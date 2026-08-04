"""
CV extract, bio-draft persistence, and deterministic template fill.

These routes sit next to the conversational assistant but use different
pipelines: PDF→structured `cv_data` via OpenAI extract, private draft CRUD,
and Python layout generation in `cv_generator` (not LLM layout).

Template asset URLs are rebased to the public API origin so canvases opened
behind reverse proxies still load `/template-assets/...` from the same host
the browser called.
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.security import verify_token
from app.crud.bio_cv_drafts import delete_bio_cv_draft, get_bio_cv_draft, upsert_bio_cv_draft
from app.crud.user import get_user_by_username
from app.dependencies import get_db
from app.schemas.cv_data_schema import BioCvDraftRequest, BioCvDraftResponse
from app.services.cv_data import CvDataValidationError, normalize_cv_data
from app.services.ai_service import extract_cv_data, generate_resume
from app.services.cv_generator_primitives import use_spacing
from app.services.entitlements import (
    assert_can_extract_cv,
    assert_template_allowed,
    charge_ai_credits,
)

router = APIRouter(prefix="/ai", tags=["ai"])

MAX_PDF_BYTES = 10 * 1024 * 1024  # 10 MB


class FillRequest(BaseModel):
    """Normalized CV profile plus the template id to materialize on the canvas."""

    cv_data: dict
    template_id: str
    # Optional per-document rhythm from the Sections panel (stack/record/…).
    spacing_px: Optional[dict[str, Any]] = None


def _current_user_id(db: Session, payload: dict) -> int:
    """Resolve JWT `sub` to a user id or raise 401."""
    user = get_user_by_username(db, username=payload.get("sub"))
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    return user.id


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
    db: Session = Depends(get_db),
):
    """Extract structured CV fields from an uploaded PDF (entitlement-gated).

    Side effects: OpenAI extract call and AI credit charge on success.
    Rejects non-PDF filenames and bodies over 10 MB before contacting the model.
    """
    user = get_user_by_username(db, username=payload.get("sub"))
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    assert_can_extract_cv(db, user)
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Akceptowane są wyłącznie pliki PDF.")
    data = await file.read()
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="Plik przekracza limit 10 MB.")
    try:
        cv_data, usage = extract_cv_data(data)
        charge_ai_credits(db, user.id, usage.get("cost_pln_estimate", 0.0))
        return {"cv_data": cv_data, "usage": usage}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Nie udało się wyodrębnić danych z CV: {exc}")


@router.get("/bio_cv_draft", response_model=BioCvDraftResponse, status_code=200)
async def get_bio_cv_draft_route(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Return the caller's private bio/CV draft, or an empty normalized profile."""
    draft = get_bio_cv_draft(db, _current_user_id(db, payload))
    if draft is None:
        return BioCvDraftResponse(cv_data=normalize_cv_data({}), updated_at=None)
    return BioCvDraftResponse(
        cv_data=normalize_cv_data(draft.cv_data),
        updated_at=draft.updated_at.isoformat() if draft.updated_at else None,
    )


@router.put("/bio_cv_draft", response_model=BioCvDraftResponse, status_code=200)
async def upsert_bio_cv_draft_route(
    request: BioCvDraftRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Create or replace the caller's bio/CV draft after schema normalisation."""
    try:
        cv_data = normalize_cv_data(request.cv_data)
    except CvDataValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    draft = upsert_bio_cv_draft(db, _current_user_id(db, payload), cv_data)
    return BioCvDraftResponse(
        cv_data=normalize_cv_data(draft.cv_data),
        updated_at=draft.updated_at.isoformat() if draft.updated_at else None,
    )


@router.delete("/bio_cv_draft", status_code=200)
async def delete_bio_cv_draft_route(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Delete the caller's draft if present; returns whether a row was removed."""
    deleted = delete_bio_cv_draft(db, _current_user_id(db, payload))
    return {"deleted": deleted}


@router.post("/fill_template", status_code=200)
async def fill_template(
    request: FillRequest,
    http_request: Request,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Materialize a template canvas from `cv_data` using deterministic Python layout.

    Gated by template tier entitlements. Does not call the LLM for placement —
    only validates/normalises profile data and runs `generate_resume`.
    """
    user = get_user_by_username(db, username=payload.get("sub"))
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    assert_template_allowed(db, user, request.template_id)
    try:
        cv_data = normalize_cv_data(request.cv_data, require_name=True)
        with use_spacing(request.spacing_px):
            elements = generate_resume(request.template_id, cv_data)
        return {"elements": _rebase_template_asset_urls(elements, http_request)}
    except CvDataValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Nie udało się wygenerować szablonu: {exc}")
