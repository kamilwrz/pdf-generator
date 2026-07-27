from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Read once at import time (by value), so tests/ops must patch
# `app.api.routes.billing.ALLOW_UNPAID_PLAN_SELECTION` directly — setting the
# env var after import has no effect on this module.
from app.core.config import ALLOW_UNPAID_PLAN_SELECTION
from app.core.security import verify_token
from app.crud.user import get_user_by_username
from app.dependencies import get_db
from app.services.entitlements import (
    SELECTABLE_PLANS,
    get_entitlements,
    list_selectable_plans,
    set_user_plan,
)

router = APIRouter(prefix="/billing", tags=["billing"])


class SelectPlanRequest(BaseModel):
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
    standard/premium, return 402 with `code=payment_required`. Later this branch
    creates a Checkout Session and returns `checkout_url` instead of activating.
    """
    user = get_user_by_username(db, username=payload.get("sub"))
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    if request.plan_slug not in SELECTABLE_PLANS:
        raise HTTPException(status_code=400, detail="Nieznany plan.")
    if request.plan_slug != "free" and not ALLOW_UNPAID_PLAN_SELECTION:
        # Stripe later: create Checkout Session here and return checkout_url.
        raise HTTPException(
            status_code=402,
            detail={
                "code": "payment_required",
                "message": "Ten plan wymaga płatności.",
                "plan_slug": request.plan_slug,
                "checkout_url": None,
            },
        )
    sub = set_user_plan(db, user.id, request.plan_slug)
    return {
        "plan_slug": sub.plan_slug,
        "payment_required": False,
        "checkout_url": None,
        "entitlements": get_entitlements(db, user),
    }
