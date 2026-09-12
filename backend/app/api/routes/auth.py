"""
Authentication and account entitlement routes.

`/auth/register` creates an unverified account, while password or Google login
issues the JWT only after the relevant identity has been verified.
`/auth/me/entitlements` returns the caller's plan limits so the frontend can
hide or gate paid features without a separate billing round-trip.
"""

from app.core.localisation import message as localised_message
from app.core.localisation import ui_language

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette import status
from app.schemas.user_schema import (
    GoogleCredentialRequest,
    ResendVerificationRequest,
    UserCreateRequest,
    VerifyEmailRequest,
)
from app.crud.user import (
    authenticate_user,
    create_google_user,
    create_user,
    get_user_by_email,
    get_user_by_google_sub,
    get_user_by_username,
)
from fastapi.security import OAuth2PasswordRequestForm
from app.core.security import (
    canonical_identity,
    create_access_token,
    get_access_token_expire_minutes,
    get_current_user,
)
from datetime import datetime, timedelta, timezone
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
from app.core.config import FRONTEND_URL
from app.services.email_service import send_verification_email
from app.services.email_verification import (
    consume_email_verification_token,
    issue_email_verification_token,
)
from app.services.google_auth_service import verify_google_credential

import hashlib
import re
from urllib.parse import quote

router = APIRouter(
    prefix="/auth",
    tags=["auth"]
)


def _token_response(user: User) -> dict:
    """Issue the single application session shape used by every auth method."""
    access_token_expires = timedelta(minutes=get_access_token_expire_minutes())
    token = create_access_token(
        data={"sub": str(user.id), "username": user.username},
        expires_delta=access_token_expires,
    )
    return {"access_token": token, "token_type": "bearer", "username": user.username}


def _verification_url(token: str) -> str:
    return f"{FRONTEND_URL}/verify-email?token={quote(token, safe='')}&lang={ui_language.get()}"


def _verification_idempotency_key(user_id: int, token: str) -> str:
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()[:24]
    return f"verify-{user_id}-{digest}"


@router.post("/register", status_code=201)
def register_user(
    user: UserCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create a new user when the username and email are both unused.

    Side effects: inserts the user and Free subscription, stores a hashed
    single-use proof, and asks Resend to deliver its raw counterpart. Duplicate
    usernames or emails return HTTP 409 with a Polish message for the form.
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
            detail={"code": "username_taken", "message": localised_message('this_username_is_already_taken')},
        )
    if get_user_by_email(db, email=user.email):
        raise HTTPException(
            status_code=409,
            detail={"code": "email_taken", "message": localised_message('this_email_address_is_already_in_use')},
        )
    try:
        create_user(db=db, user=user, email_verified=False)
    except IntegrityError as exc:
        db.rollback()
        # The database unique keys are authoritative for simultaneous signup.
        # Keep the response non-enumerating when the pre-check lost a race.
        raise HTTPException(
            status_code=409,
            detail={"code": "identity_taken", "message": localised_message('this_account_could_not_be_created')},
        ) from exc
    created = get_user_by_username(db, username=user.username)
    raw_token = issue_email_verification_token(db, created.id)
    sent = send_verification_email(
        created.email,
        _verification_url(raw_token),
        idempotency_key=_verification_idempotency_key(created.id, raw_token),
    )
    return {
        "status": "verification_required",
        "email_sent": sent,
        "message": (
            "Wysłaliśmy link potwierdzający na podany adres e-mail."
            if sent else
            "Konto utworzono, ale wiadomość nie została wysłana. Spróbuj ponownie."
        ),
    }


@router.post("/verify-email")
def verify_email(request: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Consume a single-use proof and enable password authentication."""
    user = consume_email_verification_token(db, request.token)
    if user is None:
        raise HTTPException(
            status_code=400,
            detail={"code": "verification_invalid", "message": localised_message('the_link_is_invalid_or_has_expired')},
        )
    return {"status": "verified", "message": localised_message('your_email_address_has_been_verified')}


@router.post("/resend-verification", status_code=202)
def resend_verification(
    request_body: ResendVerificationRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Send a replacement proof while keeping account existence private."""
    claim_rate_limit(db, scope="verify_resend_ip", raw_key=client_ip(request), limit=10, window_seconds=3600)
    # Case variants must share one quota because email identity is canonical in
    # the database; otherwise an attacker could bypass the resend limit.
    claim_rate_limit(
        db,
        scope="verify_resend_email",
        raw_key=canonical_identity(request_body.email),
        limit=3,
        window_seconds=3600,
    )
    user = get_user_by_email(db, request_body.email)
    if user is not None and user.email_verified_at is None and user.is_active:
        raw_token = issue_email_verification_token(db, user.id)
        send_verification_email(
            user.email,
            _verification_url(raw_token),
            idempotency_key=_verification_idempotency_key(user.id, raw_token),
        )
    return {"status": "accepted", "message": localised_message('if_the_account_needs_verification_we_have_sent')}


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
                "message": localised_message('incorrect_username_or_password'),
            },
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.email_verified_at is None:
        clear_rate_limit(db, scope="login_account", raw_key=account_key)
        release_rate_limit_claim(db, scope="login_ip", raw_key=ip_key, window_seconds=window_seconds)
        raise HTTPException(
            status_code=403,
            detail={
                "code": "email_unverified",
                "message": localised_message('verify_your_email_address_before_signing_in'),
                # Credentials were valid, so returning the account address here
                # does not create a username-enumeration oracle.
                "email": user.email,
            },
        )
    clear_rate_limit(db, scope="login_account", raw_key=account_key)
    release_rate_limit_claim(
        db,
        scope="login_ip",
        raw_key=ip_key,
        window_seconds=window_seconds,
    )
    return _token_response(user)


