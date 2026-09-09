"""Server-side verification for Google Identity Services credentials."""
from __future__ import annotations

from app.core.config import GOOGLE_CLIENT_ID


def verify_google_credential(credential: str) -> dict:
    """Validate signature, issuer, audience, and expiry through google-auth."""
    if not GOOGLE_CLIENT_ID:
        raise RuntimeError("Google authentication is not configured.")
    from google.auth.transport import requests
    from google.oauth2 import id_token

    return id_token.verify_oauth2_token(
        credential,
        requests.Request(),
        GOOGLE_CLIENT_ID,
    )
