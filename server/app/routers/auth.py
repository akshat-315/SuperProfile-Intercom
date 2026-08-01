from fastapi import APIRouter, Request, Response, status

from app.config import settings
from app.db import SessionDep
from app.deps import CurrentUser
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    SignupRequest,
    UserOut,
    WorkspaceOut,
)
from app.services import auth as service
from app.services import ratelimit
from app.services.security import SESSION_COOKIE, SESSION_TTL, sign_session, utcnow

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _me(signed_in: service.SignedIn) -> MeResponse:
    return MeResponse(
        user=UserOut(
            id=signed_in.user.id,
            name=signed_in.user.name,
            email=signed_in.user.email,
            email_verified=signed_in.user.email_verified,
        ),
        workspace=WorkspaceOut(
            id=signed_in.workspace.id,
            name=signed_in.workspace.name,
            slug=signed_in.workspace.slug,
        ),
        role=signed_in.role,
    )


def _set_session_cookie(response: Response, signed_in: service.SignedIn) -> None:
    token = sign_session(
        user_id=signed_in.user.id,
        workspace_id=signed_in.workspace.id,
        role=signed_in.role,
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
    ratelimit.enforce(ratelimit.SIGNUP, _client_ip(request))

    signed_in = await service.signup(
        db,
        name=body.name,
        email=body.email,
        password=body.password,
        workspace_name=body.workspace_name,
        now=utcnow(),
    )
    await db.commit()

    _set_session_cookie(response, signed_in)
    return _me(signed_in)


@router.post("/login", response_model=MeResponse)
async def login(
    body: LoginRequest, request: Request, response: Response, db: SessionDep
) -> MeResponse:
    ratelimit.enforce(ratelimit.LOGIN, _client_ip(request))

    signed_in = await service.login(db, email=body.email, password=body.password)

    _set_session_cookie(response, signed_in)
    return _me(signed_in)


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
async def me(principal: CurrentUser) -> MeResponse:
    return _me(
        service.SignedIn(
            user=principal.user, workspace=principal.workspace, role=principal.role
        )
    )
