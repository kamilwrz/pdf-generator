"""
CV extract, bio-draft persistence, and deterministic template fill.

These routes sit next to the conversational assistant but use different
pipelines: PDF→structured `cv_data` via the configured model provider, private draft CRUD,
and Python layout generation in `cv_generator` (not LLM layout).

Template asset URLs are rebased to the public API origin so canvases opened
behind reverse proxies still load `/template-assets/...` from the same host
the browser called.
"""

import base64
from datetime import datetime
import hashlib
import json
import logging
from typing import Any, Optional

import fitz

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.config import CV_EXTRACT_MAX_PAGES
from app.core.security import resolve_user_from_payload, verify_token, verify_token_optional
from app.crud.bio_cv_drafts import delete_bio_cv_draft, get_bio_cv_draft, upsert_bio_cv_draft
from app.crud.cv_import_snapshots import (
    create_snapshot, get_owned_snapshot, linked_pdfs, linked_pdfs_for_snapshots,
    list_owned_snapshots,
    mark_snapshot_failed, mark_snapshot_succeeded, soft_delete_snapshot,
)
from app.dependencies import get_db
from app.schemas.cv_data_schema import BioCvDraftRequest, BioCvDraftResponse
from app.services.cv_data import CvDataValidationError, normalize_cv_data
from app.services.ai_service import CvExtractionError, extract_cv_data, generate_resume
from app.services.cv_generator_primitives import use_spacing
from app.services.cv_templates.registry import TEMPLATE_LAYOUTS
from app.services.entitlements import (
    AiReservationError,
    FREE_STARTER_TEMPLATE_IDS,
    PlanLimitError,
    assert_template_allowed,
    record_cv_import,
    release_ai_reservation,
    reserve_cv_import,
    settle_failed_cv_import_reservation,
    stage_cv_import_reservation_success,
)

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger(__name__)

MAX_PDF_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_PDF_PAGES = CV_EXTRACT_MAX_PAGES


class FillRequest(BaseModel):
    """Normalized CV profile plus the template id to materialize on the canvas."""

    cv_data: dict
    template_id: str
    # Optional per-document rhythm from the Sections panel (stack/record/…).
    spacing_px: Optional[dict[str, Any]] = None


def _snapshot_payload(snapshot, documents: list | None = None) -> dict:
    """Return one owner-authorized import, including its private CV data."""
    data = snapshot.cv_data or {}
    return {
        "id": snapshot.id,
        "filename": snapshot.source_filename,
        "size_bytes": snapshot.source_size_bytes,
        "status": snapshot.status,
        "error_code": snapshot.error_code,
        "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
        "completed_at": snapshot.completed_at.isoformat() if snapshot.completed_at else None,
        "summary": {
            "name": data.get("name"),
            "title": data.get("title"),
            "experience_count": len(data.get("experience") or []),
            "education_count": len(data.get("education") or []),
            "skills_count": len(data.get("skills") or []),
        },
        "cv_data": data if snapshot.status == "succeeded" else None,
        "documents": [
            {
                "id": document.id,
                "title": document.title,
                "template_id": document.template_id,
                "updated_at": document.updated_at.isoformat() if document.updated_at else None,
            }
            for document in (documents or [])
        ],
    }


def _snapshot_list_payload(snapshot, *, document_count: int) -> dict:
    """Return history metadata without extracted content or user-supplied names."""
    return {
        "id": snapshot.id,
        "size_bytes": snapshot.source_size_bytes,
        "status": snapshot.status,
        "error_code": snapshot.error_code,
        "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
        "completed_at": snapshot.completed_at.isoformat() if snapshot.completed_at else None,
        "document_count": document_count,
    }


