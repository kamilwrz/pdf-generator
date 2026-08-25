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
from app.services.cv_generator_primitives import _text
from app.services.pdf_generator import PDF_Generator


def _normalise_contact_text(value: object) -> str:
    """Collapse accidental whitespace without shortening user contact details."""
    return " ".join(str(value or "").split())


def build_contact_band_anchor(descriptor: dict[str, Any], *, page: int = 1) -> dict:
    """Zero-footprint anchor element carrying a contact band's reflow descriptor.

    Empty ``content`` means the PDF/canvas draw nothing; ``flowRole`` keeps the
    structural section detector from ever treating it as a heading. The client
    contact-band controller reads ``contactBand`` off this element to re-run
    layout when a channel is added or removed.
    """
    return {
        "category": "text", "content": "",
        "left": 0, "top": 0, "width": 0, "height": 0,
        "fontSize": 1, "fontFamily": "Inter", "color": "#000000",
        "zIndex": 0, "page": page,
        "flowRole": "masthead-anchor",
        "contactBand": descriptor,
        "contactBandId": descriptor["id"],
    }


def _tag_contact_pair(icon: dict, label: dict, channel: str, band_id: str) -> None:
    """Stamp channel + band identity onto an icon/label pair (in place)."""
    for element in (icon, label):
        element["contactChannel"] = channel
        element["contactBandId"] = band_id


def _build_band_descriptor(
    *, band_id: str | None, mode: str, anchor: dict,
    items: list[tuple[str, str]], text_fs: float, text_color: str, font: str,
    icon_size: float, theme: str,
    char_width: float, icon_gap: float, item_pad: float, line_step: float,
) -> dict:
    """Assemble the client-reflow descriptor for a contact band.

    ``order`` is the channel sequence actually placed (non-empty items only), so
    the client re-lays the band in the same order the generator used.
    """
    return {
        "id": band_id,
        "mode": mode,
        "anchor": anchor,
        "text": {"fontFamily": font, "fontSizePt": text_fs, "colorHex": text_color},
        "icon": {"sizePt": icon_size, "theme": theme},
        "metrics": {"iconGap": icon_gap, "itemPad": item_pad,
                    "lineStep": line_step, "charWidth": char_width},
        "order": [key for key, value in items if value],
    }


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


def _contact_channel_items(cv: dict[str, Any]) -> list[tuple[str, str]]:
    """Ordered non-empty (icon_key, display) pairs without character truncation."""
    items: list[tuple[str, str]] = []
    phone = _normalise_contact_text(cv.get("phone"))
    email = _normalise_contact_text(cv.get("email"))
    if phone:
        items.append(("phone", phone))
    if email:
        items.append(("email", email))
    for kind, label in contact_social_items(cv):
        items.append((kind, label))
    location = _normalise_contact_text(cv.get("location"))
    if location:
        items.append(("location", location))
    return items


