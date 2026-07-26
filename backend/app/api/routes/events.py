"""Minimal, stateless product-metrics logging — not a database table.

Backs the Phase 1a success metrics (see docs/designs/cv-only-ux-monetization.md).
Auth-gated and schema-validated because this endpoint's data is the sole
signal gating whether Phase 2 gets built at all; an unauthenticated or
unvalidated endpoint would let anyone pollute that decision.
"""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import verify_token
from app.dependencies import get_db
from app.utils.metrics_logging import log_metric_event

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
    log_metric_event(
        "event", db, payload,
        type=request.event_type, template_id=request.template_id,
    )
    return {"status": "logged"}