def _encode_import_cursor(snapshot) -> str:
    """Encode the stable pagination tuple as an opaque URL-safe cursor."""
    raw = json.dumps(
        {"created_at": snapshot.created_at.isoformat(), "id": snapshot.id},
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_import_cursor(cursor: str | None) -> tuple[datetime | None, int | None]:
    """Validate and decode a cursor without accepting arbitrary query syntax."""
    if not cursor:
        return None, None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
        created_at = datetime.fromisoformat(payload["created_at"])
        snapshot_id = int(payload["id"])
        if snapshot_id < 1:
            raise ValueError("invalid id")
        return created_at, snapshot_id
    except (KeyError, TypeError, ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_cursor", "message": "Kursor historii importów jest nieprawidłowy."},
        ) from exc


def _read_and_validate_pdf(file: UploadFile) -> bytes:
    """Read bounded bytes and reject non-PDF, malformed, encrypted, or huge inputs."""
    # The route is synchronous, so reading the spooled upload directly keeps
    # validation, provider execution, quota mutation, and the SQLAlchemy
    # session inside FastAPI's worker-thread execution path.
    data = file.file.read(MAX_PDF_BYTES + 1)
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="Plik przekracza limit 10 MB.")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Wybrany plik nie jest prawidłowym PDF.")
    try:
        document = fitz.open(stream=data, filetype="pdf")
        try:
            if document.needs_pass:
                raise HTTPException(status_code=400, detail="Zaszyfrowane PDF-y nie są obsługiwane.")
            if document.page_count < 1 or document.page_count > MAX_PDF_PAGES:
                raise HTTPException(status_code=400, detail=f"PDF musi mieć od 1 do {MAX_PDF_PAGES} stron.")
        finally:
            document.close()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Nie można odczytać tego pliku PDF.") from exc
    return data


def _current_user_id(db: Session, payload: dict) -> int:
    """Resolve JWT `sub` to a user id or raise 401."""
    user = resolve_user_from_payload(db, payload)
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    return user.id


def _mark_failed_import_snapshot(
    db: Session,
    snapshot,
    error_code: str,
) -> None:
    """Persist a safe failure tombstone without changing quota settlement.

    Snapshot diagnostics are secondary to the durable provider reservation. A
    broken snapshot write is logged with identifiers only and must never cause
    a paid/ambiguous provider call to be released accidentally.
    """

    if snapshot is None:
        return
    try:
        mark_snapshot_failed(db, snapshot, error_code)
    except Exception:
        db.rollback()
        logger.error(
            "Could not persist failed CV import snapshot: snapshot_id=%s error_code=%s",
            getattr(snapshot, "id", None),
            error_code,
        )


