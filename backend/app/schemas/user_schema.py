"""Request body for user registration."""

import re

from pydantic import BaseModel, field_validator

# Pragmatic email-shape check used at registration. This is a format sanity
# guard, not full RFC 5322 validation: it rejects obvious mistakes (missing @,
# missing domain, embedded whitespace) without pulling in the optional
# `email-validator` dependency that Pydantic's `EmailStr` requires. Upgrade to
# `EmailStr` (and add the dependency) if stricter validation is ever needed.
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UserCreateRequest(BaseModel):
    """Credentials and optional plan slug chosen at signup.

    `plan` defaults to free. Paid values are only honoured when unpaid plan
    selection is enabled; otherwise registration forces Free. `email` is
    format-checked and whitespace-trimmed before it reaches the database.
    """

    username: str
    password: str
    email: str
    plan: str = "free"

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        """Trim and reject clearly malformed addresses (returns the normalized value)."""
        normalized = value.strip()
        if not _EMAIL_PATTERN.match(normalized):
            raise ValueError("Nieprawidłowy adres e-mail.")
        return normalized
