"""Contact-row builders for CV template generators.

Keeps masthead / sidebar contact geometry layout-safe when LinkedIn, GitHub,
and website join email/phone/location. Wrapping placers return the final Y so
header rules and flow start can move with the contact band.
"""
from __future__ import annotations

from typing import Any, Callable

from reportlab.pdfbase.pdfmetrics import stringWidth

from app.services.contact_links import contact_display_label, contact_social_items
from app.services.cv_templates.shared.icons import _icon_beside
from app.services.cv_templates.shared.text import _compact_text
from app.services.cv_generator_primitives import _text
from app.services.pdf_generator import PDF_Generator


def _measured_text_width(value: str, font: str, text_fs: float) -> float | None:
    """Actual rendered width of a label in points, or None if it cannot be
    measured.

    Uses the same font resolution and ReportLab metrics the PDF renderer uses,
    so a centered contact row lines up on the real glyph extent rather than a
    fixed per-character guess. Returns None (never raises) when the font is not
    registered, so callers can fall back to the character-count estimate.
    """
    try:
        draw_font, _, _ = PDF_Generator._resolve_font(font, False, False)
        return stringWidth(value, draw_font, text_fs)
    except Exception:
        return None


def _contact_channel_items(
    cv: dict[str, Any],
    *,
    email_limit: int = 40,
    phone_limit: int = 24,
    location_limit: int = 28,
    social_limit: int = 36,
) -> list[tuple[str, str]]:
    """Ordered non-empty (icon_key, display) pairs for icon contact rows."""
    items: list[tuple[str, str]] = []
    phone = _compact_text(cv.get("phone"), phone_limit)
    email = _compact_text(cv.get("email"), email_limit)
    if phone:
        items.append(("phone", phone))
    if email:
        items.append(("email", email))
    for kind, label in contact_social_items(cv, limit=social_limit):
        items.append((kind, label))
    location = _compact_text(cv.get("location"), location_limit)
    if location:
        items.append(("location", location))
    return items


def _sidebar_contact_items(cv: dict[str, Any]) -> list[tuple[str, str]]:
    """Sidebar KONTAKT stack: phone, email, socials, location."""
    return _contact_channel_items(
        cv,
        email_limit=42,
        phone_limit=28,
        location_limit=34,
        social_limit=36,
    )


def _contact_item_width(
    value: str,
    *,
    char_width: float,
    icon_gap: float,
    item_pad: float,
    font: str | None = None,
    text_fs: float | None = None,
) -> float:
    """Horizontal footprint of one icon+label contact chip in points.

    Shared by the left-anchored and centered placers so their line-wrapping
    math can't drift apart. When ``font`` and ``text_fs`` are supplied the
    label is measured with real ReportLab metrics (accurate centering and
    wrapping); otherwise it falls back to the ``char_width`` estimate the
    left-anchored placer has always used.
    """
    text_width: float | None = None
    if font is not None and text_fs is not None:
        text_width = _measured_text_width(value, font, text_fs)
    if text_width is None:
        text_width = len(value) * char_width
    return icon_gap + text_width + item_pad


def _place_wrapping_icon_contacts(
    *,
    theme: str,
    items: list[tuple[str, str]],
    start_x: float,
    start_y: float,
    right_limit: float,
    text_fs: float,
    icon_size: float,
    text_color: str,
    font: str,
    char_width: float = 5.2,
    icon_gap: float = 16.0,
    item_pad: float = 14.0,
    line_step: float = 16.0,
    icon_builder: Callable[..., dict] | None = None,
) -> tuple[list[dict], float]:
    """Place icon+label contacts with harbor-style wrap.

    Returns (elements, bottom_y) where bottom_y is the top of the last contact
    row (not including text height). Callers typically put a rule at
    ``bottom_y + line_step`` or similar.
    """
    build_icon = icon_builder or (
        lambda name, left, top: _icon_beside(theme, name, left, top, text_fs, icon_size)
    )
    elements: list[dict] = []
    cx = float(start_x)
    cy = float(start_y)
    for key, value in items:
        if not value:
            continue
        advance = _contact_item_width(
            value, char_width=char_width, icon_gap=icon_gap, item_pad=item_pad
        )
        if cx > start_x and cx + advance > right_limit:
            cx = float(start_x)
            cy += line_step
        elements.append(build_icon(key, cx, cy))
        # Contact labels must stay with their icons when SPACE_* packing runs.
        # Untagged short phone lines match the "heading + rule below" heuristic
        # (the masthead divider) and get restacked as a fake first section.
        label = _text(value, text_fs, font, text_color, cx + icon_gap, cy, zIndex=3)
        label["flowRole"] = "masthead"
        elements.append(label)
        cx += advance
    return elements, cy