def _settle_failed_import_claim(
    db: Session,
    *,
    user_id: int,
    reservation_id: str,
    outcome: str,
) -> None:
    """Apply the failure outcome without ever refunding an uncertain call."""

    try:
        if outcome == "consume":
            settle_failed_cv_import_reservation(
                db,
                user_id=user_id,
                reservation_id=reservation_id,
            )
        elif outcome == "release":
            release_ai_reservation(
                db,
                user_id=user_id,
                reservation_id=reservation_id,
            )
        # ``uncertain`` and settlement failures intentionally remain pending;
        # lease expiry charges the original monthly period conservatively.
    except Exception:
        db.rollback()
        logger.error(
            "Could not finalize failed CV import reservation: reservation_id=%s outcome=%s",
            reservation_id,
            outcome,
        )


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
def extract_cv(
    file: UploadFile = File(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Extract structured CV fields from an uploaded PDF (entitlement-gated).

    Side effects: a durable pre-provider reservation, at most one
    Cloudflare/OpenAI call for an idempotency key, a monthly import-counter
    increment, and a normalized import snapshot on success.
    Rejects non-PDF filenames and bodies over 10 MB before contacting the model.
    """
    key = (idempotency_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "idempotency_key_required",
                "message": "Nagłówek Idempotency-Key jest wymagany.",
            },
        )
    user = resolve_user_from_payload(db, payload)
    if user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    filename = (file.filename or "cv.pdf").strip()
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Akceptowane są wyłącznie pliki PDF.")
    data = _read_and_validate_pdf(file)
    request_hash = hashlib.sha256(
        filename.encode("utf-8", errors="replace") + b"\0" + data,
    ).hexdigest()
    claim = reserve_cv_import(
        db,
        user_id=user.id,
        idempotency_key=key,
        request_hash=request_hash,
    )
    if claim.replay_response is not None:
        snapshot_id = int(claim.replay_response.get("snapshot_id") or 0)
        snapshot = get_owned_snapshot(db, owner_id=user.id, snapshot_id=snapshot_id)
        if snapshot is None or snapshot.status != "succeeded":
            raise AiReservationError(
                409,
                "ai_request_finalized",
                "Zapisany wynik tego importu nie jest już dostępny.",
            )
        return {
            "import": _snapshot_payload(snapshot),
            "cv_data": snapshot.cv_data or {},
            "usage": dict(claim.replay_response.get("usage") or {}),
        }

    snapshot = None
    provider_completed = False
    try:
        snapshot = create_snapshot(db, owner_id=user.id, filename=filename, size_bytes=len(data))
        # This handler is a regular `def`, so FastAPI already runs the complete
        # provider + database workflow in its worker pool. Starting another
        # thread here would separate the SQLAlchemy session from its operation.
        cv_data, usage = extract_cv_data(data)
        provider_completed = True
        # Claim the finite import slot and transition the snapshot in one
        # transaction. If either operation or the final commit fails, the
        # generic handler rolls both back before recording the failed snapshot.
        # This prevents a 500 response from consuming the user's only Free
        # import while leaving its snapshot stuck in processing.
        record_cv_import(db, user.id, commit=False)
        snapshot = mark_snapshot_succeeded(db, snapshot, cv_data, commit=False)
        stage_cv_import_reservation_success(
            db,
            user_id=user.id,
            reservation_id=claim.reservation_id,
            snapshot_id=snapshot.id,
            usage_payload=usage,
        )
        db.commit()
        db.refresh(snapshot)
        return {"import": _snapshot_payload(snapshot), "cv_data": cv_data, "usage": usage}
    except CvExtractionError as exc:
        db.rollback()
        _mark_failed_import_snapshot(db, snapshot, exc.code)
        _settle_failed_import_claim(
            db,
            user_id=user.id,
            reservation_id=claim.reservation_id,
            outcome=exc.reservation_outcome,
        )
        raise HTTPException(
            status_code=exc.status_code,
            detail={
                "code": exc.code,
                "message": exc.user_message,
                "retryable": exc.retryable,
            },
        ) from exc
    except PlanLimitError as exc:
        # A second atomic quota check runs after the provider call. This branch
        # handles the rare case of concurrent requests that passed the first
        # gate together; only requests within the allowance may succeed.
        code = exc.detail.get("code", "plan_limit_cv_imports")
        db.rollback()
        _mark_failed_import_snapshot(db, snapshot, code)
        _settle_failed_import_claim(
            db,
            user_id=user.id,
            reservation_id=claim.reservation_id,
            outcome="uncertain" if provider_completed else "release",
        )
        raise
    except Exception as exc:
        # A flush/commit failure leaves the session unusable until rollback.
        # Roll back the conditional quota increment and staged success before
        # persisting the independent failed-snapshot outcome.
        db.rollback()
        _mark_failed_import_snapshot(db, snapshot, "extraction_failed")
        _settle_failed_import_claim(
            db,
            user_id=user.id,
            reservation_id=claim.reservation_id,
            outcome="uncertain" if provider_completed else "release",
        )
        raise HTTPException(
            status_code=500,
            detail="Nie udało się wyodrębnić danych z CV.",
        ) from exc


@router.get("/imports", status_code=200)
def list_imports(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """List one bounded page of non-sensitive import metadata for the owner."""
    owner_id = _current_user_id(db, payload)
    cursor_created_at, cursor_id = _decode_import_cursor(cursor)
    rows = list_owned_snapshots(
        db,
        owner_id=owner_id,
        limit=limit,
        cursor_created_at=cursor_created_at,
        cursor_id=cursor_id,
    )
    page = rows[:limit]
    documents_by_import = linked_pdfs_for_snapshots(
        db,
        snapshot_ids=[snapshot.id for snapshot in page],
        owner_id=owner_id,
    )
    return {
        "items": [
            _snapshot_list_payload(
                snapshot,
                document_count=len(documents_by_import.get(snapshot.id, [])),
            )
            for snapshot in page
        ],
        "next_cursor": _encode_import_cursor(page[-1]) if len(rows) > limit and page else None,
    }


@router.get("/imports/{snapshot_id}", status_code=200)
def get_import(snapshot_id: int, payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    """Return one owned import, including its stored normalized CV data."""
    owner_id = _current_user_id(db, payload)
    snapshot = get_owned_snapshot(db, owner_id=owner_id, snapshot_id=snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono danych importu.")
    return _snapshot_payload(snapshot, linked_pdfs(db, snapshot_id=snapshot.id, owner_id=owner_id))


@router.delete("/imports/{snapshot_id}", status_code=200)
def delete_import(snapshot_id: int, payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    """Erase the caller's stored extracted data; source PDFs were never retained."""
    owner_id = _current_user_id(db, payload)
    snapshot = get_owned_snapshot(db, owner_id=owner_id, snapshot_id=snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono danych importu.")
    soft_delete_snapshot(db, snapshot)
    return {"deleted": True}


@router.get("/bio_cv_draft", response_model=BioCvDraftResponse, status_code=200)
def get_bio_cv_draft_route(
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
def upsert_bio_cv_draft_route(
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
def delete_bio_cv_draft_route(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Delete the caller's draft if present; returns whether a row was removed."""
    deleted = delete_bio_cv_draft(db, _current_user_id(db, payload))
    return {"deleted": deleted}


@router.post("/fill_template", status_code=200)
def fill_template(
    request: FillRequest,
    http_request: Request,
    payload: dict | None = Depends(verify_token_optional),
    db: Session = Depends(get_db),
):
    """Materialize a template canvas from `cv_data` using deterministic Python layout.

    Authenticated callers are gated by their plan's template tier. Anonymous
    guests (no JWT, or a stale/invalid Bearer) may only fill Free starter
    templates — the same allowlist as the Free plan. Does not call the LLM for
    placement; only validates/normalises profile data and runs `generate_resume`.
    """
    if request.template_id not in TEMPLATE_LAYOUTS:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "unknown_template",
                "message": "Wybrany szablon nie istnieje.",
            },
        )

    # Guest path: optional auth returned None (missing, expired, or malformed
    # JWT). Enforce the Free starter allowlist so anonymous traffic cannot
    # bypass Pro-tier template locks, then run the same layout pipeline.
    if payload is None:
        if request.template_id not in FREE_STARTER_TEMPLATE_IDS:
            raise PlanLimitError(
                "plan_feature_template",
                "Ten szablon jest dostępny w planie Pro.",
            )
    else:
        user = resolve_user_from_payload(db, payload)
        if user is None:
            raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
        assert_template_allowed(db, user, request.template_id)
    try:
        cv_data = normalize_cv_data(request.cv_data, require_name=True)
        with use_spacing(request.spacing_px):
            elements = generate_resume(request.template_id, cv_data)
        return {"elements": _rebase_template_asset_urls(elements, http_request)}
    except CvDataValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_cv_data", "message": str(exc)},
        ) from exc
    except ValueError as exc:
        logger.warning(
            "Template generation rejected input: template_id=%s error_type=%s",
            request.template_id,
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=400,
            detail={
                "code": "template_generation_rejected",
                "message": "Nie można wygenerować szablonu z podanych danych.",
            },
        ) from exc
    except Exception as exc:
        logger.error(
            "Template generation failed: template_id=%s error_type=%s",
            request.template_id,
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail={
                "code": "template_generation_failed",
                "message": "Nie udało się wygenerować szablonu.",
            },
        ) from exc
