"""Freestyle → template-rhythm reflow.

GPT classifies canvas text into sections / blocks / roles. This module is the
sole authority for coordinates: it packs classified elements using the same
vertical rhythm constants as `cv_generator` (SPACE_STACK / SPACE_RECORD /
SPACE_SECTION / SPACE_AFTER_RULE) and returns one previewable layout group.
"""
from __future__ import annotations

import math
from typing import Any

from app.services.cv_generator import (
    A4_H,
    CONTENT_BOTTOM,
    MARGIN_BOTTOM,
    PAGE_TOP,
    SPACE_AFTER_RULE,
    SPACE_RECORD,
    SPACE_SECTION,
    SPACE_STACK,
)
from app.services.layout_analysis import (
    AUTO_LAYOUT_CATEGORIES,
    EPSILON,
    _group,
    _number,
    extract_bounds,
)


VALID_ROLES = {
    "heading",
    "entry_title",
    "entry_meta",
    "body",
    "list",
    "contact",
    "rule",
    "other",
}
# Placement order inside one block (title → meta → body).
_ROLE_RANK = {
    "heading": 0,
    "entry_title": 1,
    "entry_meta": 2,
    "body": 3,
    "list": 4,
    "contact": 5,
    "rule": 6,
    "other": 7,
}
_FLOW_CATEGORIES = {"text", "textarea", "line"}


def _page_margins(page_height: float) -> tuple[float, float]:
    """Scale generator page margins when the canvas is not classic A4 height."""
    if page_height <= 0:
        return float(PAGE_TOP), float(CONTENT_BOTTOM)
    scale = page_height / float(A4_H)
    top = float(PAGE_TOP) * scale
    bottom = page_height - float(MARGIN_BOTTOM) * scale
    return top, max(top + 40.0, bottom)


def _estimate_height(item: dict[str, Any], width: float) -> float:
    if item.get("category") == "line":
        return max(_number(item.get("height"), 1.5), 1.0)
    if item.get("category") == "text":
        return max(_number(item.get("height"), item.get("fontSize", 12) * 1.35), 8.0)
    content_height = _number(item.get("content_height"), 0.0)
    if content_height > item.get("height", 0) + EPSILON:
        return content_height
    # Prefer measured/stored height; fall back to a wrap estimate.
    stored = _number(item.get("height"), 0.0)
    if stored > 0:
        return stored
    font_size = max(_number(item.get("fontSize"), 12.0), 1.0)
    line_height = max(_number(item.get("lineHeight"), font_size * 1.35), 1.0)
    chars_per_line = max(10, int(width / (font_size * 0.52)))
    lines = sum(
        max(1, math.ceil(len(line.strip()) / chars_per_line)) if line.strip() else 1
        for line in str(item.get("content") or "").split("\n")
    )
    return round(max(lines * line_height + 6, line_height + 6), 2)


def _normalize_classification(raw: dict[str, Any], known_ids: set[str]) -> dict[str, Any] | None:
    """Validate GPT output into a packable structure. Returns None if unusable."""
    if not isinstance(raw, dict):
        return None
    sections_raw = raw.get("sections")
    if not isinstance(sections_raw, list) or not sections_raw:
        return None

    ignored = {
        str(element_id)
        for element_id in (raw.get("ignored_element_ids") or [])
        if isinstance(element_id, str) and element_id in known_ids
    }
    profile = raw.get("profile") if isinstance(raw.get("profile"), dict) else {}
    content_left = _number(profile.get("content_left"), 0.0)
    content_width = _number(profile.get("content_width"), 0.0)

    sections: list[dict[str, Any]] = []
    used_ids: set[str] = set()
    for section_index, section in enumerate(sections_raw):
        if not isinstance(section, dict):
            continue
        section_id = str(section.get("id") or f"section-{section_index}")
        blocks_raw = section.get("blocks")
        if not isinstance(blocks_raw, list):
            continue
        blocks: list[dict[str, Any]] = []
        for block_index, block in enumerate(blocks_raw):
            if not isinstance(block, dict):
                continue
            elements_raw = block.get("elements")
            if not isinstance(elements_raw, list) or not elements_raw:
                continue
            members: list[dict[str, str]] = []
            for entry in elements_raw:
                if not isinstance(entry, dict):
                    continue
                element_id = str(entry.get("element_id") or "")
                role = str(entry.get("role") or "other")
                if element_id not in known_ids or element_id in used_ids:
                    continue
                if role not in VALID_ROLES:
                    role = "other"
                used_ids.add(element_id)
                members.append({"element_id": element_id, "role": role})
            if not members:
                continue
            blocks.append({
                "id": str(block.get("id") or f"{section_id}-block-{block_index}"),
                "order": int(_number(block.get("order"), block_index)),
                "elements": members,
            })
        if not blocks:
            # Allow a heading-only section expressed as a single synthetic block.
            heading_id = str(section.get("heading_element_id") or "")
            if heading_id in known_ids and heading_id not in used_ids:
                used_ids.add(heading_id)
                blocks.append({
                    "id": f"{section_id}-heading",
                    "order": 0,
                    "elements": [{"element_id": heading_id, "role": "heading"}],
                })
        if not blocks:
            continue
        blocks.sort(key=lambda item: item["order"])
        sections.append({
            "id": section_id,
            "order": int(_number(section.get("order"), section_index)),
            "blocks": blocks,
        })

    if not sections or not used_ids:
        return None
    sections.sort(key=lambda item: item["order"])
    return {
        "profile": {
            "content_left": content_left,
            "content_width": content_width,
        },
        "sections": sections,
        "ignored_element_ids": ignored,
        "classified_ids": used_ids,
    }


