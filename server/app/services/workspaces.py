from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.logging import get_logger
from app.models import ADMIN, User, Workspace, WorkspaceMember
from app.services.security import slugify
from app.workspace_filter import all_workspaces, use_workspace

log = get_logger(__name__)

NOT_A_MEMBER = "You are not a member of that workspace."


@dataclass(frozen=True)
class Membership:
    workspace: Workspace
    role: str


async def memberships(db: AsyncSession, user: User) -> list[Membership]:
    with all_workspaces(reason="a person's memberships span every workspace they belong to"):
        rows = (
            await db.execute(
                select(WorkspaceMember, Workspace)
                .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
                .where(WorkspaceMember.user_id == user.id)
                .order_by(WorkspaceMember.joined_at)
            )
        ).all()
    return [Membership(workspace=workspace, role=member.role) for member, workspace in rows]


async def membership_in(db: AsyncSession, user: User, workspace_id: int) -> Membership | None:
    with all_workspaces(reason="the cookie names a workspace and is checked against it"):
        row = (
            await db.execute(
                select(WorkspaceMember, Workspace)
                .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
                .where(
                    WorkspaceMember.user_id == user.id,
                    WorkspaceMember.workspace_id == workspace_id,
                )
            )
        ).first()
    if row is None:
        return None
    member, workspace = row
    return Membership(workspace=workspace, role=member.role)


async def create(db: AsyncSession, user: User, *, name: str, now: datetime) -> Membership:
    workspace = Workspace(name=name.strip(), slug=await _free_slug(db, name))
    db.add(workspace)
    await db.flush()

    with use_workspace(workspace.id):
        db.add(
            WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=ADMIN, joined_at=now)
        )
        await db.flush()

    log.info("workspace.created", workspace_id=workspace.id, user_id=user.id)
    return Membership(workspace=workspace, role=ADMIN)


async def switch(db: AsyncSession, user: User, workspace_id: int) -> Membership:
    membership = await membership_in(db, user, workspace_id)
    if membership is None:
        raise AppError("not_a_member", NOT_A_MEMBER, status_code=403)
    return membership


async def _free_slug(db: AsyncSession, name: str) -> str:
    stem = slugify(name)
    with all_workspaces(reason="a slug is unique across the whole system"):
        taken = set(await db.scalars(select(Workspace.slug).where(Workspace.slug.like(f"{stem}%"))))
    if stem not in taken:
        return stem
    suffix = 2
    while f"{stem}-{suffix}" in taken:
        suffix += 1
    return f"{stem}-{suffix}"
