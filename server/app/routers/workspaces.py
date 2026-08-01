from fastapi import APIRouter, Response, status

from app.deps import Admin, Verified
from app.routers.auth import me_response, set_session_cookie
from app.schemas.auth import CreateWorkspaceRequest, MeResponse
from app.schemas.team import RenameWorkspaceRequest
from app.services import workspaces as service
from app.services.security import utcnow

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


@router.post("", response_model=MeResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    body: CreateWorkspaceRequest, response: Response, signed_in: Verified
) -> MeResponse:
    active = await service.create(signed_in.db, signed_in.user, name=body.name, now=utcnow())
    await signed_in.db.commit()

    set_session_cookie(response, signed_in.user, active)
    return await me_response(signed_in.db, signed_in.user, active)


@router.patch("/current", response_model=MeResponse)
async def rename_workspace(
    body: RenameWorkspaceRequest, response: Response, signed_in: Admin
) -> MeResponse:
    assert signed_in.workspace is not None
    signed_in.workspace.name = body.name.strip()
    await signed_in.db.commit()

    active = service.Membership(workspace=signed_in.workspace, role=signed_in.role or "")
    set_session_cookie(response, signed_in.user, active)
    return await me_response(signed_in.db, signed_in.user, active)
