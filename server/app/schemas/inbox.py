from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CustomerOut(BaseModel):
    id: int
    name: str
    email: str | None


class AssigneeOut(BaseModel):
    id: int
    name: str


class ConversationRow(BaseModel):
    id: int
    channel: str
    status: str
    subject: str | None
    customer: CustomerOut
    assignee: AssigneeOut | None
    snoozed_until: datetime | None
    last_message_at: datetime
    unread: int
    preview: str


class ConversationList(BaseModel):
    items: list[ConversationRow]
    next_cursor: str | None


class MessageOut(BaseModel):
    id: int
    seq: int
    direction: str
    author: AssigneeOut | None
    body_text: str
    client_msg_id: UUID | None
    read_at: datetime | None
    created_at: datetime


class ConversationDetail(BaseModel):
    conversation: ConversationRow
    messages: list[MessageOut]


class ReplyRequest(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    client_msg_id: UUID | None = None
    snooze_until: datetime | None = None
    resolve: bool = False


class AssignRequest(BaseModel):
    user_id: int | None = None


class StatusRequest(BaseModel):
    status: str = Field(min_length=1, max_length=16)


class SnoozeRequest(BaseModel):
    until: datetime
    body: str | None = Field(default=None, max_length=10000)
