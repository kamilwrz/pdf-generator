from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth, getAscentDescent
from pathlib import Path
import io
import re
from fontTools.ttLib import TTFont as _FTFont

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent  # app -> backend

FONT_PATH_INTER = _BACKEND_DIR / "fonts" / "Inter.ttf"
FONT_PATH_ROBOTO = _BACKEND_DIR / "fonts" / "Roboto.ttf"
FONT_PATH_TIMESROMAN = _BACKEND_DIR / "fonts" / "TimesRoman.ttf"


def _register_ttf(name, path):
    """Register a TTF under ``name``, first forcing its internal name-table
    identifiers to match ``name``.

    ReportLab dedupes dynamic (TTF) font registrations by the font FILE's own
    internal PostScript name, not by the name passed to registerFont()
    (pdfmetrics._dynFaceNames, keyed on TTFontFace.name — parsed from the
    file's nameID 6/4/1 records). Some of our bundled variant files mislabel
    themselves internally as their Regular/Italic sibling (e.g. Inter-Bold.ttf
    and Inter.ttf both self-report "Inter-Regular"), so registering them under
    different Python-side names still collides at that internal-name layer:
    the second registerFont() call silently aliases onto the first font
    object and its glyphs are never used — bold/italic text renders as
    whichever variant got registered first. Rewriting each file's name table
    to its intended registration name before handing it to ReportLab makes
    every variant a distinct entry regardless of what the file itself claims
    to be.
    """
    ft = _FTFont(str(path))
    for record in ft["name"].names:
        if record.nameID in (1, 3, 4, 6, 16):
            record.string = name
    buf = io.BytesIO()
    ft.save(buf)
    buf.seek(0)
    pdfmetrics.registerFont(TTFont(name, buf))


_register_ttf('Inter', FONT_PATH_INTER)
_register_ttf('Roboto', FONT_PATH_ROBOTO)
_register_ttf('Times-Roman', FONT_PATH_TIMESROMAN)

# Real bold/italic cuts (latin) for the custom TTF families, so styled text
# uses true variants (matching the browser, which @font-faces the same files)
# instead of faux stroke/skew.
_FONTS_DIR = _BACKEND_DIR / "fonts"
for _fam in ("Inter", "Roboto"):
    _register_ttf(f'{_fam}-Bold', _FONTS_DIR / f'{_fam}-Bold.ttf')
    _register_ttf(f'{_fam}-Italic', _FONTS_DIR / f'{_fam}-Italic.ttf')
    _register_ttf(f'{_fam}-BoldItalic', _FONTS_DIR / f'{_fam}-BoldItalic.ttf')
    pdfmetrics.registerFontFamily(
        _fam, normal=_fam, bold=f'{_fam}-Bold', italic=f'{_fam}-Italic', boldItalic=f'{_fam}-BoldItalic'
    )

# Times-Roman ships as Liberation Serif (SIL OFL, metric-compatible with Times
# New Roman, full Latin Extended-A incl. Polish). Real bold/italic cuts replace
# ReportLab's built-in Type1 Times-* variants, which are Latin-1 only and
# cannot render ą/ę/ł/ż etc.
_register_ttf('Times-Roman-Bold', _FONTS_DIR / 'TimesRoman-Bold.ttf')
_register_ttf('Times-Roman-Italic', _FONTS_DIR / 'TimesRoman-Italic.ttf')
_register_ttf('Times-Roman-BoldItalic', _FONTS_DIR / 'TimesRoman-BoldItalic.ttf')
pdfmetrics.registerFontFamily(
    'Times-Roman', normal='Times-Roman', bold='Times-Roman-Bold',
    italic='Times-Roman-Italic', boldItalic='Times-Roman-BoldItalic'
)


