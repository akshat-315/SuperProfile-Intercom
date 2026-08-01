from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.logging import get_logger
from app.models import ADMIN, User, Workspace, WorkspaceMember
from app.services.security import (
    hash_password,
    password_problem,
    slugify,
    verify_password,
)
from app.workspace_filter import all_workspaces, use_workspace

log = get_logger(__name__)

EMAIL_TAKEN = "That email already has an account. Try logging in instead."
BAD_CREDENTIALS = "That email and password do not match."


@dataclass(frozen=True)
class SignedIn:
    user: User
    workspace: Workspace
    role: str


async def signup(
    db: AsyncSession,
    *,
    name: str,
    email: str,
    password: str,
    workspace_name: str,
    now: datetime,
) -> SignedIn:
    email = email.strip()

    if (problem := password_problem(password)) is not None:
        raise AppError("weak_password", problem, status_code=400)

    with all_workspaces(reason="an email address is unique across the whole system"):
        taken = await db.scalar(select(func.count()).select_from(User).where(User.email == email))
    if taken:
        raise AppError("email_taken", EMAIL_TAKEN, status_code=409)

    user = User(email=email, name=name.strip(), password_hash=hash_password(password))
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise AppError("email_taken", EMAIL_TAKEN, status_code=409) from exc

    workspace = Workspace(name=workspace_name.strip(), slug=await _free_slug(db, workspace_name))
    db.add(workspace)
    await db.flush()

    with use_workspace(workspace.id):
        db.add(
            WorkspaceMember(
                workspace_id=workspace.id, user_id=user.id, role=ADMIN, joined_at=now
            )
        )
        await db.flush()

    log.info("auth.signup", user_id=user.id, workspace_id=workspace.id)
    return SignedIn(user=user, workspace=workspace, role=ADMIN)


async def login(db: AsyncSession, *, email: str, password: str) -> SignedIn:
    with all_workspaces(reason="sign-in happens before any workspace is chosen"):
        user = await db.scalar(select(User).where(User.email == email.strip()))
        member = (
            await db.scalar(
                select(WorkspaceMember)
                .where(WorkspaceMember.user_id == user.id)
                .order_by(WorkspaceMember.joined_at)
            )
            if user is not None
            else None
        )
        workspace = (
            await db.scalar(select(Workspace).where(Workspace.id == member.workspace_id))
            if member is not None
            else None
        )

    password_hash = user.password_hash if user is not None else _DUMMY_HASH
    correct = verify_password(password, password_hash)

    if user is None or not correct or member is None or workspace is None:
        raise AppError("bad_credentials", BAD_CREDENTIALS, status_code=401)

    log.info("auth.login", user_id=user.id, workspace_id=workspace.id)
    return SignedIn(user=user, workspace=workspace, role=member.role)


async def _free_slug(db: AsyncSession, workspace_name: str) -> str:
    stem = slugify(workspace_name)
    with all_workspaces(reason="a slug is unique across the whole system"):
        taken = set(
            await db.scalars(select(Workspace.slug).where(Workspace.slug.like(f"{stem}%")))
        )
    if stem not in taken:
        return stem
    suffix = 2
    while f"{stem}-{suffix}" in taken:
        suffix += 1
    return f"{stem}-{suffix}"


_DUMMY_HASH = hash_password("a password that is never correct")
