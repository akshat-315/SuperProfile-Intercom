from sqlalchemy import String, UniqueConstraint
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseTable, HasWorkspaceId, Id


class Customer(HasWorkspaceId, BaseTable):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("workspace_id", "visitor_id", name="uq_customer_visitor"),
        UniqueConstraint("workspace_id", "email", name="uq_customer_email"),
    )

    id: Mapped[Id]
    email: Mapped[str | None] = mapped_column(CITEXT)
    name: Mapped[str | None] = mapped_column(String(120))
    visitor_id: Mapped[str | None] = mapped_column(String(64))

    @property
    def display_name(self) -> str:
        return self.name or self.email or "Anonymous visitor"
