"""
ReportLab PDF renderer for CV Studio canvas documents.

Coordinate system: the editor uses a top-left origin (CSS-like). ReportLab
uses a bottom-left origin, so every draw call converts `top` into
`page_height - top - glyph_offset` before stroking text or shapes.

Fonts: bundled TTFs are registered at import time. Internal PostScript name
collisions in bold/italic files are rewritten via fontTools so each variant
actually renders (see `_register_ttf`).

Callers pass an image resolver that turns canvas `src` values into local paths
ReportLab can open (downloading from S3 when needed).
"""

from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth, getAscentDescent
from pathlib import Path
from PIL import Image as PilImage
import io
import re
from fontTools.ttLib import TTFont as _FTFont

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent  # app -> backend

# Strip control / invisible chars that become .notdef / "NBSP" boxes in PDF
# viewers, and normalize exotic Unicode spaces to ordinary spaces.
_PDF_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")
_PDF_ODD_SPACE_RE = re.compile(
    r"[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]"
)
_PDF_INVISIBLE_RE = re.compile(
    r"[\u00ad\u200b-\u200f\u2028\u2029\u2060\ufeff\ufffc\ufffd]"
)

# ReportLab stringWidth and the browser's soft-wrap disagree by ~1–2 px on
# Inter at CV body sizes when a line is packed to the box edge. Without this
# slack the PDF wraps a final word (e.g. "korporacyjnych.") while the canvas
# still shows it on the previous line. Prefer matching the canvas; a 2 px
# overshoot is invisible and does not clip under overflow:hidden.
WRAP_WIDTH_TOLERANCE_PX = 2.0


def sanitize_pdf_text(text) -> str:
    """Clean element content before drawing it into a PDF.

    Null bytes and other controls have no glyph in our fonts, so ReportLab
    still emits a text run that Acrobat labels as NBSP/missing-glyph boxes.
    Non-breaking and other Unicode spaces are folded to regular spaces so
    wrapping and export match what users expect from the canvas.
    Newlines/tabs are preserved for textarea wrapping.
    """
    if text is None:
        return ""
    cleaned = _PDF_CONTROL_RE.sub("", str(text))
    cleaned = _PDF_INVISIBLE_RE.sub("", cleaned)
    cleaned = _PDF_ODD_SPACE_RE.sub(" ", cleaned)
    return cleaned

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

# Stylish display/serif/mono options — all OFL, all with full Latin
# Extended-A coverage (verified for Polish ą/ć/ę/ł/ń/ó/ś/ź/ż incl. uppercase).
_FONTS_DIR = _BACKEND_DIR / "fonts"
for _fam in ("PlayfairDisplay", "CormorantGaramond", "Lora", "Montserrat", "JetBrainsMono"):
    _register_ttf(_fam, _FONTS_DIR / f'{_fam}.ttf')

