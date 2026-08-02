import base64
import hashlib
import hmac
import time

from app.logging import get_logger

log = get_logger(__name__)

TOLERANCE_SECONDS = 300
PREFIX = "whsec_"


def verify(raw: bytes, headers: dict[str, str] | None, secret: str) -> bool:
    if not secret:
        log.warning("webhook.no_secret")
        return False

    message_id = _header(headers, "webhook-id", "svix-id")
    timestamp = _header(headers, "webhook-timestamp", "svix-timestamp")
    signatures = _header(headers, "webhook-signature", "svix-signature")
    if not message_id or not timestamp or not signatures:
        return False

    if not _recent(timestamp):
        log.warning("webhook.stale_timestamp", timestamp=timestamp)
        return False

    key = base64.b64decode(secret.removeprefix(PREFIX))
    signed = f"{message_id}.{timestamp}.".encode() + raw
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()

    for candidate in signatures.split(" "):
        version, _, value = candidate.partition(",")
        if version == "v1" and hmac.compare_digest(value, expected):
            return True

    log.warning("webhook.bad_signature", message_id=message_id)
    return False


def _header(headers: dict[str, str] | None, *names: str) -> str | None:
    if not headers:
        return None
    for name in names:
        found = headers.get(name)
        if found:
            return found
    return None


def _recent(timestamp: str) -> bool:
    try:
        sent_at = int(timestamp)
    except ValueError:
        return False
    return abs(time.time() - sent_at) <= TOLERANCE_SECONDS
