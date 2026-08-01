from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=1, max_length=512)
    invite_code: str | None = Field(default=None, max_length=32)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=512)


class CreateWorkspaceRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class SwitchWorkspaceRequest(BaseModel):
    workspace_id: int


class WorkspaceOut(BaseModel):
    id: int
    name: str
    slug: str


class MembershipOut(BaseModel):
    workspace: WorkspaceOut
    role: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    email_verified: bool


class MeResponse(BaseModel):
    user: UserOut
    memberships: list[MembershipOut]
    active_workspace: WorkspaceOut | None
    role: str | None


class VerifyResponse(BaseModel):
    already_verified: bool
    joined_workspace_id: int | None
