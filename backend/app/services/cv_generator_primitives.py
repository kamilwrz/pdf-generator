"""
Low-level CV layout primitives shared by every template generator.

Owns page geometry, vertical rhythm constants, element constructors, and the
``Builder`` cursor. Individual generators under ``cv_templates.templates`` and
shared helpers import these symbols (also re-exported from ``cv_generator``).
"""

from __future__ import annotations

import math
import secrets
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Iterator, Mapping

from app.services.pdf_generator import PDF_Generator

A4_H = 842
# Match classic/sidebar footer rules (~y=783) + frontend textarea reflow
# (pageTop 66 / bottomMargin 72). The older 96 px margin left ~37 px of empty
# band above the footer and made keep_together park the next experience
# record on page N+1 even when the canvas later shrank earlier boxes.
MARGIN_BOTTOM = 72
PAGE_TOP = 66
CONTENT_BOTTOM = A4_H - MARGIN_BOTTOM  # 770

# Vertical rhythm for generated CVs. Every template should space content as:
#   section → record (block) → stack (elements inside a record).
# Keep these equal within each level so X/Y placement reads as one pattern.
#
# Tuned for denser one-page packing than the old 14/18/12 trio, while keeping
# section breaks readable. Canvas spacing guides measure glyph ink, not the
# full textarea line-box — so SPACE_SECTION must be a few px above the target
# visual gap (21 authored ≈ ~16px ink-to-ink on section boundaries).
#
# These module constants are the defaults. Generators must read live values via
# ``get_spacing()`` so per-document overrides from the Sections panel apply
# during ``fill_template`` (import-time ``SPACE_*`` binding would ignore them).
SPACE_STACK = 4       # title → meta → body inside one record
SPACE_RECORD = 10     # between records in the same section
SPACE_SECTION = 21    # after a finished section before the next heading
SPACE_AFTER_RULE = 8  # section heading rule → first content block
# Clearance from masthead chrome to the first section heading. Authored box
# gaps; canvas ink guides read a few px tighter. Keep every template in the
# ~25–45 px visual band under the header (solid band vs thin divider).
SPACE_AFTER_MASTHEAD = 32      # solid header bands (Cinder/Ledger)
SPACE_AFTER_HEADER_RULE = 36   # thin divider under name/contact mastheads

_SPACING_MIN = 0.0
_SPACING_MAX = 80.0


@dataclass(frozen=True)
class FlowSpacing:
    """Per-document vertical rhythm (px). Masthead gaps stay global defaults."""

    stack: float = SPACE_STACK
    record: float = SPACE_RECORD
    section: float = SPACE_SECTION
    after_rule: float = SPACE_AFTER_RULE
    after_masthead: float = SPACE_AFTER_MASTHEAD
    after_header_rule: float = SPACE_AFTER_HEADER_RULE

    def as_spacing_px(self) -> dict[str, float]:
        """JSON shape persisted on ``Pdf.spacing_px`` / sent by the editor."""
        return {
            "stack": float(self.stack),
            "record": float(self.record),
            "section": float(self.section),
            "after_rule": float(self.after_rule),
        }


DEFAULT_FLOW_SPACING = FlowSpacing()
_flow_spacing: ContextVar[FlowSpacing] = ContextVar(
    "cv_flow_spacing",
    default=DEFAULT_FLOW_SPACING,
)


