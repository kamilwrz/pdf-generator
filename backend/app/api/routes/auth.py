"""
Authentication and account entitlement routes.

`/auth/register` and `/auth/token` create accounts and issue JWTs.
`/auth/me/entitlements` returns the caller's plan limits so the frontend can
hide or gate paid features without a separate billing round-trip.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette import status
from app.schemas.user_schema import UserCreateRequest
from app.crud.user import get_user_by_username, get_user_by_email, create_user, authenticate_user
from fastapi.security import OAuth2PasswordRequestForm
from app.core.security import (
    canonical_identity,
    create_access_token,
    get_access_token_expire_minutes,
    get_current_user,
)
from datetime import timedelta
from app.dependencies import get_db
from app.services.entitlements import get_entitlements
from app.services.auth_rate_limit import (
    AuthRateLimitExceeded,
    claim_rate_limit,
    clear_rate_limit,
    client_ip,
    release_rate_limit_claim,
)
from app.models.models import User

router = APIRouter(
    prefix="/auth",
    tags=["auth"]
)


@router.post("/register")
def register_user(
    user: UserCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create a new user when the username and email are both unused.

    Side effects: inserts a users row (and entitlements bootstrap may later
    attach a Free plan during DB init for existing users). Duplicate usernames
    or emails return HTTP 400 with a Polish message for the registration form.
    The email pre-check turns what would otherwise be a database uniqueness
    IntegrityError (surfacing as a 500) into an actionable validation message.
    """
    claim_rate_limit(
        db,
        scope="register_ip",
        raw_key=client_ip(request),
        limit=5,
        window_seconds=60 * 60,
    )
    db_user = get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(
            status_code=409,
            detail={"code": "username_taken", "message": "Nazwa użytkownika jest już zajęta."},
        )
    if get_user_by_email(db, email=user.email):
        raise HTTPException(
            status_code=409,
            detail={"code": "email_taken", "message": "Adres e-mail jest już zajęty."},
        )
    try:
        return create_user(db=db, user=user)
    except IntegrityError as exc:
        db.rollback()
        # The database unique keys are authoritative for simultaneous signup.
        # Keep the response non-enumerating when the pre-check lost a race.
        raise HTTPException(
            status_code=409,
            detail={"code": "identity_taken", "message": "Nie można utworzyć tego konta."},
        ) from exc


@router.post("/token")
def login_for_acess_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """OAuth2 password-form login used by the SPA and Swagger UI.

    On success returns a Bearer JWT whose `sub` is the immutable numeric user
    ID. Admission is claimed atomically before Argon2 work, limiting both
    failed credentials and the password hasher's concurrent memory cost.
    Failed credentials use HTTP 401 with WWW-Authenticate so clients can clear
    stale tokens without treating the response as a network failure.
    """
    account_key = canonical_identity(form_data.username)
    ip_key = client_ip(request)
    window_seconds = 15 * 60
    claim_rate_limit(
        db,
        scope="login_account",
        raw_key=account_key,
        limit=5,
        window_seconds=window_seconds,
    )
    try:
        claim_rate_limit(
            db,
            scope="login_ip",
            raw_key=ip_key,
            limit=20,
            window_seconds=window_seconds,
        )
    except AuthRateLimitExceeded:
        # The account admission did not reach password verification because
        # this IP was already blocked, so it must not count as a failed login.
        release_rate_limit_claim(
            db,
            scope="login_account",
            raw_key=account_key,
            window_seconds=window_seconds,
        )
        raise
    try:
        user = authenticate_user(form_data.username, form_data.password, db)
    except Exception:
        # Operational failures are not credential failures. Refund both
        # admissions before propagating the sanitized global/server response.
        release_rate_limit_claim(
            db,
            scope="login_account",
            raw_key=account_key,
            window_seconds=window_seconds,
        )
        release_rate_limit_claim(
            db,
            scope="login_ip",
            raw_key=ip_key,
            window_seconds=window_seconds,
        )
        raise
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "invalid_credentials",
                "message": "Nieprawidłowa nazwa użytkownika lub hasło.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )
    clear_rate_limit(db, scope="login_account", raw_key=account_key)
    release_rate_limit_claim(
        db,
        scope="login_ip",
        raw_key=ip_key,
        window_seconds=window_seconds,
    )
    access_token_expires = timedelta(minutes=get_access_token_expire_minutes())
    access_token = create_access_token(
        data={"sub": str(user.id), "username": user.username},
        expires_delta=access_token_expires,
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/verify-token")
def verify_user_token(_user: User = Depends(get_current_user)):
    """Validate the Bearer JWT and require its account to remain active."""
    return {"message": "Token jest prawidłowy."}


@router.get("/me/entitlements")
def me_entitlements(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return plan limits and feature flags for the authenticated user."""
    return get_entitlements(db, user)
