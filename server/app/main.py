import asyncio
import secrets
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager, suppress
from urllib.parse import urlsplit

import structlog
from fastapi import FastAPI, Request, Response

from app.config import settings
from app.errors import envelope, register_error_handlers
from app.logging import configure_logging, get_logger
from app.routers import auth, dev, health, inbox, invites, team, workspaces
from app.services import jobs, outbox  # noqa: F401  handlers register on import

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    log.info("app.started", environment=settings.environment, version=settings.version)

    stop = asyncio.Event()
    runner = asyncio.create_task(jobs.run_forever(stop))
    try:
        yield
    finally:
        stop.set()
        with suppress(asyncio.CancelledError):
            await runner


app = FastAPI(title="Intercom API", version=settings.version, lifespan=lifespan)

register_error_handlers(app)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(team.router)
app.include_router(invites.router)
app.include_router(inbox.router)
app.include_router(dev.router)


CHANGING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

NO_COOKIE_PATHS = ("/api/widget/", "/hooks/")


def own_origin() -> str:
    parsed = urlsplit(settings.app_url)
    return f"{parsed.scheme}://{parsed.netloc}".lower()


@app.middleware("http")
async def refuse_other_origins(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    origin = request.headers.get("origin")
    changing = request.method in CHANGING_METHODS
    carries_cookie = not request.url.path.startswith(NO_COOKIE_PATHS)

    if changing and carries_cookie and origin is not None and origin.lower() != own_origin():
        log.warning("request.foreign_origin", origin=origin, path=request.url.path)
        return envelope("forbidden_origin", "That request came from somewhere else.", 403)

    return await call_next(request)


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
