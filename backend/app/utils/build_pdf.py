#BUILDING PDF CONTENT IN MEMORY
import io
from reportlab.pdfgen import canvas
from app.services.pdf_generator import PDF_Generator 

def build_pdf_to_buffer(pdf_data, elements, image_src_resolver):
    """Build PDF into an in-memory buffer. image_src_resolver(src) returns path for ReportLab."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(595, 842))
    pdf = PDF_Generator(pdf_data, c)
    pdf.setTitle(pdf_data.pdf_title if hasattr(pdf_data, 'pdf_title') else "untitled")
    pages = getattr(pdf_data, "pages", 1) or 1
    pdf.render_elements(elements, image_src_resolver, pages)
    return buffer.getvalue()