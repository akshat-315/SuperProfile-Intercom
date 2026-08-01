from datetime import UTC, datetime
from typing import Annotated

from sqlalchemy import BigInteger, ColumnElement, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

Timestamp = Annotated[datetime, mapped_column(DateTime(timezone=True))]
Id = Annotated[int, mapped_column(BigInteger, primary_key=True)]


def utcnow() -> datetime:
    return datetime.now(UTC)


class BaseTable(Base):
    __abstract__ = True

    created_at: Mapped[Timestamp] = mapped_column(server_default=func.now())


class WorkspaceOwned:
    @classmethod
    def workspace_filter(cls, workspace_id: int) -> ColumnElement[bool]:
        raise NotImplementedError


class HasWorkspaceId(WorkspaceOwned):
    workspace_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    @classmethod
    def workspace_filter(cls, workspace_id: int) -> ColumnElement[bool]:
        return cls.workspace_id == workspace_id
