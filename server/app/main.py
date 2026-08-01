import secrets
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response

from app.config import settings
from app.errors import register_error_handlers
from app.logging import configure_logging, get_logger
from app.routers import auth, health, invites, team, workspaces

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    log.info("app.started", environment=settings.environment, version=settings.version)
    yield


app = FastAPI(title="Intercom API", version=settings.version, lifespan=lifespan)

register_error_handlers(app)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(team.router)
app.include_router(invites.router)


@app.middleware("http")
async def trace_requests(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    trace_id = "req_" + secrets.token_hex(4)
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(trace_id=trace_id)

    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        _log_request(request, status_code=500, started=started)
        raise

    _log_request(request, status_code=response.status_code, started=started)
    response.headers["X-Request-Id"] = trace_id
    return response


def _log_request(request: Request, *, status_code: int, started: float) -> None:
    route = request.scope.get("route")
    log.info(
        "http.request",
        **{
            "http.method": request.method,
            "http.route": getattr(route, "path", request.url.path),
            "http.status_code": status_code,
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        },
    )
