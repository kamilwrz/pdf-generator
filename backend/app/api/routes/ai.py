import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
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


def _public_request_origin(request: Request) -> str:
    """Return the browser-visible API origin, including reverse-proxy headers."""
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip()
    forwarded_host = request.headers.get("x-forwarded-host", "").split(",", 1)[0].strip()
    scheme = forwarded_proto or request.url.scheme
    host = forwarded_host or request.headers.get("host") or request.url.netloc
    return f"{scheme}://{host}"


def _rebase_template_asset_urls(elements: list[dict], request: Request) -> list[dict]:
    """Ensure generated template assets point at the API that served this CV."""
    origin = _public_request_origin(request)
    marker = "/template-assets/"
    rebased = []

    for element in elements:
        source = str(element.get("src") or "")
        asset_index = source.find(marker)
        if element.get("category") == "image" and asset_index >= 0:
            rebased.append({**element, "src": f"{origin}{source[asset_index:]}"})
        else:
            rebased.append(element)

    return rebased


@router.post("/extract_cv", status_code=200)
async def extract_cv(
    file: UploadFile = File(...),
    payload: dict = Depends(verify_token),
):
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Akceptowane są wyłącznie pliki PDF.")
    data = await file.read()
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="Plik przekracza limit 10 MB.")
    try:
        cv_data = extract_cv_data(data)
        return {"cv_data": cv_data}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Nie udało się wyodrębnić danych z CV: {exc}")


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
        raise HTTPException(status_code=400, detail="Akceptowane są wyłącznie pliki PDF.")
    data = await file.read()
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="Plik przekracza limit 10 MB.")

    try:
        ids = [int(i) for i in json.loads(image_ids or "[]")]
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="image_ids musi być listą identyfikatorów w formacie JSON.")

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
        raise HTTPException(status_code=500, detail=f"Nie udało się wygenerować prezentacji: {exc}")


@router.post("/generate_article", status_code=200)
async def generate_article_route(
    file: UploadFile = File(...),
    payload: dict = Depends(verify_token),
):
    """Rewrite an uploaded PDF's content as a newspaper-style two-column
    article (Gazette layout): drop cap, section headings, pull-quote, folio
    page numbers. Returns element specs ready for loadAiElements."""
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Akceptowane są wyłącznie pliki PDF.")
    data = await file.read()
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="Plik przekracza limit 10 MB.")
    from app.services.article_generator import generate_article
    try:
        return generate_article(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Nie udało się wygenerować artykułu: {exc}")


@router.post("/fill_template", status_code=200)
async def fill_template(
    request: FillRequest,
    http_request: Request,
    payload: dict = Depends(verify_token),
):
    try:
        elements = generate_resume(request.template_id, request.cv_data)
        return {"elements": _rebase_template_asset_urls(elements, http_request)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Nie udało się wygenerować szablonu: {exc}")
