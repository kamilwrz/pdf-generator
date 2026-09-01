"""
User lookup, registration, and password authentication.

New accounts receive a subscription plan immediately. When unpaid paid-plan
selection is disabled, registration silently falls back to Free so Stripe can
own paid upgrades later without blocking signup.
"""

from sqlalchemy.orm import Session
from app.models.models import User, UserSubscription
from app.schemas.user_schema import UserCreateRequest
from datetime import datetime, timedelta, timezone
from app.core.security import (
    canonical_identity,
    hash_legacy_password,
    hash_password,
    verify_password_and_rehash,
)
from app.services.entitlements import (
    normalize_plan_slug,
    PRO_PASS_DAYS,
)
# Read once at import time (by value), so tests/ops must patch
# `app.crud.user.ALLOW_UNPAID_PLAN_SELECTION` directly — setting the env var
# or patching app.core.config after import has no effect on this module.
from app.core.config import ALLOW_UNPAID_PLAN_SELECTION


def _get_user_by_canonical_with_legacy_fallback(
    db: Session,
    *,
    canonical_column,
    display_attribute: str,
    value: str,
):
    """Resolve indexed canonical identities plus temporary N-1 null rows.

    The first query is the steady-state indexed path. Only when it misses do we
    scan the small compatibility set inserted by old workers after migration
    0011. Python performs NFKC/casefold comparison because database ``lower``
    functions are not Unicode-equivalent across SQLite and PostgreSQL.
    """
    lookup_key = canonical_identity(value)
    if not lookup_key:
        return None
    current = db.query(User).filter(canonical_column == lookup_key).first()
    if current is not None:
        return current
    legacy_candidates = db.query(User).filter(canonical_column.is_(None)).yield_per(100)
    return next(
        (
            candidate
            for candidate in legacy_candidates
            if canonical_identity(getattr(candidate, display_attribute, None)) == lookup_key
        ),
        None,
    )


def get_user_by_username(db: Session, username: str):
    """Return a canonical user, including a nullable N-1 compatibility row."""
    return _get_user_by_canonical_with_legacy_fallback(
        db,
        canonical_column=User.username_canonical,
        display_attribute="username",
        value=username,
    )


def get_user_by_email(db: Session, email: str):
    """Return the User row for `email`, or None (used for signup uniqueness)."""
    return _get_user_by_canonical_with_legacy_fallback(
        db,
        canonical_column=User.email_canonical,
        display_attribute="email",
        value=email,
    )


def create_user(db: Session, user: UserCreateRequest) -> str:
    """Atomically insert a canonical account and its initial subscription.

    Side effects: users insert + subscription write. Returns a plain success
    string for the register route rather than the ORM object.
    """
    argon2_password_hash = hash_password(user.password)
    legacy_password_hash = hash_legacy_password(user.password)
    db_user = User(
        username=user.username,
        username_canonical=canonical_identity(user.username),
        email=user.email,
        email_canonical=canonical_identity(user.email),
        # Keep the bcrypt value only for N-1 workers during the additive
        # migration window. Current workers always prefer the Argon2id column.
        hashed_password=legacy_password_hash,
        argon2_password_hash=argon2_password_hash,
        created_at=datetime.now(timezone.utc),
        is_active=True,
    )
    requested = normalize_plan_slug(getattr(user, "plan", "free") or "free")
    if requested != "free" and not ALLOW_UNPAID_PLAN_SELECTION:
        requested = "free"
    try:
        if requested not in {"free", "pro"}:
            requested = "free"
        now = datetime.now(timezone.utc)
        db.add(db_user)
        db.flush()
        db.add(UserSubscription(
            user_id=db_user.id,
            plan_slug=requested,
            status="active",
            current_period_start=now,
            current_period_end=(now + timedelta(days=PRO_PASS_DAYS)) if requested == "pro" else None,
            updated_at=now,
            free_import_used=False,
        ))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return "user registration complete"


def authenticate_user(username: str, password: str, db: Session):
    """Return the User on valid credentials, otherwise False.

    Callers should treat any non-User return as an auth failure without
    revealing whether the username existed.
    """
    user = get_user_by_username(db, username)
    if not user:
        return False
    preferred_hash = user.argon2_password_hash or user.hashed_password
    valid, replacement_hash = verify_password_and_rehash(password, preferred_hash)
    if not valid:
        return False
    if user.argon2_password_hash is None:
        # Successful legacy login is the only moment plaintext is available.
        # Add Argon2id without overwriting bcrypt so an N-1 rollback can still
        # authenticate the account during the documented compatibility window.
        user.argon2_password_hash = (
            replacement_hash
            if replacement_hash and replacement_hash.startswith("$argon2")
            else hash_password(password)
        )
        if user.hashed_password.startswith("$argon2"):
            # Repair accounts created by the short-lived pre-bridge build:
            # preserve their Argon2id value above and recreate the rollback
            # bcrypt slot while the plaintext is available.
            user.hashed_password = hash_legacy_password(password)
        db.add(user)
        db.commit()
        db.refresh(user)
    elif replacement_hash is not None:
        # Rehash only the preferred Argon2id slot when its cost parameters age.
        user.argon2_password_hash = replacement_hash
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