def _infer_column(
    bounds_by_id: dict[str, dict[str, Any]],
    classified_ids: set[str],
    page_width: float,
    profile_left: float,
    profile_width: float,
) -> tuple[float, float]:
    samples = [
        bounds_by_id[element_id]
        for element_id in classified_ids
        if element_id in bounds_by_id and bounds_by_id[element_id]["category"] in {"text", "textarea"}
    ]
    if profile_left > 0 and profile_width > 40:
        left = profile_left
        width = profile_width
    elif samples:
        lefts = sorted(item["left"] for item in samples)
        widths = sorted(item["width"] for item in samples)
        left = lefts[len(lefts) // 2]
        width = widths[len(widths) // 2]
    else:
        left, width = 55.0, min(485.0, page_width - 70.0)
    width = max(80.0, min(width, page_width - left - 8.0))
    left = max(0.0, min(left, page_width - width))
    return round(left, 2), round(width, 2)


def _anchor_start_y(
    bounds_by_id: dict[str, dict[str, Any]],
    classified_ids: set[str],
    page_top: float,
    page_height: float,
) -> float:
    """Start the flow below header chrome that is not being reflowed."""
    bottoms: list[float] = []
    for element_id, item in bounds_by_id.items():
        if element_id in classified_ids:
            continue
        if item.get("locked") or item.get("fixedToPage") or item.get("category") == "image":
            # Only treat upper-page anchors as header chrome.
            if item["page"] == 1 and item["top"] < page_height * 0.28:
                bottoms.append(item["top"] + item["height"])
    if not bottoms:
        return page_top
    return max(page_top, max(bottoms) + SPACE_SECTION)


def pack_rhythm_classification(
    elements: list[dict[str, Any]],
    classification: dict[str, Any],
    page_size: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Pack GPT-classified elements into a single safe layout group.

    Unclassified / ignored / locked / fixedToPage elements keep their geometry.
    Classified flow elements receive new left/top/page (and width for textareas).
    """
    page_size = page_size or {}
    page_width = _number(page_size.get("width"), 595.0)
    page_height = _number(page_size.get("height"), float(A4_H))
    if page_width <= 0 or page_height <= 0:
        return None

    page_top, content_bottom = _page_margins(page_height)
    usable_height = content_bottom - page_top
    if usable_height < 80:
        return None

    # Bounds for every positioned category we may move or treat as an anchor.
    all_bounds = extract_bounds(
        elements,
        AUTO_LAYOUT_CATEGORIES | {"line", "rectangle", "circle", "ellipse"},
    )
    bounds_by_id = {item["element_id"]: item for item in all_bounds}
    known_ids = {
        str(element.get("element_id"))
        for element in elements
        if element.get("element_id")
    }
    normalized = _normalize_classification(classification, known_ids)
    if normalized is None:
        return None

    classified_ids: set[str] = set(normalized["classified_ids"])
    # Drop locked / fixed / non-flowable ids from the pack list.
    movable_ids: set[str] = set()
    for element_id in classified_ids:
        item = bounds_by_id.get(element_id)
        raw = next((el for el in elements if str(el.get("element_id")) == element_id), None)
        if item is None or raw is None:
            continue
        if raw.get("locked") or raw.get("fixedToPage"):
            continue
        if item.get("category") not in _FLOW_CATEGORIES:
            continue
        movable_ids.add(element_id)
    if len(movable_ids) < 2:
        return None

    content_left, content_width = _infer_column(
        bounds_by_id,
        movable_ids,
        page_width,
        normalized["profile"]["content_left"],
        normalized["profile"]["content_width"],
    )

    # Working geometry for collision validation includes non-moved content.
    working = [dict(item) for item in all_bounds if item["category"] in AUTO_LAYOUT_CATEGORIES]
    working_by_id = {item["element_id"]: item for item in working}
    # Also track lines we move so patches can include them.
    line_state = {
        element_id: dict(bounds_by_id[element_id])
        for element_id in movable_ids
        if bounds_by_id.get(element_id, {}).get("category") == "line"
    }

    cursor_page = 1
    cursor_y = _anchor_start_y(bounds_by_id, movable_ids, page_top, page_height)
    patches: list[dict[str, Any]] = []

    def ensure_space(height: float) -> None:
        nonlocal cursor_page, cursor_y
        if cursor_y + height > content_bottom + EPSILON:
            cursor_page += 1
            cursor_y = page_top

    def place(element_id: str, *, gap_after: float) -> None:
        nonlocal cursor_y
        source = bounds_by_id[element_id]
        height = _estimate_height(source, content_width)
        ensure_space(height)
        left = content_left
        width = content_width
        if source["category"] == "line":
            # Keep short accent rules rather than full column width.
            width = min(content_width, max(source["width"], 48.0))
        elif source["category"] == "text":
            # Single-line labels keep a measured-ish width but share the column left.
            width = min(content_width, max(source["width"], 40.0))

        patch: dict[str, Any] = {
            "element_id": element_id,
            "left": round(left, 2),
            "top": round(cursor_y, 2),
            "page": cursor_page,
        }
        if source["category"] == "textarea":
            patch["width"] = round(content_width, 2)
            patch["height"] = round(height, 2)
        elif source["category"] == "line":
            patch["width"] = round(width, 2)
            patch["height"] = round(height, 2)

        original = bounds_by_id[element_id]
        changed = (
            abs(patch["left"] - original["left"]) > EPSILON
            or abs(patch["top"] - original["top"]) > EPSILON
            or patch["page"] != original["page"]
            or (
                "height" in patch
                and abs(patch["height"] - original["height"]) > EPSILON
            )
            or (
                "width" in patch
                and abs(patch["width"] - original["width"]) > EPSILON
            )
        )
        if changed:
            patches.append(patch)

        if element_id in working_by_id:
            working_by_id[element_id].update({
                "left": patch["left"],
                "top": patch["top"],
                "page": patch["page"],
                **({"width": patch["width"]} if "width" in patch else {}),
                **({"height": patch["height"]} if "height" in patch else {}),
            })
        elif element_id in line_state:
            line_state[element_id].update({
                "left": patch["left"],
                "top": patch["top"],
                "page": patch["page"],
                "width": patch.get("width", line_state[element_id]["width"]),
                "height": patch.get("height", line_state[element_id]["height"]),
            })

        cursor_y += height + gap_after

    for section_index, section in enumerate(normalized["sections"]):
        blocks = section["blocks"]
        for block_index, block in enumerate(blocks):
            members = [
                member for member in block["elements"]
                if member["element_id"] in movable_ids
            ]
            members.sort(
                key=lambda member: (
                    _ROLE_RANK.get(member["role"], 9),
                    bounds_by_id[member["element_id"]]["top"],
                    member["element_id"],
                )
            )
            if not members:
                continue

            for member_index, member in enumerate(members):
                is_last_in_block = member_index == len(members) - 1
                is_last_block = block_index == len(blocks) - 1
                role = member["role"]
                if not is_last_in_block:
                    # Inside a record: title → meta → body uses STACK.
                    gap = SPACE_STACK
                    if role == "heading":
                        gap = SPACE_AFTER_RULE
                elif not is_last_block:
                    gap = SPACE_RECORD
                else:
                    # End of section: larger break before the next section.
                    gap = SPACE_SECTION if section_index < len(normalized["sections"]) - 1 else 0.0
                place(member["element_id"], gap_after=gap)

    if not patches:
        return None

    # Validate against content items (text/textarea/image). Line-only moves are
    # included in patches but decorative collisions are intentionally soft.
    validation_items = list(working_by_id.values())
    group = _group(
        group_id="rhythm-reflow",
        title="Ujednolić rytm układu (indywidualny szablon)",
        reason=(
            "Elementy zostały sklasyfikowane semantycznie, a następnie ułożone "
            f"według rytmu szablonu: STACK {SPACE_STACK}px, RECORD {SPACE_RECORD}px, "
            f"SECTION {SPACE_SECTION}px. Stałe tła i elementy spoza klasyfikacji pozostają na miejscu."
        ),
        severity="critical",
        patches=patches,
        items=validation_items,
        page_width=page_width,
        page_height=page_height,
        allow_overlap=False,
    )
    if group is None:
        # Freestyle chaos often already overlaps with images/anchors. Allow the
        # packed column to resolve content-vs-content while still staying on-page;
        # the preview card remains mandatory before apply.
        group = _group(
            group_id="rhythm-reflow",
            title="Ujednolić rytm układu (indywidualny szablon)",
            reason=(
                "Elementy zostały sklasyfikowane semantycznie, a następnie ułożone "
                f"według rytmu szablonu: STACK {SPACE_STACK}px, RECORD {SPACE_RECORD}px, "
                f"SECTION {SPACE_SECTION}px. Podgląd jest wymagany — układ freestyle mógł "
                "mieć wcześniejsze kolizje z obrazami lub kotwicami."
            ),
            severity="critical",
            patches=patches,
            items=validation_items,
            page_width=page_width,
            page_height=page_height,
            allow_overlap=True,
        )
    if group is not None:
        group["target_page"] = min(patch.get("page", 1) for patch in patches)
        group["page_count"] = max(
            max((item.get("page") or 1) for item in elements if isinstance(item, dict)),
            max(patch.get("page", 1) for patch in patches),
        )
    return group
