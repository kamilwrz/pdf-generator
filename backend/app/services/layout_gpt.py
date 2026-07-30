"""GPT-owned freestyle layout session.

Builds a full multi-page A4 geometry snapshot for the model, then turns GPT
``findings`` / ``moves`` into frontend ``layout_groups`` + ``layout_issues``.
Python only validates ids, freezes locked chrome / identity, and keeps patches
on-page — it does not invent a second layout algorithm.
"""
from __future__ import annotations

from typing import Any

from app.services.cv_generator import A4_H
from app.services.layout_analysis import (
    AUTO_LAYOUT_CATEGORIES,
    EPSILON,
    _group,
    _number,
    extract_bounds,
)

# Soft cap so one response cannot teleport freestyle blocks across the page.
MAX_LAYOUT_MOVE_PX = 80.0
MAX_LAYOUT_MOVES = 40
MAX_LAYOUT_FINDINGS = 12
_SNAPSHOT_CATEGORIES = {
    "text", "textarea", "line", "image", "rectangle", "circle", "ellipse",
}
_VALID_SEVERITIES = {"critical", "high", "medium", "low", "review", "warning"}
_FROZEN_IDENTITY_ROLES_HINTS = (
    "PODSUMOWANIE", "DOŚWIADCZENIE", "WYKSZTAŁCENIE", "UMIEJĘTNOŚCI", "JĘZYKI",
    "SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "LANGUAGES",
)


def build_layout_snapshot(
    elements: list[dict[str, Any]],
    page_size: dict[str, Any] | None,
) -> dict[str, Any]:
    """Full multi-page canvas JSON for GPT layout analysis."""
    page_size = page_size or {}
    page_width = _number(page_size.get("width"), 595.0)
    page_height = _number(page_size.get("height"), float(A4_H))
    items: list[dict[str, Any]] = []

    for element in elements:
        if not isinstance(element, dict):
            continue
        element_id = str(element.get("element_id") or "")
        category = element.get("category")
        if not element_id or category not in _SNAPSHOT_CATEGORIES:
            continue

        locked = bool(element.get("locked") or element.get("fixedToPage"))
        content = str(element.get("content") or "")
        if category == "image":
            preview = "[image]"
        elif category in {"line", "rectangle", "circle", "ellipse"}:
            preview = f"[{category}]"
        else:
            preview = content[:280]

        measured = element.get("layout_bounds") if isinstance(element.get("layout_bounds"), dict) else {}
        item: dict[str, Any] = {
            "element_id": element_id,
            "category": category,
            "page": int(_number(element.get("page"), 1)),
            "left": round(_number(measured.get("left", element.get("left"))), 2),
            "top": round(_number(measured.get("top", element.get("top"))), 2),
            "width": round(_number(measured.get("width", element.get("width"))), 2),
            "height": round(_number(measured.get("height", element.get("height"))), 2),
            "zIndex": int(_number(element.get("zIndex"), 1)),
            "movable": not locked,
            "locked": locked,
            "fixedToPage": bool(element.get("fixedToPage")),
            "content": preview,
        }
        if category in {"text", "textarea"}:
            item.update({
                "fontSize": element.get("fontSize"),
                "fontFamily": element.get("fontFamily"),
                "bold": bool(element.get("bold")),
                "italic": bool(element.get("italic")),
                "align": element.get("align"),
                "color": element.get("color"),
                "lineHeight": element.get("lineHeight"),
                "content_height": element.get("content_height"),
                "clipped": bool(element.get("clipped")),
            })
        if category == "line":
            item["color"] = element.get("color")
            item["strokeWidth"] = element.get("strokeWidth") or element.get("borderWidth")
        items.append(item)

    items.sort(key=lambda row: (row["page"], row["top"], row["left"], row["element_id"]))
    pages = sorted({item["page"] for item in items}) or [1]
    return {
        "page": {
            "width": page_width,
            "height": page_height,
            "unit": "px",
            "format": "A4",
            "page_count": max(pages),
            "pages": pages,
        },
        "element_count": len(items),
        "movable_count": sum(1 for row in items if row["movable"]),
        "elements": items,
        "constraints": {
            "max_moves": MAX_LAYOUT_MOVES,
            "max_findings": MAX_LAYOUT_FINDINGS,
            "max_delta_px": MAX_LAYOUT_MOVE_PX,
            "forbid_page_change": True,
            "forbid_resize_unless_clipped": True,
            "preserve_user_vision": True,
        },
    }


