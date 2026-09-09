"""Plan catalog, Stripe Checkout creation, and webhook fulfillment."""

import os
import secrets
import hashlib
import hmac
import logging

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

# Read once at import time (by value), so tests/ops must patch
# `app.api.routes.billing.ALLOW_UNPAID_PLAN_SELECTION` directly — setting the
# env var after import has no effect on this module.
from app.core.config import (
    ALLOW_UNPAID_PLAN_SELECTION,
    FRONTEND_URL,
    STRIPE_PRICE_PRO,
    STRIPE_SECRET_KEY,
)
from app.core.security import resolve_user_from_payload, verify_token
from app.dependencies import get_db
from app.models.models import Payment, User
from app.services.billing_service import fulfill_pro_payment
from app.services.stripe_service import construct_webhook_event, create_checkout_session
from app.services.entitlements import (
    SELECTABLE_PLANS,
    get_entitlements,
    list_selectable_plans,
    normalize_plan_slug,
    reset_ai_credits,
    set_user_plan,
)

router = APIRouter(prefix="/billing", tags=["billing"])
logger = logging.getLogger(__name__)


class SelectPlanRequest(BaseModel):
    """Requested plan slug: free | pro (legacy standard/premium remap to pro)."""

    plan_slug: str


@router.get("/plans")
async def get_plans(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Catalog for the in-app plan picker (Stripe price IDs included when set)."""
    user = resolve_user_from_payload(db, payload)
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    return {
        "plans": list_selectable_plans(db),
        "current_plan_slug": get_entitlements(db, user)["plan_slug"],
        "allow_unpaid_selection": ALLOW_UNPAID_PLAN_SELECTION,
    }


@router.post("/select-plan")
async def select_plan(
    request: SelectPlanRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    """Activate a development plan or create an idempotent Stripe Checkout Session."""
    user = resolve_user_from_payload(db, payload)
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    plan_slug = normalize_plan_slug(request.plan_slug)
    if plan_slug not in SELECTABLE_PLANS:
        raise HTTPException(status_code=400, detail="Nieznany plan.")
    if plan_slug != "free" and not ALLOW_UNPAID_PLAN_SELECTION:
        if not STRIPE_SECRET_KEY or not STRIPE_PRICE_PRO:
            raise HTTPException(
                status_code=402,
                detail={
                    "code": "payment_required",
                    "message": "Płatności są chwilowo niedostępne.",
                    "plan_slug": plan_slug,
                    "checkout_url": None,
                },
            )
        if not idempotency_key or not 8 <= len(idempotency_key) <= 255:
            raise HTTPException(
                status_code=400,
                detail={"code": "idempotency_required", "message": "Rozpocznij płatność ponownie."},
            )
        checkout = create_checkout_session(
            user_id=user.id,
            email=user.email,
            price_id=STRIPE_PRICE_PRO,
            success_url=f"{FRONTEND_URL}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_URL}/billing/cancel",
            idempotency_key=f"pro-{user.id}-{idempotency_key}",
        )
        session_id = str(getattr(checkout, "id", "") or checkout.get("id"))
        checkout_url = str(getattr(checkout, "url", "") or checkout.get("url"))
        payment = db.query(Payment).filter_by(provider="stripe", provider_ref=session_id).one_or_none()
        if payment is None:
            try:
                db.add(Payment(
                    user_id=user.id,
                    provider="stripe",
                    provider_ref=session_id,
                    plan_slug="pro",
                    amount_cents=5900,
                    currency="pln",
                    status="pending",
                    raw=None,
                    created_at=datetime.now(timezone.utc),
                ))
                db.commit()
            except IntegrityError:
                db.rollback()
        return {
            "plan_slug": "pro",
            "payment_required": True,
            "checkout_url": checkout_url,
            "checkout_session_id": session_id,
        }
    sub = set_user_plan(db, user.id, plan_slug)
    return {
        "plan_slug": sub.plan_slug,
        "payment_required": False,
        "checkout_url": None,
        "entitlements": get_entitlements(db, user),
    }


class ResetAiCreditsRequest(BaseModel):
    """Ops helper: zero this month's AI usage so the plan allowance is full again."""

    user_id: int


class AdminSetUserPlanRequest(BaseModel):
    """Exact account identity and plan requested by an authorized operator."""

    username: str
    plan_slug: str


def _admin_secret_ok(x_admin_secret: str | None) -> bool:
    """Accept only a dedicated high-entropy ops secret for credit resets."""
    provided = (x_admin_secret or "").strip()
    expected = (os.getenv("ADMIN_RESET_SECRET") or "").strip()
    if not provided or len(expected) < 32:
        return False
    return secrets.compare_digest(provided, expected)


def _admin_audit_target_ref(user_id: int) -> str:
    """Return a non-reversible target reference for operations audit logs."""

    expected = (os.getenv("ADMIN_RESET_SECRET") or "").strip().encode("utf-8")
    digest = hmac.new(
        expected,
        f"ai-credit-reset:{int(user_id)}".encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    return digest[:20]


def _admin_plan_audit_target_ref(username: str) -> str:
    """Return a non-reversible reference without logging account identity."""

    expected = (os.getenv("ADMIN_RESET_SECRET") or "").strip().encode("utf-8")
    digest = hmac.new(
        expected,
        f"plan-change:{username}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return digest[:20]


@router.post("/admin/set-user-plan")
def admin_set_user_plan(
    request: AdminSetUserPlanRequest,
    db: Session = Depends(get_db),
    x_admin_secret: str | None = Header(default=None, alias="X-Admin-Secret"),
):
    """Assign an active plan to one exact username through the ops channel.

    The dedicated admin secret is mandatory and account matching is deliberately
    case-sensitive. This prevents a support operation from selecting a visually
    similar account while still allowing plan changes when Render PostgreSQL is
    unreachable from an operator workstation.
    """
    if not _admin_secret_ok(x_admin_secret):
        logger.warning("admin_plan_change outcome=denied reason=invalid_secret")
        raise HTTPException(
            status_code=403,
            detail={
                "code": "admin_secret_invalid",
                "message": "Brak uprawnień do tej operacji.",
            },
        )

    target_ref = _admin_plan_audit_target_ref(request.username)
    plan_slug = normalize_plan_slug(request.plan_slug)
    if plan_slug not in SELECTABLE_PLANS:
        logger.warning(
            "admin_plan_change outcome=invalid_plan target_ref=%s",
            target_ref,
        )
        raise HTTPException(
            status_code=400,
            detail={"code": "unknown_plan", "message": "Nieznany plan."},
        )

    user = db.query(User).filter(User.username == request.username).one_or_none()
    if user is None:
        logger.warning(
            "admin_plan_change outcome=not_found target_ref=%s",
            target_ref,
        )
        raise HTTPException(
            status_code=404,
            detail={"code": "user_not_found", "message": "Nie znaleziono użytkownika."},
        )

    try:
        subscription = set_user_plan(db, user.id, plan_slug)
        entitlements = get_entitlements(db, user)
    except Exception as exc:
        logger.error(
            "admin_plan_change outcome=failed target_ref=%s error_type=%s",
            target_ref,
            type(exc).__name__,
        )
        raise

    logger.info(
        "admin_plan_change outcome=success target_ref=%s plan_slug=%s",
        target_ref,
        subscription.plan_slug,
    )
    return {
        "plan_slug": subscription.plan_slug,
        "status": subscription.status,
        "current_period_start": subscription.current_period_start,
        "current_period_end": subscription.current_period_end,
        "entitlements": entitlements,
    }


def _stripe_value(obj, name: str, default=None):
    """Read either a StripeObject attribute or a test dictionary field."""
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Verify Stripe's raw payload and fulfill a paid Checkout exactly once."""
    payload = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    try:
        event = construct_webhook_event(payload, signature)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature.") from exc
    event_type = _stripe_value(event, "type", "")
    event_id = str(_stripe_value(event, "id", ""))
    if event_type not in {"checkout.session.completed", "checkout.session.async_payment_succeeded"}:
        return {"status": "ignored"}
    data = _stripe_value(event, "data", {})
    session = _stripe_value(data, "object", {})
    if _stripe_value(session, "payment_status") != "paid":
        return {"status": "pending"}
    session_id = str(_stripe_value(session, "id", ""))
    payment = db.query(Payment).filter_by(provider="stripe", provider_ref=session_id).one_or_none()
    if payment is None:
        # A signed Stripe event proves its origin, but it does not prove that the
        # Checkout Session was created by this application. Requiring the local
        # pending ledger row prevents an arbitrary dashboard-created Session
        # with forged metadata from granting access. Stripe retries non-2xx
        # events, which covers the short race before the row is committed.
        raise HTTPException(status_code=409, detail="Unknown checkout session.")
    if payment.status == "succeeded":
        return {"status": "already_processed"}
    amount_total = _stripe_value(session, "amount_total")
    currency = str(_stripe_value(session, "currency", "")).lower()
    if (
        payment.amount_cents is not None
        and (amount_total != payment.amount_cents or currency != payment.currency.lower())
    ):
        # The Checkout Session is created from a server-owned Price, but the
        # ledger remains the final business contract. A misconfigured Price
        # must never grant Pro for a different amount or currency.
        raise HTTPException(status_code=409, detail="Checkout amount does not match the pending payment.")
    try:
        activated = fulfill_pro_payment(
            db,
            payment=payment,
            event_id=event_id or f"session:{session_id}",
            amount_cents=amount_total,
            currency=currency,
            customer_id=_stripe_value(session, "customer"),
        )
    except IntegrityError:
        db.rollback()
        return {"status": "already_processed"}
    return {"status": "activated" if activated else "already_processed"}


@router.get("/checkout-session/{session_id}")
def checkout_session_status(
    session_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Return only the authenticated owner's local fulfillment status."""
    user = resolve_user_from_payload(db, payload)
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    payment = db.query(Payment).filter_by(
        provider="stripe",
        provider_ref=session_id,
        user_id=user.id,
    ).one_or_none()
    if payment is None:
        raise HTTPException(status_code=404, detail={"code": "checkout_not_found", "message": "Nie znaleziono płatności."})
    return {"status": payment.status, "plan_slug": payment.plan_slug}


@router.post("/admin/reset-ai-credits")
def admin_reset_ai_credits(
    request: ResetAiCreditsRequest,
    db: Session = Depends(get_db),
    x_admin_secret: str | None = Header(default=None, alias="X-Admin-Secret"),
):
    """Reset monthly AI credit usage for a user (ops / local support).

    Requires header ``X-Admin-Secret`` matching ``ADMIN_RESET_SECRET``.
    Used when the laptop cannot reach Render Postgres directly.
    """
    if not _admin_secret_ok(x_admin_secret):
        # Never log the supplied secret, target id, headers, or client address.
        # The outcome alone is sufficient to alert on denied admin attempts.
        logger.warning("admin_ai_credit_reset outcome=denied reason=invalid_secret")
        raise HTTPException(
            status_code=403,
            detail={
                "code": "admin_secret_invalid",
                "message": "Brak uprawnień do tej operacji.",
            },
        )
    target_ref = _admin_audit_target_ref(request.user_id)
    # Exact immutable ids avoid resetting the wrong account when usernames are
    # visually similar or an operator pastes only part of a display name.
    user = db.query(User).filter(User.id == request.user_id).first()
    if user is None:
        logger.warning(
            "admin_ai_credit_reset outcome=not_found target_ref=%s",
            target_ref,
        )
        raise HTTPException(
            status_code=404,
            detail={"code": "user_not_found", "message": "Nie znaleziono użytkownika."},
        )
    try:
        reset_ai_credits(db, user.id)
        ents = get_entitlements(db, user)
    except Exception as exc:
        logger.error(
            "admin_ai_credit_reset outcome=failed target_ref=%s error_type=%s",
            target_ref,
            type(exc).__name__,
        )
        raise
    logger.info(
        "admin_ai_credit_reset outcome=success target_ref=%s",
        target_ref,
    )
    return {
        "period_key": ents["usage"]["period_key"],
        "ai_credits_used": ents["usage"]["ai_credits_used"],
        "monthly_ai_credits": ents["limits"]["monthly_ai_credits"],
        "ai_credits_remaining": ents["remaining"]["ai_credits"],
    }
