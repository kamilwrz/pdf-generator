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

import datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import Response
from starlette import status
from sqlalchemy.orm import Session
from app.core.security import verify_token
from app.crud.user import get_user_by_username
from app.schemas.pdf_schema import PDFCreateRequest, PDFUpdateRequest
from app.dependencies import get_db

from app.crud.pdfs import (
    request_pdf_by_id, delete_pdf_by_id, request_pdf_by_id_show,
    request_pdf_elements_by_element_id, update_pdf_elements, request_pdfs_by_id,
    serialize_spacing_px,
)
from app.crud.cv_import_snapshots import get_owned_snapshot

from app.utils.pdf_file_ops import delete_pdf_file
from app.core.config import USE_S3
from app.services.entitlements import (
    assert_can_create_project, assert_can_export, assert_template_allowed,
    record_export,
)
from app.services.document_service import (
    create_pdf_document, update_pdf_document, render_pdf_for_download,
    render_document_bytes,
)

if USE_S3:
    from app.services import s3_storage


def _pdf_download_filename(title: str | None) -> str:
    """Normalise a stored document title into an attachment filename."""
    name = (title or "cv.pdf").strip() or "cv.pdf"
    if not name.lower().endswith(".pdf"):
        name = f"{name}.pdf"
    return name


def _content_disposition(filename: str) -> str:
    """Build Content-Disposition with ASCII fallback + RFC 5987 UTF-8 name."""
    ascii_fallback = filename.encode("ascii", "replace").decode("ascii").replace("?", "_")
    return (
        f'attachment; filename="{ascii_fallback}"; '
        f"filename*=UTF-8''{quote(filename)}"
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
        "spacing_px": pdf_row.spacing_px,
        "cv_data": pdf_row.cv_data,
        "source_import_id": pdf_row.source_import_id,
    }


router = APIRouter(
    prefix="/pdf",
    tags=["pdf"]
)


@router.post("/create_pdf")
async def create_user_pdf(
    pdf_data: PDFCreateRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Create a document from the current canvas and render an initial PDF file.

    Side effects: project entitlement check, Pdf + PdfElements insert, and a
    ReportLab render written to S3 or the local generated folder. Duplicate
    titles for the same user are rejected so stored-file names stay unambiguous.
    """
    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
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
    return create_pdf_document(db, user=db_user, username=username, pdf_data=pdf_data)


@router.post("/render_pdf", status_code=status.HTTP_200_OK)
async def render_user_pdf(
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

    Side effects: export entitlement check (`assert_can_export`) then the
    monthly export counter (`record_export`) — so every download counts against
    the plan quota exactly like `/download_pdf`. The render is attempted before
    the counter increments, so a failed render never consumes an export.
    """
    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    if pdf_data.template_id:
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
    # Gate before rendering so a blocked export neither renders nor meters.
    assert_can_export(db, db_user)
    pdf_bytes = render_document_bytes(db, user=db_user, pdf_data=pdf_data)
    record_export(db, db_user.id)

    filename = _pdf_download_filename(pdf_data.pdf_title)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(filename)},
    )


@router.get("/fetch_pdfs", status_code=status.HTTP_200_OK)
async def fetch_user_pdfs(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """List documents owned by the caller (My Docs). Empty libraries return 404."""
    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)

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
    db_user = get_user_by_username(db, username=payload.get("sub"))
    pdf_row = request_pdf_by_id(db, pdf_id)
    if pdf_row is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono pliku PDF.")
    if db_user is None or pdf_row.owner_id != db_user.id:
        raise HTTPException(status_code=403, detail="Ten dokument nie należy do Ciebie.")
    return pdf_row


