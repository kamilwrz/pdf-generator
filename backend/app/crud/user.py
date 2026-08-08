"""
User lookup, registration, and password authentication.

New accounts receive a subscription plan immediately. When unpaid paid-plan
selection is disabled, registration silently falls back to Free so Stripe can
own paid upgrades later without blocking signup.
"""

from sqlalchemy.orm import Session
from app.models.models import User
from app.schemas.user_schema import UserCreateRequest
from datetime import datetime, timezone
from app.core.security import hash_password, verify_password
from app.services.entitlements import (
    ensure_free_subscription,
    normalize_plan_slug,
    set_user_plan,
)
# Read once at import time (by value), so tests/ops must patch
# `app.crud.user.ALLOW_UNPAID_PLAN_SELECTION` directly — setting the env var
# or patching app.core.config after import has no effect on this module.
from app.core.config import ALLOW_UNPAID_PLAN_SELECTION


def get_user_by_username(db: Session, username: str):
    """Return the User row for `username`, or None."""
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: Session, email: str):
    """Return the User row for `email`, or None (used for signup uniqueness)."""
    return db.query(User).filter(User.email == email).first()


def create_user(db: Session, user: UserCreateRequest) -> str:
    """Insert a hashed user and attach the requested (or Free) plan.

    Side effects: users insert + subscription write. Returns a plain success
    string for the register route rather than the ORM object.
    """
    hashed_password = hash_password(user.password)
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        created_at=datetime.now(timezone.utc),
        is_active=True,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    requested = normalize_plan_slug(getattr(user, "plan", "free") or "free")
    if requested != "free" and not ALLOW_UNPAID_PLAN_SELECTION:
        requested = "free"
    try:
        set_user_plan(db, db_user.id, requested)
    except ValueError:
        ensure_free_subscription(db, db_user.id)
    return "user registration complete"


def authenticate_user(username: str, password: str, db: Session):
    """Return the User on valid credentials, otherwise False.

    Callers should treat any non-User return as an auth failure without
    revealing whether the username existed.
    """
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user
