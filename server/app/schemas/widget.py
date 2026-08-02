from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class SessionRequest(BaseModel):
    key: str = Field(min_length=1, max_length=32)
    browser_id: str | None = Field(default=None, max_length=512)
    name: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = None


class VisitorOut(BaseModel):
    id: int
    name: str | None
    email: str | None


class SessionOut(BaseModel):
    session: str
    browser_id: str
    workspace_name: str
    greeting: str | None
    visitor: VisitorOut


class ThreadOut(BaseModel):
    id: int
    status: str
    preview: str
    unread: int
    last_at: datetime


class ThreadList(BaseModel):
    items: list[ThreadOut]


class ChatMessage(BaseModel):
    id: int
    seq: int
    sender: Literal["customer", "agent"]
    author: str | None
    body: str
    at: datetime
    client_msg_id: UUID | None


class ThreadDetail(BaseModel):
    thread: ThreadOut
    messages: list[ChatMessage]


class SendRequest(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    client_msg_id: UUID | None = None
