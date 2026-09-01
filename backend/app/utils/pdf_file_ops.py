"""Contained compatibility helpers for historic local PDF callers."""

from pathlib import Path

from app.core.config import PDF_UPLOAD_DIR


def delete_pdf_file(file_path, *, root: Path = PDF_UPLOAD_DIR):
    """Best-effort unlink only when a legacy path stays below private storage.

    Historic rows contain filesystem locators, so this compatibility boundary
    must treat the database value as untrusted. Returning a generic failure
    keeps one corrupt row from blocking a bulk cleanup without following it
    outside the configured generated-PDF directory.
    """
    try:
        root_path = Path(root).resolve()
        candidate = Path(str(file_path or "")).resolve()
        candidate.relative_to(root_path)
        candidate.unlink(missing_ok=True)
    except (OSError, TypeError, ValueError):
        return {"message": "Nie znaleziono bezpiecznego pliku PDF."}
    return None


def rename_pdf_file(pdf: object, title: str) -> str:
    """Compatibility shim that updates display metadata without moving bytes.

    Storage V2 objects use immutable server-generated keys. Historic callers may
    still import this helper during a rolling deployment, but a user-controlled
    title must never become a filesystem path or S3 key again.
    """
    pdf.title = title
    return str(getattr(pdf, "file_path", "") or "")
