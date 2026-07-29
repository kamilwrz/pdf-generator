"""Build a complete PDF into an in-memory buffer (used for S3 uploads)."""

import io
from reportlab.pdfgen import canvas
from app.services.pdf_generator import PDF_Generator


def build_pdf_to_buffer(pdf_data, elements, image_src_resolver) -> bytes:
    """Render `elements` with ReportLab and return PDF bytes.

    `image_src_resolver(src)` must return a filesystem path ReportLab can open.
    Page size defaults to A4 portrait when the payload omits geometry.
    """
    buffer = io.BytesIO()
    page_w = float(getattr(pdf_data, "page_width", 595) or 595)
    page_h = float(getattr(pdf_data, "page_height", 842) or 842)
    c = canvas.Canvas(buffer, pagesize=(page_w, page_h))
    pdf = PDF_Generator(pdf_data, c)
    pdf.setTitle(pdf_data.pdf_title if hasattr(pdf_data, "pdf_title") else "untitled")
    pages = getattr(pdf_data, "pages", 1) or 1
    pdf.render_elements(elements, image_src_resolver, pages)
    return buffer.getvalue()
