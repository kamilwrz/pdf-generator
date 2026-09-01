"""
PDF document lifecycle: create, list, open canvas, autosave, update, delete, download.

Ownership is enforced via `_require_owned_pdf` on every by-id route to prevent
IDOR across users. Creating and exporting are entitlement-gated.

There are two persistence paths:
- Full create/update also regenerates a ReportLab PDF file (local or S3)
  via ``document_service``.
- `/save_elements` persists canvas rows only — used for debounced autosave
  without paying the cost of a full render on every keystroke.

In addition, `/render_pdf` renders the current canvas to PDF bytes and streams
them WITHOUT persisting anything. It backs the editor's "Pobierz" (Download)
button, which is independent of "Zapisz" (Save): an unsaved document can still
be exported. Like `/download_pdf`, it is export-metered.
"""

import logging
import unicodedata
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, Header, HTTPException
from fastapi.responses import Response
from starlette import status
from sqlalchemy.orm import Session
from app.core.security import resolve_user_from_payload, verify_token
from app.schemas.pdf_schema import PDFCreateRequest, PDFUpdateRequest
from app.dependencies import get_db
from app.core.config import USE_S3  # Compatibility attribute for legacy tests/deploy hooks.

from app.crud.pdfs import (
    request_pdf_by_id, request_pdf_by_id_show,
    request_pdfs_by_id,
)
from app.crud.cv_import_snapshots import get_owned_snapshot

from app.services.entitlements import (
    assert_can_create_project, assert_can_export, assert_template_allowed,
    record_export, refund_export,
)
from app.services.document_service import (
    create_pdf_document,
    delete_pdf_document,
    read_pdf_document_bytes,
    render_document_bytes,
    render_pdf_for_download,
    resolve_create_replay,
    save_pdf_elements_document,
    update_pdf_document,
)


logger = logging.getLogger(__name__)


def _refund_failed_export(db: Session, *, user_id: int, period_key: str) -> None:
    """Best-effort refund without replacing the original local failure.

    The quota claim is committed before expensive rendering/storage work so it
    is visible to every worker. If that local work fails, release the exact
    period claim. A database outage during compensation is logged and leaves a
    conservative charge rather than hiding the original renderer/storage error.
    """

    try:
        db.rollback()
        refund_export(db, int(user_id), period_key=period_key)
    except Exception:
        db.rollback()
        logger.exception("Failed to refund provisional PDF export claim")


def _pdf_download_filename(title: str | None) -> str:
    """Normalise a stored document title into an attachment filename."""
    name = (title or "cv.pdf").strip() or "cv.pdf"
    if not name.lower().endswith(".pdf"):
        name = f"{name}.pdf"
    return name


def _content_disposition(filename: str) -> str:
    """Build Content-Disposition with ASCII fallback + RFC 5987 UTF-8 name."""
    # Legacy rows predate title validation, so sanitize again at the final
    # header boundary. Percent-encoding protects filename*, while replacing
    # control characters protects the quoted ASCII fallback from CR/LF injection.
    safe_filename = "".join(
        "_" if unicodedata.category(char) == "Cc" else char
        for char in str(filename or "cv.pdf")
    )
    ascii_fallback = (
        safe_filename.encode("ascii", "replace")
        .decode("ascii")
        .replace("?", "_")
        .replace('"', "_")
        .replace("\\", "_")
    )
    return (
        f'attachment; filename="{ascii_fallback}"; '
        f"filename*=UTF-8''{quote(safe_filename, safe='')}"
    )


def _public_pdf_metadata(pdf_row) -> dict:
    """Serialize editor metadata without leaking the private storage locator.

    `Pdf.file_path`, `owner_id`, and `watermarked` are server-only state. In
    particular, exposing `file_path` would let a local deployment bypass
    `/pdf/download_pdf` and therefore skip authentication, ownership checks,
    and `record_export`. Keep this allowlist explicit when the model evolves.
    """
    return {
        "id": pdf_row.id,
        "title": pdf_row.title,
        "created_at": pdf_row.created_at,
        "updated_at": pdf_row.updated_at,
        "pages": pdf_row.pages,
        "page_width": pdf_row.page_width,
        "page_height": pdf_row.page_height,
        "editor_mode": pdf_row.editor_mode,
        "template_id": pdf_row.template_id,
        "origin_template_id": pdf_row.origin_template_id,
        "revision": int(pdf_row.revision or 1),
        "spacing_px": pdf_row.spacing_px,
        "cv_data": pdf_row.cv_data,
        "source_import_id": pdf_row.source_import_id,
    }


router = APIRouter(
    prefix="/pdf",
    tags=["pdf"]
)