def _google_username(email: str, subject: str) -> str:
    """Build a stable ASCII workspace slug without exposing the full subject."""
    local = email.split("@", 1)[0].lower()
    local = re.sub(r"[^a-z0-9._-]+", "-", local).strip(".-_") or "google"
    local = local[:20]
    if len(local) < 3:
        local = f"google-{local}"
    suffix = hashlib.sha256(subject.encode("utf-8")).hexdigest()[:8]
    return f"{local}-{suffix}"[:32]


@router.post("/google")
def google_login(
    body: GoogleCredentialRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create or authenticate a Google-bound account after provider validation."""
    claim_rate_limit(db, scope="google_login_ip", raw_key=client_ip(request), limit=20, window_seconds=900)
    try:
        claims = verify_google_credential(body.credential)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={"code": "google_unavailable", "message": localised_message('google_sign_in_is_unavailable')}) from exc
    except Exception as exc:
        raise HTTPException(status_code=401, detail={"code": "google_invalid", "message": localised_message('could_not_verify_the_google_account')}) from exc

    subject = str(claims.get("sub") or "").strip()
    email = str(claims.get("email") or "").strip()
    if not subject or not email or claims.get("email_verified") is not True:
        raise HTTPException(status_code=401, detail={"code": "google_invalid", "message": localised_message('the_google_account_has_no_verified_email_address')})
    user = get_user_by_google_sub(db, subject)
    if user is None:
        same_email = get_user_by_email(db, email)
        if same_email is not None:
            raise HTTPException(
                status_code=409,
                detail={"code": "google_link_required", "message": localised_message('sign_in_with_your_password_and_connect_google')},
            )
        try:
            user = create_google_user(
                db,
                username=_google_username(email, subject),
                email=email,
                google_sub=subject,
            )
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=409, detail={"code": "identity_taken", "message": localised_message('this_account_could_not_be_created')}) from exc
    if not user.is_active:
        raise HTTPException(status_code=401, detail={"code": "invalid_token", "message": localised_message('the_account_is_inactive')})
    return _token_response(user)


@router.post("/google/link")
def link_google_account(
    body: GoogleCredentialRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bind Google only after the local account has authenticated explicitly."""
    try:
        claims = verify_google_credential(body.credential)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={"code": "google_unavailable", "message": localised_message('google_sign_in_is_unavailable')}) from exc
    except Exception as exc:
        raise HTTPException(status_code=401, detail={"code": "google_invalid", "message": localised_message('could_not_verify_the_google_account')}) from exc
    subject = str(claims.get("sub") or "").strip()
    email = str(claims.get("email") or "").strip()
    if (
        not subject
        or not email
        or claims.get("email_verified") is not True
        or canonical_identity(email) != current_user.email_canonical
    ):
        raise HTTPException(status_code=409, detail={"code": "google_email_mismatch", "message": localised_message('the_google_email_address_does_not_match_this')})
    owner = get_user_by_google_sub(db, subject)
    if owner is not None and owner.id != current_user.id:
        raise HTTPException(status_code=409, detail={"code": "google_already_linked", "message": localised_message('this_google_account_is_already_connected')})
    current_user.google_sub = subject
    current_user.email_verified_at = current_user.email_verified_at or datetime.now(timezone.utc)
    try:
        db.add(current_user)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail={"code": "google_already_linked", "message": localised_message('this_google_account_is_already_connected')}) from exc
    return {"status": "linked"}


@router.get("/verify-token")
def verify_user_token(_user: User = Depends(get_current_user)):
    """Validate the Bearer JWT and require its account to remain active."""
    return {"message": localised_message('the_token_is_valid')}


@router.get("/me/entitlements")
def me_entitlements(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return plan limits and feature flags for the authenticated user."""
    return get_entitlements(db, user)
