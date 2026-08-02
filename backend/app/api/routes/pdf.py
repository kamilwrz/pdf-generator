"""
PDF document lifecycle: create, list, open canvas, autosave, update, delete, download.

Ownership is enforced via `_require_owned_pdf` on every by-id route to prevent
IDOR across users. Creating and exporting are entitlement-gated.

There are two persistence paths:
- Full create/update also regenerates a ReportLab PDF file (local or S3)
  via ``document_service``.
- `/save_elements` persists canvas rows only — used for debounced autosave
  without paying the cost of a full render on every keystroke.
"""

import datetime
from fastapi import APIRouter, Body, Depends, HTTPException
from starlette import status
from sqlalchemy.orm import Session
from app.core.security import verify_token
from app.crud.user import get_user_by_username
from app.schemas.pdf_schema import PDFCreateRequest, PDFUpdateRequest
from app.dependencies import get_db

from app.crud.pdfs import (
    request_pdf_by_id, delete_pdf_by_id, request_pdf_by_id_show,
    request_pdf_elements_by_element_id, update_pdf_elements, request_pdfs_by_id
)

from app.utils.pdf_file_ops import delete_pdf_file
from app.core.config import USE_S3
from app.services.entitlements import assert_can_create_project, assert_can_export, record_export
from app.services.document_service import create_pdf_document, update_pdf_document

if USE_S3:
    from app.services import s3_storage


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
    titles for the same user are rejected so download links stay stable.
    """
    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    assert_can_create_project(db, db_user)
    return create_pdf_document(db, user=db_user, username=username, pdf_data=pdf_data)


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
    return pdfs


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
    """Return all PdfElements for an owned document so the editor can hydrate."""
    _require_owned_pdf(db, payload, pdf_id)
    pdf_to_show = request_pdf_by_id_show(db, pdf_id)

    if not pdf_to_show:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nie znaleziono pliku PDF.",
        )
    return pdf_to_show


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
    pdf_row = _require_owned_pdf(db, payload, pdf_data.pdf_id)
    return update_pdf_document(db, pdf_row=pdf_row, username=username, pdf_data=pdf_data)


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

    pdf_row.pages = pdf_data.pages
    pdf_row.page_width = pdf_data.page_width
    pdf_row.page_height = pdf_data.page_height
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
    """Return a download URL or row for an owned PDF after export entitlement check.

    Side effect: increments the monthly export counter via `record_export`.
    S3 deployments return a short-lived presigned URL; local returns the Pdf row.
    """
    pdf_row = _require_owned_pdf(db, payload, id)
    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    assert_can_export(db, db_user)
    if USE_S3:
        key = s3_storage.key_from_file_path(pdf_row.file_path)
        download_url = s3_storage.generate_presigned_download_url(key)
        record_export(db, db_user.id)
        return {"url": download_url, "title": pdf_row.title}
    record_export(db, db_user.id)
    return pdf_row