def _place_stacked_icon_contacts(
    *,
    theme: str,
    items: list[tuple[str, str]],
    start_x: float,
    start_y: float,
    text_fs: float,
    icon_size: float,
    text_color: str,
    font: str,
    icon_gap: float = 16.0,
    line_step: float = 18.0,
    icon_builder: Callable[..., dict] | None = None,
) -> tuple[list[dict], float]:
    """Place icon+label contacts one channel per row (Nova masthead).

    Returns (elements, bottom_y) with the same contract as
    ``_place_wrapping_icon_contacts`` — ``bottom_y`` is the top of the last row.
    """
    build_icon = icon_builder or (
        lambda name, left, top: _icon_beside(theme, name, left, top, text_fs, icon_size)
    )
    elements: list[dict] = []
    cy = float(start_y)
    placed = 0
    for key, value in items:
        if not value:
            continue
        icon = build_icon(key, float(start_x), cy)
        # Keep contact icons on the masthead lane with their labels so spacing
        # packers never promote a phone/email row into a section heading.
        icon["flowRole"] = "masthead"
        elements.append(icon)
        label = _text(
            value, text_fs, font, text_color, float(start_x) + icon_gap, cy, zIndex=3,
        )
        label["flowRole"] = "masthead"
        elements.append(label)
        cy += line_step
        placed += 1
    if placed == 0:
        return elements, float(start_y)
    return elements, cy - line_step


def _place_centered_icon_contacts(
    *,
    theme: str,
    items: list[tuple[str, str]],
    center_x: float,
    start_y: float,
    max_width: float,
    text_fs: float,
    icon_size: float,
    text_color: str,
    font: str,
    char_width: float = 5.2,
    icon_gap: float = 16.0,
    item_pad: float = 14.0,
    line_step: float = 16.0,
    icon_builder: Callable[..., dict] | None = None,
) -> tuple[list[dict], float]:
    """Place icon+label contacts centered on ``center_x``, wrapping at ``max_width``.

    Each item's footprint is measured with real ReportLab font metrics (via
    ``_contact_item_width`` with ``font`` / ``text_fs``), not a per-character
    guess: an overestimate would both wrap an item that actually fits and shift
    the row off true center. Each completed line is then re-centered around
    ``center_x`` on its *visible* extent (the trailing ``item_pad`` after the
    last item is inter-item spacing only and is excluded from the centering
    width) — used by masthead layouts where the whole header block, including
    the contact row, must stay visually centered regardless of how many contact
    channels a CV has.

    Returns (elements, bottom_y) with the same contract as
    ``_place_wrapping_icon_contacts``.
    """
    build_icon = icon_builder or (
        lambda name, left, top: _icon_beside(theme, name, left, top, text_fs, icon_size)
    )

    # First pass: bucket items into lines using their measured footprints,
    # without emitting geometry yet — the X start of each line depends on that
    # line's total width, which is only known once the line is complete.
    lines: list[list[tuple[str, str, float]]] = [[]]
    line_width = 0.0
    for key, value in items:
        if not value:
            continue
        advance = _contact_item_width(
            value, char_width=char_width, icon_gap=icon_gap, item_pad=item_pad,
            font=font, text_fs=text_fs,
        )
        if lines[-1] and line_width + advance > max_width:
            lines.append([])
            line_width = 0.0
        lines[-1].append((key, value, advance))
        line_width += advance

    non_empty_lines = [line for line in lines if line]
    elements: list[dict] = []
    cy = float(start_y)
    for line in non_empty_lines:
        # Exclude the last item's trailing item_pad: it is spacing between
        # items, not part of the drawn row, so keeping it would push the whole
        # line left of true center.
        visible_width = sum(advance for _, _, advance in line) - item_pad
        cx = center_x - visible_width / 2.0
        for key, value, advance in line:
            elements.append(build_icon(key, cx, cy))
            label = _text(value, text_fs, font, text_color, cx + icon_gap, cy, zIndex=3)
            label["flowRole"] = "masthead"
            elements.append(label)
            cx += advance
        cy += line_step
    # Return the top of the last row (not past it), matching the contract of
    # `_place_wrapping_icon_contacts` — callers place a rule at `bottom_y + gap`.
    return elements, (cy - line_step) if non_empty_lines else cy


def _social_contact_line_parts(cv: dict[str, Any], *, limit: int = 28) -> list[str]:
    """Short social labels for mid-dot text contact lines."""
    parts: list[str] = []
    for kind in ("linkedin", "github", "website"):
        value = cv.get(kind)
        if not value:
            continue
        label = contact_display_label(kind, value, limit=limit)  # type: ignore[arg-type]
        if label:
            parts.append(label)
    return parts
