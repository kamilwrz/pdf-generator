"""Request body for user registration."""

import re
import unicodedata

from pydantic import BaseModel, field_validator

# Pragmatic email-shape check used at registration. This is a format sanity
# guard, not full RFC 5322 validation: it rejects obvious mistakes (missing @,
# missing domain, embedded whitespace) without pulling in the optional
# `email-validator` dependency that Pydantic's `EmailStr` requires. Upgrade to
# `EmailStr` (and add the dependency) if stricter validation is ever needed.
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]{3,32}$")


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

    @field_validator("username")
    @classmethod
    def _validate_username(cls, value: str) -> str:
        """Normalize display text and enforce the stable ASCII login alphabet."""
        normalized = unicodedata.normalize("NFKC", value or "").strip()
        if not _USERNAME_PATTERN.fullmatch(normalized):
            raise ValueError(
                "Nazwa użytkownika musi mieć 3–32 znaki: litery, cyfry, kropka, _ lub -."
            )
        return normalized

    @field_validator("password")
    @classmethod
    def _validate_password(cls, value: str) -> str:
        """Reject weak or oversized passwords without modifying user input."""
        if not isinstance(value, str) or not 12 <= len(value) <= 128:
            raise ValueError("Hasło musi mieć od 12 do 128 znaków.")
        return value

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        """Trim and reject clearly malformed addresses."""
        normalized = unicodedata.normalize("NFKC", value or "").strip()
        if not _EMAIL_PATTERN.match(normalized):
            raise ValueError("Nieprawidłowy adres e-mail.")
        return normalized


class VerifyEmailRequest(BaseModel):
    """Opaque, single-use proof copied from the verification link."""

    token: str


class ResendVerificationRequest(BaseModel):
    """Address that should receive a replacement verification message."""

    email: str

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        normalized = unicodedata.normalize("NFKC", value or "").strip()
        if not _EMAIL_PATTERN.match(normalized):
            raise ValueError("Nieprawidłowy adres e-mail.")
        return normalized


class GoogleCredentialRequest(BaseModel):
    """Google Identity Services ID token returned in `credential`."""

    credential: str

    @field_validator("credential")
    @classmethod
    def _validate_credential(cls, value: str) -> str:
        normalized = (value or "").strip()
        if not normalized or len(normalized) > 8192:
            raise ValueError("Nieprawidłowe poświadczenie Google.")
        return normalized
