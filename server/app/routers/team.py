from fastapi import APIRouter, Response, status

from app.deps import Admin, InWorkspace, VerifiedAdmin
from app.errors import AppError
from app.logging import get_logger
from app.routers.auth import set_session_cookie
from app.schemas.team import (
    InviteOut,
    InviteRequest,
    LeaveResponse,
    MemberOut,
    RoleRequest,
    TeamResponse,
)
from app.services import invites, outbox, team, workspaces
from app.services.security import format_invite_code, utcnow

router = APIRouter(prefix="/api/team", tags=["team"])
log = get_logger(__name__)

CANNOT_REMOVE_SELF = "Use leave instead of removing yourself."


@router.get("", response_model=TeamResponse)
async def list_team(signed_in: InWorkspace) -> TeamResponse:
    people = await team.members(signed_in.db)
    return TeamResponse(
        members=[
            MemberOut(
                user_id=m.user.id,
                name=m.user.name,
                email=m.user.email,
                role=m.role,
                email_verified=m.user.email_verified,
                joined_at=m.joined_at,
                last_seen_at=m.user.last_seen_at,
            )
            for m in people
        ]
    )


@router.post("/invite", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def invite(body: InviteRequest, signed_in: VerifiedAdmin) -> InviteOut:
    assert signed_in.workspace is not None
    created = await invites.create(
        signed_in.db,
        workspace_id=signed_in.workspace.id,
        email=body.email,
        role=body.role,
        invited_by=signed_in.user,
        now=utcnow(),
    )
    await outbox.queue_invite(
        signed_in.db,
        email=created.email,
        code=created.code,
        workspace_id=signed_in.workspace.id,
        inviter_name=signed_in.user.name,
    )
    await signed_in.db.commit()

    return InviteOut(
        email=created.email,
        role=created.role,
        code=format_invite_code(created.code),
        expires_at=created.expires_at,
    )


@router.delete("/me", response_model=LeaveResponse)
async def leave(response: Response, signed_in: InWorkspace) -> LeaveResponse:
    deleted = await team.leave(signed_in.db, signed_in.user.id)
    await signed_in.db.commit()

    held = await workspaces.memberships(signed_in.db, signed_in.user)
    set_session_cookie(response, signed_in.user, held[0] if held else None)

    return LeaveResponse(
        workspace_deleted=deleted,
        active_workspace_id=held[0].workspace.id if held else None,
    )


@router.patch("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def set_role(user_id: int, body: RoleRequest, signed_in: Admin) -> None:
    await team.change_role(signed_in.db, user_id, body.role)
    await signed_in.db.commit()


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(user_id: int, signed_in: Admin) -> None:
    if user_id == signed_in.user.id:
        raise AppError("remove_self", CANNOT_REMOVE_SELF, status_code=400)
    await team.remove(signed_in.db, user_id)
    await signed_in.db.commit()
