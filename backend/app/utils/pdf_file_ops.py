"""Local filesystem helpers for generated PDF files.

Used when `USE_S3` is false. Failures on delete are swallowed so DB cleanup
can still succeed if the file was already removed manually.
"""

import os


def delete_pdf_file(file_path):
    """Best-effort unlink of a local PDF path."""
    try:
        os.remove(file_path)
    except Exception:
        return {"message": f"Nie znaleziono pliku „{file_path}”."}


def rename_pdf_file(pdf: object, title: str) -> str:
    """Rename the on-disk PDF to match a new document title and update the ORM row.

    Side effects: filesystem rename plus mutating `pdf.title` / `pdf.file_path`.
    Assumes titles are used as filenames under the user folder.
    """
    pdf_file_path = str(pdf.file_path)

    new_file_path = pdf_file_path.split("/")
    new_file_path[-1] = title

    os.rename(pdf_file_path, "/".join(new_file_path))

    pdf.title = title
    pdf.file_path = "/".join(new_file_path)

    return "/".join(new_file_path)
