import re
from datetime import datetime
from email.utils import parseaddr

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.logging import get_logger
from app.models import EMAIL, INBOUND, OPEN, Conversation, Message, Workspace
from app.services import events, inbox, jobs, mail, widget
from app.services.html import to_text
from app.services.security import utcnow
from app.workspace_filter import all_workspaces, use_workspace

log = get_logger(__name__)

INGEST = "email.ingest"
SUBJECT_LIMIT = 200
AUTOMATED_PRECEDENCE = {"bulk", "list", "junk", "auto_reply"}

QUOTE_MARKERS = (
    re.compile(r"^\s*>", re.MULTILINE),
    re.compile(r"^\s*On .{5,120}\bwrote:\s*$", re.MULTILINE),
    re.compile(r"^\s*-{2,}\s*Original Message\s*-{2,}\s*$", re.MULTILINE | re.IGNORECASE),
    re.compile(r"^\s*_{10,}\s*$", re.MULTILINE),
    re.compile(r"^\s*From:\s.+\bSent:\s", re.MULTILINE),
)


def without_quotes(text: str) -> str:
    cut = len(text)
    for marker in QUOTE_MARKERS:
        found = marker.search(text)
        if found is not None:
            cut = min(cut, found.start())
    return text[:cut].strip() or text.strip()


def lowercased(headers: object) -> dict[str, str]:
    if not isinstance(headers, dict):
        return {}
    return {str(k).lower(): str(v) for k, v in headers.items() if v is not None}


def automated(headers: dict[str, str]) -> bool:
    submitted = headers.get("auto-submitted", "").lower()
    if submitted and submitted != "no":
        return True
    if headers.get("precedence", "").lower() in AUTOMATED_PRECEDENCE:
        return True
    return any(name in headers for name in ("x-autoreply", "x-autorespond", "list-id"))


def ours(address: str) -> bool:
    domain = address.rpartition("@")[2].lower()
    if not domain:
        return False
    return domain in {settings.email_domain.lower(), settings.inbound_domain.lower()}


def message_ids(value: str | None) -> list[str]:
    return re.findall(r"<[^<>\s]+>", value or "")


def recipients(received: dict) -> list[str]:
    for field in ("received_for", "to"):
        values = received.get(field)
        if isinstance(values, list) and values:
            return [parseaddr(str(v))[1] for v in values if v]
    return []


async def workspace_for(db: AsyncSession, addresses: list[str]) -> Workspace | None:
    tokens = [a.partition("@")[0].lower() for a in addresses if a]
    if not tokens:
        return None
    with all_workspaces(reason="an inbound email names its workspace by address"):
        return await db.scalar(select(Workspace).where(Workspace.inbound_token.in_(tokens)))


async def seen_before(db: AsyncSession, external_id: str) -> bool:
    found = await db.scalar(select(Message.id).where(Message.external_id == external_id))
    return found is not None


async def thread_for(db: AsyncSession, headers: dict[str, str]) -> Conversation | None:
    parents = message_ids(headers.get("in-reply-to"))
    parents += list(reversed(message_ids(headers.get("references"))))
    for parent in parents:
        found = await db.scalar(select(Message).where(Message.external_id == parent))
        if found is not None:
            return await db.scalar(
                select(Conversation).where(Conversation.id == found.conversation_id)
            )
    return None


async def start_thread(
    db: AsyncSession, workspace: Workspace, customer_id: int, subject: str, now: datetime
) -> Conversation:
    conversation = Conversation(
        workspace_id=workspace.id,
        customer_id=customer_id,
        channel=EMAIL,
        status=OPEN,
        subject=subject[:SUBJECT_LIMIT] or None,
        last_message_at=now,
    )
    db.add(conversation)
    await db.flush()
    return conversation


@jobs.handles(INGEST)
async def ingest(db: AsyncSession, job) -> None:
    email_id = job.payload.get("email_id")
    if not email_id:
        log.warning("ingest.no_email_id", job_id=job.id)
        return

    received = await mail.fetch_received(email_id)
    headers = lowercased(received.get("headers"))
    sender = parseaddr(str(received.get("from") or ""))[1].lower()
    external_id = received.get("message_id") or headers.get("message-id")

    if not sender:
        log.warning("ingest.no_sender", email_id=email_id)
        return
    if ours(sender):
        log.info("ingest.dropped_own_mail", email_id=email_id, sender=sender)
        return
    if automated(headers):
        log.info("ingest.dropped_automated", email_id=email_id, sender=sender)
        return

    workspace = await workspace_for(db, recipients(received))
    if workspace is None:
        log.warning("ingest.unknown_recipient", email_id=email_id, to=received.get("to"))
        return

    body = received.get("text") or to_text(str(received.get("html") or ""))
    body = without_quotes(body)
    if not body:
        log.info("ingest.empty_body", email_id=email_id)
        return

    subject = str(received.get("subject") or "").strip()
    replying_to = message_ids(headers.get("in-reply-to"))
    now = utcnow()

    with use_workspace(workspace.id):
        if external_id and await seen_before(db, external_id):
            log.info("ingest.already_stored", email_id=email_id, external_id=external_id)
            return

        identified = await widget.identify(
            db,
            workspace,
            known_visitor_id=None,
            name=parseaddr(str(received.get("from") or ""))[0] or None,
            email=sender,
            now=now,
        )
        conversation = await thread_for(db, headers)
        if conversation is None:
            conversation = await start_thread(db, workspace, identified.customer.id, subject, now)

        try:
            message = await inbox.add_message(
                db,
                conversation,
                direction=INBOUND,
                author_user_id=None,
                body=body,
                client_msg_id=None,
                now=now,
                external_id=external_id,
                in_reply_to=replying_to[0] if replying_to else None,
            )
        except IntegrityError:
            await db.rollback()
            log.info("ingest.delivered_twice", email_id=email_id, external_id=external_id)
            return

        await db.commit()

    events.message_saved(conversation, message)
    log.info(
        "ingest.stored",
        email_id=email_id,
        workspace_id=workspace.id,
        conversation_id=conversation.id,
        seq=message.seq,
    )
