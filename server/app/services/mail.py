import httpx

from app.config import settings
from app.logging import get_logger

log = get_logger(__name__)

RESEND_URL = "https://api.resend.com/emails"
RECEIVING_URL = "https://api.resend.com/emails/receiving"
TIMEOUT_SECONDS = 10.0


class MailUnavailable(Exception):
    pass


async def fetch_received(email_id: str) -> dict:
    if not settings.mail_configured:
        raise MailUnavailable("no mail credentials configured")

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.get(
                f"{RECEIVING_URL}/{email_id}",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            )
    except httpx.HTTPError as exc:
        raise MailUnavailable(f"{type(exc).__name__}: {exc}") from exc

    if response.status_code >= 400:
        raise MailUnavailable(f"resend returned {response.status_code}: {response.text[:200]}")
    return response.json()


async def send(*, to: str, subject: str, html: str, text: str) -> bool:
    if not settings.mail_configured:
        log.warning("mail.not_configured", to=to, subject=subject)
        return False

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.post(
                RESEND_URL,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.sender,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                    "text": text,
                },
            )
    except httpx.HTTPError as exc:
        log.error("mail.send_failed", to=to, error=f"{type(exc).__name__}: {exc}")
        return False

    if response.status_code >= 400:
        log.error("mail.rejected", to=to, status=response.status_code, body=response.text[:300])
        return False

    log.info("mail.sent", to=to, subject=subject)
    return True


def verification_email(*, name: str, link: str) -> tuple[str, str, str]:
    subject = "Confirm your email address"
    text = (
        f"Hi {name},\n\n"
        f"Confirm your email address to finish setting up your account:\n\n"
        f"{link}\n\n"
        f"This link works for 24 hours. If you did not create an account, ignore this email.\n"
    )
    html = (
        f"<p>Hi {name},</p>"
        f"<p>Confirm your email address to finish setting up your account.</p>"
        f'<p><a href="{link}">Confirm my email address</a></p>'
        f"<p>This link works for 24 hours. "
        f"If you did not create an account, you can ignore this email.</p>"
    )
    return subject, html, text


def invite_email(
    *, workspace_name: str, inviter_name: str, link: str, code: str
) -> tuple[str, str, str]:
    subject = f"{inviter_name} invited you to {workspace_name}"
    text = (
        f"{inviter_name} has invited you to join {workspace_name}.\n\n"
        f"{link}\n\n"
        f"Or enter this code when you sign up: {code}\n\n"
        f"This invitation works for 7 days.\n"
    )
    html = (
        f"<p><strong>{inviter_name}</strong> has invited you to join "
        f"<strong>{workspace_name}</strong>.</p>"
        f'<p><a href="{link}">Accept the invitation</a></p>'
        f"<p>Or enter this code when you sign up: <strong>{code}</strong></p>"
        f"<p>This invitation works for 7 days.</p>"
    )
    return subject, html, text
