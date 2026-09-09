"""Minimal Resend HTTP client for transactional account messages."""
from __future__ import annotations

import html
import json
import logging
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import EMAIL_FROM, RESEND_API_KEY


logger = logging.getLogger(__name__)
_EMAIL_RE = re.compile(r"[^\s@]+@[^\s@]+")
_URL_RE = re.compile(r"https?://\S+")


def _safe_provider_error(error: HTTPError) -> tuple[str, str]:
    """Extract a bounded Resend error without logging account or token data.

    Resend places the useful rejection reason in the HTTP response body. The
    transport exception alone reports only ``403 Forbidden``, which cannot
    distinguish a sender-domain problem from an API-key permission problem.
    """
    try:
        raw_body = error.read(4096).decode("utf-8", errors="replace")
        payload = json.loads(raw_body)
    except (AttributeError, UnicodeError, json.JSONDecodeError):
        return "unknown", "Provider returned no JSON error details."

    if not isinstance(payload, dict):
        return "unknown", "Provider returned an unexpected error payload."

    provider_code = str(payload.get("name") or payload.get("code") or "unknown")
    message = str(payload.get("message") or "Provider returned no error message.")
    # Provider validation messages can echo submitted addresses or URLs. Keep
    # the operational reason while removing user data and verification proofs.
    message = _EMAIL_RE.sub("<redacted-email>", message)
    message = _URL_RE.sub("<redacted-url>", message)
    message = " ".join(message.split())[:500]
    return provider_code[:100], message


def send_verification_email(to: str, verification_url: str, *, idempotency_key: str) -> bool:
    """Send a verification link without exposing the token in logs.

    Returns False when delivery is not configured or Resend rejects the request.
    Registration remains committed in either case so the user can use resend.
    """
    if not RESEND_API_KEY:
        logger.warning("verification_email outcome=disabled")
        return False
    safe_url = html.escape(verification_url, quote=True)
    body = json.dumps({
        "from": EMAIL_FROM,
        "to": [to],
        "subject": "Potwierdź konto w CV Studio",
        "text": f"Potwierdź adres e-mail, otwierając ten link: {verification_url}\nLink wygasa po 24 godzinach.",
        "html": (
            "<h1>Potwierdź konto w CV Studio</h1>"
            "<p>Otwórz poniższy link, aby potwierdzić adres e-mail.</p>"
            f'<p><a href="{safe_url}">Potwierdź adres e-mail</a></p>'
            "<p>Link wygasa po 24 godzinach.</p>"
        ),
    }).encode("utf-8")
    request = Request(
        "https://api.resend.com/emails",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key,
        },
    )
    try:
        with urlopen(request, timeout=10) as response:
            return 200 <= response.status < 300
    except HTTPError as error:
        provider_code, message = _safe_provider_error(error)
        logger.error(
            "verification_email outcome=failed provider=resend status=%s provider_code=%s message=%s",
            error.code,
            provider_code,
            message,
        )
        return False
    except (URLError, TimeoutError) as error:
        logger.error(
            "verification_email outcome=failed provider=resend transport_error=%s",
            type(error).__name__,
        )
        return False
