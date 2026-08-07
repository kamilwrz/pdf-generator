"""
Authentication primitives: password hashing and JWT access tokens.

Passwords are stored as bcrypt hashes. Bcrypt itself silently truncates input
at 72 bytes, so this module truncates explicitly before hash/verify so login
and registration always use the same byte prefix.

Access tokens are JWTs whose `sub` claim is the username. Lifetime defaults to
seven days and can be overridden with ACCESS_TOKEN_EXPIRE_MINUTES.
"""

from passlib.context import CryptContext
import bcrypt as bcrypt_lib
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordBearer
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
import os
from dotenv import load_dotenv

load_dotenv()

# Known placeholders that must never ship as a production signing key.
_WEAK_SECRET_KEYS = frozenset({
    "",
    "your-secret-key-here",
    "changeme",
    "secret",
    "test",
    "dev",
    "development",
})

secret_key = (os.getenv("SECRET_KEY") or "").strip()
algorithm = (os.getenv("ALGORITHM") or "HS256").strip()
DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES = 7 * 24 * 60


def assert_secret_key_configured() -> None:
    """Fail fast when SECRET_KEY is missing or an obvious placeholder.

    Called from the FastAPI lifespan so unit tests that never start the app
    can still import modules. Re-reads the environment so TestClient setups
    can set SECRET_KEY before creating the client. Set
    ALLOW_INSECURE_SECRET=true only for local throwaway environments —
    never in production.
    """
    key = (os.getenv("SECRET_KEY") or secret_key or "").strip()
    if key and key.lower() not in _WEAK_SECRET_KEYS and len(key) >= 16:
        return
    if os.getenv("ALLOW_INSECURE_SECRET", "").lower() == "true":
        return
    raise RuntimeError(
        "SECRET_KEY must be set to a strong value (at least 16 characters, "
        "not a placeholder). For local throwaway runs only, set "
        "ALLOW_INSECURE_SECRET=true."
    )

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# Token URL matches the OAuth2 password form used by /auth/token.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")
# Optional Bearer for guest-capable routes (e.g. fill_template). Prefer
# HTTPBearer over a second OAuth2PasswordBearer so OpenAPI does not mark the
# route as requiring the password flow, and missing credentials yield None
# instead of FastAPI's English "Not authenticated" 401.
optional_bearer = HTTPBearer(auto_error=False)

def get_access_token_expire_minutes() -> int:
    """Return a positive token lifetime in minutes, falling back to seven days."""
    try:
        lifetime = int(
            os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES))
        )
    except ValueError:
        return DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES

    return lifetime if lifetime > 0 else DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Encode a JWT for the given claims, always setting an absolute `exp`.

    Callers typically pass ``{"sub": username}``. The returned string is what
    the frontend stores and sends as a Bearer token.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=get_access_token_expire_minutes())
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, secret_key, algorithm=algorithm)
    return encoded_jwt

def verify_token(token: str = Depends(oauth2_scheme)) -> dict:
    """FastAPI dependency: require a valid Bearer JWT and return its payload.

    Raises HTTP 403 with a Polish message when the token is missing, malformed,
    expired, or lacks a `sub` claim. Routes that need the username should read
    ``payload["sub"]``.
    """
    try:
        payload = jwt.decode(token, secret_key, algorithms=[algorithm])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=403, detail="Token jest nieprawidłowy lub wygasł")
        return payload
    except JWTError:
        raise HTTPException(status_code=403, detail="Token jest nieprawidłowy lub wygasł")


def verify_token_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer),
) -> dict | None:
    """Return a JWT payload when a valid Bearer token is present, else ``None``.

    Used by guest-capable routes such as ``POST /ai/fill_template``. A missing,
    malformed, or expired token is treated as an anonymous guest rather than a
    hard 401/403 — the route itself decides Free-tier limits for that case.
    """
    if credentials is None or not credentials.credentials:
        return None
    token = credentials.credentials
    try:
        payload = jwt.decode(token, secret_key, algorithms=[algorithm])
        username: str = payload.get("sub")
        if username is None:
            return None
        return payload
    except JWTError:
        return None

def _password_to_72_bytes(password: str | bytes | None) -> bytes:
    """Bcrypt accepts at most 72 bytes. Return password as bytes, never longer than 72."""
    if password is None:
        return b""
    if isinstance(password, bytes):
        return password[:72]
    s = password if isinstance(password, str) else str(password)
    encoded = s.encode("utf-8")
    return encoded[:72]


def hash_password(password: str) -> str:
    """Hash a password for storage. Long passwords are truncated to 72 bytes for bcrypt."""
    pw_bytes = _password_to_72_bytes(password)
    return bcrypt_lib.hashpw(pw_bytes, bcrypt_lib.gensalt()).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain password against a hash. Long passwords are truncated to 72 bytes."""
    pw_bytes = _password_to_72_bytes(plain)
    return bcrypt_lib.checkpw(pw_bytes, hashed.encode("ascii"))
