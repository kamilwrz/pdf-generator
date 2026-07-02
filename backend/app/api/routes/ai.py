from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from app.core.security import verify_token
from app.services.ai_service import extract_cv_data, fill_template_elements

router = APIRouter(prefix="/ai", tags=["ai"])

MAX_PDF_BYTES = 10 * 1024 * 1024  # 10 MB


class FillRequest(BaseModel):
    cv_data: dict
    elements: list[dict]


@router.post("/extract_cv", status_code=200)
async def extract_cv(
    file: UploadFile = File(...),
    payload: dict = Depends(verify_token),
):
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    data = await file.read()
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit.")
    try:
        cv_data = extract_cv_data(data)
        return {"cv_data": cv_data}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"CV extraction failed: {exc}")


@router.post("/fill_template", status_code=200)
async def fill_template(
    request: FillRequest,
    payload: dict = Depends(verify_token),
):
    try:
        fills = fill_template_elements(request.cv_data, request.elements)
        return {"fills": fills}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Template fill failed: {exc}")
