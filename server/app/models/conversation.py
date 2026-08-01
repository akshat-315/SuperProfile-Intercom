from datetime import datetime
from typing import Literal, get_args

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseTable, HasWorkspaceId, Id, Timestamp

Channel = Literal["chat", "email"]
CHANNELS: tuple[str, ...] = get_args(Channel)
CHAT: Channel = "chat"
EMAIL: Channel = "email"

Status = Literal["open", "resolved"]
STATUSES: tuple[str, ...] = get_args(Status)
OPEN: Status = "open"
RESOLVED: Status = "resolved"


class Conversation(HasWorkspaceId, BaseTable):
    __tablename__ = "conversations"
    __table_args__ = (
        Index("ix_conversations_recent", "workspace_id", "last_message_at"),
        Index("ix_conversations_assignee", "workspace_id", "assignee_user_id"),
    )

    id: Mapped[Id]
    customer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=OPEN)
    subject: Mapped[str | None] = mapped_column(String(200))
    assignee_user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    snoozed_until: Mapped[Timestamp | None]
    last_message_at: Mapped[Timestamp] = mapped_column(nullable=False)
    last_message_preview: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    unread_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    def is_snoozed(self, now: datetime) -> bool:
        return self.snoozed_until is not None and self.snoozed_until > now
