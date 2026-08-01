from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.logging import get_logger
from app.models import Invite, User
from app.services.security import hash_password, password_problem, verify_password
from app.workspace_filter import all_workspaces

log = get_logger(__name__)

EMAIL_TAKEN = "That email already has an account. Try logging in instead."
BAD_CREDENTIALS = "That email and password do not match."


async def signup(
    db: AsyncSession,
    *,
    name: str,
    email: str,
    password: str,
    invite: Invite | None,
    now: datetime,
) -> User:
    email = email.strip()

    if (problem := password_problem(password)) is not None:
        raise AppError("weak_password", problem, status_code=400)

    with all_workspaces(reason="an email address is unique across the whole system"):
        taken = await db.scalar(select(func.count()).select_from(User).where(User.email == email))
    if taken:
        raise AppError("email_taken", EMAIL_TAKEN, status_code=409)

    user = User(
        email=email,
        name=name.strip(),
        password_hash=hash_password(password),
        pending_invite_id=invite.id if invite is not None else None,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise AppError("email_taken", EMAIL_TAKEN, status_code=409) from exc

    log.info("auth.signup", user_id=user.id)
    return user


async def login(db: AsyncSession, *, email: str, password: str) -> User:
    with all_workspaces(reason="signing in happens before any workspace is chosen"):
        user = await db.scalar(select(User).where(User.email == email.strip()))

    password_hash = user.password_hash if user is not None else _DUMMY_HASH
    correct = verify_password(password, password_hash)

    if user is None or not correct:
        raise AppError("bad_credentials", BAD_CREDENTIALS, status_code=401)

    log.info("auth.login", user_id=user.id)
    return user


_DUMMY_HASH = hash_password("a password that is never correct")
