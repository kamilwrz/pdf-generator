from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent  # app -> backend

FONT_PATH_INTER = _BACKEND_DIR / "fonts" / "Inter.ttf"
FONT_PATH_ROBOTO = _BACKEND_DIR / "fonts" / "Roboto.ttf"
FONT_PATH_TIMESROMAN = _BACKEND_DIR / "fonts" / "TimesRoman.otf"

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




