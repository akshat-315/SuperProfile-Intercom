from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionDep
from app.errors import AppError
from app.models import User, Workspace, WorkspaceMember, touch_last_seen
from app.services.security import SESSION_COOKIE, read_session, utcnow
from app.workspace_filter import all_workspaces, use_workspace

NOT_SIGNED_IN = "You need to sign in to do that."


@dataclass(frozen=True)
class Principal:
    user: User
    workspace: Workspace
    role: str
    db: AsyncSession


async def current_principal(request: Request, db: SessionDep) -> Principal:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise AppError("unauthenticated", NOT_SIGNED_IN, status_code=401)

    now = utcnow()
    payload = read_session(token, now=now)
    if payload is None:
        raise AppError("unauthenticated", NOT_SIGNED_IN, status_code=401)

    user_id = payload["uid"]
    workspace_id = payload["wid"]

    with all_workspaces(reason="the cookie names its own workspace and is checked against it"):
        member = await db.scalar(
            select(WorkspaceMember).where(
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.workspace_id == workspace_id,
            )
        )
    if member is None:
        raise AppError("unauthenticated", NOT_SIGNED_IN, status_code=401)

    with use_workspace(workspace_id):
        user = await db.scalar(select(User).where(User.id == user_id))
        workspace = await db.scalar(select(Workspace).where(Workspace.id == workspace_id))
        if user is None or workspace is None:
            raise AppError("unauthenticated", NOT_SIGNED_IN, status_code=401)
        if touch_last_seen(user, now):
            await db.commit()

    return Principal(user=user, workspace=workspace, role=member.role, db=db)


CurrentUser = Annotated[Principal, Depends(current_principal)]
