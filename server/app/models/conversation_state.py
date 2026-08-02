from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseTable, HasWorkspaceId, Timestamp

SUMMARY_FIELDS = ("product", "issue", "intent", "tried", "status")
KEYWORDS = "keywords"


class ConversationState(HasWorkspaceId, BaseTable):
    __tablename__ = "conversation_states"

    conversation_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    state: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    last_seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    model: Mapped[str | None] = mapped_column(String(80))
    updated_at: Mapped[Timestamp] = mapped_column(server_default=func.now())
