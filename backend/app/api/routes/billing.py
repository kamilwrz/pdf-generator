"""
Plan catalog and pre-Stripe plan activation.

Until Checkout is wired, paid plans can be activated instantly when
`ALLOW_UNPAID_PLAN_SELECTION` is true. That flag is read at import time, so
tests must patch this module's binding rather than changing the env var after
import.
"""

import os
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Read once at import time (by value), so tests/ops must patch
# `app.api.routes.billing.ALLOW_UNPAID_PLAN_SELECTION` directly — setting the
# env var after import has no effect on this module.
from app.core.config import ALLOW_UNPAID_PLAN_SELECTION
from app.core.security import verify_token
from app.crud.user import get_user_by_username
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


class SelectPlanRequest(BaseModel):
    """Requested plan slug: free | pro (legacy standard/premium remap to pro)."""

    plan_slug: str


@router.get("/plans")
async def get_plans(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Catalog for the in-app plan picker (Stripe price IDs included when set)."""
    user = get_user_by_username(db, username=payload.get("sub"))
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
    user = get_user_by_username(db, username=payload.get("sub"))
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

    username: str


def _admin_secret_ok(x_admin_secret: str | None) -> bool:
    """Accept X-Admin-Secret equal to ADMIN_RESET_SECRET only.

    SECRET_KEY is intentionally not accepted: the JWT signing key must not
    double as an ops credential. When ADMIN_RESET_SECRET is unset, the
    endpoint stays closed.
    """
    provided = (x_admin_secret or "").strip()
    expected = (os.getenv("ADMIN_RESET_SECRET") or "").strip()
    if not provided or not expected:
        return False
    return secrets.compare_digest(provided, expected)


@router.post("/admin/reset-ai-credits")
async def admin_reset_ai_credits(
    request: ResetAiCreditsRequest,
    db: Session = Depends(get_db),
    x_admin_secret: str | None = Header(default=None, alias="X-Admin-Secret"),
):
    """Reset monthly AI credit usage for a user (ops / local support).

    Requires header ``X-Admin-Secret`` matching ``ADMIN_RESET_SECRET``.
    Used when the laptop cannot reach Render Postgres directly.
    """
    if not _admin_secret_ok(x_admin_secret):
        raise HTTPException(status_code=403, detail="Forbidden.")
    username = (request.username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required.")
    user = (
        db.query(User)
        .filter(User.username.ilike(username))
        .first()
    )
    if user is None:
        # Fallback: substring match for support typos / display names.
        user = (
            db.query(User)
            .filter(User.username.ilike(f"%{username}%"))
            .order_by(User.id)
            .first()
        )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    reset_ai_credits(db, user.id)
    ents = get_entitlements(db, user)
    return {
        "username": user.username,
        "period_key": ents["usage"]["period_key"],
        "ai_credits_used": ents["usage"]["ai_credits_used"],
        "monthly_ai_credits": ents["limits"]["monthly_ai_credits"],
        "ai_credits_remaining": ents["remaining"]["ai_credits"],
    }
