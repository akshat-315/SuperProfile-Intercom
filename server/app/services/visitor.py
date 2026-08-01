import base64
import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.config import settings

VISITOR_TTL = timedelta(days=30)

_SESSION = b"widget-visitor-v1"
_BROWSER = b"widget-browser-v1"


@dataclass(frozen=True)
class Visitor:
    visitor_id: str
    customer_id: int
    workspace_id: int


def sign_session(*, visitor_id: str, customer_id: int, workspace_id: int, now: datetime) -> str:
    return _seal({"vid": visitor_id, "cid": customer_id, "wid": workspace_id}, _SESSION, now=now)


def read_session(token: str, *, now: datetime) -> Visitor | None:
    payload = _open(token, _SESSION, now=now)
    if payload is None:
        return None
    vid, cid, wid = payload.get("vid"), payload.get("cid"), payload.get("wid")
    if not isinstance(vid, str) or not isinstance(cid, int) or not isinstance(wid, int):
        return None
    return Visitor(visitor_id=vid, customer_id=cid, workspace_id=wid)


def sign_browser_id(visitor_id: str, *, now: datetime) -> str:
    return _seal({"vid": visitor_id}, _BROWSER, now=now)


def read_browser_id(token: str, *, now: datetime) -> str | None:
    payload = _open(token, _BROWSER, now=now)
    if payload is None:
        return None
    visitor_id = payload.get("vid")
    return visitor_id if isinstance(visitor_id, str) else None


def _seal(body: dict, purpose: bytes, *, now: datetime) -> str:
    payload = {**body, "exp": int((now + VISITOR_TTL).timestamp())}
    encoded = _b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    return f"{encoded}.{_sign(encoded, purpose)}"


def _open(token: str, purpose: bytes, *, now: datetime) -> dict | None:
    body, _, signature = token.partition(".")
    if not body or not signature:
        return None
    if not hmac.compare_digest(signature, _sign(body, purpose)):
        return None
    try:
        payload = json.loads(_b64decode(body))
    except (ValueError, TypeError):
        return None
    if not isinstance(payload, dict):
        return None
    expires_at = payload.get("exp")
    if not isinstance(expires_at, int) or expires_at <= int(now.timestamp()):
        return None
    return payload


def _sign(body: str, purpose: bytes) -> str:
    key = hmac.new(settings.session_secret.encode(), purpose, hashlib.sha256).digest()
    return _b64encode(hmac.new(key, body.encode(), hashlib.sha256).digest())


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
