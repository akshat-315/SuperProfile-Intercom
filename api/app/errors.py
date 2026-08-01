from typing import Any

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.logging import get_logger

log = get_logger(__name__)

_DEFAULTS: dict[int, tuple[str, str]] = {
    status.HTTP_400_BAD_REQUEST: ("bad_request", "That request wasn't valid."),
    status.HTTP_401_UNAUTHORIZED: ("unauthenticated", "You need to sign in to do that."),
    status.HTTP_403_FORBIDDEN: ("forbidden", "You don't have access to that."),
    status.HTTP_404_NOT_FOUND: ("not_found", "We couldn't find that."),
    status.HTTP_409_CONFLICT: ("conflict", "That conflicts with something that exists."),
    status.HTTP_422_UNPROCESSABLE_CONTENT: ("invalid_request", "Some of those details aren't valid."),
    status.HTTP_429_TOO_MANY_REQUESTS: ("rate_limited", "Too many requests. Wait a moment."),
}

_UNEXPECTED = ("internal_error", "Something went wrong on our end. Please try again.")


class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def current_trace_id() -> str:
    return structlog.contextvars.get_contextvars().get("trace_id", "req_unknown")


def envelope(code: str, message: str, status_code: int) -> JSONResponse:
    trace_id = current_trace_id()
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "trace_id": trace_id}},
        headers={"X-Request-Id": trace_id},
    )


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        log.warning("request.rejected", code=exc.code, status=exc.status_code, **exc.details)
        return envelope(exc.code, exc.message, exc.status_code)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code, message = _DEFAULTS.get(exc.status_code, _UNEXPECTED)
        return envelope(code, message, exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        log.warning("request.invalid", errors=exc.errors())
        code, message = _DEFAULTS[status.HTTP_422_UNPROCESSABLE_CONTENT]
        return envelope(code, message, status.HTTP_422_UNPROCESSABLE_CONTENT)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("request.failed", error=type(exc).__name__)
        code, message = _UNEXPECTED
        return envelope(code, message, status.HTTP_500_INTERNAL_SERVER_ERROR)
