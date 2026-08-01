from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.logging import get_logger
from app.models import EmailVerification, Job, User, Workspace
from app.services import jobs, mail
from app.services.security import format_invite_code
from app.workspace_filter import all_workspaces

log = get_logger(__name__)

VERIFICATION = "send_verification_email"
INVITE = "send_invite_email"


class Undeliverable(RuntimeError):
    pass


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
        row = await db.scalar(
            select(EmailVerification).where(EmailVerification.token == token)
        )

    if user is None or row is None:
        log.info("outbox.verification_gone", job_id=job.id)
        return

    link = verification_link(token)
    if settings.expose_dev_links:
        log.info("mail.dev_link", kind="verification", to=user.email, link=link)

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

    subject, html, text = mail.invite_email(
        workspace_name=workspace.name,
        inviter_name=job.payload["inviter_name"],
        link=link,
        code=format_invite_code(code),
    )
    if not await mail.send(to=email, subject=subject, html=html, text=text):
        raise Undeliverable("the mail provider did not accept it")
