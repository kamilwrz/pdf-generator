from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent  # app -> backend

FONT_PATH_INTER = _BACKEND_DIR / "fonts" / "Inter.ttf"
FONT_PATH_ROBOTO = _BACKEND_DIR / "fonts" / "Roboto.ttf"
FONT_PATH_TIMESROMAN = _BACKEND_DIR / "fonts" / "TimesRoman.ttf"

pdfmetrics.registerFont(TTFont('Inter', FONT_PATH_INTER))
pdfmetrics.registerFont(TTFont('Roboto', FONT_PATH_ROBOTO))
pdfmetrics.registerFont(TTFont('Times-Roman', FONT_PATH_TIMESROMAN))


class PDF_Generator:
    def __init__(self, DATA, CANVAS):
        self.data = DATA
        self.c = CANVAS

    def setTitle(self, title):
        self.c.setTitle(title)

    def renderImage(self, src, width, height, left, top):
        corrected_y = 842 - top - height
        self.c.drawImage(src, left, corrected_y, width=width, height=height, mask=None)

    def renderLine(self, width, height, left, top, color):
        corrected_y = 842 - top - height
        self.c.setFillColor(HexColor(color))
        self.c.rect(left, corrected_y, width=width, height=height, stroke=0, fill=1)

    def renderText(self, left, top, fontFamily, fontSize, color, content):
        corrected_y = 842 - top - fontSize * 0.34
        self.c.setFont(fontFamily, fontSize)
        self.c.setFillColor(HexColor(color))
        self.c.drawString(left, corrected_y , content)

    def generatePDF(self):
        self.c.showPage()
        self.c.save()

    def render_elements(self, elements, image_resolver, pages=1):
        """Render every element onto the canvas, one ReportLab page per
        document page. Elements are grouped by their ``page`` attribute
        (1-based). Empty pages are still emitted so the page count is
        preserved. ``image_resolver(src)`` returns a local path ReportLab
        can read."""
        by_page = {}
        for element in elements:
            if getattr(element, "deleted", None) == True:
                continue
            page_no = getattr(element, "page", 1) or 1
            by_page.setdefault(page_no, []).append(element)

        total_pages = max(int(pages or 1), max(by_page.keys(), default=1))

        for page_no in range(1, total_pages + 1):
            for element in by_page.get(page_no, []):
                category = element.category
                if category == "text":
                    self.renderText(element.left, element.top, element.fontFamily, element.fontSize, element.color, element.content)
                elif category == "line":
                    self.renderLine(float(element.width), float(element.height), element.left, element.top, element.backgroundColor)
                elif category == "image":
                    self.renderImage(image_resolver(element.src or ""), float(element.width), float(element.height), element.left, element.top)
            self.c.showPage()

        self.c.save()




