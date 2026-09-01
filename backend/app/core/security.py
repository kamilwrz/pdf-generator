"""Argon2id passwords, legacy bcrypt migration, and versioned JWT identity."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
import unicodedata

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
import bcrypt as bcrypt_lib
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordBearer
import jwt
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.models import User

load_dotenv()

_WEAK_SECRET_KEYS = frozenset({
    "",
    "your-secret-key-here",
    "changeme",
    "secret",
    "test",
    "dev",
    "development",
})

algorithm = (os.getenv("ALGORITHM") or "HS256").strip()
DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES = 7 * 24 * 60
DEFAULT_JWT_KEY_VERSION = "2026-09-01-v2"

# OWASP-aligned Argon2id parameters: 64 MiB, three iterations, two lanes.
# The encoded hash records these values, allowing future rehash-on-login when
# the work factor changes without keeping a separate password schema version.
_argon2 = PasswordHasher(
    time_cost=3,
    memory_cost=64 * 1024,
    parallelism=2,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")
optional_bearer = HTTPBearer(auto_error=False)


def _secret_key() -> str:
    """Read the current signing key so deploy-time rotation takes effect."""
    return (os.getenv("SECRET_KEY") or "").strip()


def _jwt_key_version() -> str:
    """Return the login epoch required in every newly issued token."""
    return (os.getenv("JWT_KEY_VERSION") or DEFAULT_JWT_KEY_VERSION).strip()


def assert_secret_key_configured() -> None:
    """Fail startup when the JWT key is missing, weak, or a placeholder."""
    key = _secret_key()
    if key and key.lower() not in _WEAK_SECRET_KEYS and len(key) >= 32:
        return
    if os.getenv("ALLOW_INSECURE_SECRET", "").lower() == "true":
        return
    raise RuntimeError(
        "SECRET_KEY must be set to a strong value of at least 32 characters. "
        "For local throwaway runs only, set ALLOW_INSECURE_SECRET=true."
    )


def get_access_token_expire_minutes() -> int:
    """Return a positive token lifetime, falling back to seven days."""
    try:
        lifetime = int(
            os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES))
        )
    except ValueError:
        return DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES
    return lifetime if lifetime > 0 else DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Encode a versioned JWT; new callers use immutable ``user.id`` as sub."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=get_access_token_expire_minutes())
    )
    to_encode.update({"exp": expire, "ver": _jwt_key_version()})
    return jwt.encode(to_encode, _secret_key(), algorithm=algorithm)


def _decode_token(token: str) -> dict:
    """Decode and validate signature, subject, and the forced-login epoch.

    Tokens without ``ver`` are accepted only as a deployment bridge. Rotating
    ``SECRET_KEY`` after the new frontend is live invalidates that entire
    legacy population, while a token carrying a different explicit epoch is
    always rejected immediately.
    """
    payload = jwt.decode(token, _secret_key(), algorithms=[algorithm])
    subject = payload.get("sub")
    if subject is None or str(subject).strip() == "":
        raise InvalidTokenError("missing subject")
    token_version = payload.get("ver")
    if token_version is not None and token_version != _jwt_key_version():
        raise InvalidTokenError("stale token version")
    return payload


def _token_error() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail={"code": "invalid_token", "message": "Token jest nieprawidłowy lub wygasł."},
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_token(token: str = Depends(oauth2_scheme)) -> dict:
    """Require a valid Bearer JWT without ever accepting a URL token."""
    try:
        return _decode_token(token)
    except InvalidTokenError as exc:
        raise _token_error() from exc


def verify_token_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer),
) -> dict | None:
    """Return a valid payload for guest-capable routes, otherwise ``None``."""
    if credentials is None or not credentials.credentials:
        return None
    try:
        return _decode_token(credentials.credentials)
    except InvalidTokenError:
        return None


def canonical_identity(value: str | None) -> str:
    """Normalize a username/email lookup key without altering display text."""
    return unicodedata.normalize("NFKC", value or "").strip().casefold()


def resolve_user_from_payload(db: Session, payload: dict) -> User | None:
    """Resolve versioned numeric subjects or exact legacy usernames.

    A legacy token has no ``ver`` claim and its subject is the exact username
    stored by the issuing N-1 worker. It must never be case-folded or parsed as
    an integer: either interpretation could authorize a different account when
    an old worker created a canonical collision or a numeric username.
    """
    subject = str(payload.get("sub") or "").strip()
    token_version = payload.get("ver")
    if token_version is not None:
        if token_version != _jwt_key_version() or not subject.isdigit():
            return None
        return db.query(User).filter(User.id == int(subject), User.is_active.is_(True)).first()
    # The equality is deliberately exact. A canonical lookup would let an N-1
    # `alice` token select a current `Alice` row before its own null-canonical
    # row, while digit parsing would turn username `123` into user id 123.
    return db.query(User).filter(
        User.username == subject,
        User.is_active.is_(True),
    ).first()


def get_current_user(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
) -> User:
    """Central auth dependency: validate token, activity, and immutable owner."""
    user = resolve_user_from_payload(db, payload)
    if user is None:
        raise _token_error()
    return user


def _legacy_bcrypt_bytes(password: str | bytes | None) -> bytes:
    """Reproduce the retired 72-byte bcrypt behavior only for old hashes."""
    if password is None:
        return b""
    encoded = password if isinstance(password, bytes) else str(password).encode("utf-8")
    return encoded[:72]


def hash_password(password: str) -> str:
    """Hash a complete 12–128 character password with Argon2id."""
    return _argon2.hash(password)


def hash_legacy_password(password: str) -> str:
    """Create the temporary bcrypt rollback hash stored for N-1 workers.

    The current application never authenticates against this value when an
    Argon2id hash is available. Bcrypt's historical 72-byte input limit is
    therefore isolated to rollback compatibility and cannot weaken normal
    authentication of 12–128 character passwords.
    """
    return bcrypt_lib.hashpw(
        _legacy_bcrypt_bytes(password),
        bcrypt_lib.gensalt(),
    ).decode("ascii")


def verify_password_and_rehash(plain: str, hashed: str) -> tuple[bool, str | None]:
    """Verify Argon2id or legacy bcrypt and return an optional upgraded hash."""
    if not hashed:
        return False, None
    if hashed.startswith("$argon2"):
        try:
            valid = _argon2.verify(hashed, plain)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False, None
        if valid and _argon2.check_needs_rehash(hashed):
            return True, hash_password(plain)
        return bool(valid), None
    if hashed.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            valid = bcrypt_lib.checkpw(_legacy_bcrypt_bytes(plain), hashed.encode("ascii"))
        except (ValueError, TypeError, UnicodeError):
            return False, None
        return (True, hash_password(plain)) if valid else (False, None)
    return False, None


def verify_password(plain: str, hashed: str) -> bool:
    """Compatibility boolean wrapper around migration-aware verification."""
    valid, _replacement = verify_password_and_rehash(plain, hashed)
    return valid
