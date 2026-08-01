from typing import Any, Literal, get_args

from sqlalchemy import BigInteger, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseTable, Id, Timestamp

JobStatus = Literal["pending", "done", "failed"]
JOB_STATUSES: tuple[str, ...] = get_args(JobStatus)

PENDING: JobStatus = "pending"
DONE: JobStatus = "done"
FAILED: JobStatus = "failed"


class Job(BaseTable):
    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_due", "status", "run_at"),)

    id: Mapped[Id]
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=PENDING)
    run_at: Mapped[Timestamp] = mapped_column(nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    workspace_id: Mapped[int | None] = mapped_column(BigInteger)