@router.post("/show_pdf", status_code=status.HTTP_200_OK)
async def show_user_pdf(
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
async def delete_user_pdf(
    db: Session = Depends(get_db),
    payload: dict = Depends(verify_token),
    pdf_id=Body(),
):
    """Delete an owned document's DB rows and best-effort remove the PDF file."""
    pdf_to_delete = _require_owned_pdf(db, payload, pdf_id)

    delete_pdf_by_id(db, pdf_id)
    if USE_S3:
        key = s3_storage.key_from_file_path(pdf_to_delete.file_path)
        if key:
            try:
                s3_storage.delete_object(key)
            except Exception:
                pass
    else:
        delete_pdf_file(pdf_to_delete.file_path)
    return {"deleted": "Usunięto plik PDF.", "name": pdf_to_delete.title, "pdf_id": pdf_to_delete.id}


@router.put("/update_pdf", status_code=status.HTTP_201_CREATED)
async def update_user_pdf(
    pdf_data: PDFUpdateRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(verify_token),
):
    """Persist elements and regenerate the downloadable PDF for an owned document.

    Heavier than autosave: rewrites the file on disk/S3 and syncs PdfElements
    to the authoritative client list (including deletions).
    """
    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    pdf_row = _require_owned_pdf(db, payload, pdf_data.pdf_id)
    if pdf_data.template_id:
        # A downgraded user may keep the row's existing paid template, but may
        # not turn a Free document into a paid-template document through update.
        assert_template_allowed(
            db, db_user, pdf_data.template_id, existing_pdf=pdf_row,
        )
    return update_pdf_document(db, pdf_row=pdf_row, user=db_user, username=username, pdf_data=pdf_data)


@router.put("/save_elements", status_code=status.HTTP_200_OK)
async def save_pdf_elements(
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
    db_user = get_user_by_username(db, username=payload.get("sub"))
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    if pdf_data.template_id:
        assert_template_allowed(
            db, db_user, pdf_data.template_id, existing_pdf=pdf_row,
        )

    pdf_row.pages = pdf_data.pages
    pdf_row.page_width = pdf_data.page_width
    pdf_row.page_height = pdf_data.page_height
    pdf_row.editor_mode = (
        "template" if getattr(pdf_data, "editor_mode", "freeform") == "template" else "freeform"
    )
    pdf_row.template_id = getattr(pdf_data, "template_id", None)
    pdf_row.spacing_px = serialize_spacing_px(getattr(pdf_data, "spacing_px", None))
    pdf_row.cv_data = getattr(pdf_data, "cv_data", None)
    pdf_row.updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.add(pdf_row)

    existing_by_id = request_pdf_elements_by_element_id(db, pdf_data.pdf_id)
    update_pdf_elements(db, pdf_data.root, existing_by_id, pdf_data.pdf_id)
    db.commit()
    return {"saved": True, "pdf_id": pdf_row.id}


@router.post("/download_pdf", status_code=status.HTTP_200_OK)
async def download_pdf(
    db: Session = Depends(get_db),
    id=Body(),
    payload: dict = Depends(verify_token),
):
    """Stream an owned PDF as an attachment after the export entitlement check.

    Side effects: increments the monthly export counter via `record_export`.
    Re-renders a legacy watermarked stored file in place before serving it.
    Clean files never pay that compatibility cost.

    Bytes are always proxied through this API (local disk or S3 ``get_object``).
    Returning a browser-side S3 presigned URL used to fail with opaque
    ``Failed to fetch`` errors whenever the bucket lacked CORS for the React
    origin — the editor cannot read cross-origin bodies without that CORS
    config, so the API streams the file instead.
    """
    pdf_row = _require_owned_pdf(db, payload, id)
    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    assert_can_export(db, db_user)
    # Older deployments persisted Free-plan files with a watermark. Keep the
    # database flag true until those bytes are actually rebuilt, then clear it.
    # This lazy migration works for both local and S3 storage without pretending
    # that a data-only migration also changed the file contents.
    if bool(pdf_row.watermarked):
        render_pdf_for_download(db, pdf_row)
        db.commit()

    if USE_S3:
        key = s3_storage.key_from_file_path(pdf_row.file_path)
        try:
            pdf_bytes = s3_storage.download_bytes(key)
        except Exception as exc:
            raise HTTPException(
                status_code=404,
                detail="Nie znaleziono pliku PDF w magazynie.",
            ) from exc
    else:
        path = Path(pdf_row.file_path) if pdf_row.file_path else None
        if path is None or not path.is_file():
            raise HTTPException(status_code=404, detail="Nie znaleziono pliku PDF na dysku.")
        try:
            # CV PDFs are small enough to prepare in memory. Reading before the
            # atomic claim proves the bytes exist, while claiming before the
            # Response is constructed guarantees no unmetered file is sent.
            pdf_bytes = path.read_bytes()
        except OSError as exc:
            raise HTTPException(
                status_code=404,
                detail="Nie znaleziono pliku PDF na dysku.",
            ) from exc

    # This is the authoritative conditional quota claim. It deliberately runs
    # after storage access succeeds but before any response can stream bytes.
    record_export(db, db_user.id)
    filename = _pdf_download_filename(pdf_row.title)
    disposition = _content_disposition(filename)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": disposition},
    )
