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
    for element in elements:
        if element.category == "text" and getattr(element, "deleted", None) != True:
            pdf.renderText(element.left, element.top, element.fontFamily, element.fontSize, element.color, element.content)
        elif element.category == "line" and getattr(element, "deleted", None) != True:
            pdf.renderLine(float(element.width), float(element.height), element.left, element.top, element.backgroundColor)
        elif element.category == "image" and getattr(element, "deleted", None) != True:
            path = image_src_resolver(element.src or "")
            pdf.renderImage(path, float(element.width), float(element.height), element.left, element.top)
    pdf.generatePDF()
    return buffer.getvalue()