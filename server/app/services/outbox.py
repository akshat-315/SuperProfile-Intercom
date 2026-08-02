import re
from html import escape
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.logging import get_logger
from app.models import (
    INBOUND,
    Conversation,
    Customer,
    EmailVerification,
    Job,
    Message,
    User,
    Workspace,
)
from app.services import jobs, mail
from app.services.security import format_invite_code
from app.workspace_filter import all_workspaces

log = get_logger(__name__)

VERIFICATION = "send_verification_email"
INVITE = "send_invite_email"
REPLY = "email.reply"

UNSAFE_IN_NAME = re.compile(r'[\r\n"<>]')


class Undeliverable(RuntimeError):
    pass


def new_message_id() -> str:
    domain = settings.inbound_domain or settings.email_domain
    return f"<{uuid4().hex}@{domain}>"


def display_name(agent: str, workspace: str) -> str:
    return UNSAFE_IN_NAME.sub("", f"{agent} from {workspace}").strip() or workspace


async def queue_reply(db: AsyncSession, *, message: Message, workspace_id: int) -> Job:
    return await jobs.enqueue(
        db,
        kind=REPLY,
        payload={"message_id": message.id},
        workspace_id=workspace_id,
    )


async def queue_verification(db: AsyncSession, *, user: User, token: str) -> Job:
    return await jobs.enqueue(
        db,
        kind=VERIFICATION,
        payload={"user_id": user.id, "token": token},
    )


async def queue_invite(
    db: AsyncSession, *, email: str, code: str, workspace_id: int, inviter_name: str
) -> Job:
    return await jobs.enqueue(
        db,
        kind=INVITE,
        payload={"email": email, "code": code, "inviter_name": inviter_name},
        workspace_id=workspace_id,
    )


def verification_link(token: str) -> str:
    return f"{settings.app_url.rstrip('/')}/verify/{token}"


def invite_link(code: str) -> str:
    return f"{settings.app_url.rstrip('/')}/invite/{code}"


@jobs.handles(VERIFICATION)
async def _send_verification(db: AsyncSession, job: Job) -> None:
    token = job.payload["token"]
    with all_workspaces(reason="a person is global; this job carries no workspace"):
        user = await db.scalar(select(User).where(User.id == job.payload["user_id"]))
        row = await db.scalar(select(EmailVerification).where(EmailVerification.token == token))

    if user is None or row is None:
        log.info("outbox.verification_gone", job_id=job.id)
        return

    link = verification_link(token)
    if settings.expose_dev_links:
        log.info("mail.dev_link", kind="verification", to=user.email, link=link)
    if not settings.mail_configured:
        return

    subject, html, text = mail.verification_email(name=user.name, link=link)
    if not await mail.send(to=user.email, subject=subject, html=html, text=text):
        raise Undeliverable("the mail provider did not accept it")


@jobs.handles(INVITE)
async def _send_invite(db: AsyncSession, job: Job) -> None:
    with all_workspaces(reason="the job carries its own workspace id"):
        workspace = await db.scalar(select(Workspace).where(Workspace.id == job.workspace_id))

    if workspace is None:
        log.info("outbox.invite_workspace_gone", job_id=job.id)
        return

    code = job.payload["code"]
    email = job.payload["email"]
    link = invite_link(code)
    if settings.expose_dev_links:
        log.info("mail.dev_link", kind="invite", to=email, link=link, code=format_invite_code(code))
    if not settings.mail_configured:
        return

    subject, html, text = mail.invite_email(
        workspace_name=workspace.name,
        inviter_name=job.payload["inviter_name"],
        link=link,
        code=format_invite_code(code),
    )
    if not await mail.send(to=email, subject=subject, html=html, text=text):
        raise Undeliverable("the mail provider did not accept it")


@jobs.handles(REPLY)
async def _send_reply(db: AsyncSession, job: Job) -> None:
    with all_workspaces(reason="the job carries its own workspace id"):
        message = await db.scalar(select(Message).where(Message.id == job.payload["message_id"]))
        if message is None:
            log.info("outbox.reply_message_gone", job_id=job.id)
            return

        conversation = await db.scalar(
            select(Conversation).where(Conversation.id == message.conversation_id)
        )
        workspace = await db.scalar(select(Workspace).where(Workspace.id == message.workspace_id))
        if conversation is None or workspace is None:
            log.info("outbox.reply_conversation_gone", job_id=job.id)
            return

        customer = await db.scalar(select(Customer).where(Customer.id == conversation.customer_id))
        author = (
            await db.scalar(select(User).where(User.id == message.author_user_id))
            if message.author_user_id
            else None
        )

        earlier = list(
            await db.scalars(
                select(Message)
                .where(
                    Message.conversation_id == conversation.id,
                    Message.seq < message.seq,
                    Message.external_id.is_not(None),
                )
                .order_by(Message.seq)
            )
        )

    if customer is None or not customer.email:
        log.info("outbox.reply_no_address", job_id=job.id, conversation_id=conversation.id)
        return
    if not settings.mail_configured:
        return

    chain = [m.external_id for m in earlier if m.external_id]
    answering = next((m.external_id for m in reversed(earlier) if m.direction == INBOUND), None)

    headers = {"Message-ID": message.external_id} if message.external_id else {}
    if answering:
        headers["In-Reply-To"] = answering
    if chain:
        headers["References"] = " ".join(chain)

    subject = conversation.subject or "Your conversation"
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"

    body = message.body_text
    sent = await mail.send(
        to=customer.email,
        subject=subject,
        html=f"<p>{escape(body).replace(chr(10), '<br>')}</p>",
        text=body,
        sender=f"{display_name(author.name if author else workspace.name, workspace.name)} "
        f"<{settings.inbound_address(workspace.inbound_token)}>",
        reply_to=settings.inbound_address(workspace.inbound_token),
        headers=headers,
    )
    if not sent:
        raise Undeliverable("the mail provider did not accept the reply")
