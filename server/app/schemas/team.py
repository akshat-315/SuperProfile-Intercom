from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class MemberOut(BaseModel):
    user_id: int
    name: str
    email: str
    role: str
    email_verified: bool
    joined_at: datetime
    last_seen_at: datetime | None


class TeamResponse(BaseModel):
    members: list[MemberOut]


class InviteRequest(BaseModel):
    email: EmailStr
    role: str = Field(min_length=1, max_length=16)


class InviteOut(BaseModel):
    email: str
    role: str
    code: str
    expires_at: datetime


class RoleRequest(BaseModel):
    role: str = Field(min_length=1, max_length=16)


class InvitePreview(BaseModel):
    workspace_name: str
    inviter_name: str
    email: str
    role: str


class RenameWorkspaceRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class LeaveResponse(BaseModel):
    workspace_deleted: bool
