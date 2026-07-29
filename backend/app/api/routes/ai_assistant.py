"""
Canvas AI assistant HTTP surface.

Validates the requested action, enforces the AI-assistant entitlement, logs a
product metric, dispatches to `analyze_action`, then charges AI credits from
the model's estimated PLN cost. Provider failures bubble as `AIServiceError`
and are mapped to a stable Polish 500 by the app-level handler in `main.py`.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import verify_token
from app.crud.user import get_user_by_username
from app.dependencies import get_db
from app.services.ai_assistant_service import AIServiceError, analyze_action
from app.services.entitlements import assert_can_use_ai_assistant, charge_ai_credits
from app.utils.metrics_logging import log_metric_event

logger = logging.getLogger("ai_assistant")

router = APIRouter(prefix="/ai", tags=["ai_assistant"])

VALID_ACTIONS = {
    "rating", "design_rating", "position_rating",
    "grammar", "language", "improve", "ats_score", "layout", "chat",
}


class AssistantRequest(BaseModel):
    """Body for POST /ai/assistant.

    `elements` is the current canvas snapshot (client ids + style/geometry).
    `history` is only meaningful for `chat` follow-ups in the open session.
    """

    action: str
    elements: list[dict] = []
    message: str = ""
    job_description: str = ""
    page_size: dict = {}
    # Prior turns from the open editor session (role + content). Chat only.
    history: list[dict] = []


class TokenUsage(BaseModel):
    """Token and cost estimate returned for billing meters and UI display."""

    model: str | None = None
    action: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    cost_pln_estimate: float = 0.0
    rates_usd_per_1m: dict[str, float] = {}


class AssistantResponse(BaseModel):
    """Union response covering rating tips, style corrections, and layout groups.

    Unused group lists stay empty depending on the action so the frontend can
    render one message shape for all assistant buttons.
    """

    message: str
    rating: int | None = None
    tips: list[str] = []
    corrections: list[dict] = []
    layout_groups: list[dict] = []
    layout_issues: list[dict] = []
    structure_groups: list[dict] = []
    structure_issues: list[dict] = []
    deletion_groups: list[dict] = []
    deletion_issues: list[dict] = []
    clone_groups: list[dict] = []
    clone_issues: list[dict] = []
    web_sources: list[str] = []
    usage: TokenUsage | None = None


@router.post("/assistant", response_model=AssistantResponse, status_code=200)
async def ai_assistant(
    request: AssistantRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Run one assistant action against the caller's canvas snapshot.

    Side effects: metric log, OpenAI call, and AI credit charge on success.
    Credits are charged only after a successful analysis so failed provider
    calls do not consume the monthly budget.
    """
    if request.action not in VALID_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Nieznana akcja: {request.action}")

    if request.action == "position_rating" and not request.job_description.strip():
        raise HTTPException(
            status_code=400,
            detail="Pole job_description jest wymagane dla akcji position_rating.",
        )

    user = get_user_by_username(db, username=payload.get("sub"))
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    assert_can_use_ai_assistant(db, user)

    log_metric_event("ai_assistant_call", db, payload, action=request.action)

    try:
        result = analyze_action(
            action=request.action,
            elements=request.elements,
            message=request.message,
            job_description=request.job_description,
            page_size=request.page_size,
            history=request.history,
        )
        charge_ai_credits(db, user.id, result.get("usage", {}).get("cost_pln_estimate", 0.0))
        return AssistantResponse(**result)
    except AIServiceError:
        # Handled by the app-level exception_handler in main.py, which logs
        # full context and returns a generic, non-leaking message.
        raise
    except Exception:
        logger.exception("Unexpected error in AI assistant route: action=%s", request.action)
        raise HTTPException(status_code=500, detail="Wystąpił nieoczekiwany błąd. Spróbuj ponownie.")
