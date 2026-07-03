from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.security import verify_token
from app.services.ai_assistant_service import analyze_action

router = APIRouter(prefix="/ai", tags=["ai_assistant"])

VALID_ACTIONS = {
    "rating", "design_rating", "position_rating",
    "grammar", "language", "improve", "ats_score", "chat",
}


class AssistantRequest(BaseModel):
    action: str
    elements: list[dict] = []
    message: str = ""
    job_description: str = ""


class AssistantResponse(BaseModel):
    message: str
    rating: int | None = None
    tips: list[str] = []
    corrections: list[dict] = []
    web_sources: list[str] = []


@router.post("/assistant", response_model=AssistantResponse, status_code=200)
async def ai_assistant(
    request: AssistantRequest,
    payload: dict = Depends(verify_token),
):
    if request.action not in VALID_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Unknown action: {request.action}")

    if request.action == "position_rating" and not request.job_description.strip():
        raise HTTPException(
            status_code=400,
            detail="job_description is required for position_rating",
        )

    try:
        result = analyze_action(
            action=request.action,
            elements=request.elements,
            message=request.message,
            job_description=request.job_description,
        )
        return AssistantResponse(**result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI assistant error: {exc}")
