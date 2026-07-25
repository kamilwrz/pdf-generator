"""Minimal, stateless product-metrics logging — not a database table.

Backs the Phase 1a success metrics (see docs/designs/cv-only-ux-monetization.md).
Auth-gated and schema-validated because this endpoint's data is the sole
signal gating whether Phase 2 gets built at all; an unauthenticated or
unvalidated endpoint would let anyone pollute that decision.
"""
import logging
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import verify_token
from app.crud.user import get_user_by_username
from app.dependencies import get_db

logger = logging.getLogger("events")

router = APIRouter(prefix="/events", tags=["events"])


class EventLogRequest(BaseModel):
    event_type: Literal["template_picked", "template_dismissed"]
    template_id: str | None = None


@router.post("/log", status_code=200)
async def log_event(
    request: EventLogRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    # Best-effort: a logging failure must never surface to the caller or
    # block the user action it's measuring (fire-and-forget).
    try:
        user = get_user_by_username(db, username=payload.get("sub"))
        logger.info(
            "event type=%s template_id=%s user_id=%s",
            request.event_type, request.template_id, user.id if user else None,
        )
    except Exception:
        logger.debug("event logging failed", exc_info=True)

    return {"status": "logged"}
