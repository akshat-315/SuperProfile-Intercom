from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseTable, Id, Timestamp


class User(BaseTable):
    __tablename__ = "users"

    id: Mapped[Id]
    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email_verified_at: Mapped[Timestamp | None]
    last_seen_at: Mapped[Timestamp | None]

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None


class EmailVerification(BaseTable):
    __tablename__ = "email_verifications"
    __table_args__ = (Index("ix_email_verifications_user_id", "user_id"),)

    id: Mapped[Id]
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[Timestamp] = mapped_column(nullable=False)
    used_at: Mapped[Timestamp | None]

    def is_usable(self, now: datetime) -> bool:
        return self.used_at is None and self.expires_at > now


def touch_last_seen(user: User, now: datetime) -> bool:
    if user.last_seen_at is not None and (now - user.last_seen_at).total_seconds() < 60:
        return False
    user.last_seen_at = now
    return True
