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


class SetupOut(BaseModel):
    """The three things a new workspace needs before anyone can use it.

    None of it is secret. The widget key is public by design - it sits in the
    page source of every site that installs the panel - and the support address
    is one customers write to. So any member may read this, not only admins.
    """

    widget_key: str
    install_snippet: str
    support_email: str | None
    help_url: str


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
