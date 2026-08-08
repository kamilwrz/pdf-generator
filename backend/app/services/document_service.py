"""
PDF document create/update orchestration.

Routes stay thin: ownership and HTTP concerns remain in `pdf.py`, while this
module owns ReportLab render + local/S3 persistence and image path resolution
for authenticated `/images/{id}/content` URLs.
"""

from __future__ import annotations

import re
from os import listdir
from os.path import isfile, join
from pathlib import Path

from fastapi import HTTPException
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session

from app.core.config import BACKEND_URL, PDF_UPLOAD_DIR, USE_S3
from app.crud.images import request_image_by_id
from app.crud.pdfs import (
    create_new_pdf,
    request_pdf_elements_by_element_id,
    serialize_spacing_px,
    update_pdf_elements,
)
from app.services.entitlements import get_entitlements
from app.services.pdf_generator import PDF_Generator
from app.utils.build_pdf import build_pdf_to_buffer
from app.utils.image_src_to_path import image_src_to_local_path
from app.utils.pdf_file_ops import rename_pdf_file

if USE_S3:
    from app.services import s3_storage

# Matches canvas src values written by the authenticated image content route.
_IMAGE_CONTENT_RE = re.compile(r"/images/(\d+)/content(?:\?.*)?$")


def resolve_image_src_for_pdf(db: Session, src: str) -> str:
    """Resolve a canvas image `src` to a local path ReportLab can open.

    Authenticated content URLs (`/images/{id}/content`) are looked up by id so
    exports keep working after the public `/uploads` mount is removed. Legacy
    `/uploads/...` and template-asset paths still use ``image_src_to_local_path``.
    """
    if not src:
        return src
    match = _IMAGE_CONTENT_RE.search(str(src).replace("\\", "/"))
    if match:
        image = request_image_by_id(db, int(match.group(1)))
        if image is None:
            return src
        path = image.file_path
        if USE_S3 and str(path).startswith("https://"):
            return image_src_to_local_path(path)
        return str(Path(path).resolve()) if path else src
    return image_src_to_local_path(src)


def make_image_resolver(db: Session):
    """Return ``image_resolver(src)`` bound to the current DB session."""

    def _resolve(src: str) -> str:
        return resolve_image_src_for_pdf(db, src)

    return _resolve


def create_pdf_document(db: Session, *, user, username: str, pdf_data) -> dict:
    """Persist a new Pdf row and render the initial downloadable file.

    @raises HTTPException 400 - Empty elements or duplicate title.
    """
    elements = pdf_data.root
    title = pdf_data.pdf_title
    if not elements:
        raise HTTPException(status_code=400, detail="Brakuje części danych.")

    resolver = make_image_resolver(db)
    # Free-plan accounts get a diagonal watermark stamped onto every rendered
    # page; Standard/Premium exports stay clean. The plan is read fresh here
    # (rather than cached on the user object) so an upgrade mid-session takes
    # effect on the very next save.
    watermark = get_entitlements(db, user)["plan_slug"] == "free"

    if USE_S3:
        key = f"pdfs/{username}/{title}"
        try:
            paginator = s3_storage.get_client().get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=s3_storage.S3_BUCKET, Prefix=f"pdfs/{username}/"):
                for obj in page.get("Contents", []):
                    if obj["Key"] == key:
                        raise HTTPException(status_code=400, detail="Plik o tej nazwie już istnieje.")
        except HTTPException:
            raise
        except Exception:
            # Listing can fail transiently; proceed and let upload overwrite if needed.
            pass
        pdf_bytes = build_pdf_to_buffer(pdf_data, elements, resolver, watermark=watermark)
        file_path = s3_storage.upload_bytes(key, pdf_bytes, content_type="application/pdf")
        pdf_id = create_new_pdf(
            db, title, user.id, file_path, elements,
            pdf_data.pages, pdf_data.page_width, pdf_data.page_height,
            getattr(pdf_data, "editor_mode", "freeform"),
            getattr(pdf_data, "template_id", None),
            getattr(pdf_data, "spacing_px", None),
            watermarked=watermark,
        )
        return {"created": "Utworzono plik PDF.", "link": file_path, "pdf_id": pdf_id}

    user_upload_dir = PDF_UPLOAD_DIR / username
    user_upload_dir.mkdir(parents=True, exist_ok=True)

    files_in_user_folder = [f for f in listdir(user_upload_dir) if isfile(join(user_upload_dir, f))]
    if title in files_in_user_folder:
        raise HTTPException(status_code=400, detail="Plik o tej nazwie już istnieje.")

    pdf_path = user_upload_dir / title
    pdf_id = create_new_pdf(
        db, title, user.id, pdf_path.as_posix(), elements,
        pdf_data.pages, pdf_data.page_width, pdf_data.page_height,
        getattr(pdf_data, "editor_mode", "freeform"),
        getattr(pdf_data, "template_id", None),
        getattr(pdf_data, "spacing_px", None),
        watermarked=watermark,
    )

    pdf = PDF_Generator(
        pdf_data,
        canvas.Canvas(str(user_upload_dir / title), pagesize=(pdf_data.page_width, pdf_data.page_height)),
    )
    pdf.setTitle(title)
    pdf.render_elements(elements, resolver, pdf_data.pages, watermark=watermark)

    return {
        "created": "Utworzono plik PDF.",
        "link": f"{BACKEND_URL}/{pdf_path.as_posix()}",
        "pdf_id": pdf_id,
    }