# Real bold/italic cuts (latin) for the custom TTF families, so styled text
# uses true variants (matching the browser, which @font-faces the same files)
# instead of faux stroke/skew.
for _fam in ("Inter", "Roboto", "PlayfairDisplay", "CormorantGaramond", "Lora", "Montserrat", "JetBrainsMono"):
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
    """Draws validated canvas elements onto an open ReportLab canvas.

    Construct with the request payload (for page height) and a Canvas, then
    call `render_elements` followed by `generatePDF` to finalize the file.
    """

    def __init__(self, DATA, CANVAS):
        self.data = DATA
        self.c = CANVAS
        # Page height drives the top-left -> bottom-left y flip everywhere.
        # A4 portrait (842) is the default document geometry.
        self.page_h = float(getattr(DATA, "page_height", 842) or 842)

    def setTitle(self, title):
        """Set the PDF document title metadata shown in viewers."""
        self.c.setTitle(title)

    def renderImage(self, src, width, height, left, top, align_with_text=None):
        """Draw a bitmap after flipping Y so `top` matches the editor.

        PNG/RGBA icons must use ``mask='auto'`` — with ``mask=None`` ReportLab
        paints transparent pixels as opaque black, which shows up as solid
        squares around line-art template icons.

        ``align_with_text``:
        - ``True`` — ``top`` is the companion label's CSS top; shift to the
          optical cap mid-line used by ``renderText``.
        - ``False`` — honour the authored ``top`` (geometric placement).
        - ``None`` — legacy Iconic asset paths still get the optical shift.
        """
        h = float(height)
        w = float(width)
        t = float(top)
        src_s = str(src or "")
        normalized_src = src_s.replace("\\", "/")
        is_iconic_asset = (
            "/template-assets/iconic/" in normalized_src
            or "/template_assets/iconic/" in normalized_src
        )
        if align_with_text is False:
            align = False
        elif align_with_text is True:
            align = True
        else:
            align = is_iconic_asset
        if align and h <= 32 and w <= 32:
            # Cap-centre of an ~8.5pt Montserrat label at the same authored top.
            text_cap_mid = t - 1.2
            t = text_cap_mid - h / 2
        corrected_y = self.page_h - t - h
        if not src_s:
            return
        self.c.saveState()
        try:
            try:
                reader = self._image_reader_for_pdf(src_s)
                self.c.drawImage(
                    reader,
                    left,
                    corrected_y,
                    width=w,
                    height=h,
                    mask="auto",
                )
            except Exception:
                self.c.drawImage(
                    src_s, left, corrected_y, width=w, height=h, mask="auto",
                )
        finally:
            self.c.restoreState()

    @staticmethod
    def _image_reader_for_pdf(src):
        """Load via PIL so palette/LA/RGBA icons keep a proper soft mask."""
        path = Path(str(src))
        if path.is_file():
            with PilImage.open(path) as opened:
                image = opened.convert("RGBA") if opened.mode in ("P", "LA", "L") else opened.copy()
                if image.mode != "RGBA" and "A" in image.getbands():
                    image = image.convert("RGBA")
                elif image.mode not in ("RGB", "RGBA"):
                    image = image.convert("RGBA")
                return ImageReader(image)
        return ImageReader(src)

    def renderLine(self, width, height, left, top, color):
        corrected_y = self.page_h - top - height
        self.c.setFillColor(HexColor(color))
        self.c.rect(left, corrected_y, width=width, height=height, stroke=0, fill=1)

    def renderRectangle(self, width, height, left, top, color, border_width, border_radius=None):
        """Outline-only rectangle (no fill). ``color`` is the border colour
        (the element reuses backgroundColor for it, like the line). The stroke
        is inset by half its width so the outer edge lines up with the box —
        matching the canvas's box-sizing: border-box.

        ``border_radius`` (px) draws rounded corners via ReportLab ``roundRect``;
        the radius is clamped to half the inset box so a tall/thin pill cannot
        request a corner larger than the shape. None or 0 keeps square corners.
        """
        corrected_y = self.page_h - top - height
        bw = float(border_width) if border_width else 1.0
        self.c.setStrokeColor(HexColor(color or "#000000"))
        self.c.setLineWidth(bw)
        inset_w = width - bw
        inset_h = height - bw
        radius = float(border_radius) if border_radius else 0.0
        if radius > 0:
            # Match the frontend's border-box radius: clamp to half the inset box.
            radius = min(radius, inset_w / 2, inset_h / 2)
            self.c.roundRect(
                left + bw / 2, corrected_y + bw / 2, inset_w, inset_h, radius, stroke=1, fill=0,
            )
        else:
            self.c.rect(left + bw / 2, corrected_y + bw / 2, width=inset_w, height=inset_h, stroke=1, fill=0)

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
        'Inter':             ('Inter-Bold', 'Inter-Italic', 'Inter-BoldItalic'),
        'Roboto':            ('Roboto-Bold', 'Roboto-Italic', 'Roboto-BoldItalic'),
        'Times-Roman':       ('Times-Roman-Bold', 'Times-Roman-Italic', 'Times-Roman-BoldItalic'),
        'PlayfairDisplay':   ('PlayfairDisplay-Bold', 'PlayfairDisplay-Italic', 'PlayfairDisplay-BoldItalic'),
        'CormorantGaramond': ('CormorantGaramond-Bold', 'CormorantGaramond-Italic', 'CormorantGaramond-BoldItalic'),
        'Lora':              ('Lora-Bold', 'Lora-Italic', 'Lora-BoldItalic'),
        'Montserrat':        ('Montserrat-Bold', 'Montserrat-Italic', 'Montserrat-BoldItalic'),
        'JetBrainsMono':     ('JetBrainsMono-Bold', 'JetBrainsMono-Italic', 'JetBrainsMono-BoldItalic'),
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
        text = sanitize_pdf_text(text)
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

    def renderText(self, left, top, fontFamily, fontSize, color, content, bold=False, italic=False, underline=False, runs=None):
        corrected_y = self.page_h - top - fontSize * 0.34
        prepared = self._prepare_styled(content, runs, bold, italic, underline, color)
        if prepared is None:
            # Fast path: uniform single-line text, byte-identical to before runs.
            self._draw_text_line(left, corrected_y, content, fontFamily, fontSize, color, bold, italic, underline)
            return
        # Single line: no wrapping, just draw each styled piece left-to-right,
        # advancing x by the piece's rendered width.
        clean, clean_styles = prepared
        piece_x = left
        for text, (piece_bold, piece_italic, piece_underline, piece_color) in self._line_to_pieces(clean, clean_styles):
            self._draw_text_line(
                piece_x, corrected_y, text, fontFamily, fontSize,
                piece_color or color, piece_bold, piece_italic, piece_underline,
            )
            piece_font, _, _ = self._resolve_font(fontFamily, piece_bold, piece_italic)
            piece_x += self._line_width(text, piece_font, fontSize, 0.0)

    @staticmethod
    def _line_width(text, font, size, letter_spacing):
        """Rendered width of a string including CSS-style letter-spacing
        (applied after every character)."""
        if not text:
            return 0.0
        return stringWidth(text, font, size) + len(text) * letter_spacing

    @classmethod
    def _fits_wrap_width(cls, text, font, size, letter_spacing, avail_width):
        """True when ``text`` fits the wrap column, with canvas-matching slack."""
        return (
            cls._line_width(text, font, size, letter_spacing)
            <= float(avail_width) + WRAP_WIDTH_TOLERANCE_PX
        )

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
        for paragraph in sanitize_pdf_text(text).split("\n"):
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
                if cls._fits_wrap_width(candidate, font, size, letter_spacing, avail_width):
                    current = candidate
                    continue

                if current:
                    para_lines.append(current)
                    current = ""

                # A single word that overflows the box is hard-broken per char.
                if not cls._fits_wrap_width(word, font, size, letter_spacing, avail_width):
                    chunk = ""
                    for ch in word:
                        if chunk == "" or cls._fits_wrap_width(
                            chunk + ch, font, size, letter_spacing, avail_width
                        ):
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

    # ------------------------------------------------------------------
    # Inline decoration (``runs``) support.
    #
    # These helpers are the run-aware counterpart to the single-font wrap
    # engine above. They are entered ONLY when an element carries non-empty,
    # non-no-op ``runs``; every other element falls through to the original
    # ``_wrap_textarea`` / ``_draw_text_line`` path unchanged, preserving the
    # byte-for-byte Canvas↔PDF output that predates this feature.
    # ------------------------------------------------------------------

    @staticmethod
    def _normalize_runs(runs):
        """Coerce incoming ``runs`` (pydantic ``TextRun`` models or plain dicts,
        as stored in ``extra_properties``) into validated dicts.

        Drops spans with a non-positive length or non-integer offsets. Returns
        None when nothing usable remains, which signals callers to take the
        plain single-font path."""
        if not runs:
            return None
        out = []
        for run in runs:
            if hasattr(run, "model_dump"):
                data = run.model_dump()
            elif isinstance(run, dict):
                data = run
            else:
                data = {k: getattr(run, k, None)
                        for k in ("start", "end", "bold", "italic", "underline", "color")}
            try:
                start = int(data.get("start"))
                end = int(data.get("end"))
            except (TypeError, ValueError):
                continue
            if end <= start:
                continue
            out.append({
                "start": start,
                "end": end,
                "bold": data.get("bold"),
                "italic": data.get("italic"),
                "underline": data.get("underline"),
                "color": data.get("color"),
            })
        return out or None

    @staticmethod
    def _build_char_styles(content, runs, base_bold, base_italic, base_underline, base_color):
        """Return a per-character list of ``(bold, italic, underline, color)``
        for ``content``. Each character starts at the element base style; every
        run overlays only the marks it declares over its ``[start, end)`` span."""
        base = (bool(base_bold), bool(base_italic), bool(base_underline), base_color)
        styles = [base] * len(content)
        for run in runs:
            start = max(0, run["start"])
            end = min(len(content), run["end"])
            for i in range(start, end):
                b, it, u, c = styles[i]
                styles[i] = (
                    run["bold"] if run["bold"] is not None else b,
                    run["italic"] if run["italic"] is not None else it,
                    run["underline"] if run["underline"] is not None else u,
                    run["color"] if run["color"] is not None else c,
                )
        return styles

    @staticmethod
    def _sanitize_with_styles(text, char_styles):
        """``sanitize_pdf_text`` applied in lockstep with the parallel style
        list: every character the sanitizer would drop also drops its style
        entry, so run offsets stay aligned with the cleaned text. Exotic spaces
        fold to a normal space (length preserved), matching the plain path."""
        out_chars = []
        out_styles = []
        for ch, style in zip(str(text), char_styles):
            if _PDF_CONTROL_RE.match(ch) or _PDF_INVISIBLE_RE.match(ch):
                continue
            if _PDF_ODD_SPACE_RE.match(ch):
                ch = " "
            out_chars.append(ch)
            out_styles.append(style)
        return "".join(out_chars), out_styles

    def _prepare_styled(self, content, runs, base_bold, base_italic, base_underline, base_color):
        """Build the sanitized text + per-character styles for a run-aware draw.

        Returns None (take the plain path) when there are no runs, or when the
        runs resolve to nothing different from the element base style — that
        defensive check keeps unformatted content byte-identical to the old
        output even if an empty/no-op ``runs`` array is sent."""
        normalized = self._normalize_runs(runs)
        if not normalized:
            return None
        raw = "" if content is None else str(content)
        styles = self._build_char_styles(
            raw, normalized, base_bold, base_italic, base_underline, base_color,
        )
        clean, clean_styles = self._sanitize_with_styles(raw, styles)
        base = (bool(base_bold), bool(base_italic), bool(base_underline), base_color)
        if all(style == base for style in clean_styles):
            return None
        return clean, clean_styles

    def _styled_run_width(self, text, styles, family, size, letter_spacing):
        """Width of a styled substring: the sum of maximal same-draw-font
        segments. Only the resolved draw font affects advance width (faux bold
        stroke and faux italic shear do not), so segmenting by draw font gives
        the exact rendered width; underline and colour are ignored here."""
        if not text:
            return 0.0
        total = 0.0
        seg = text[0]
        cur_font, _, _ = self._resolve_font(family, styles[0][0], styles[0][1])
        for i in range(1, len(text)):
            font, _, _ = self._resolve_font(family, styles[i][0], styles[i][1])
            if font == cur_font:
                seg += text[i]
                continue
            total += stringWidth(seg, cur_font, size) + len(seg) * letter_spacing
            seg = text[i]
            cur_font = font
        total += stringWidth(seg, cur_font, size) + len(seg) * letter_spacing
        return total

    def _styled_fits(self, text, styles, family, size, letter_spacing, avail_width):
        """Run-aware analogue of ``_fits_wrap_width`` using the same slack."""
        return (
            self._styled_run_width(text, styles, family, size, letter_spacing)
            <= float(avail_width) + WRAP_WIDTH_TOLERANCE_PX
        )

    @staticmethod
    def _line_to_pieces(text, styles):
        """Split a wrapped line into maximal same-style pieces for drawing.
        Grouping uses the FULL style tuple (including underline and colour) so
        each piece can be drawn with a single ``_draw_text_line`` call."""
        pieces = []
        if not text:
            return pieces
        seg = text[0]
        cur = styles[0]
        for i in range(1, len(text)):
            if styles[i] == cur:
                seg += text[i]
                continue
            pieces.append((seg, cur))
            seg = text[i]
            cur = styles[i]
        pieces.append((seg, cur))
        return pieces

    def _wrap_textarea_styled(self, content, styles, family, size, letter_spacing,
                              max_width, base_style, bullet_list=False):
        """Run-aware reimplementation of ``_wrap_textarea``.

        Mirrors the plain word-wrap (explicit newlines, break on spaces, hard
        break over-wide words) but tracks each character's style so line width
        is measured with the font each span actually draws in — the same files
        the canvas ``@font-face``s, so wrap points match the browser even with
        mixed bold/italic runs.

        Returns tuples of ``(pieces, is_last_of_paragraph, indent_px,
        bullet_prefix)`` where ``pieces`` is a list of ``(text, style)``."""
        out = []
        cursor = 0  # running offset into `content`, incl. the "\n" separators
        paragraphs = content.split("\n")
        for paragraph in paragraphs:
            p_len = len(paragraph)
            p_styles = styles[cursor:cursor + p_len]
            cursor += p_len + 1  # skip the newline that split() removed

            if paragraph == "":
                out.append(([], True, 0.0, ""))
                continue

            is_bullet = bullet_list and bool(re.match(r"^\s*•", paragraph))
            bullet_prefix = "• " if is_bullet else ""
            if is_bullet:
                match = re.match(r"^\s*•[ \t]*", paragraph)
                strip = match.end()
                body = paragraph[strip:]
                body_styles = p_styles[strip:]
            else:
                body = paragraph
                body_styles = p_styles

            # The bullet marker is drawn in the element base style, so its width
            # (the hanging indent) uses the base-resolved font like the plain path.
            bullet_font, _, _ = self._resolve_font(family, base_style[0], base_style[1])
            para_indent = self._line_width(bullet_prefix, bullet_font, size, letter_spacing)
            avail_width = max_width - para_indent

            # Split the body into words with parallel styles, reproducing
            # str.split(" ") semantics (consecutive spaces yield empty words).
            words = []          # list of (text, styles)
            sep_styles = []     # style of the space preceding words[k] (k >= 1)
            word_text = ""
            word_styles = []
            for ch, style in zip(body, body_styles):
                if ch == " ":
                    words.append((word_text, word_styles))
                    sep_styles.append(style)
                    word_text = ""
                    word_styles = []
                else:
                    word_text += ch
                    word_styles.append(style)
            words.append((word_text, word_styles))

            para_lines = []  # list of (text, styles)
            cur_text = ""
            cur_styles = []
            for k, (w_text, w_styles) in enumerate(words):
                if cur_text == "":
                    cand_text = w_text
                    cand_styles = list(w_styles)
                else:
                    sep_style = sep_styles[k - 1]
                    cand_text = cur_text + " " + w_text
                    cand_styles = cur_styles + [sep_style] + w_styles

                if self._styled_fits(cand_text, cand_styles, family, size, letter_spacing, avail_width):
                    cur_text = cand_text
                    cur_styles = cand_styles
                    continue

                if cur_text:
                    para_lines.append((cur_text, cur_styles))
                    cur_text = ""
                    cur_styles = []

                # A single word wider than the box is hard-broken per character.
                if not self._styled_fits(w_text, w_styles, family, size, letter_spacing, avail_width):
                    chunk_text = ""
                    chunk_styles = []
                    for ch, style in zip(w_text, w_styles):
                        if chunk_text == "" or self._styled_fits(
                            chunk_text + ch, chunk_styles + [style],
                            family, size, letter_spacing, avail_width,
                        ):
                            chunk_text += ch
                            chunk_styles.append(style)
                        else:
                            para_lines.append((chunk_text, chunk_styles))
                            chunk_text = ch
                            chunk_styles = [style]
                    cur_text = chunk_text
                    cur_styles = chunk_styles
                else:
                    cur_text = w_text
                    cur_styles = list(w_styles)

            para_lines.append((cur_text, cur_styles))
            for i, (line_text, line_styles) in enumerate(para_lines):
                out.append((
                    self._line_to_pieces(line_text, line_styles),
                    i == len(para_lines) - 1,
                    para_indent,
                    bullet_prefix if i == 0 else "",
                ))
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
        runs=None,
    ):
        """Measure wrapped copy with the exact metrics used by PDF rendering.

        When ``runs`` are present the run-aware wrapper drives the line count so
        mixed bold/italic spans (which shift wrap points) reflow to the same
        height the styled draw produces; otherwise the plain path is used."""
        instance = cls.__new__(cls)  # width-only measurement needs no canvas
        prepared = instance._prepare_styled(content, runs, bold, italic, False, None)
        if prepared is not None:
            clean, clean_styles = prepared
            base_style = (bool(bold), bool(italic), False, None)
            styled_lines = instance._wrap_textarea_styled(
                clean, clean_styles, font_family, float(font_size),
                float(letter_spacing or 0), float(width), base_style, bullet_list,
            )
            return len(styled_lines) * float(line_height)
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

    def renderTextarea(self, left, top, width, height, fontFamily, fontSize, color, content, lineHeight, letterSpacing, bold=False, italic=False, underline=False, align="left", bulletList=False, autoHeight=False, runs=None):
        """Render a multi-line text box so it matches the on-canvas edit-mode
        box: same wrap, line-height, letter-spacing and font metrics. Lines
        whose top falls outside the box height are clipped (mirrors the
        textarea's overflow:hidden).

        When ``runs`` carry inline decoration the styled path draws each line as
        a sequence of per-span pieces; otherwise the original single-font path
        runs unchanged. Justify combined with inline runs degrades to left in
        v1 (mixed-font word-space stretching is out of scope)."""
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
        # first baseline sits at half_leading + ascent below the box top. Line
        # box height is the explicit px line-height regardless of per-span font,
        # so the element base metrics drive vertical placement in both paths.
        ascent, descent = getAscentDescent(measure_font, fontSize)  # ascent>0, descent<0
        font_height = ascent - descent
        half_leading = (line_height - font_height) / 2.0

        prepared = self._prepare_styled(content, runs, bold, italic, underline, color)

        if prepared is None:
            # Fast path: uniform styling, byte-identical to the pre-runs renderer.
            lines = self._wrap_textarea(content, measure_font, fontSize, letter_spacing, width, bulletList)
            if autoHeight:
                # The canvas is the typography authority: after fonts load / the user
                # changes a face, `reflowTextareaHeight` stores measured heights and
                # packs following tops. Recomputing height from PDF wrap here used
                # to ignore that box — shorter wrap opened fake gaps, longer wrap
                # drew through the next block — so Canvas≠PDF rhythm after a font
                # change even when the editor looked correct.
                #
                # Only expand when the payload still carries a stub height (export
                # before the first browser measure); otherwise honour the stored
                # box and clip overflow like the canvas `overflow: hidden`.
                computed_height = len(lines) * line_height
                if height < line_height * 0.5:
                    height = computed_height

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
            return

        # Styled path: run-aware wrap, then draw each line's pieces in sequence.
        clean, clean_styles = prepared
        base_style = (bool(bold), bool(italic), bool(underline), color)
        lines = self._wrap_textarea_styled(
            clean, clean_styles, fontFamily, fontSize, letter_spacing,
            width, base_style, bulletList,
        )
        if autoHeight:
            computed_height = len(lines) * line_height
            if height < line_height * 0.5:
                height = computed_height

        for i, (pieces, is_last, indent_px, bullet_prefix) in enumerate(lines):
            line_top = i * line_height
            if line_top >= height:  # clipped by the box
                break
            baseline_from_top = line_top + half_leading + ascent
            y = self.page_h - top - baseline_from_top

            eff_left = left + indent_px
            eff_width = width - indent_px
            x = eff_left
            if pieces:
                # Total line width sums the pieces, each measured with the font
                # its span actually draws in. Justify is not applied for styled
                # lines (v1 degradation): right/center still offset, else left.
                line_w = 0.0
                for text, (pb, pit, _pu, _pc) in pieces:
                    piece_font, _, _ = self._resolve_font(fontFamily, pb, pit)
                    line_w += self._line_width(text, piece_font, fontSize, letter_spacing)
                if align == "right":
                    x = eff_left + (eff_width - line_w)
                elif align == "center":
                    x = eff_left + (eff_width - line_w) / 2.0

            if bullet_prefix:
                self._draw_text_line(
                    left, y, bullet_prefix, fontFamily, fontSize, color,
                    bold, italic, underline, letter_spacing,
                )

            piece_x = x
            for text, (pb, pit, pu, pc) in pieces:
                self._draw_text_line(
                    piece_x, y, text, fontFamily, fontSize, pc or color,
                    pb, pit, pu, letter_spacing,
                )
                piece_font, _, _ = self._resolve_font(fontFamily, pb, pit)
                piece_x += self._line_width(text, piece_font, fontSize, letter_spacing)

    def generatePDF(self):
        """Finalize the current page and write the PDF to the canvas destination."""
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
                        getattr(element, "runs", None),
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
                        getattr(element, "runs", None),
                    )
                elif category == "line":
                    self.renderLine(float(element.width), float(element.height), element.left, element.top, element.backgroundColor)
                elif category == "rectangle":
                    self.renderRectangle(float(element.width), float(element.height), element.left, element.top, element.backgroundColor, getattr(element, "borderWidth", 1), getattr(element, "borderRadius", None))
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
                    self.renderImage(
                        image_resolver(element.src or ""),
                        float(element.width),
                        float(element.height),
                        element.left,
                        element.top,
                        # Preserve explicit False (geometric contact icons); None → path heuristic.
                        align_with_text=getattr(element, "alignWithText", None),
                    )
            self.c.showPage()

        self.c.save()




