from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.logging import get_logger
from app.models import ADMIN, ROLES, User, Workspace, WorkspaceMember
from app.workspace_filter import all_workspaces, require_workspace_id

log = get_logger(__name__)

LAST_ADMIN = "A workspace needs at least one admin. Make someone else an admin first."
NOT_IN_TEAM = "That person is not in this workspace."
UNKNOWN_ROLE = "Pick either admin or agent."


@dataclass(frozen=True)
class Member:
    user: User
    role: str
    joined_at: datetime


async def members(db: AsyncSession) -> list[Member]:
    rows = (
        await db.execute(
            select(WorkspaceMember).order_by(WorkspaceMember.joined_at)
        )
    ).scalars().all()
    if not rows:
        return []
    with all_workspaces(reason="a person is global; the membership rows above are already filtered"):
        people = {
            user.id: user
            for user in await db.scalars(
                select(User).where(User.id.in_([row.user_id for row in rows]))
            )
        }
    return [
        Member(user=people[row.user_id], role=row.role, joined_at=row.joined_at)
        for row in rows
        if row.user_id in people
    ]


async def membership_of(db: AsyncSession, user_id: int) -> WorkspaceMember:
    row = await db.scalar(select(WorkspaceMember).where(WorkspaceMember.user_id == user_id))
    if row is None:
        raise AppError("not_in_team", NOT_IN_TEAM, status_code=404)
    return row


async def admin_count(db: AsyncSession) -> int:
    return (
        await db.scalar(
            select(func.count()).select_from(WorkspaceMember).where(WorkspaceMember.role == ADMIN)
        )
    ) or 0


async def member_count(db: AsyncSession) -> int:
    return (await db.scalar(select(func.count()).select_from(WorkspaceMember))) or 0


async def change_role(db: AsyncSession, user_id: int, role: str) -> WorkspaceMember:
    if role not in ROLES:
        raise AppError("unknown_role", UNKNOWN_ROLE, status_code=400)

    membership = await membership_of(db, user_id)
    if membership.role == ADMIN and role != ADMIN and await admin_count(db) == 1:
        raise AppError("last_admin", LAST_ADMIN, status_code=400)

    membership.role = role
    await db.flush()
    log.info("team.role_changed", user_id=user_id, role=role)
    return membership


async def remove(db: AsyncSession, user_id: int) -> None:
    membership = await membership_of(db, user_id)
    if membership.role == ADMIN and await admin_count(db) == 1 and await member_count(db) > 1:
        raise AppError("last_admin", LAST_ADMIN, status_code=400)

    await db.delete(membership)
    await db.flush()
    log.info("team.removed", user_id=user_id)


async def leave(db: AsyncSession, user_id: int) -> bool:
    membership = await membership_of(db, user_id)
    alone = await member_count(db) == 1

    if not alone and membership.role == ADMIN and await admin_count(db) == 1:
        raise AppError("last_admin", LAST_ADMIN, status_code=400)

    workspace_id = require_workspace_id()
    await db.delete(membership)
    await db.flush()

    if alone:
        with all_workspaces(reason="deleting a workspace removes the row the filter matches on"):
            await db.execute(delete(Workspace).where(Workspace.id == workspace_id))
        log.info("workspace.deleted", workspace_id=workspace_id, reason="last member left")

    log.info("team.left", user_id=user_id, workspace_id=workspace_id)
    return alone
