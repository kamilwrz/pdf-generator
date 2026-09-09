"""Issue and consume single-use email-verification proofs."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from sqlalchemy.orm import Session

from app.models.models import EmailVerificationToken, User


TOKEN_LIFETIME = timedelta(hours=24)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def token_digest(token: str) -> str:
    """Return the non-reversible lookup key persisted in the database."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_email_verification_token(db: Session, user_id: int) -> str:
    """Invalidate older proofs and return a new raw token for email delivery."""
    now = _utcnow()
    db.query(EmailVerificationToken).filter(
        EmailVerificationToken.user_id == user_id,
        EmailVerificationToken.consumed_at.is_(None),
    ).update({EmailVerificationToken.consumed_at: now}, synchronize_session=False)
    raw_token = secrets.token_urlsafe(32)
    db.add(EmailVerificationToken(
        user_id=user_id,
        token_hash=token_digest(raw_token),
        created_at=now,
        expires_at=now + TOKEN_LIFETIME,
    ))
    db.commit()
    return raw_token


def consume_email_verification_token(db: Session, raw_token: str) -> User | None:
    """Verify and consume a proof atomically, returning its account on success."""
    if not raw_token or len(raw_token) > 512:
        return None
    now = _utcnow()
    proof = (
        db.query(EmailVerificationToken)
        .filter(EmailVerificationToken.token_hash == token_digest(raw_token))
        .with_for_update()
        .one_or_none()
    )
    if proof is None or proof.consumed_at is not None or _as_utc(proof.expires_at) <= now:
        return None
    user = db.query(User).filter(User.id == proof.user_id).with_for_update().one_or_none()
    if user is None or not user.is_active:
        return None
    proof.consumed_at = now
    user.email_verified_at = user.email_verified_at or now
    db.add_all([proof, user])
    db.commit()
    db.refresh(user)
    return user