def _clamp_spacing(value: Any, default: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return float(default)
    if not math.isfinite(parsed):
        return float(default)
    return max(_SPACING_MIN, min(_SPACING_MAX, parsed))


def normalize_spacing_px(raw: Mapping[str, Any] | FlowSpacing | None) -> FlowSpacing:
    """Merge partial overrides onto defaults; clamp to the editor-safe range."""
    if isinstance(raw, FlowSpacing):
        return FlowSpacing(
            stack=_clamp_spacing(raw.stack, SPACE_STACK),
            record=_clamp_spacing(raw.record, SPACE_RECORD),
            section=_clamp_spacing(raw.section, SPACE_SECTION),
            after_rule=_clamp_spacing(raw.after_rule, SPACE_AFTER_RULE),
            after_masthead=_clamp_spacing(raw.after_masthead, SPACE_AFTER_MASTHEAD),
            after_header_rule=_clamp_spacing(raw.after_header_rule, SPACE_AFTER_HEADER_RULE),
        )
    if not isinstance(raw, Mapping):
        return DEFAULT_FLOW_SPACING
    return FlowSpacing(
        stack=_clamp_spacing(raw.get("stack"), SPACE_STACK),
        record=_clamp_spacing(raw.get("record"), SPACE_RECORD),
        section=_clamp_spacing(raw.get("section"), SPACE_SECTION),
        after_rule=_clamp_spacing(raw.get("after_rule"), SPACE_AFTER_RULE),
        after_masthead=_clamp_spacing(raw.get("after_masthead"), SPACE_AFTER_MASTHEAD),
        after_header_rule=_clamp_spacing(
            raw.get("after_header_rule"), SPACE_AFTER_HEADER_RULE
        ),
    )


def get_spacing() -> FlowSpacing:
    """Current generation rhythm (defaults unless ``use_spacing`` is active)."""
    return _flow_spacing.get()


@contextmanager
def use_spacing(overrides: Mapping[str, Any] | FlowSpacing | None = None) -> Iterator[FlowSpacing]:
    """Apply per-request / per-document spacing for the duration of generation."""
    spacing = normalize_spacing_px(overrides)
    token = _flow_spacing.set(spacing)
    try:
        yield spacing
    finally:
        _flow_spacing.reset(token)


def section_chrome_height(label_fs: float) -> float:
    """Y advance for a typical section label + after-rule gap."""
    return float(label_fs) * 1.35 + get_spacing().after_rule


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
        # When True, ``need`` will not open a new page. Used so a multi-element
        # record (title + meta + bullets) cannot be split across the footer.
        self._keep_together = False

    def continuation_top(self) -> float:
        """Y cursor after a page break. Themes override for custom mastheads."""
        return float(PAGE_TOP)

    def need(self, h: float):
        """Advance to a new page if the next element wouldn't fit."""
        if self._keep_together:
            return
        if self.y + h > CONTENT_BOTTOM:
            self.pg += 1
            self.y = self.continuation_top()

    def need_section(self, chrome_h: float, first_body_h: float = 0.0):
        """
        Reserve section chrome together with the first body block so a heading
        is never stranded alone above the page footer.
        """
        self.need(float(chrome_h) + max(float(first_body_h), 0.0))

    @contextmanager
    def keep_together(self, height: float):
        """
        Keep a logical record on one page.

        Moves to the next page first when ``height`` does not fit at the current
        cursor. While the context is active, nested ``need`` / ``block`` / ``text``
        calls cannot open another page — so a title cannot be stranded above the
        footer while its meta/body continue on page N+1.

        Every element emitted inside the context is tagged with the same
        ``flowGroup`` id so canvas auto-height reflow can keep the record whole
        when browser measurement shrinks earlier blocks and reclaim-packs later
        content (otherwise a degree/meta line can return to page N while the
        description stays on N+1).

        Sections may still continue across pages; only the atomic record stays
        whole. If a single record is taller than one content page, splitting is
        allowed as a last resort so content is not painted past the footer.
        """
        reserved = max(float(height), 0.0)
        self.need(reserved)
        # After ``need``, ``self.y`` is the top of the page that will host the
        # record. Only allow splitting when the record is taller than a full
        # content page — comparing against the remaining space *before* ``need``
        # would wrongly disable keep-together near the footer and park a skill
        # category on page N while its chips jump to page N+1 at the same Y.
        full_page_capacity = CONTENT_BOTTOM - self.continuation_top()
        allow_split = reserved > full_page_capacity + 0.01
        start = len(self.els)
        group_id = f"record-{secrets.token_hex(6)}"
        previous = self._keep_together
        if not allow_split:
            self._keep_together = True
        try:
            yield
        finally:
            self._keep_together = previous
            for element in self.els[start:]:
                element.setdefault("flowGroup", group_id)

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
        # stays explicit and matches static frontend chrome (e.g. Monument rhythm).
        self.els.append(_line(left, self.y, width, height, col, page=self.pg))

    def gap(self, px: float):
        self.y += px

    def build(self) -> list[dict]:
        return self.els
