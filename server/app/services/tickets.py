import secrets
import threading
import time
from dataclasses import dataclass

AGENT = "agent"
VISITOR = "visitor"
TTL_SECONDS = 30
MAX_TRACKED = 4096


@dataclass(frozen=True)
class Claim:
    kind: str
    workspace_id: int
    user_id: int | None = None
    name: str | None = None
    role: str | None = None
    customer_id: int | None = None


_lock = threading.Lock()
_issued: dict[str, tuple[Claim, float]] = {}


def mint(claim: Claim) -> str:
    token = secrets.token_urlsafe(32)
    with _lock:
        _forget_expired(time.monotonic())
        _issued[token] = (claim, time.monotonic())
    return token


def redeem(token: str) -> Claim | None:
    with _lock:
        found = _issued.pop(token, None)
    if found is None:
        return None
    claim, issued_at = found
    if time.monotonic() - issued_at > TTL_SECONDS:
        return None
    return claim


def _forget_expired(now: float) -> None:
    if len(_issued) < MAX_TRACKED:
        return
    for token in [t for t, (_, at) in _issued.items() if now - at > TTL_SECONDS]:
        _issued.pop(token, None)