@router.post("/create_pdf")
def create_user_pdf(
    pdf_data: PDFCreateRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Create a document from the current canvas and render an initial PDF file.

    Side effects: project entitlement check, Pdf + PdfElements insert, and a
    ReportLab render written to S3 or the local generated folder. Display-title
    uniqueness remains a per-user product rule; storage keys never use titles.
    """
    db_user = resolve_user_from_payload(db, payload)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    username = db_user.username
    if idempotency_key is None:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_idempotency_key",
                "message": "Nagłówek Idempotency-Key jest wymagany.",
            },
        )
    replay = resolve_create_replay(
        db,
        owner_id=db_user.id,
        pdf_data=pdf_data,
        idempotency_key=idempotency_key,
    )
    if replay is not None:
        return replay
    if pdf_data.source_import_id is not None and get_owned_snapshot(
        db, owner_id=db_user.id, snapshot_id=pdf_data.source_import_id,
    ) is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono danych importu.")
    # New documents never inherit the downgrade exception. A client-supplied
    # pdf_id is irrelevant here; Free can create only one of its three starter
    # templates (or a genuinely freeform document with no template id).
    if pdf_data.template_id:
        assert_template_allowed(db, db_user, pdf_data.template_id)
    assert_can_create_project(db, db_user)
    return create_pdf_document(
        db,
        user=db_user,
        username=username,
        pdf_data=pdf_data,
        idempotency_key=idempotency_key,
    )


@router.post("/render_pdf", status_code=status.HTTP_200_OK)
def render_user_pdf(
    pdf_data: PDFCreateRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Render the current canvas to PDF and stream it WITHOUT persisting.

    Powers the editor's "Pobierz" (Download) button. Download is independent of
    "Zapisz" (Save): this route never creates or updates a Pdf/PdfElements row,
    so a document that was never saved to "Moje dokumenty" can still be
    exported. Reuses ``PDFCreateRequest`` because the payload is the live canvas
    (elements + geometry). ``pdf_id`` is optional and is used only to prove that
    a downgraded user is rendering the same paid-template document they own; it
    never causes this route to persist the canvas.

    Side effects: an atomic provisional export claim is committed before
    ReportLab starts. A local render/validation failure refunds that claim, so
    failed work is free while concurrent bursts cannot start more renderers
    than the plan has available slots.
    """
    db_user = resolve_user_from_payload(db, payload)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    if pdf_data.editor_mode == "template" and pdf_data.template_id:
        legacy_pdf = None
        if pdf_data.pdf_id is not None:
            candidate = request_pdf_by_id(db, pdf_data.pdf_id)
            if candidate is not None and candidate.owner_id == db_user.id:
                legacy_pdf = candidate
        assert_template_allowed(
            db,
            db_user,
            pdf_data.template_id,
            existing_pdf=legacy_pdf,
        )
    # The read-only gate avoids a needless atomic claim in the common exhausted
    # case. ``record_export`` is the authoritative cross-worker admission and
    # must succeed before ReportLab starts.
    assert_can_export(db, db_user)
    claim = record_export(db, db_user.id)
    claim_period = str(claim.period_key)
    try:
        pdf_bytes = render_document_bytes(db, user=db_user, pdf_data=pdf_data)
    except Exception:
        _refund_failed_export(
            db,
            user_id=int(db_user.id),
            period_key=claim_period,
        )
        raise

    filename = _pdf_download_filename(pdf_data.pdf_title)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(filename)},
    )


@router.get("/fetch_pdfs", status_code=status.HTTP_200_OK)
def fetch_user_pdfs(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """List documents owned by the caller (My Docs). Empty libraries return 404."""
    db_user = resolve_user_from_payload(db, payload)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    username = db_user.username

    pdfs = request_pdfs_by_id(db, db_user.id)

    if not pdfs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utwórz plik PDF, aby był dostępny do podglądu i edycji.",
        )
    return [_public_pdf_metadata(pdf_row) for pdf_row in pdfs]


def _require_owned_pdf(db: Session, payload: dict, pdf_id):
    """Fetch a Pdf row and 403 unless it belongs to the authenticated user.

    Every by-id pdf route MUST go through this — fetching by id alone lets any
    logged-in user read/modify anyone's documents (IDOR).
    """
    db_user = resolve_user_from_payload(db, payload)
    pdf_row = request_pdf_by_id(db, pdf_id)
    if pdf_row is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono pliku PDF.")
    if db_user is None or pdf_row.owner_id != db_user.id:
        raise HTTPException(status_code=403, detail="Ten dokument nie należy do Ciebie.")
    return pdf_row


@router.post("/show_pdf", status_code=status.HTTP_200_OK)
def show_user_pdf(
    db: Session = Depends(get_db),
    payload: dict = Depends(verify_token),
    pdf_id=Body(),
):
    """Return one owned document's metadata and elements for editor hydration.

    The single response avoids combining elements with a potentially stale list
    entry and includes the normalized CV snapshot needed for template changes.
    """
    pdf_row = _require_owned_pdf(db, payload, pdf_id)
    pdf_to_show = request_pdf_by_id_show(db, pdf_id)

    if not pdf_to_show:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nie znaleziono pliku PDF.",
        )
    return {"document": _public_pdf_metadata(pdf_row), "elements": pdf_to_show}


