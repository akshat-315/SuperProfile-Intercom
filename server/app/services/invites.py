from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import Invite, User, Workspace, WorkspaceMember
from app.services.security import normalise_invite_code
from app.workspace_filter import all_workspaces, use_workspace

UNUSABLE_CODE = "That invite code is not valid. Ask for a new one."


def unusable_code() -> AppError:
    return AppError("invalid_invite", UNUSABLE_CODE, status_code=404)


async def by_code(db: AsyncSession, code: str, *, now: datetime) -> Invite:
    with all_workspaces(reason="an invite code is looked up before any workspace is known"):
        invite = await db.scalar(
            select(Invite).where(Invite.code == normalise_invite_code(code))
        )
    if invite is None or not invite.is_usable(now):
        raise unusable_code()
    return invite


async def pending_for(db: AsyncSession, user: User, *, now: datetime) -> Invite | None:
    with all_workspaces(reason="a pending invite is read before its workspace is active"):
        if user.pending_invite_id is not None:
            invite = await db.scalar(
                select(Invite).where(Invite.id == user.pending_invite_id)
            )
            if invite is not None and invite.is_usable(now):
                return invite
        return await db.scalar(
            select(Invite)
            .where(Invite.email == user.email, Invite.accepted_at.is_(None))
            .order_by(Invite.created_at.desc())
        )


async def accept(db: AsyncSession, user: User, invite: Invite, *, now: datetime) -> Workspace:
    if not invite.is_usable(now):
        raise unusable_code()

    with use_workspace(invite.workspace_id):
        workspace = await db.scalar(
            select(Workspace).where(Workspace.id == invite.workspace_id)
        )
        if workspace is None:
            raise unusable_code()

        already = await db.scalar(
            select(WorkspaceMember).where(WorkspaceMember.user_id == user.id)
        )
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
