from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import ROLES, Invite, User, Workspace, WorkspaceMember
from app.services.security import new_invite_code, normalise_invite_code
from app.workspace_filter import all_workspaces, use_workspace

UNUSABLE_CODE = "That invite code is not valid. Ask for a new one."
ALREADY_A_MEMBER = "That person is already in this workspace."
UNKNOWN_ROLE = "Pick either admin or agent."

INVITE_TTL = timedelta(days=7)


def unusable_code() -> AppError:
    return AppError("invalid_invite", UNUSABLE_CODE, status_code=404)


async def by_code(db: AsyncSession, code: str, *, now: datetime) -> Invite:
    with all_workspaces(reason="an invite code is looked up before any workspace is known"):
        invite = await db.scalar(select(Invite).where(Invite.code == normalise_invite_code(code)))
    if invite is None or not invite.is_usable(now):
        raise unusable_code()
    return invite


async def pending_for(db: AsyncSession, user: User, *, now: datetime) -> Invite | None:
    with all_workspaces(reason="a pending invite is read before its workspace is active"):
        if user.pending_invite_id is not None:
            invite = await db.scalar(select(Invite).where(Invite.id == user.pending_invite_id))
            if invite is not None and invite.is_usable(now):
                return invite
        return await db.scalar(
            select(Invite)
            .where(
                Invite.email == user.email,
                Invite.accepted_at.is_(None),
                Invite.expires_at > now,
            )
            .order_by(Invite.created_at.desc())
        )


async def accept(db: AsyncSession, user: User, invite: Invite, *, now: datetime) -> Workspace:
    if not invite.is_usable(now):
        raise unusable_code()

    with use_workspace(invite.workspace_id):
        workspace = await db.scalar(select(Workspace).where(Workspace.id == invite.workspace_id))
        if workspace is None:
            raise unusable_code()

        already = await db.scalar(select(WorkspaceMember).where(WorkspaceMember.user_id == user.id))
        if already is None:
            db.add(
                WorkspaceMember(
                    workspace_id=invite.workspace_id,
                    user_id=user.id,
                    role=invite.role,
                    joined_at=now,
                )
            )

    invite.accepted_at = now
    user.pending_invite_id = None
    await db.flush()
    return workspace


@dataclass(frozen=True)
class Preview:
    workspace_name: str
    inviter_name: str
    email: str
    role: str


async def create(
    db: AsyncSession, *, workspace_id: int, email: str, role: str, invited_by: User, now: datetime
) -> Invite:
    if role not in ROLES:
        raise AppError("unknown_role", UNKNOWN_ROLE, status_code=400)

    email = email.strip()

    with all_workspaces(reason="a person is global; membership is checked against this workspace"):
        existing = await db.scalar(select(User).where(User.email == email))
        if existing is not None:
            member = await db.scalar(
                select(WorkspaceMember).where(
                    WorkspaceMember.user_id == existing.id,
                    WorkspaceMember.workspace_id == workspace_id,
                )
            )
            if member is not None:
                raise AppError("already_a_member", ALREADY_A_MEMBER, status_code=409)

    invite = Invite(
        workspace_id=workspace_id,
        email=email,
        role=role,
        code=new_invite_code(),
        invited_by_user_id=invited_by.id,
        expires_at=now + INVITE_TTL,
    )
    db.add(invite)
    await db.flush()
    return invite


async def preview(db: AsyncSession, code: str, *, now: datetime) -> Preview:
    invite = await by_code(db, code, now=now)
    with all_workspaces(reason="an invite is previewed before the reader has any workspace"):
        workspace = await db.scalar(select(Workspace).where(Workspace.id == invite.workspace_id))
        inviter = await db.scalar(select(User).where(User.id == invite.invited_by_user_id))
    if workspace is None or inviter is None:
        raise unusable_code()
    return Preview(
        workspace_name=workspace.name,
        inviter_name=inviter.name,
        email=invite.email,
        role=invite.role,
    )
