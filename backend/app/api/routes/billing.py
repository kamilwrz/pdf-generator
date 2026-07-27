from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import ALLOW_UNPAID_PLAN_SELECTION
from app.core.security import verify_token
from app.crud.user import get_user_by_username
from app.dependencies import get_db
from app.services.entitlements import SELECTABLE_PLANS, set_user_plan

router = APIRouter(prefix="/billing", tags=["billing"])


class SelectPlanRequest(BaseModel):
    plan_slug: str


@router.post("/select-plan")
async def select_plan(
    request: SelectPlanRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user = get_user_by_username(db, username=payload.get("sub"))
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    if request.plan_slug not in SELECTABLE_PLANS:
        raise HTTPException(status_code=400, detail="Nieznany plan.")
    if request.plan_slug != "free" and not ALLOW_UNPAID_PLAN_SELECTION:
        raise HTTPException(status_code=402, detail="Ten plan wymaga płatności.")
    sub = set_user_plan(db, user.id, request.plan_slug)
    return {"plan_slug": sub.plan_slug}
