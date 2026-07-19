import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.security import verify_token
from app.crud.images import request_image_by_id
from app.crud.user import get_user_by_username
from app.dependencies import get_db
from app.services.ai_service import extract_cv_data, generate_resume

router = APIRouter(prefix="/ai", tags=["ai"])

MAX_PDF_BYTES = 10 * 1024 * 1024  # 10 MB


class FillRequest(BaseModel):
    cv_data: dict
    template_id: str


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


@router.post("/generate_deck", status_code=200)
async def generate_deck_route(
    file: UploadFile = File(...),
    image_ids: str = Form("[]"),
    template_id: str = Form("meridian"),
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Generate a 16:9 slide deck from an uploaded PDF's text, in the chosen
    deck theme (meridian / onyx / verdant). Selected gallery images are
    vision-captioned and placed on the slides whose content they match.
    Returns element specs ready for loadAiElements."""
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    data = await file.read()
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit.")

    try:
        ids = [int(i) for i in json.loads(image_ids or "[]")]
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="image_ids must be a JSON list of ids.")

    # Only the caller's own gallery images are eligible.
    db_user = get_user_by_username(db, username=payload.get("sub"))
    rows = []
    for img_id in ids:
        row = request_image_by_id(db, img_id)
        if row is not None and row.owner_id == db_user.id:
            rows.append(row)

    from app.services.deck_generator import generate_deck
    try:
        result = generate_deck(data, rows, template_id)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Deck generation failed: {exc}")


@router.post("/generate_article", status_code=200)
async def generate_article_route(
    file: UploadFile = File(...),
    payload: dict = Depends(verify_token),
):
    """Rewrite an uploaded PDF's content as a newspaper-style two-column
    article (Gazette layout): drop cap, section headings, pull-quote, folio
    page numbers. Returns element specs ready for loadAiElements."""
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    data = await file.read()
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit.")
    from app.services.article_generator import generate_article
    try:
        return generate_article(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Article generation failed: {exc}")


@router.post("/fill_template", status_code=200)
async def fill_template(
    request: FillRequest,
    payload: dict = Depends(verify_token),
):
    try:
        elements = generate_resume(request.template_id, request.cv_data)
        return {"elements": elements}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Template generation failed: {exc}")