def _sidebar_contact_items(cv: dict[str, Any]) -> list[tuple[str, str]]:
    """Sidebar KONTAKT stack: phone, email, socials, location."""
    return _contact_channel_items(cv)


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
    band_id: str | None = None,
) -> tuple[list[dict], float, dict]:
    """Place icon+label contacts that wrap onto additional rows as needed.

    Returns (elements, bottom_y, descriptor) where bottom_y is the top of the
    last contact row (not including text height). Callers typically put a rule
    at ``bottom_y + line_step`` or similar.

    When ``band_id`` is provided, every icon/label pair is tagged with its
    channel + the shared band id so the client contact-channel manager can move
    or delete a channel as a unit; the returned ``descriptor`` carries the
    geometry needed to re-run this layout on the client. When ``band_id`` is
    None the elements are byte-identical to the pre-feature output.
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
        icon = build_icon(key, cx, cy)
        # Contact labels must stay with their icons when SPACE_* packing runs.
        # Untagged short phone lines match the "heading + rule below" heuristic
        # (the masthead divider) and get restacked as a fake first section.
        label = _text(value, text_fs, font, text_color, cx + icon_gap, cy, zIndex=3)
        label["flowRole"] = "masthead"
        if band_id is not None:
            _tag_contact_pair(icon, label, key, band_id)
        elements.append(icon)
        elements.append(label)
        cx += advance
    descriptor = _build_band_descriptor(
        band_id=band_id, mode="wrapping",
        anchor={"startX": float(start_x), "startY": float(start_y),
                "rightLimit": float(right_limit)},
        items=items, text_fs=text_fs, text_color=text_color, font=font,
        icon_size=icon_size, theme=theme,
        char_width=char_width, icon_gap=icon_gap, item_pad=item_pad, line_step=line_step,
    )
    return elements, cy, descriptor


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
    band_id: str | None = None,
) -> tuple[list[dict], float, dict]:
    """Place icon+label contacts one channel per row (Nova masthead).

    Returns (elements, bottom_y, descriptor) with the same contract as
    ``_place_wrapping_icon_contacts`` — ``bottom_y`` is the top of the last row.

    When ``band_id`` is provided each icon/label pair is tagged with its channel
    + the shared band id so the client contact-channel manager can move or delete
    a channel as a unit; the returned ``descriptor`` (mode ``"stacked"``) carries
    the geometry needed to re-run this layout on the client. When ``band_id`` is
    None the drawn output is byte-identical to the pre-feature version.
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
        label = _text(
            value, text_fs, font, text_color, float(start_x) + icon_gap, cy, zIndex=3,
        )
        label["flowRole"] = "masthead"
        if band_id is not None:
            _tag_contact_pair(icon, label, key, band_id)
        elements.append(icon)
        elements.append(label)
        cy += line_step
        placed += 1
    descriptor = _build_band_descriptor(
        band_id=band_id, mode="stacked",
        anchor={"startX": float(start_x), "startY": float(start_y)},
        items=items, text_fs=text_fs, text_color=text_color, font=font,
        icon_size=icon_size, theme=theme,
        char_width=5.2, icon_gap=icon_gap, item_pad=14.0, line_step=line_step,
    )
    bottom_y = float(start_y) if placed == 0 else cy - line_step
    return elements, bottom_y, descriptor


