import asyncio
from collections.abc import Awaitable, Callable
from contextlib import suppress
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import session_factory
from app.logging import get_logger
from app.models import DONE, FAILED, PENDING, Job, utcnow

log = get_logger(__name__)

Handler = Callable[[AsyncSession, Job], Awaitable[None]]

HANDLERS: dict[str, Handler] = {}

MAX_ATTEMPTS = 5
BATCH_SIZE = 20
POLL_SECONDS = 3.0
BACKOFF_CAP = timedelta(minutes=10)
ERROR_LIMIT = 500


def handles(kind: str) -> Callable[[Handler], Handler]:
    def register(handler: Handler) -> Handler:
        HANDLERS[kind] = handler
        return handler

    return register


async def enqueue(
    db: AsyncSession,
    *,
    kind: str,
    payload: dict[str, Any],
    run_at: datetime | None = None,
    workspace_id: int | None = None,
) -> Job:
    if kind not in HANDLERS:
        raise ValueError(f"no handler registered for job kind {kind!r}")

    job = Job(
        kind=kind,
        payload=payload,
        status=PENDING,
        run_at=run_at or utcnow(),
        workspace_id=workspace_id,
    )
    db.add(job)
    await db.flush()
    log.info("job.queued", job_id=job.id, kind=kind)
    return job


def backoff(attempts: int) -> timedelta:
    return min(timedelta(minutes=2 ** (attempts - 1)), BACKOFF_CAP)


async def run_due(db: AsyncSession, *, now: datetime) -> int:
    due = list(
        await db.scalars(
            select(Job)
            .where(Job.status == PENDING, Job.run_at <= now)
            .order_by(Job.run_at)
            .limit(BATCH_SIZE)
            .with_for_update(skip_locked=True)
        )
    )

    for job in due:
        job.attempts += 1
        try:
            handler = HANDLERS[job.kind]
        except KeyError:
            job.status = FAILED
            job.last_error = f"no handler registered for {job.kind!r}"
            log.error("job.no_handler", job_id=job.id, kind=job.kind)
            continue

        try:
            await handler(db, job)
        except Exception as exc:
            job.last_error = f"{type(exc).__name__}: {exc}"[:ERROR_LIMIT]
            if job.attempts >= MAX_ATTEMPTS:
                job.status = FAILED
                log.error("job.gave_up", job_id=job.id, kind=job.kind, error=job.last_error)
            else:
                job.run_at = now + backoff(job.attempts)
                log.warning(
                    "job.retrying",
                    job_id=job.id,
                    kind=job.kind,
                    attempt=job.attempts,
                    error=job.last_error,
                )
        else:
            job.status = DONE
            job.last_error = None
            log.info("job.done", job_id=job.id, kind=job.kind)

    await db.commit()
    return len(due)


async def run_forever(stop: asyncio.Event) -> None:
    log.info("jobs.runner_started")
    while not stop.is_set():
        try:
            async with session_factory() as db:
                await run_due(db, now=utcnow())
        except Exception as exc:
            log.error("jobs.runner_error", error=f"{type(exc).__name__}: {exc}")

        with suppress(TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=POLL_SECONDS)

    log.info("jobs.runner_stopped")
