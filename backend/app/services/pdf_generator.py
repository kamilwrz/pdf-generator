from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth, getAscentDescent
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

    @staticmethod
    def _line_width(text, font, size, letter_spacing):
        """Rendered width of a string including CSS-style letter-spacing
        (applied after every character)."""
        if not text:
            return 0.0
        return stringWidth(text, font, size) + len(text) * letter_spacing

    def _wrap_textarea(self, text, font, size, letter_spacing, max_width):
        """Reproduce the browser's soft-wrapping of a fixed-width text box.

        Honours explicit newlines, breaks on spaces, and hard-breaks words
        that are individually wider than the box. Width is measured with the
        same font metrics + letter-spacing the canvas uses, so the wrap points
        match what the user sees in edit mode."""
        lines = []
        for paragraph in (text or "").split("\n"):
            if paragraph == "":
                lines.append("")
                continue

            current = ""
            for word in paragraph.split(" "):
                candidate = word if current == "" else current + " " + word
                if self._line_width(candidate, font, size, letter_spacing) <= max_width:
                    current = candidate
                    continue

                if current:
                    lines.append(current)
                    current = ""

                # A single word that overflows the box is hard-broken per char.
                if self._line_width(word, font, size, letter_spacing) > max_width:
                    chunk = ""
                    for ch in word:
                        if chunk == "" or self._line_width(chunk + ch, font, size, letter_spacing) <= max_width:
                            chunk += ch
                        else:
                            lines.append(chunk)
                            chunk = ch
                    current = chunk
                else:
                    current = word

            lines.append(current)
        return lines

    def renderTextarea(self, left, top, width, height, fontFamily, fontSize, color, content, lineHeight, letterSpacing):
        """Render a multi-line text box so it matches the on-canvas edit-mode
        box: same wrap, line-height, letter-spacing and font metrics. Lines
        whose top falls outside the box height are clipped (mirrors the
        textarea's overflow:hidden)."""
        width = float(width)
        height = float(height)
        fontSize = float(fontSize)
        line_height = float(lineHeight) if lineHeight else fontSize * 1.2
        letter_spacing = float(letterSpacing) if letterSpacing else 0.0

        # CSS centres the text within each line box via half-leading; the
        # first baseline sits at half_leading + ascent below the box top.
        ascent, descent = getAscentDescent(fontFamily, fontSize)  # ascent>0, descent<0
        font_height = ascent - descent
        half_leading = (line_height - font_height) / 2.0

        lines = self._wrap_textarea(content, fontFamily, fontSize, letter_spacing, width)

        for i, line in enumerate(lines):
            line_top = i * line_height
            if line_top >= height:  # clipped by the box
                break
            baseline_from_top = line_top + half_leading + ascent
            y = 842 - top - baseline_from_top

            text_obj = self.c.beginText()
            text_obj.setTextOrigin(left, y)
            text_obj.setFont(fontFamily, fontSize)
            text_obj.setCharSpace(letter_spacing)
            text_obj.setFillColor(HexColor(color))
            if line:
                text_obj.textLine(line)
            self.c.drawText(text_obj)

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
                elif category == "textarea":
                    self.renderTextarea(
                        element.left, element.top, element.width, element.height,
                        element.fontFamily, element.fontSize, element.color, element.content,
                        getattr(element, "lineHeight", None), getattr(element, "letterSpacing", None),
                    )
                elif category == "line":
                    self.renderLine(float(element.width), float(element.height), element.left, element.top, element.backgroundColor)
                elif category == "image":
                    self.renderImage(image_resolver(element.src or ""), float(element.width), float(element.height), element.left, element.top)
            self.c.showPage()

        self.c.save()




