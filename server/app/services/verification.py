from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.errors import AppError
from app.logging import get_logger
from app.models import EmailVerification, User
from app.services import invites, mail
from app.services.security import new_verification_token, verification_expiry
from app.workspace_filter import all_workspaces

log = get_logger(__name__)

UNUSABLE_TOKEN = "That confirmation link is no longer valid. Ask for a new one."


@dataclass(frozen=True)
class Confirmed:
    user: User
    already_verified: bool
    joined_workspace_id: int | None


async def issue(db: AsyncSession, user: User, *, now: datetime) -> EmailVerification:
    row = EmailVerification(
        user_id=user.id,
        token=new_verification_token(),
        expires_at=verification_expiry(now),
    )
    db.add(row)
    await db.flush()
    return row


def link_for(token: str) -> str:
    return f"{settings.app_url.rstrip('/')}/verify/{token}"


async def deliver(*, name: str, email: str, token: str) -> None:
    link = link_for(token)
    if settings.expose_dev_links:
        log.info("mail.dev_link", kind="verification", to=email, link=link)
    subject, html, text = mail.verification_email(name=name, link=link)
    await mail.send(to=email, subject=subject, html=html, text=text)


async def confirm(db: AsyncSession, token: str, *, now: datetime) -> Confirmed:
    with all_workspaces(reason="a confirmation link is followed before any workspace is known"):
        row = await db.scalar(select(EmailVerification).where(EmailVerification.token == token))
        user = (
            await db.scalar(select(User).where(User.id == row.user_id))
            if row is not None
            else None
        )

    if row is None or user is None:
        raise AppError("invalid_token", UNUSABLE_TOKEN, status_code=404)

    if row.used_at is not None:
        if user.email_verified:
            return Confirmed(user=user, already_verified=True, joined_workspace_id=None)
        raise AppError("invalid_token", UNUSABLE_TOKEN, status_code=404)

    if row.expires_at <= now:
        raise AppError("invalid_token", UNUSABLE_TOKEN, status_code=404)

    row.used_at = now
    if not user.email_verified:
        user.email_verified_at = now

    joined = None
    invite = await invites.pending_for(db, user, now=now)
    if invite is not None:
        workspace = await invites.accept(db, user, invite, now=now)
        joined = workspace.id

    await db.flush()
    log.info("auth.verified", user_id=user.id, joined_workspace_id=joined)
    return Confirmed(user=user, already_verified=False, joined_workspace_id=joined)
