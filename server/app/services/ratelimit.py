import threading
import time
from dataclasses import dataclass

from app.errors import AppError
from app.logging import get_logger

log = get_logger(__name__)


@dataclass(frozen=True)
class Limit:
    allowed: int
    window_seconds: int
    name: str


LOGIN = Limit(allowed=5, window_seconds=60, name="login")
SIGNUP = Limit(allowed=3, window_seconds=60, name="signup")
VERIFY_RESEND = Limit(allowed=3, window_seconds=3600, name="verify_resend")


class _Counter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._windows: dict[str, tuple[float, int]] = {}

    def hit(self, key: str, limit: Limit, now: float) -> bool:
        with self._lock:
            self._forget_expired(now)
            started_at, count = self._windows.get(key, (now, 0))
            if now - started_at >= limit.window_seconds:
                started_at, count = now, 0
            count += 1
            self._windows[key] = (started_at, count)
            return count <= limit.allowed

    def _forget_expired(self, now: float) -> None:
        if len(self._windows) < 1024:
            return
        self._windows = {
            key: window for key, window in self._windows.items() if now - window[0] < 3600
        }

    def reset(self) -> None:
        with self._lock:
            self._windows.clear()


_counter = _Counter()


def enforce(limit: Limit, key: str) -> None:
    if _counter.hit(f"{limit.name}:{key}", limit, time.monotonic()):
        return
    log.warning("ratelimit.hit", limit=limit.name, key=key)
    raise AppError(
        "rate_limited",
        "Too many attempts. Wait a minute and try again.",
        status_code=429,
    )


def reset() -> None:
    _counter.reset()