class PDF_Generator:
    def __init__(self, DATA, CANVAS):
        self.data = DATA
        self.c = CANVAS
        # Page height drives the top-left -> bottom-left y flip everywhere.
        # A4 portrait (842) is the default document geometry.
        self.page_h = float(getattr(DATA, "page_height", 842) or 842)

    def setTitle(self, title):
        self.c.setTitle(title)

    def renderImage(self, src, width, height, left, top):
        corrected_y = self.page_h - top - height
        self.c.drawImage(src, left, corrected_y, width=width, height=height, mask=None)

    def renderLine(self, width, height, left, top, color):
        corrected_y = self.page_h - top - height
        self.c.setFillColor(HexColor(color))
        self.c.rect(left, corrected_y, width=width, height=height, stroke=0, fill=1)

    def renderRectangle(self, width, height, left, top, color, border_width):
        """Outline-only rectangle (no fill). ``color`` is the border colour
        (the element reuses backgroundColor for it, like the line). The stroke
        is inset by half its width so the outer edge lines up with the box —
        matching the canvas's box-sizing: border-box."""
        corrected_y = self.page_h - top - height
        bw = float(border_width) if border_width else 1.0
        self.c.setStrokeColor(HexColor(color or "#000000"))
        self.c.setLineWidth(bw)
        self.c.rect(left + bw / 2, corrected_y + bw / 2, width=width - bw, height=height - bw, stroke=1, fill=0)

    def renderEllipse(self, width, height, left, top, color, border_width, filled):
        """Render a CSS border-box circle/ellipse with matching PDF bounds."""
        corrected_y = self.page_h - top - height
        shape_color = HexColor(color or "#000000")
        if filled:
            self.c.setFillColor(shape_color)
            self.c.ellipse(left, corrected_y, left + width, corrected_y + height, stroke=0, fill=1)
            return

        bw = float(border_width) if border_width else 1.0
        bw = min(bw, float(width), float(height))
        inset = bw / 2
        self.c.setStrokeColor(shape_color)
        self.c.setLineWidth(bw)
        self.c.ellipse(
            left + inset,
            corrected_y + inset,
            left + width - inset,
            corrected_y + height - inset,
            stroke=1,
            fill=0,
        )

    @staticmethod
    def _connector_geometry(source, target):
        """Orthogonal (right-angle) route between two element boxes. Endpoints
        sit at the midpoint of each box's facing side; the path bends at the
        midway line. Returns (points, end_point, last_dir) in canvas (top-left
        origin) coordinates — identical to the frontend's connectorPath.js so
        the PDF matches the canvas. last_dir is the direction the final segment
        travels into the target (for the arrowhead)."""
        def box(el):
            w = float(getattr(el, "width", 0) or 0)
            h = float(getattr(el, "height", 0) or 0)
            left = float(getattr(el, "left", 0) or 0)
            top = float(getattr(el, "top", 0) or 0)
            return left, top, w, h, left + w / 2, top + h / 2, left + w, top + h

        sl, st, sw, sh, scx, scy, sr, sb = box(source)
        tl, tt, tw, th, tcx, tcy, tr, tb = box(target)
        dx = tcx - scx
        dy = tcy - scy
        if abs(dx) >= abs(dy):
            sx = sr if dx >= 0 else sl
            tx = tl if dx >= 0 else tr
            p0, p3 = (sx, scy), (tx, tcy)
            mx = (sx + tx) / 2.0
            pts = [p0, (mx, scy), (mx, tcy), p3]
            last = "right" if dx >= 0 else "left"
        else:
            sy = sb if dy >= 0 else st
            ty = tt if dy >= 0 else tb
            p0, p3 = (scx, sy), (tcx, ty)
            my = (sy + ty) / 2.0
            pts = [p0, (scx, my), (tcx, my), p3]
            last = "down" if dy >= 0 else "up"
        return pts, p3, last

    def renderConnector(self, source, target, color, border_width, arrow):
        """Thin right-angle connector between two elements, with an optional
        filled arrowhead at the target end."""
        pts, end, last = self._connector_geometry(source, target)
        bw = float(border_width) if border_width else 1.0
        stroke = HexColor(color or "#000000")
        self.c.setStrokeColor(stroke)
        self.c.setLineWidth(bw)
        flip = lambda p: (p[0], self.page_h - p[1])
        for i in range(len(pts) - 1):
            x1, y1 = flip(pts[i])
            x2, y2 = flip(pts[i + 1])
            self.c.line(x1, y1, x2, y2)
        if arrow:
            A = 7.0
            ex, ey = end
            if last == "right":
                tri = [(ex, ey), (ex - A, ey - A), (ex - A, ey + A)]
            elif last == "left":
                tri = [(ex, ey), (ex + A, ey - A), (ex + A, ey + A)]
            elif last == "down":
                tri = [(ex, ey), (ex - A, ey - A), (ex + A, ey - A)]
            else:  # up
                tri = [(ex, ey), (ex - A, ey + A), (ex + A, ey + A)]
            self.c.setFillColor(stroke)
            path = self.c.beginPath()
            fx, fy = flip(tri[0])
            path.moveTo(fx, fy)
            for pt in tri[1:]:
                fx, fy = flip(pt)
                path.lineTo(fx, fy)
            path.close()
            self.c.drawPath(path, stroke=0, fill=1)

    ITALIC_SHEAR = 0.21  # ~12 degree slant for faux italic (fallback only)

    # (family, bold, italic) -> a registered font that is a REAL variant.
    # Inter/Roboto/Times are bundled Unicode fonts. ReportLab's standard
    # Helvetica and Courier fonts use WinAnsi encoding, so they cannot render
    # Polish letters and must resolve to the Unicode-safe Inter family.
    _VARIANT_FONTS = {
        'Inter':       ('Inter-Bold', 'Inter-Italic', 'Inter-BoldItalic'),
        'Roboto':      ('Roboto-Bold', 'Roboto-Italic', 'Roboto-BoldItalic'),
        'Times-Roman': ('Times-Roman-Bold', 'Times-Roman-Italic', 'Times-Roman-BoldItalic'),
    }
    _UNICODE_FONT_ALIASES = {
        'Helvetica': 'Inter',
        'Courier': 'Inter',
    }

    @classmethod
    def _resolve_font(cls, family, bold, italic):
        """Pick the font to draw with. Returns (font_name, faux_bold,
        faux_italic): a real variant when one exists (no faux needed),
        otherwise the base font with faux flags so it still renders."""
        family = cls._UNICODE_FONT_ALIASES.get(family, family)
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

    def _draw_text_line(self, x, y, text, font, size, color, bold=False, italic=False, underline=False, letter_spacing=0.0, word_space=0.0):
        """Draw one line of text at baseline (x, y) with optional bold, italic
        and underline. Uses a real bold/italic font when available; faux styling
        (fill+stroke for bold, sheared matrix for italic) is the fallback for
        fonts without a registered variant. Underline is always a drawn rule.
        ``word_space`` adds extra width to each space char (used by justify)."""
        draw_font, faux_bold, faux_italic = self._resolve_font(font, bold, italic)
        if text:
            to = self.c.beginText()
            if faux_italic:
                to.setTextTransform(1, 0, self.ITALIC_SHEAR, 1, x, y)
            else:
                to.setTextOrigin(x, y)
            to.setFont(draw_font, size)
            # ALWAYS set both: Tc/Tw are PDF graphics state and persist across
            # text objects, so a previous line's letter-spacing/justify word
            # spacing would silently leak into every following text otherwise.
            to.setCharSpace(letter_spacing or 0)
            to.setWordSpace(word_space or 0)
            to.setFillColor(HexColor(color))
            if faux_bold:
                to.setTextRenderMode(2)  # fill + stroke
                self.c.setLineWidth(max(0.3, size * 0.035))
                self.c.setStrokeColor(HexColor(color))
            to.textLine(text)
            self.c.drawText(to)
        if underline and text:
            width = stringWidth(text, draw_font, size) + len(text) * letter_spacing + word_space * text.count(" ")
            uy = y - size * 0.12
            self.c.setLineWidth(max(0.4, size * 0.05))
            self.c.setStrokeColor(HexColor(color))
            self.c.line(x, uy, x + width, uy)

    def renderText(self, left, top, fontFamily, fontSize, color, content, bold=False, italic=False, underline=False):
        corrected_y = self.page_h - top - fontSize * 0.34
        self._draw_text_line(left, corrected_y, content, fontFamily, fontSize, color, bold, italic, underline)

    @staticmethod
    def _line_width(text, font, size, letter_spacing):
        """Rendered width of a string including CSS-style letter-spacing
        (applied after every character)."""
        if not text:
            return 0.0
        return stringWidth(text, font, size) + len(text) * letter_spacing

    @classmethod
    def _wrap_textarea(cls, text, font, size, letter_spacing, max_width, bullet_list=False):
        """Reproduce the browser's soft-wrapping of a fixed-width text box.

        Honours explicit newlines, breaks on spaces, and hard-breaks words
        that are individually wider than the box. Width is measured with the
        same font metrics + letter-spacing the canvas uses, so the wrap points
        match what the user sees in edit mode.

        When ``bullet_list`` is set, a leading bullet is normalized to ``• ``
        and rendered in its own prefix column. Its real font-metric width
        determines the hanging indent, so every bullet's text and continuation
        lines have exactly the same start on the canvas and in the PDF.

        Returns tuples of (line, is_last_of_paragraph, indent_px,
        bullet_prefix). The is_last flag lets justify leave the final line of
        each paragraph left-aligned, matching CSS text-align: justify."""
        out = []
        for paragraph in (text or "").split("\n"):
            if paragraph == "":
                out.append(("", True, 0.0, ""))
                continue

            is_bullet = bullet_list and bool(re.match(r"^\s*•", paragraph))
            bullet_prefix = "• " if is_bullet else ""
            body = re.sub(r"^\s*•[ \t]*", "", paragraph) if is_bullet else paragraph
            para_indent = cls._line_width(bullet_prefix, font, size, letter_spacing)
            avail_width = max_width - para_indent

            para_lines = []
            current = ""
            for word in body.split(" "):
                candidate = word if current == "" else current + " " + word
                if cls._line_width(candidate, font, size, letter_spacing) <= avail_width:
                    current = candidate
                    continue

                if current:
                    para_lines.append(current)
                    current = ""

                # A single word that overflows the box is hard-broken per char.
                if cls._line_width(word, font, size, letter_spacing) > avail_width:
                    chunk = ""
                    for ch in word:
                        if chunk == "" or cls._line_width(chunk + ch, font, size, letter_spacing) <= avail_width:
                            chunk += ch
                        else:
                            para_lines.append(chunk)
                            chunk = ch
                    current = chunk
                else:
                    current = word

            para_lines.append(current)
            for i, ln in enumerate(para_lines):
                # The bullet occupies a dedicated prefix column on the first
                # line; all text starts at the same hanging-indent position.
                out.append((ln, i == len(para_lines) - 1, para_indent, bullet_prefix if i == 0 else ""))
        return out

    @classmethod
    def measure_textarea_height(
        cls,
        content,
        font_family,
        font_size,
        line_height,
        width,
        *,
        bold=False,
        italic=False,
        letter_spacing=0.0,
        bullet_list=False,
    ):
        """Measure wrapped copy with the exact metrics used by PDF rendering."""
        measure_font, _, _ = cls._resolve_font(font_family, bold, italic)
        lines = cls._wrap_textarea(
            content,
            measure_font,
            float(font_size),
            float(letter_spacing or 0),
            float(width),
            bullet_list,
        )
        return len(lines) * float(line_height)

    def renderTextarea(self, left, top, width, height, fontFamily, fontSize, color, content, lineHeight, letterSpacing, bold=False, italic=False, underline=False, align="left", bulletList=False, autoHeight=False):
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

        lines = self._wrap_textarea(content, measure_font, fontSize, letter_spacing, width, bulletList)
        if autoHeight:
            # A template's canvas height is measured from its rendered content.
            # Recompute from the same wrapped lines here so exporting before the
            # browser's next paint cannot silently clip a line from the PDF.
            height = len(lines) * line_height

        for i, (line, is_last, indent_px, bullet_prefix) in enumerate(lines):
            line_top = i * line_height
            if line_top >= height:  # clipped by the box
                break
            baseline_from_top = line_top + half_leading + ascent
            y = self.page_h - top - baseline_from_top

            # Alignment: offset each line by its measured width (same width the
            # browser computes, since both use the same font). Justify fills the
            # box by stretching the spaces, leaving each paragraph's last line
            # left-aligned (CSS behaviour). A hanging-indent line shifts its
            # whole effective box right by indent_px.
            eff_left = left + indent_px
            eff_width = width - indent_px
            x = eff_left
            word_space = 0.0
            if line:
                line_w = self._line_width(line, measure_font, fontSize, letter_spacing)
                if align == "right":
                    x = eff_left + (eff_width - line_w)
                elif align == "center":
                    x = eff_left + (eff_width - line_w) / 2.0
                elif align == "justify" and not is_last:
                    spaces = line.count(" ")
                    if spaces > 0 and line_w < eff_width:
                        word_space = (eff_width - line_w) / spaces

            if bullet_prefix:
                self._draw_text_line(
                    left, y, bullet_prefix, fontFamily, fontSize, color,
                    bold, italic, underline, letter_spacing,
                )
            self._draw_text_line(x, y, line, fontFamily, fontSize, color, bold, italic, underline, letter_spacing, word_space)

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
        by_id = {}
        for element in elements:
            eid = getattr(element, "element_id", None)
            if eid is not None:
                by_id[eid] = element
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
                        getattr(element, "align", "left") or "left",
                        getattr(element, "bulletList", False),
                        getattr(element, "autoHeight", False),
                    )
                elif category == "line":
                    self.renderLine(float(element.width), float(element.height), element.left, element.top, element.backgroundColor)
                elif category == "rectangle":
                    self.renderRectangle(float(element.width), float(element.height), element.left, element.top, element.backgroundColor, getattr(element, "borderWidth", 1))
                elif category in {"circle", "ellipse"}:
                    self.renderEllipse(
                        float(element.width),
                        float(element.height),
                        element.left,
                        element.top,
                        element.backgroundColor,
                        getattr(element, "borderWidth", 1),
                        getattr(element, "filled", False),
                    )
                elif category == "connector":
                    source = by_id.get(getattr(element, "source_id", None))
                    target = by_id.get(getattr(element, "target_id", None))
                    if source is not None and target is not None:
                        self.renderConnector(source, target, element.backgroundColor, getattr(element, "borderWidth", 1), getattr(element, "arrow", False))
                elif category == "image":
                    self.renderImage(image_resolver(element.src or ""), float(element.width), float(element.height), element.left, element.top)
            self.c.showPage()

        self.c.save()




