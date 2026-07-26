"""One-time removal of retired deck/article documents."""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Callable

from sqlalchemy.orm import Session

from app.core.config import USE_S3
from app.models.models import MaintenanceMarker, Pdf, PdfElements
from app.utils.pdf_file_ops import delete_pdf_file


logger = logging.getLogger(__name__)

CLEANUP_KEY = "remove_decks_and_articles_v1"
_REMOVED_DOCUMENT_SIZES = (
    (595.0, 842.0),  # A4 articles and, per the requested purge, existing CVs.
    (960.0, 540.0),  # 16:9 decks.
)


def _matches_removed_size(pdf: Pdf) -> bool:
    width = float(pdf.page_width or 595)
    height = float(pdf.page_height or 842)
    return any(
        math.isclose(width, candidate_width, abs_tol=0.1)
        and math.isclose(height, candidate_height, abs_tol=0.1)
        for candidate_width, candidate_height in _REMOVED_DOCUMENT_SIZES
    )


def _delete_stored_pdf(file_path: str | None) -> None:
    if not file_path:
        return
    if USE_S3:
        from app.services import s3_storage

        key = s3_storage.key_from_file_path(file_path)
        if key:
            s3_storage.delete_object(key)
        return
    delete_pdf_file(file_path)


def run_legacy_document_cleanup(
    db: Session,
    *,
    delete_file: Callable[[str | None], None] = _delete_stored_pdf,
) -> int:
    """
    Permanently delete retired deck/article documents once. The explicit product
    decision also removes existing A4 CV documents, so only a durable marker
    prevents future documents from being caught by this legacy-size cleanup.
    """
    existing = db.query(MaintenanceMarker).filter(
        MaintenanceMarker.key == CLEANUP_KEY
    ).first()
    if existing is not None:
        return 0

    documents = [
        pdf
        for pdf in db.query(Pdf).all()
        if _matches_removed_size(pdf)
    ]
    document_ids = [pdf.id for pdf in documents]
    for document in documents:
        try:
            delete_file(document.file_path)
        except Exception:
            # Database cleanup must not be blocked by an already-missing or
            # unreachable object. The warning leaves an operational trace.
            logger.warning(
                "Could not remove retired PDF file during cleanup: pdf_id=%s path=%s",
                document.id,
                document.file_path,
                exc_info=True,
            )

    if document_ids:
        db.query(PdfElements).filter(PdfElements.pdf_id.in_(document_ids)).delete(
            synchronize_session=False,
        )
        db.query(Pdf).filter(Pdf.id.in_(document_ids)).delete(
            synchronize_session=False,
        )

    db.add(MaintenanceMarker(
        key=CLEANUP_KEY,
        completed_at=datetime.now(timezone.utc),
    ))
    db.commit()
    return len(document_ids)
