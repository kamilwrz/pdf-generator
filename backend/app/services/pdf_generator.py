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

# Real bold/italic cuts (latin) for the custom TTF families, so styled text
# uses true variants (matching the browser, which @font-faces the same files)
# instead of faux stroke/skew.
_FONTS_DIR = _BACKEND_DIR / "fonts"
for _fam in ("Inter", "Roboto"):
    pdfmetrics.registerFont(TTFont(f'{_fam}-Bold', _FONTS_DIR / f'{_fam}-Bold.ttf'))
    pdfmetrics.registerFont(TTFont(f'{_fam}-Italic', _FONTS_DIR / f'{_fam}-Italic.ttf'))
    pdfmetrics.registerFont(TTFont(f'{_fam}-BoldItalic', _FONTS_DIR / f'{_fam}-BoldItalic.ttf'))
    pdfmetrics.registerFontFamily(
        _fam, normal=_fam, bold=f'{_fam}-Bold', italic=f'{_fam}-Italic', boldItalic=f'{_fam}-BoldItalic'
    )


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

    ITALIC_SHEAR = 0.21  # ~12 degree slant for faux italic (fallback only)

    # (family, bold, italic) -> a registered font that is a REAL variant.
    # Inter/Roboto are the cuts we ship; Times/Helvetica/Courier use ReportLab's
    # always-available standard variants. Anything else falls back to faux.
    _VARIANT_FONTS = {
        'Inter':       ('Inter-Bold', 'Inter-Italic', 'Inter-BoldItalic'),
        'Roboto':      ('Roboto-Bold', 'Roboto-Italic', 'Roboto-BoldItalic'),
        'Times-Roman': ('Times-Bold', 'Times-Italic', 'Times-BoldItalic'),
        'Helvetica':   ('Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'),
        'Courier':     ('Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'),
    }

    @classmethod
    def _resolve_font(cls, family, bold, italic):
        """Pick the font to draw with. Returns (font_name, faux_bold,
        faux_italic): a real variant when one exists (no faux needed),
        otherwise the base font with faux flags so it still renders."""
        variants = cls._VARIANT_FONTS.get(family)
        if not variants:
            return family, bold, italic
        bold_f, italic_f, bolditalic_f = variants
        if bold and italic:
            return bolditalic_f, False, False
        if bold:
            return bold_f, False, False
        if italic:
            return italic_f, False, False
        return family, False, False

    def _draw_text_line(self, x, y, text, font, size, color, bold=False, italic=False, underline=False, letter_spacing=0.0):
        """Draw one line of text at baseline (x, y) with optional bold, italic
        and underline. Uses a real bold/italic font when available; faux styling
        (fill+stroke for bold, sheared matrix for italic) is the fallback for
        fonts without a registered variant. Underline is always a drawn rule."""
        draw_font, faux_bold, faux_italic = self._resolve_font(font, bold, italic)
        if text:
            to = self.c.beginText()
            if faux_italic:
                to.setTextTransform(1, 0, self.ITALIC_SHEAR, 1, x, y)
            else:
                to.setTextOrigin(x, y)
            to.setFont(draw_font, size)
            if letter_spacing:
                to.setCharSpace(letter_spacing)
            to.setFillColor(HexColor(color))
            if faux_bold:
                to.setTextRenderMode(2)  # fill + stroke
                self.c.setLineWidth(max(0.3, size * 0.035))
                self.c.setStrokeColor(HexColor(color))
            to.textLine(text)
            self.c.drawText(to)
        if underline and text:
            width = stringWidth(text, draw_font, size) + len(text) * letter_spacing
            uy = y - size * 0.12
            self.c.setLineWidth(max(0.4, size * 0.05))
            self.c.setStrokeColor(HexColor(color))
            self.c.line(x, uy, x + width, uy)

    def renderText(self, left, top, fontFamily, fontSize, color, content, bold=False, italic=False, underline=False):
        corrected_y = 842 - top - fontSize * 0.34
        self._draw_text_line(left, corrected_y, content, fontFamily, fontSize, color, bold, italic, underline)

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

    def renderTextarea(self, left, top, width, height, fontFamily, fontSize, color, content, lineHeight, letterSpacing, bold=False, italic=False, underline=False):
        """Render a multi-line text box so it matches the on-canvas edit-mode
        box: same wrap, line-height, letter-spacing and font metrics. Lines
        whose top falls outside the box height are clipped (mirrors the
        textarea's overflow:hidden)."""
        width = float(width)
        height = float(height)
        fontSize = float(fontSize)
        line_height = float(lineHeight) if lineHeight else fontSize * 1.2
        letter_spacing = float(letterSpacing) if letterSpacing else 0.0

        # Measure with the variant that will actually be drawn (real bold/italic
        # has different glyph widths), so the wrap matches the browser, which
        # @font-faces the same files.
        measure_font, _, _ = self._resolve_font(fontFamily, bold, italic)

        # CSS centres the text within each line box via half-leading; the
        # first baseline sits at half_leading + ascent below the box top.
        ascent, descent = getAscentDescent(measure_font, fontSize)  # ascent>0, descent<0
        font_height = ascent - descent
        half_leading = (line_height - font_height) / 2.0

        lines = self._wrap_textarea(content, measure_font, fontSize, letter_spacing, width)

        for i, line in enumerate(lines):
            line_top = i * line_height
            if line_top >= height:  # clipped by the box
                break
            baseline_from_top = line_top + half_leading + ascent
            y = 842 - top - baseline_from_top

            self._draw_text_line(left, y, line, fontFamily, fontSize, color, bold, italic, underline, letter_spacing)

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
                    self.renderText(
                        element.left, element.top, element.fontFamily, element.fontSize, element.color, element.content,
                        getattr(element, "bold", False), getattr(element, "italic", False), getattr(element, "underline", False),
                    )
                elif category == "textarea":
                    self.renderTextarea(
                        element.left, element.top, element.width, element.height,
                        element.fontFamily, element.fontSize, element.color, element.content,
                        getattr(element, "lineHeight", None), getattr(element, "letterSpacing", None),
                        getattr(element, "bold", False), getattr(element, "italic", False), getattr(element, "underline", False),
                    )
                elif category == "line":
                    self.renderLine(float(element.width), float(element.height), element.left, element.top, element.backgroundColor)
                elif category == "image":
                    self.renderImage(image_resolver(element.src or ""), float(element.width), float(element.height), element.left, element.top)
            self.c.showPage()

        self.c.save()




