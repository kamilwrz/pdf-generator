import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import verify_token
from app.crud.user import get_user_by_username
from app.dependencies import get_db
from app.services.ai_assistant_service import AIServiceError, analyze_action

logger = logging.getLogger("ai_assistant")

router = APIRouter(prefix="/ai", tags=["ai_assistant"])

VALID_ACTIONS = {
    "rating", "design_rating", "position_rating",
    "grammar", "language", "improve", "ats_score", "layout", "chat",
}


class AssistantRequest(BaseModel):
    action: str
    elements: list[dict] = []
    message: str = ""
    job_description: str = ""
    page_size: dict = {}


class AssistantResponse(BaseModel):
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
    web_sources: list[str] = []


def _log_ai_assistant_open(db: Session, payload: dict, action: str) -> None:
    """Best-effort metric log for the AiAssistant open-rate success metric.
    Logs the numeric user id (not the username in the JWT `sub` claim) to
    avoid writing an identifiable handle into a persistent log. Never
    allowed to affect the caller — a logging failure here must not break
    the actual AI Assistant call it's measuring.
    """
    try:
        user = get_user_by_username(db, username=payload.get("sub"))
        logger.info("ai_assistant_call user_id=%s action=%s", user.id if user else None, action)
    except Exception:
        logger.debug("ai_assistant_call logging failed", exc_info=True)


@router.post("/assistant", response_model=AssistantResponse, status_code=200)
async def ai_assistant(
    request: AssistantRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    if request.action not in VALID_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Nieznana akcja: {request.action}")

    if request.action == "position_rating" and not request.job_description.strip():
        raise HTTPException(
            status_code=400,
            detail="Pole job_description jest wymagane dla akcji position_rating.",
        )

    _log_ai_assistant_open(db, payload, request.action)

    try:
        result = analyze_action(
            action=request.action,
            elements=request.elements,
            message=request.message,
            job_description=request.job_description,
            page_size=request.page_size,
        )
        return AssistantResponse(**result)
    except AIServiceError:
        # Handled by the app-level exception_handler in main.py, which logs
        # full context and returns a generic, non-leaking message.
        raise
    except Exception:
        logger.exception("Unexpected error in AI assistant route: action=%s", request.action)
        raise HTTPException(status_code=500, detail="Wystąpił nieoczekiwany błąd. Spróbuj ponownie.")
