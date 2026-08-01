from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=1, max_length=512)
    workspace_name: str = Field(min_length=1, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=512)


class WorkspaceOut(BaseModel):
    id: int
    name: str
    slug: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    email_verified: bool


class MeResponse(BaseModel):
    user: UserOut
    workspace: WorkspaceOut
    role: str
