from typing import Literal, get_args

from sqlalchemy import BigInteger, ColumnElement, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseTable, HasWorkspaceId, Id, Timestamp, WorkspaceOwned

Role = Literal["admin", "agent"]
ROLES: tuple[str, ...] = get_args(Role)

ADMIN: Role = "admin"
AGENT: Role = "agent"


class Workspace(WorkspaceOwned, BaseTable):
    __tablename__ = "workspaces"

    id: Mapped[Id]
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(140), unique=True, nullable=False)

    @classmethod
    def workspace_filter(cls, workspace_id: int) -> ColumnElement[bool]:
        return cls.id == workspace_id


class WorkspaceMember(HasWorkspaceId, BaseTable):
    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("user_id", "workspace_id", name="uq_member_user_workspace"),
    )

    id: Mapped[Id]
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    joined_at: Mapped[Timestamp] = mapped_column(nullable=False)
