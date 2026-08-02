import threading
import time
from dataclasses import dataclass

from app.errors import AppError
from app.logging import get_logger

log = get_logger(__name__)

TOO_MANY = "Too many attempts. Wait a minute and try again."
MAX_TRACKED = 4096
IDLE_SECONDS = 3600


@dataclass(frozen=True)
class Limit:
    allowed: int
    window_seconds: int
    name: str

    @property
    def refill_per_second(self) -> float:
        return self.allowed / self.window_seconds


LOGIN = Limit(allowed=5, window_seconds=60, name="login")
SIGNUP = Limit(allowed=3, window_seconds=60, name="signup")
VERIFY_RESEND = Limit(allowed=3, window_seconds=3600, name="verify_resend")
WIDGET_SESSION = Limit(allowed=20, window_seconds=60, name="widget_session")
WIDGET_START = Limit(allowed=5, window_seconds=300, name="widget_start")
WIDGET_SEND = Limit(allowed=30, window_seconds=60, name="widget_send")
WS_TICKET = Limit(allowed=30, window_seconds=60, name="ws_ticket")
WS_TYPING = Limit(allowed=5, window_seconds=1, name="ws_typing")
HELP_PUBLIC = Limit(allowed=60, window_seconds=60, name="help_public")


class _Buckets:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._buckets: dict[str, tuple[float, float]] = {}

    def take(self, key: str, limit: Limit, now: float) -> bool:
        with self._lock:
            self._forget_idle(now)
            tokens, seen = self._buckets.get(key, (float(limit.allowed), now))
            tokens = min(float(limit.allowed), tokens + (now - seen) * limit.refill_per_second)
            if tokens < 1.0:
                self._buckets[key] = (tokens, now)
                return False
            self._buckets[key] = (tokens - 1.0, now)
            return True

    def _forget_idle(self, now: float) -> None:
        if len(self._buckets) < MAX_TRACKED:
            return
        self._buckets = {
            key: bucket for key, bucket in self._buckets.items() if now - bucket[1] < IDLE_SECONDS
        }


_buckets = _Buckets()


def allow(limit: Limit, key: str) -> bool:
    return _buckets.take(f"{limit.name}:{key}", limit, time.monotonic())


def enforce(limit: Limit, key: str) -> None:
    if allow(limit, key):
        return
    log.warning("ratelimit.hit", limit=limit.name, key=key)
    raise AppError("rate_limited", TOO_MANY, status_code=429)
