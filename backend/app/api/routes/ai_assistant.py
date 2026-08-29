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
from app.services.entitlements import assert_can_use_ai_action, charge_ai_credits
from app.utils.metrics_logging import log_metric_event

logger = logging.getLogger("ai_assistant")

router = APIRouter(prefix="/ai", tags=["ai_assistant"])

VALID_ACTIONS = {
    "rating", "design_rating", "position_rating",
    "grammar", "language", "improve", "shorten", "ats_score", "layout", "chat",
    "translate",
}

# ISO-ish language codes shared by detection, content corrections, and translate.
SUPPORTED_LANGUAGES = frozenset({"pl", "en", "de", "fr", "es", "uk", "it", "nl"})
# Backwards-compatible alias for the translate action's existing references.
TRANSLATE_LANGUAGES = SUPPORTED_LANGUAGES


class AssistantRequest(BaseModel):
    """Body for POST /ai/assistant.

    `elements` is the current canvas snapshot (client ids + style/geometry).
    `history` is only meaningful for `chat` follow-ups in the open session.
    `target_language` is required for `translate` (pl/en/de/fr/es/uk/it/nl).
    """

    action: str
    elements: list[dict] = []
    message: str = ""
    job_description: str = ""
    page_size: dict = {}
    # Prior turns from the open editor session (role + content). Chat / layout.
    history: list[dict] = []
    # Optional template slug (e.g. "monument", "slate") for layout_contract hints.
    # Freestyle / saved documents may omit this; the layout session still works.
    template_id: str | None = None
    # Target language code for the translate action (ignored by other actions).
    target_language: str = ""
    # Optional CV-language override for content actions (grammar/language/
    # improve/shorten). Empty means the backend auto-detects from the canvas.
    cv_language: str = ""
    # Canonical profile snapshot. Translate uses it to return a structured
    # translated profile for future template fills instead of relying on
    # renderer-specific canvas strings.
    cv_data: dict | None = None


class TokenUsage(BaseModel):
    """Token and cost estimate returned for billing meters and UI display.

    Credit rule: 1 credit = 5 groszy (0.05 PLN). ``credits_charged`` mirrors
    ``entitlements.credits_for_cost(cost_pln_estimate)`` for successful calls.
    """

    model: str | None = None
    action: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    cost_pln_estimate: float = 0.0
    credits_charged: int = 0
    credit_pln: float = 0.05
    usd_to_pln: float = 4.0
    rates_usd_per_1m: dict[str, float] = {}


class AssistantResponse(BaseModel):
    """Union response covering rating tips, style corrections, and layout groups.

    Unused group lists stay empty depending on the action so the frontend can
    render one message shape for all assistant buttons. Scored actions may also
    return structured `categories`, `strengths`, and `priorities` for the
    dashboard UI (partial scores must not live only inside tip strings).
    """

    message: str
    rating: int | None = None
    tips: list[str] = []
    corrections: list[dict] = []
    categories: list[dict] = []
    strengths: list[str] = []
    priorities: list[dict] = []
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
    # Language actually used for corrections, echoed so the UI selector syncs.
    cv_language: str = ""
    # Present for profile-aware content actions: the complete normalized profile
    # after the proposed corrections, applied by the client on "Apply all".
    updated_cv_data: dict | None = None


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

    target_language = (request.target_language or "").strip().lower()
    if request.action == "translate":
        if not target_language:
            raise HTTPException(
                status_code=400,
                detail="Pole target_language jest wymagane dla akcji translate.",
            )
        if target_language not in TRANSLATE_LANGUAGES:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Nieobsługiwany język tłumaczenia. "
                    "Dozwolone: pl, en, de, fr, es, uk, it, nl."
                ),
            )

    cv_language = (request.cv_language or "").strip().lower()
    if cv_language and cv_language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Nieobsługiwany język CV. "
                "Dozwolone: pl, en, de, fr, es, uk, it, nl."
            ),
        )

    user = get_user_by_username(db, username=payload.get("sub"))
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    # Content AI is available on Pro. Appearance actions (design_rating + layout)
    # are gated separately via PRO_ONLY_AI_ACTIONS in entitlements.
    assert_can_use_ai_action(db, user, request.action)

    log_metric_event("ai_assistant_call", db, payload, action=request.action)

    try:
        result = analyze_action(
            action=request.action,
            elements=request.elements,
            message=request.message,
            job_description=request.job_description,
            page_size=request.page_size,
            history=request.history,
            template_id=request.template_id,
            target_language=target_language,
            cv_language=cv_language,
            cv_data=request.cv_data,
            db=db,
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
