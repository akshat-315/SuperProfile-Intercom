import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.logging import get_logger
from app.models import Message
from app.services import jobs, webhooks
from app.workspace_filter import all_workspaces

log = get_logger(__name__)

RECEIVED = "email.received"
INGEST = "email.ingest"


def authentic(raw: bytes, headers: dict[str, str]) -> bool:
    return webhooks.verify(raw, headers, settings.resend_webhook_secret)


def delivery(raw: bytes) -> tuple[str, str | None] | None:
    try:
        event = json.loads(raw)
    except ValueError:
        log.warning("inbound.unreadable_payload")
        return None

    if not isinstance(event, dict) or event.get("type") != RECEIVED:
        return None

    data = event.get("data")
    if not isinstance(data, dict):
        return None

    email_id = data.get("email_id")
    if not isinstance(email_id, str) or not email_id:
        log.warning("inbound.no_email_id")
        return None

    message_id = data.get("message_id")
    return email_id, message_id if isinstance(message_id, str) else None


async def already_stored(db: AsyncSession, message_id: str) -> bool:
    with all_workspaces(reason="an inbound email names no workspace until it is routed"):
        found = await db.scalar(select(Message.id).where(Message.external_id == message_id))
    return found is not None


async def accept(db: AsyncSession, email_id: str) -> None:
    await jobs.enqueue(db, kind=INGEST, payload={"email_id": email_id})