def _place_chip_icon_contacts(
    *,
    theme: str,
    items: list[tuple[str, str]],
    start_x: float,
    start_y: float,
    right_limit: float,
    chip_h: float,
    icon_size: float,
    text_fs: float,
    text_color: str,
    chip_color: str,
    font: str,
    rect_builder: Callable[..., dict],
    icon_builder: Callable[..., dict],
    pad_left: float = 6.0,
    icon_text_gap: float = 6.0,
    chip_gap: float = 8.0,
    width_base: float = 28.0,
    width_per_char: float = 5.2,
    min_width: float = 120.0,
    max_width: float = 168.0,
    band_id: str | None = None,
) -> tuple[list[dict], float, dict]:
    """Place icon+label contacts as rounded pills (Volt masthead chips).

    Each channel is a triple: a background ``rectangle`` pill with an icon and a
    label at fixed inset offsets; rows wrap at ``right_limit``. Chip width uses a
    character-count formula (not a measured width) so the client engine can
    reproduce the exact same geometry for canvas↔PDF parity.

    ``rect_builder(x, y, w, h, color)`` and ``icon_builder(key, left, top, size)``
    are supplied by the caller (Volt owns its own ``_rect``/``_icon`` helpers).

    Returns (elements, bottom_y, descriptor). When ``band_id`` is provided every
    rect/icon/label is tagged with its channel + the shared band id; the returned
    ``descriptor`` (mode ``"chip"``) carries the geometry for client reflow.
    """
    line_step = chip_h + 8.0
    label_offset = pad_left + icon_size + icon_text_gap  # 27 for Volt defaults
    elements: list[dict] = []
    x = float(start_x)
    chip_top = float(start_y)
    for key, value in items:
        if not value:
            continue
        width = max(min_width, min(max_width, width_base + len(value) * width_per_char))
        if x > start_x and x + width > right_limit:
            x = float(start_x)
            chip_top += line_step
        text_top = chip_top + (chip_h - text_fs) / 2.0
        rect = rect_builder(x, chip_top, width, chip_h, chip_color)
        icon = icon_builder(key, x + pad_left, text_top, icon_size)
        label = _text(value, text_fs, font, text_color, x + label_offset, text_top, zIndex=3)
        for element in (rect, icon, label):
            element["flowRole"] = "masthead"
        if band_id is not None:
            for element in (rect, icon, label):
                element["contactChannel"] = key
                element["contactBandId"] = band_id
        elements.extend([rect, icon, label])
        x += width + chip_gap
    descriptor = {
        "id": band_id,
        "mode": "chip",
        "anchor": {"startX": float(start_x), "startY": float(start_y),
                   "rightLimit": float(right_limit)},
        "text": {"fontFamily": font, "fontSizePt": text_fs, "colorHex": text_color},
        "icon": {"sizePt": icon_size, "theme": theme},
        "chipColor": chip_color,
        "metrics": {"chipH": chip_h, "iconSize": icon_size, "padLeft": pad_left,
                    "labelOffset": label_offset, "widthBase": width_base,
                    "widthPerChar": width_per_char, "minWidth": min_width,
                    "maxWidth": max_width, "chipGap": chip_gap,
                    "lineStep": line_step, "charWidth": width_per_char},
        "order": [key for key, value in items if value],
    }
    return elements, chip_top, descriptor


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
    band_id: str | None = None,
) -> tuple[list[dict], float, dict]:
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

    Returns (elements, bottom_y, descriptor) with the same contract as
    ``_place_wrapping_icon_contacts``. ``band_id`` behaves identically here:
    when set, pairs are tagged and the descriptor carries reflow geometry;
    when None the drawn output is byte-identical to the pre-feature version.
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
            icon = build_icon(key, cx, cy)
            label = _text(value, text_fs, font, text_color, cx + icon_gap, cy, zIndex=3)
            label["flowRole"] = "masthead"
            if band_id is not None:
                _tag_contact_pair(icon, label, key, band_id)
            elements.append(icon)
            elements.append(label)
            cx += advance
        cy += line_step
    descriptor = _build_band_descriptor(
        band_id=band_id, mode="centered",
        anchor={"centerX": float(center_x), "startY": float(start_y),
                "maxWidth": float(max_width)},
        items=items, text_fs=text_fs, text_color=text_color, font=font,
        icon_size=icon_size, theme=theme,
        char_width=char_width, icon_gap=icon_gap, item_pad=item_pad, line_step=line_step,
    )
    # Return the top of the last row (not past it), matching the contract of
    # `_place_wrapping_icon_contacts` — callers place a rule at `bottom_y + gap`.
    return elements, (cy - line_step) if non_empty_lines else cy, descriptor


def _reserved_contact_last_row_top(
    contact_bottom: float,
    descriptor: dict[str, Any],
    *,
    minimum_rows: int = 2,
) -> float:
    """Return the last-row top after reserving a stable contact-band height.

    Centered mastheads must not move their divider or first body section when
    the user adds or removes a contact channel. The placer reports only the
    last row that currently exists, so a document generated with one row would
    otherwise keep a divider that is too high once live editing creates a
    second row. This helper derives the reserved row from the same ``startY``
    and ``lineStep`` values that the client receives in the contact descriptor.

    ``contact_bottom`` remains the lower bound, which preserves any additional
    rows already required by unusually long contact labels.

    Args:
        contact_bottom: Top coordinate of the last row placed by the generator.
        descriptor: Contact-band descriptor returned by a shared placer.
        minimum_rows: Minimum number of contact rows the masthead must reserve.

    Returns:
        The top coordinate of the actual or reserved final contact row.
    """
    start_y = float(descriptor["anchor"]["startY"])
    line_step = float(descriptor["metrics"]["lineStep"])
    reserved_row_top = start_y + max(0, minimum_rows - 1) * line_step
    return max(float(contact_bottom), reserved_row_top)


def _social_contact_line_parts(cv: dict[str, Any]) -> list[str]:
    """Full social labels for mid-dot text contact lines."""
    parts: list[str] = []
    for kind in ("linkedin", "github", "website"):
        value = cv.get(kind)
        if not value:
            continue
        label = contact_display_label(kind, value)  # type: ignore[arg-type]
        if label:
            parts.append(label)
    return parts
