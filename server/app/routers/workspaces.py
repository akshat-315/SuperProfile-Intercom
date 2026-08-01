from fastapi import APIRouter, Response, status

from app.deps import SignedIn
from app.routers.auth import me_response, set_session_cookie
from app.schemas.auth import CreateWorkspaceRequest, MeResponse
from app.services import workspaces as service
from app.services.security import utcnow

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


@router.post("", response_model=MeResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    body: CreateWorkspaceRequest, response: Response, signed_in: SignedIn
) -> MeResponse:
    active = await service.create(signed_in.db, signed_in.user, name=body.name, now=utcnow())
    await signed_in.db.commit()

    set_session_cookie(response, signed_in.user, active)
    return await me_response(signed_in.db, signed_in.user, active)
