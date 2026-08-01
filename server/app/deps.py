from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionDep
from app.errors import AppError
from app.models import ADMIN, User, Workspace, touch_last_seen
from app.services import workspaces
from app.services.security import SESSION_COOKIE, read_session, utcnow
from app.workspace_filter import all_workspaces, use_workspace

NOT_SIGNED_IN = "You need to sign in to do that."
NO_WORKSPACE = "Create or join a workspace first."
NOT_ADMIN = "Only an admin can do that."
NOT_VERIFIED = "Confirm your email address first."


@dataclass(frozen=True)
class SignedInUser:
    user: User
    workspace: Workspace | None
    role: str | None
    db: AsyncSession


def _not_signed_in() -> AppError:
    return AppError("unauthenticated", NOT_SIGNED_IN, status_code=401)


async def signed_in_user(request: Request, db: SessionDep) -> AsyncIterator[SignedInUser]:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise _not_signed_in()

    now = utcnow()
    payload = read_session(token, now=now)
    if payload is None:
        raise _not_signed_in()

    with all_workspaces(reason="a person is global; their workspaces are looked up separately"):
        user = await db.scalar(select(User).where(User.id == payload["uid"]))
    if user is None:
        raise _not_signed_in()

    workspace_id = payload.get("wid")
    if workspace_id is None:
        if touch_last_seen(user, now):
            await db.commit()
        yield SignedInUser(user=user, workspace=None, role=None, db=db)
        return

    membership = await workspaces.membership_in(db, user, workspace_id)
    if membership is None:
        raise _not_signed_in()

    with use_workspace(workspace_id):
        if touch_last_seen(user, now):
            await db.commit()
        yield SignedInUser(user=user, workspace=membership.workspace, role=membership.role, db=db)


SignedIn = Annotated[SignedInUser, Depends(signed_in_user)]


async def signed_in_user_in_workspace(signed_in: SignedIn) -> SignedInUser:
    if signed_in.workspace is None:
        raise AppError("no_workspace", NO_WORKSPACE, status_code=409)
    return signed_in


InWorkspace = Annotated[SignedInUser, Depends(signed_in_user_in_workspace)]


async def admin_in_workspace(signed_in: InWorkspace) -> SignedInUser:
    if signed_in.role != ADMIN:
        raise AppError("not_admin", NOT_ADMIN, status_code=403)
    return signed_in


Admin = Annotated[SignedInUser, Depends(admin_in_workspace)]


async def verified_admin_in_workspace(signed_in: Admin) -> SignedInUser:
    if not signed_in.user.email_verified:
        raise AppError("email_not_verified", NOT_VERIFIED, status_code=403)
    return signed_in


VerifiedAdmin = Annotated[SignedInUser, Depends(verified_admin_in_workspace)]
