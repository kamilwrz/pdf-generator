from passlib.context import CryptContext
import bcrypt as bcrypt_lib
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
import os
from dotenv import load_dotenv

load_dotenv(override=True)

secret_key = os.getenv("SECRET_KEY")
algorithm = os.getenv("ALGORITHM")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

def create_access_token(data:dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, secret_key, algorithm=algorithm)
    return encoded_jwt

def verify_token(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, secret_key, algorithms=[algorithm])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=403, detail="Token jest nieprawidłowy lub wygasł")
        return payload
    except JWTError:
        raise HTTPException(status_code=403, detail="Token jest nieprawidłowy lub wygasł")

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