def _is_frozen_identity(raw: dict[str, Any], item: dict[str, Any]) -> bool:
    """Freeze large name / short ALL-CAPS role under the photo on page 1."""
    if item.get("category") not in {"text", "textarea"}:
        return False
    if int(item.get("page") or 1) != 1 or _number(item.get("top"), 999) > 240:
        return False
    font_size = _number(raw.get("fontSize"), item.get("fontSize", 12.0))
    content = str(raw.get("content") or "").strip()
    if font_size >= 18:
        return True
    if content and 10 <= font_size <= 16 and "\n" not in content and 3 <= len(content) <= 48:
        upper = content.upper()
        if content == upper and not any(hint in upper for hint in _FROZEN_IDENTITY_ROLES_HINTS):
            return True
    return False


def _unwrap_payload(raw: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    if isinstance(raw.get("findings"), list) or isinstance(raw.get("moves"), list):
        return raw
    for key in ("result", "data", "layout", "response", "proposal"):
        nested = raw.get(key)
        if isinstance(nested, dict) and (
            isinstance(nested.get("findings"), list) or isinstance(nested.get("moves"), list)
        ):
            return nested
    return raw


def _extract_findings(raw: dict[str, Any]) -> list[dict[str, Any]]:
    payload = _unwrap_payload(raw)
    for key in ("findings", "issues", "problems"):
        value = payload.get(key)
        if isinstance(value, list) and value:
            return [item for item in value if isinstance(item, dict)]
    moves = payload.get("moves")
    if isinstance(moves, list) and moves:
        return [{
            "id": "layout-moves",
            "severity": "medium",
            "title": "Propozycje układu",
            "analysis": str(payload.get("summary") or "").strip(),
            "moves": moves,
        }]
    return []


def _finding_moves(finding: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("moves", "patches", "adjustments"):
        value = finding.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def _validated_patches(
    moves_raw: list[dict[str, Any]],
    *,
    bounds_by_id: dict[str, dict[str, Any]],
    raw_by_id: dict[str, dict[str, Any]],
    keep_ids: set[str],
    used_ids: set[str],
    page_width: float,
    page_height: float,
    limit: int,
) -> list[dict[str, Any]]:
    patches: list[dict[str, Any]] = []
    for entry in moves_raw:
        if len(patches) >= limit:
            break
        element_id = str(
            entry.get("element_id") or entry.get("id") or entry.get("elementId") or ""
        )
        if not element_id or element_id in used_ids:
            continue
        original = bounds_by_id.get(element_id)
        raw = raw_by_id.get(element_id)
        if original is None or raw is None:
            continue
        if raw.get("locked") or raw.get("fixedToPage") or element_id in keep_ids:
            continue
        if _is_frozen_identity(raw, original):
            continue

        if "top" in entry or "left" in entry:
            desired_left = _number(entry.get("left"), original["left"])
            desired_top = _number(entry.get("top"), original["top"])
        else:
            desired_left = original["left"] + _number(entry.get("dx") or entry.get("delta_x"), 0.0)
            desired_top = original["top"] + _number(entry.get("dy") or entry.get("delta_y"), 0.0)

        delta_left = max(-MAX_LAYOUT_MOVE_PX, min(MAX_LAYOUT_MOVE_PX, desired_left - original["left"]))
        delta_top = max(-MAX_LAYOUT_MOVE_PX, min(MAX_LAYOUT_MOVE_PX, desired_top - original["top"]))
        new_left = round(original["left"] + delta_left, 2)
        new_top = round(original["top"] + delta_top, 2)
        new_top = max(0.0, min(new_top, page_height - max(original["height"], 1.0)))
        new_left = max(0.0, min(new_left, page_width - max(original["width"] * 0.2, 1.0)))

        patch: dict[str, Any] = {
            "element_id": element_id,
            "left": new_left,
            "top": new_top,
            "page": original["page"],
        }
        # Optional height expand for clipped textareas when GPT requests it.
        if "height" in entry and original.get("category") == "textarea":
            desired_h = _number(entry.get("height"), original["height"])
            if desired_h > original["height"] + EPSILON:
                patch["height"] = round(min(desired_h, page_height - new_top), 2)

        if (
            abs(patch["left"] - original["left"]) <= EPSILON
            and abs(patch["top"] - original["top"]) <= EPSILON
            and "height" not in patch
        ):
            continue

        used_ids.add(element_id)
        patches.append(patch)
    return patches


def compile_layout_gpt_response(
    elements: list[dict[str, Any]],
    gpt_raw: dict[str, Any],
    page_size: dict[str, Any] | None,
) -> tuple[list[dict[str, Any]], list[dict[str, str]], str, str]:
    """Return (layout_groups, layout_issues, summary, error_code)."""
    page_size = page_size or {}
    page_width = _number(page_size.get("width"), 595.0)
    page_height = _number(page_size.get("height"), float(A4_H))
    if page_width <= 0 or page_height <= 0:
        return [], [], "", "invalid_page_size"

    raw = gpt_raw if isinstance(gpt_raw, dict) else {}
    payload = _unwrap_payload(raw)
    summary = str(payload.get("summary") or payload.get("message") or raw.get("summary") or "").strip()
    findings = _extract_findings(raw)

    if not findings:
        if isinstance(payload.get("findings"), list) and not payload["findings"]:
            return [], [], summary, ""
        if isinstance(payload.get("moves"), list) and not payload["moves"]:
            return [], [], summary, ""
        # Pure Q&A answer without geometry patches is still valid.
        if summary or str(raw.get("message") or "").strip():
            return [], [], summary or str(raw.get("message") or "").strip(), ""
        return [], [], "", "empty_response"

    keep_ids = {
        str(element_id)
        for element_id in (payload.get("keep_element_ids") or raw.get("keep_element_ids") or [])
        if isinstance(element_id, str)
    }
    all_bounds = extract_bounds(
        elements,
        AUTO_LAYOUT_CATEGORIES | {"line", "rectangle", "circle", "ellipse"},
    )
    bounds_by_id = {item["element_id"]: item for item in all_bounds}
    raw_by_id = {
        str(element.get("element_id")): element
        for element in elements
        if isinstance(element, dict) and element.get("element_id")
    }

    groups: list[dict[str, Any]] = []
    issues: list[dict[str, str]] = []
    used_ids: set[str] = set()
    remaining = MAX_LAYOUT_MOVES

    for index, finding in enumerate(findings[:MAX_LAYOUT_FINDINGS]):
        title = str(finding.get("title") or finding.get("heading") or f"Problem układu #{index + 1}").strip()[:140]
        analysis = str(
            finding.get("analysis")
            or finding.get("reason")
            or finding.get("message")
            or ""
        ).strip()
        severity = str(finding.get("severity") or "medium").strip().lower()
        if severity not in _VALID_SEVERITIES:
            severity = "medium"
        issues.append({"severity": severity, "message": (analysis or title)[:700]})

        moves = _finding_moves(finding)
        if not moves or remaining <= 0:
            continue
        patches = _validated_patches(
            moves,
            bounds_by_id=bounds_by_id,
            raw_by_id=raw_by_id,
            keep_ids=keep_ids,
            used_ids=used_ids,
            page_width=page_width,
            page_height=page_height,
            limit=remaining,
        )
        if not patches:
            continue
        remaining -= len(patches)

        working = {eid: dict(item) for eid, item in bounds_by_id.items()}
        for patch in patches:
            node = working.get(patch["element_id"])
            if not node:
                continue
            node["left"] = patch["left"]
            node["top"] = patch["top"]
            if "height" in patch:
                node["height"] = patch["height"]

        finding_id = str(finding.get("id") or f"finding-{index + 1}")
        finding_id = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in finding_id)[:48]
        group = _group(
            group_id=f"layout-{finding_id}",
            title=title,
            reason=(analysis or title)[:800],
            severity=severity,
            patches=patches,
            items=list(working.values()),
            page_width=page_width,
            page_height=page_height,
            allow_overlap=True,
        )
        if group is None:
            continue
        group["target_page"] = min(p.get("page", 1) for p in patches)
        group["page_count"] = max(
            max((el.get("page") or 1) for el in elements if isinstance(el, dict)),
            max(p.get("page", 1) for p in patches),
        )
        groups.append(group)

    return groups, issues, summary, ""
