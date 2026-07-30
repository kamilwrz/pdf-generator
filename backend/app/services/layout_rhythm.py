"""Freestyle vertical-gap unification (SPACE_* rhythm).

GPT classifies canvas text into sections / blocks / roles. This module only
nudges ``top``/``page`` so consecutive pairs match ``cv_generator`` gaps
(SPACE_STACK / SPACE_RECORD / SPACE_SECTION / SPACE_AFTER_RULE). User freestyle
``left``/width/height and the first element's anchor stay intact.
"""
from __future__ import annotations

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
_ROLE_ALIASES = {
    "title": "entry_title",
    "job_title": "entry_title",
    "role": "entry_title",
    "meta": "entry_meta",
    "subtitle": "entry_meta",
    "dates": "entry_meta",
    "company": "entry_meta",
    "description": "body",
    "content": "body",
    "bullet": "list",
    "bullets": "list",
    "section_heading": "heading",
    "section_title": "heading",
    "header": "heading",
    "line": "rule",
}
# Placement order inside one block: heading + rule, then title → meta → body.
_ROLE_RANK = {
    "heading": 0,
    "rule": 1,
    "entry_title": 2,
    "entry_meta": 3,
    "body": 4,
    "list": 5,
    "contact": 6,
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


def _unwrap_classification(raw: dict[str, Any]) -> dict[str, Any]:
    """Accept common GPT wrappers around the sections payload."""
    if not isinstance(raw, dict):
        return {}
    if isinstance(raw.get("sections"), list):
        return raw
    for key in ("classification", "layout", "result", "data", "rhythm"):
        nested = raw.get(key)
        if isinstance(nested, dict) and isinstance(nested.get("sections"), list):
            return nested
    return raw


def _canonical_role(value: object) -> str:
    role = str(value or "other").strip().lower().replace(" ", "_").replace("-", "_")
    role = _ROLE_ALIASES.get(role, role)
    return role if role in VALID_ROLES else "other"


def _block_elements(raw_block: dict[str, Any]) -> list[Any]:
    for key in ("elements", "items", "members"):
        value = raw_block.get(key)
        if isinstance(value, list):
            return value
    return []


def _normalize_classification(raw: dict[str, Any], known_ids: set[str]) -> dict[str, Any] | None:
    """Validate GPT output into a packable structure. Returns None if unusable."""
    raw = _unwrap_classification(raw if isinstance(raw, dict) else {})
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
            blocks_raw = []
        blocks: list[dict[str, Any]] = []
        for block_index, block in enumerate(blocks_raw):
            if not isinstance(block, dict):
                continue
            elements_raw = _block_elements(block)
            if not elements_raw:
                continue
            members: list[dict[str, str]] = []
            for entry in elements_raw:
                if isinstance(entry, str):
                    element_id, role = entry, "other"
                elif isinstance(entry, dict):
                    element_id = str(
                        entry.get("element_id")
                        or entry.get("id")
                        or entry.get("elementId")
                        or ""
                    )
                    role = _canonical_role(entry.get("role") or entry.get("type"))
                else:
                    continue
                if element_id not in known_ids or element_id in used_ids:
                    continue
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


def _heuristic_classification(
    elements: list[dict[str, Any]],
    bounds_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Fallback when GPT JSON is unusable: one section, one element per block."""
    flow = []
    for el in elements:
        element_id = str(el.get("element_id") or "")
        item = bounds_by_id.get(element_id)
        if not item or el.get("locked") or el.get("fixedToPage"):
            continue
        if item.get("category") not in {"text", "textarea"}:
            continue
        flow.append(item)
    flow.sort(key=lambda item: (item["page"], item["top"], item["left"], item["element_id"]))
    blocks = [
        {
            "id": f"auto-{index}",
            "order": index,
            "elements": [{
                "element_id": item["element_id"],
                "role": "heading" if item.get("category") == "text" and item.get("fontSize", 0) >= 12 else "body",
            }],
        }
        for index, item in enumerate(flow)
    ]
    return {
        "profile": {"content_left": 0.0, "content_width": 0.0},
        "ignored_element_ids": set(),
        "classified_ids": {item["element_id"] for item in flow},
        "sections": [{"id": "content", "order": 1, "blocks": blocks}] if blocks else [],
    }


def _flatten_flow(
    normalized: dict[str, Any],
    movable_ids: set[str],
    bounds_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build the reading-order chain used for gap unification."""
    flow: list[dict[str, Any]] = []
    for section in normalized["sections"]:
        for block in section["blocks"]:
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
            for member in members:
                flow.append({
                    "element_id": member["element_id"],
                    "role": member["role"],
                    "section_id": section["id"],
                    "block_id": block["id"],
                })
    return flow


def _expected_gap(previous: dict[str, Any], current: dict[str, Any]) -> float:
    """Return the template rhythm gap between two consecutive classified items."""
    if previous["section_id"] != current["section_id"]:
        return float(SPACE_SECTION)
    if previous["block_id"] != current["block_id"]:
        return float(SPACE_RECORD)
    prev_role = previous["role"]
    if prev_role == "heading" and current["role"] == "rule":
        return float(SPACE_STACK)
    if prev_role in {"heading", "rule"}:
        return float(SPACE_AFTER_RULE)
    return float(SPACE_STACK)


def _document_top(item: dict[str, Any], page_height: float) -> float:
    return (item["page"] - 1) * page_height + item["top"]


def _set_document_top(
    item: dict[str, Any],
    absolute_top: float,
    height: float,
    page_height: float,
    page_top: float,
    content_bottom: float,
) -> None:
    """Write page/top for an absolute Y, wrapping to the next page if needed."""
    absolute_top = max(0.0, absolute_top)
    page = int(absolute_top // page_height) + 1
    top = absolute_top - (page - 1) * page_height
    if height <= content_bottom - page_top and top + height > content_bottom + EPSILON:
        page += 1
        top = page_top
    if top < page_top and page > 1:
        # Keep continuations inside the content band.
        top = page_top
    item["page"] = page
    item["top"] = round(top, 2)


def pack_rhythm_classification(
    elements: list[dict[str, Any]],
    classification: dict[str, Any],
    page_size: dict[str, Any] | None,
) -> tuple[dict[str, Any] | None, str]:
    """Unify vertical gaps only — preserve freestyle left/width/anchor.

    GPT (or the heuristic fallback) supplies section/block/role membership.
    Python nudges ``top``/``page`` just enough so consecutive pairs use
    SPACE_STACK / SPACE_RECORD / SPACE_SECTION / SPACE_AFTER_RULE. ``left``,
    ``width`` and ``height`` stay as the user authored them.

    Returns ``(group, error_code)``. ``error_code`` is empty on success.
    """
    page_size = page_size or {}
    page_width = _number(page_size.get("width"), 595.0)
    page_height = _number(page_size.get("height"), float(A4_H))
    if page_width <= 0 or page_height <= 0:
        return None, "invalid_page_size"

    page_top, content_bottom = _page_margins(page_height)
    if content_bottom - page_top < 80:
        return None, "page_too_small"

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
    used_fallback = False
    if normalized is None:
        normalized = _heuristic_classification(elements, bounds_by_id)
        used_fallback = True
        if not normalized["sections"]:
            return None, "classification_empty"

    classified_ids: set[str] = set(normalized["classified_ids"])
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
        return None, "too_few_movable"

    flow = _flatten_flow(normalized, movable_ids, bounds_by_id)
    if len(flow) < 2:
        return None, "too_few_movable"

    # Working copy for every content/line id we may patch or validate against.
    working_by_id = {
        item["element_id"]: dict(item)
        for item in all_bounds
        if item["category"] in AUTO_LAYOUT_CATEGORIES or item["element_id"] in movable_ids
    }

    # Anchor: keep the first flow item exactly where the user put it.
    first_id = flow[0]["element_id"]
    previous_item = working_by_id[first_id]
    previous_meta = flow[0]

    for current_meta in flow[1:]:
        element_id = current_meta["element_id"]
        current = working_by_id[element_id]
        gap = _expected_gap(previous_meta, current_meta)
        prev_bottom = _document_top(previous_item, page_height) + previous_item["height"]
        desired_abs = prev_bottom + gap
        _set_document_top(
            current,
            desired_abs,
            current["height"],
            page_height,
            page_top,
            content_bottom,
        )
        # left/width/height intentionally unchanged — only vertical rhythm.
        previous_item = current
        previous_meta = current_meta

    patches: list[dict[str, Any]] = []
    for element_id in movable_ids:
        original = bounds_by_id[element_id]
        proposed = working_by_id[element_id]
        if (
            abs(proposed["top"] - original["top"]) > EPSILON
            or proposed["page"] != original["page"]
        ):
            patches.append({
                "element_id": element_id,
                "left": round(original["left"], 2),
                "top": round(proposed["top"], 2),
                "page": proposed["page"],
            })

    if not patches:
        return None, "no_position_changes"

    validation_items = list(working_by_id.values())
    reason_suffix = (
        " Użyto zapasowej kolejności Y (GPT zwrócił nieparsowalną strukturę)."
        if used_fallback
        else ""
    )
    title = "Ujednolić odstępy (zachowaj Twój układ)"
    reason = (
        "Przesunięto elementy tylko w pionie, żeby ujednolicić odstępy: "
        f"STACK {SPACE_STACK}px w bloku, RECORD {SPACE_RECORD}px między wpisami, "
        f"SECTION {SPACE_SECTION}px między sekcjami, AFTER_RULE {SPACE_AFTER_RULE}px po linii. "
        "Left, szerokość i Twój ogólny układ freestyle zostają bez zmian."
        f"{reason_suffix}"
    )

    group = _group(
        group_id="rhythm-reflow",
        title=title,
        reason=reason,
        severity="high",
        patches=patches,
        items=validation_items,
        page_width=page_width,
        page_height=page_height,
        allow_overlap=False,
    )
    if group is None:
        group = _group(
            group_id="rhythm-reflow",
            title=title,
            reason=reason + " Podgląd wymagany — mogą pozostać kolizje z ikonami/obrazami.",
            severity="high",
            patches=patches,
            items=validation_items,
            page_width=page_width,
            page_height=page_height,
            allow_overlap=True,
        )
    if group is None:
        return None, "safety_validation_failed"

    group["target_page"] = min(patch.get("page", 1) for patch in patches)
    group["page_count"] = max(
        max((item.get("page") or 1) for item in elements if isinstance(item, dict)),
        max(patch.get("page", 1) for patch in patches),
    )
    return group, ""
