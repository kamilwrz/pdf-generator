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
    """Allowed product-metric events only — keeps the metric vocabulary small.

    Guest-funnel events (landing_cta_clicked .. guest_doc_claimed) are queued
    client-side while anonymous (see frontend/src/utils/guestEvents.js) and
    flushed through this same authenticated endpoint once the visitor has a
    JWT — this endpoint itself never accepts unauthenticated requests.
    """

    event_type: Literal[
        "template_picked",
        "template_dismissed",
        "landing_cta_clicked",
        # Per-source landing CTA events. `landing_cta_clicked` above stays for
        # backward compatibility, but the redesigned landing emits a specific
        # source per call-to-action so the funnel can tell which surface drove
        # the click (hero vs before/after vs templates vs pricing vs final CTA)
        # without adding a free-form field that would weaken the fixed
        # vocabulary this endpoint deliberately enforces.
        "hero_new_cv",
        "hero_wizard",
        "hero_import",
        "hero_demo",
        "before_after_import",
        "templates_new_cv",
        "templates_wizard",
        "pricing_free",
        "pricing_pro",
        "final_wizard",
        "final_import",
        "guest_editor_opened",
        "guest_demo_loaded",
        "guest_first_edit",
        "save_gate_shown",
        "register_completed",
        "guest_doc_claimed",
        "new_cv_created",
    ]
    template_id: str | None = None


@router.post("/log", status_code=200)
async def log_event(
    request: EventLogRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Append one validated product event to the metrics log stream.

    Side effect: structured log line only — no durable events table.
    """
    log_metric_event(
        "event", db, payload,
        type=request.event_type, template_id=request.template_id,
    )
    return {"status": "logged"}
