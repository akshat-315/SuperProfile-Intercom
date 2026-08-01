from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseTable, HasWorkspaceId, Id, Timestamp


class Invite(HasWorkspaceId, BaseTable):
    __tablename__ = "invites"
    __table_args__ = (Index("ix_invites_workspace_email", "workspace_id", "email"),)

    id: Mapped[Id]
    email: Mapped[str] = mapped_column(CITEXT, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    invited_by_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    expires_at: Mapped[Timestamp] = mapped_column(nullable=False)
    accepted_at: Mapped[Timestamp | None]

    def is_usable(self, now: datetime) -> bool:
        return self.accepted_at is None and self.expires_at > now
