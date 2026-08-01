import base64
import hashlib
import hmac
import json
import re
import secrets
import unicodedata
from datetime import UTC, datetime, timedelta

import bcrypt

from app.config import settings

BCRYPT_ROUNDS = 12
BCRYPT_MAX_BYTES = 72
MIN_PASSWORD_LENGTH = 8

SESSION_TTL = timedelta(days=7)
SESSION_COOKIE = "session"

VERIFICATION_TTL = timedelta(hours=24)

INVITE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
INVITE_CODE_LENGTH = 8

_NON_SLUG = re.compile(r"[^a-z0-9]+")
_CODE_NOISE = re.compile(r"[\s\-]+")


def utcnow() -> datetime:
    return datetime.now(UTC)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_password_bytes(password), password_hash.encode())
    except (ValueError, TypeError):
        return False


def _password_bytes(password: str) -> bytes:
    raw = unicodedata.normalize("NFKC", password).encode()
    if len(raw) <= BCRYPT_MAX_BYTES:
        return raw
    return base64.b64encode(hashlib.sha256(raw).digest())


def password_problem(password: str) -> str | None:
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Use at least {MIN_PASSWORD_LENGTH} characters."
    return None


def sign_session(*, user_id: int, workspace_id: int | None, role: str | None, now: datetime) -> str:
    payload: dict = {"uid": user_id, "exp": int((now + SESSION_TTL).timestamp())}
    if workspace_id is not None:
        payload["wid"] = workspace_id
        payload["role"] = role
    body = _b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    return f"{body}.{_sign(body)}"


def read_session(token: str, *, now: datetime) -> dict | None:
    body, _, signature = token.partition(".")
    if not body or not signature:
        return None
    if not hmac.compare_digest(signature, _sign(body)):
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
    if not isinstance(payload.get("uid"), int):
        return None
    workspace_id = payload.get("wid")
    if workspace_id is not None and not isinstance(workspace_id, int):
        return None
    return payload


def session_expiry(now: datetime) -> datetime:
    return now + SESSION_TTL


def _sign(body: str) -> str:
    digest = hmac.new(settings.session_secret.encode(), body.encode(), hashlib.sha256).digest()
    return _b64encode(digest)


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def new_verification_token() -> str:
    return secrets.token_hex(32)


def verification_expiry(now: datetime) -> datetime:
    return now + VERIFICATION_TTL


def new_invite_code() -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(INVITE_CODE_LENGTH))


def normalise_invite_code(code: str) -> str:
    return _CODE_NOISE.sub("", code).upper()


def format_invite_code(code: str) -> str:
    return f"{code[:4]}-{code[4:]}" if len(code) == INVITE_CODE_LENGTH else code


def slugify(name: str, *, fallback: str = "workspace") -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = _NON_SLUG.sub("-", ascii_name.lower()).strip("-")[:100]
    if not slug or slug.isdigit():
        slug = f"{fallback}-{slug}" if slug else fallback
    return slug