@router.delete("/delete_pdf", status_code=status.HTTP_202_ACCEPTED)
def delete_user_pdf(
    db: Session = Depends(get_db),
    payload: dict = Depends(verify_token),
    pdf_id=Body(),
):
    """Delete owned DB rows and durably queue private-object removal."""
    pdf_to_delete = _require_owned_pdf(db, payload, pdf_id)

    db_user = resolve_user_from_payload(db, payload)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    username = db_user.username
    deleted_title = pdf_to_delete.title
    deleted_id = pdf_to_delete.id
    delete_pdf_document(db, pdf_row=pdf_to_delete, username=username)
    return {"deleted": "Usunięto plik PDF.", "name": deleted_title, "pdf_id": deleted_id}


@router.put("/update_pdf", status_code=status.HTTP_201_CREATED)
def update_user_pdf(
    pdf_data: PDFUpdateRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(verify_token),
):
    """Persist elements and regenerate the downloadable PDF for an owned document.

    Heavier than autosave: publishes a new immutable local/S3 object, switches
    the database pointer, and syncs PdfElements (including deletions).
    """
    db_user = resolve_user_from_payload(db, payload)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    username = db_user.username
    pdf_row = _require_owned_pdf(db, payload, pdf_data.pdf_id)
    if pdf_data.editor_mode == "template" and pdf_data.template_id:
        # A downgraded user may keep the row's existing paid template, but may
        # not turn a Free document into a paid-template document through update.
        assert_template_allowed(
            db, db_user, pdf_data.template_id, existing_pdf=pdf_row,
        )
    return update_pdf_document(db, pdf_row=pdf_row, user=db_user, username=username, pdf_data=pdf_data)


@router.put("/save_elements", status_code=status.HTTP_200_OK)
def save_pdf_elements(
    pdf_data: PDFUpdateRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(verify_token),
):
    """Lightweight autosave: persist canvas elements + page geometry only.

    No ReportLab render, no S3 upload — cheap enough for idle debounce while
    editing. The rendered PDF stays stale until an explicit create/update;
    reopening loads from these saved elements (`show_pdf` reads PdfElements).
    """
    pdf_row = _require_owned_pdf(db, payload, pdf_data.pdf_id)
    db_user = resolve_user_from_payload(db, payload)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    if pdf_data.editor_mode == "template" and pdf_data.template_id:
        assert_template_allowed(
            db, db_user, pdf_data.template_id, existing_pdf=pdf_row,
        )

    return save_pdf_elements_document(
        db,
        pdf_row=pdf_row,
        user=db_user,
        pdf_data=pdf_data,
    )


@router.post("/download_pdf", status_code=status.HTTP_200_OK)
def download_pdf(
    db: Session = Depends(get_db),
    id=Body(),
    payload: dict = Depends(verify_token),
):
    """Stream an owned PDF as an attachment after the export entitlement check.

    Side effects: increments the monthly export counter via `record_export`.
    Re-renders a legacy watermarked file into a new Storage V2 object before
    serving it. Clean files never pay that compatibility cost.

    Bytes are always proxied through this API (local disk or S3 ``get_object``).
    Returning a browser-side S3 presigned URL used to fail with opaque
    ``Failed to fetch`` errors whenever the bucket lacked CORS for the React
    origin — the editor cannot read cross-origin bodies without that CORS
    config, so the API streams the file instead.
    """
    pdf_row = _require_owned_pdf(db, payload, id)
    db_user = resolve_user_from_payload(db, payload)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    username = db_user.username
    assert_can_export(db, db_user)
    claim = record_export(db, db_user.id)
    claim_period = str(claim.period_key)
    try:
        # Older deployments persisted Free-plan files with a watermark. Keep
        # the flag true until those bytes are rebuilt. Admission happens first
        # because this compatibility render is as costly as live-canvas export.
        if bool(pdf_row.watermarked):
            pdf_row = render_pdf_for_download(
                db,
                pdf_row,
                user=db_user,
                username=username,
            )
        pdf_bytes = read_pdf_document_bytes(pdf_row, username=username)
    except (FileNotFoundError, OSError, ValueError) as exc:
        _refund_failed_export(
            db,
            user_id=int(db_user.id),
            period_key=claim_period,
        )
        raise HTTPException(
            status_code=404,
            detail={
                "code": "pdf_storage_not_found",
                "message": "Nie znaleziono pliku PDF w magazynie.",
            },
        ) from exc
    except Exception:
        _refund_failed_export(
            db,
            user_id=int(db_user.id),
            period_key=claim_period,
        )
        raise

    filename = _pdf_download_filename(pdf_row.title)
    disposition = _content_disposition(filename)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": disposition},
    )
