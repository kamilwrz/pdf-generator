"""Minimal Resend HTTP client for transactional account messages."""
from __future__ import annotations

import html
import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import EMAIL_FROM, RESEND_API_KEY


logger = logging.getLogger(__name__)


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
    except (HTTPError, URLError, TimeoutError):
        logger.exception("verification_email outcome=failed")
        return False
