from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.db import SessionDep
from app.logging import get_logger

router = APIRouter(tags=["health"])
log = get_logger(__name__)


class Health(BaseModel):
    status: str
    db: str
    version: str


@router.get("/health", response_model=Health, summary="Report whether the process can serve traffic")
async def health(session: SessionDep, response: Response) -> Health:
    db_ok = True
    try:
        await session.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        db_ok = False
        log.error("health.db_unavailable", error=type(exc).__name__)
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return Health(
        status="ok" if db_ok else "degraded",
        db="ok" if db_ok else "error",
        version=settings.version,
    )
