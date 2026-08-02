from fastapi import APIRouter, Response, status

from app.config import settings
from app.deps import Admin, InWorkspace, Verified
from app.routers.auth import me_response, set_session_cookie
from app.schemas.auth import CreateWorkspaceRequest, MeResponse, SetupOut
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


@router.get("/setup", response_model=SetupOut)
async def setup(signed_in: InWorkspace) -> SetupOut:
    """What to paste into a website, and where customers write to.

    Both values already live on the workspace row; until now nothing returned
    them, so a new workspace had no way to find out how to install itself.
    """
    workspace = signed_in.workspace
    assert workspace is not None

    origin = settings.app_origin
    return SetupOut(
        widget_key=workspace.widget_key,
        install_snippet=(
            f'<script src="{origin}/widget.js" data-key="{workspace.widget_key}"></script>'
        ),
        support_email=(
            settings.inbound_address(workspace.inbound_token)
            if settings.inbound_configured
            else None
        ),
        help_url=f"{origin}/help/{workspace.slug}",
    )


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
