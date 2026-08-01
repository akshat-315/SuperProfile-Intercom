from fastapi import APIRouter, Response

from app.db import SessionDep
from app.deps import SignedIn
from app.errors import AppError
from app.routers.auth import me_response, set_session_cookie
from app.schemas.auth import MeResponse
from app.schemas.team import InvitePreview
from app.services import invites as service
from app.services import workspaces
from app.services.security import utcnow

router = APIRouter(prefix="/api/invite", tags=["invites"])

NOT_VERIFIED = "Confirm your email address before joining a workspace."


@router.get("/{code}", response_model=InvitePreview)
async def preview(code: str, db: SessionDep) -> InvitePreview:
    found = await service.preview(db, code, now=utcnow())
    return InvitePreview(
        workspace_name=found.workspace_name,
        inviter_name=found.inviter_name,
        email=found.email,
        role=found.role,
    )


@router.post("/{code}", response_model=MeResponse)
async def join(code: str, response: Response, signed_in: SignedIn) -> MeResponse:
    if not signed_in.user.email_verified:
        raise AppError("email_not_verified", NOT_VERIFIED, status_code=403)

    now = utcnow()
    invite = await service.by_code(signed_in.db, code, now=now)
    workspace = await service.accept(signed_in.db, signed_in.user, invite, now=now)
    await signed_in.db.commit()

    active = await workspaces.membership_in(signed_in.db, signed_in.user, workspace.id)
    set_session_cookie(response, signed_in.user, active)
    return await me_response(signed_in.db, signed_in.user, active)
