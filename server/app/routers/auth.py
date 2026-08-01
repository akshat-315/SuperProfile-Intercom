from fastapi import APIRouter, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import SessionDep
from app.deps import SignedIn
from app.models import User, Workspace
from app.schemas.auth import (
    LoginRequest,
    MembershipOut,
    MeResponse,
    SignupRequest,
    SwitchWorkspaceRequest,
    UserOut,
    WorkspaceOut,
)
from app.services import auth as service
from app.services import ratelimit, workspaces
from app.services.security import SESSION_COOKIE, SESSION_TTL, sign_session, utcnow

router = APIRouter(prefix="/api/auth", tags=["auth"])


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def workspace_out(workspace: Workspace) -> WorkspaceOut:
    return WorkspaceOut(id=workspace.id, name=workspace.name, slug=workspace.slug)


async def me_response(
    db: AsyncSession, user: User, active: workspaces.Membership | None
) -> MeResponse:
    held = await workspaces.memberships(db, user)
    return MeResponse(
        user=UserOut(
            id=user.id, name=user.name, email=user.email, email_verified=user.email_verified
        ),
        memberships=[
            MembershipOut(workspace=workspace_out(m.workspace), role=m.role) for m in held
        ],
        active_workspace=workspace_out(active.workspace) if active is not None else None,
        role=active.role if active is not None else None,
    )


def set_session_cookie(
    response: Response, user: User, active: workspaces.Membership | None
) -> None:
    token = sign_session(
        user_id=user.id,
        workspace_id=active.workspace.id if active is not None else None,
        role=active.role if active is not None else None,
        now=utcnow(),
    )
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.post("/signup", response_model=MeResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    body: SignupRequest, request: Request, response: Response, db: SessionDep
) -> MeResponse:
    ratelimit.enforce(ratelimit.SIGNUP, client_ip(request))

    user = await service.signup(
        db, name=body.name, email=body.email, password=body.password, now=utcnow()
    )
    await db.commit()

    set_session_cookie(response, user, None)
    return await me_response(db, user, None)


@router.post("/login", response_model=MeResponse)
async def login(
    body: LoginRequest, request: Request, response: Response, db: SessionDep
) -> MeResponse:
    ratelimit.enforce(ratelimit.LOGIN, client_ip(request))

    user = await service.login(db, email=body.email, password=body.password)
    held = await workspaces.memberships(db, user)
    active = held[0] if held else None

    set_session_cookie(response, user, active)
    return await me_response(db, user, active)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    response.delete_cookie(
        SESSION_COOKIE,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.get("/me", response_model=MeResponse)
async def me(signed_in: SignedIn) -> MeResponse:
    active = (
        workspaces.Membership(workspace=signed_in.workspace, role=signed_in.role)
        if signed_in.workspace is not None and signed_in.role is not None
        else None
    )
    return await me_response(signed_in.db, signed_in.user, active)


@router.post("/workspace", response_model=MeResponse)
async def switch_workspace(
    body: SwitchWorkspaceRequest, response: Response, signed_in: SignedIn
) -> MeResponse:
    active = await workspaces.switch(signed_in.db, signed_in.user, body.workspace_id)

    set_session_cookie(response, signed_in.user, active)
    return await me_response(signed_in.db, signed_in.user, active)
