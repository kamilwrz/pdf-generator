"""
Plan catalog and pre-Stripe plan activation.

Until Checkout is wired, paid plans can be activated instantly when
`ALLOW_UNPAID_PLAN_SELECTION` is true. That flag is read at import time, so
tests must patch this module's binding rather than changing the env var after
import.
"""

import os
import secrets
import hashlib
import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Read once at import time (by value), so tests/ops must patch
# `app.api.routes.billing.ALLOW_UNPAID_PLAN_SELECTION` directly — setting the
# env var after import has no effect on this module.
from app.core.config import ALLOW_UNPAID_PLAN_SELECTION
from app.core.security import resolve_user_from_payload, verify_token
from app.dependencies import get_db
from app.models.models import User
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
):
    """Activate a plan instantly (pre-Stripe) or signal that Checkout is required.

    Stripe seam: when `ALLOW_UNPAID_PLAN_SELECTION` is False and the user picks
    Pro, return 402 with `code=payment_required`. Later this branch creates a
    Checkout Session and returns `checkout_url` instead of activating.
    """
    user = resolve_user_from_payload(db, payload)
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    plan_slug = normalize_plan_slug(request.plan_slug)
    if plan_slug not in SELECTABLE_PLANS:
        raise HTTPException(status_code=400, detail="Nieznany plan.")
    if plan_slug != "free" and not ALLOW_UNPAID_PLAN_SELECTION:
        # Stripe later: create Checkout Session here and return checkout_url.
        raise HTTPException(
            status_code=402,
            detail={
                "code": "payment_required",
                "message": "Ten plan wymaga płatności.",
                "plan_slug": plan_slug,
                "checkout_url": None,
            },
        )
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
