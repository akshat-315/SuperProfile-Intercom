from typing import Literal, get_args
from uuid import UUID

from sqlalchemy import BigInteger, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseTable, HasWorkspaceId, Id, Timestamp

Direction = Literal["inbound", "outbound"]
DIRECTIONS: tuple[str, ...] = get_args(Direction)
INBOUND: Direction = "inbound"
OUTBOUND: Direction = "outbound"


class Message(HasWorkspaceId, BaseTable):
    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint("conversation_id", "seq", name="uq_message_seq"),
        UniqueConstraint("conversation_id", "client_msg_id", name="uq_message_client_id"),
        UniqueConstraint("workspace_id", "external_id", name="uq_message_external_id"),
    )

    id: Mapped[Id]
    conversation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    direction: Mapped[str] = mapped_column(String(16), nullable=False)
    author_user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    body_text: Mapped[str] = mapped_column(Text, nullable=False)
    client_msg_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True))
    read_at: Mapped[Timestamp | None]
