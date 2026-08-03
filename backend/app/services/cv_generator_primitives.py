"""
Low-level CV layout primitives shared by every template generator.

Owns page geometry, vertical rhythm constants, element constructors, and the
``Builder`` cursor. Theme generators and ``cv_generator_iconic`` import these
symbols (often re-exported from ``cv_generator`` for backward compatibility).
"""

from __future__ import annotations

import math

from app.services.pdf_generator import PDF_Generator

A4_H = 842
# Match classic frames + frontend textarea reflow (pageTop 66 / bottomMargin 96).
MARGIN_BOTTOM = 96
PAGE_TOP = 66
CONTENT_BOTTOM = A4_H - MARGIN_BOTTOM  # 746

# Vertical rhythm for generated CVs. Every template should space content as:
#   section → record (block) → stack (elements inside a record).
# Keep these equal within each level so X/Y placement reads as one pattern.
#
# Tuned for denser one-page packing than the old 14/18/12 trio, while keeping
# section breaks readable. Canvas spacing guides measure glyph ink, not the
# full textarea line-box — so SPACE_SECTION must be a few px above the target
# visual gap (21 authored ≈ ~16px ink-to-ink on section boundaries).
SPACE_STACK = 4       # title → meta → body inside one record
SPACE_RECORD = 10     # between records in the same section
SPACE_SECTION = 21    # after a finished section before the next heading
SPACE_AFTER_RULE = 8  # section heading rule → first content block
# Clearance from masthead chrome to the first section heading. Authored box
# gaps; canvas ink guides read a few px tighter. Keep every template in the
# ~25–45 px visual band under the header (solid band vs thin divider).
SPACE_AFTER_MASTHEAD = 32      # solid header bands (Cinder/Raven/Ledger/Rift)
SPACE_AFTER_HEADER_RULE = 36   # thin divider under name/contact mastheads


def section_chrome_height(label_fs: float) -> float:
    """Y advance for a typical section label + after-rule gap."""
    return float(label_fs) * 1.35 + SPACE_AFTER_RULE


def _text(content, fontSize, fontFamily, color, left, top, *,
          zIndex=2, page=1, bold=False, italic=False):
    return {"category": "text", "content": str(content),
            "fontSize": fontSize, "fontFamily": fontFamily,
            "color": color, "left": left, "top": top,
            "zIndex": zIndex, "page": page, "bold": bold, "italic": italic}


def _block(content, left, top, width, height, fontSize, lineHeight, color, fontFamily, *,
           zIndex=2, page=1, bold=False, italic=False, align="left", bulletList=False):
    # preserveInitialLayout: the generator already paginated with ReportLab
    # metrics. On first canvas mount the client may shrink boxes to browser
    # scrollHeight (ReportLab can overshoot) but must not grow — independent
    # growth races and stretches section gaps. User edits still reflow fully.
    return {"category": "textarea", "content": str(content),
            "left": left, "top": top, "width": width, "height": height,
            "fontSize": fontSize, "lineHeight": lineHeight,
            "letterSpacing": 0, "color": color, "fontFamily": fontFamily,
            "zIndex": zIndex, "page": page, "bold": bold, "italic": italic,
            "align": align, "bulletList": bulletList, "autoHeight": True,
            "preserveInitialLayout": True}


def _line(left, top, width, height, color, *, zIndex=1, page=1):
    return {"category": "line", "left": left, "top": top,
            "width": width, "height": height, "backgroundColor": color,
            "zIndex": zIndex, "page": page}


def _rect(left, top, width, height, color, borderWidth=1, *, zIndex=1, page=1):
    """Outline-only rectangle (backgroundColor = border colour)."""
    return {"category": "rectangle", "left": left, "top": top,
            "width": width, "height": height, "backgroundColor": color,
            "borderWidth": borderWidth, "zIndex": zIndex, "page": page}


def _circle(left, top, diameter, color, *, filled=False, borderWidth=1, zIndex=1, page=1):
    return {"category": "circle", "left": left, "top": top,
            "width": diameter, "height": diameter, "backgroundColor": color,
            "filled": filled, "borderWidth": borderWidth,
            "zIndex": zIndex, "page": page}


def _ellipse(left, top, width, height, color, *, filled=False, borderWidth=1, zIndex=1, page=1):
    return {"category": "ellipse", "left": left, "top": top,
            "width": width, "height": height, "backgroundColor": color,
            "filled": filled, "borderWidth": borderWidth,
            "zIndex": zIndex, "page": page}


class Builder:
    """Tracks vertical position and page across element-generating calls."""

    def __init__(self, start_y: float):
        self.els: list[dict] = []
        self.y = float(start_y)
        self.pg = 1

    def need(self, h: float):
        """Advance to a new page if the next element wouldn't fit."""
        if self.y + h > CONTENT_BOTTOM:
            self.pg += 1
            self.y = float(PAGE_TOP)

    def need_section(self, chrome_h: float, first_body_h: float = 0.0):
        """
        Reserve section chrome together with the first body block so a heading
        is never stranded alone above the page footer.
        """
        self.need(float(chrome_h) + max(float(first_body_h), 0.0))

    def text(self, content, fs, fam, col, left, *, bold=False, italic=False) -> float:
        if not content:
            return self.y
        self.need(fs * 1.5)
        self.els.append(_text(content, fs, fam, col, left, self.y,
                               zIndex=2, page=self.pg, bold=bold, italic=italic))
        self.y += fs * 1.35
        return self.y

    def block(self, content, left, width, fs, lh, col, fam, *,
              bold=False, italic=False, align="left", min_h=0.0, bulletList=False) -> float:
        if not content:
            return self.y
        h = self.measure_block(
            content, width, fs, lh, fam,
            bold=bold, italic=italic, min_h=min_h, bulletList=bulletList,
        )
        self.need(h)
        self.els.append(_block(content, left, self.y, width, h, fs, lh, col, fam,
                                zIndex=2, page=self.pg, bold=bold, italic=italic, align=align,
                                bulletList=bulletList))
        self.y += h
        return self.y

    @staticmethod
    def measure_block(content, width, fs, lh, fam, *,
                      bold=False, italic=False, min_h=0.0, bulletList=False) -> float:
        if not content:
            return 0.0
        rendered_height = PDF_Generator.measure_textarea_height(
            str(content), fam, fs, lh, width,
            bold=bold, italic=italic, bullet_list=bulletList,
        )
        # Canvas textareas have no padding or border. Match their integer
        # scrollHeight so mounting the canvas does not alter the authored gaps.
        return max(math.ceil(rendered_height), min_h)

    def line(self, left, width, height, col):
        # Rule sits on the current cursor without advancing. Callers follow with
        # SPACE_AFTER_RULE (or a template-specific gap) so under-header spacing
        # stays explicit and matches static frontend chrome (e.g. Onyx +16).
        self.els.append(_line(left, self.y, width, height, col, page=self.pg))

    def gap(self, px: float):
        self.y += px

    def build(self) -> list[dict]:
        return self.els