def update_pdf_document(db: Session, *, pdf_row, user, username: str, pdf_data) -> dict:
    """Regenerate the downloadable PDF and sync PdfElements for an owned row."""
    elements = pdf_data.root
    title = pdf_data.pdf_title
    pdf_id = pdf_data.pdf_id
    resolver = make_image_resolver(db)
    # Re-derive the watermark flag from the account's CURRENT plan on every
    # update, not just at creation time — a Free-plan document must regain the
    # watermark on save even if it was first created while on a paid plan
    # (e.g. after a downgrade), and a paid-plan resave must clear it.
    watermark = get_entitlements(db, user)["plan_slug"] == "free"

    if USE_S3:
        key = f"pdfs/{username}/{title}"
        pdf_bytes = build_pdf_to_buffer(pdf_data, elements, resolver, watermark=watermark)
        s3_storage.upload_bytes(key, pdf_bytes, content_type="application/pdf")
        pdf_row.title = title
        pdf_row.pages = pdf_data.pages
        pdf_row.page_width = pdf_data.page_width
        pdf_row.page_height = pdf_data.page_height
        pdf_row.editor_mode = (
            "template" if getattr(pdf_data, "editor_mode", "freeform") == "template" else "freeform"
        )
        pdf_row.template_id = getattr(pdf_data, "template_id", None)
        pdf_row.spacing_px = serialize_spacing_px(getattr(pdf_data, "spacing_px", None))
        pdf_row.file_path = (
            f"https://{s3_storage.S3_BUCKET}.s3.{s3_storage.AWS_REGION}.amazonaws.com/{key}"
        )
        pdf_row.watermarked = watermark
        link = pdf_row.file_path
        existing_by_id = request_pdf_elements_by_element_id(db, pdf_id)
        update_pdf_elements(db, elements, existing_by_id, pdf_id)
        db.commit()
        return {"updated": "Pomyślnie zaktualizowano plik PDF.", "link": link, "pdf_id": pdf_row.id}

    new_file_path = rename_pdf_file(pdf_row, title)
    pdf_row.pages = pdf_data.pages
    pdf_row.page_width = pdf_data.page_width
    pdf_row.page_height = pdf_data.page_height
    pdf_row.editor_mode = (
        "template" if getattr(pdf_data, "editor_mode", "freeform") == "template" else "freeform"
    )
    pdf_row.template_id = getattr(pdf_data, "template_id", None)
    pdf_row.spacing_px = serialize_spacing_px(getattr(pdf_data, "spacing_px", None))
    db.add(pdf_row)
    existing_by_id = request_pdf_elements_by_element_id(db, pdf_id)
    update_pdf_elements(db, elements, existing_by_id, pdf_id)
    c = canvas.Canvas(new_file_path, pagesize=(pdf_data.page_width, pdf_data.page_height))
    pdf = PDF_Generator(pdf_data, c)
    pdf.setTitle(pdf_row.title or "untitled")
    pdf.render_elements(elements, resolver, pdf_data.pages, watermark=watermark)
    pdf_row.watermarked = watermark
    db.commit()
    return {"updated": "Pomyślnie zaktualizowano plik PDF.", "link": new_file_path, "pdf_id": pdf_row.id}
