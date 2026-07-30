"""Freestyle rhythm: GPT proposes moves from a full A4 snapshot; Python validates.

Primary path: the model receives the complete page JSON and returns a short
list of ``moves`` (absolute left/top). Python freezes identity (name/role),
clamps each axis to ±15 px, forbids page/size changes, and emits a preview
group. Legacy classification packing remains as a fallback.
"""
from __future__ import annotations

from statistics import median
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
    "name",
    "job_label",
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
    "full_name": "name",
    "candidate_name": "name",
    "person_name": "name",
    "headline": "job_label",
    "professional_title": "job_label",
    "job_headline": "job_label",
}
# Placement order inside one block: heading + rule, then title → meta → body.
_ROLE_RANK = {
    "name": -2,
    "job_label": -1,
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
# Soft freestyle nudge: larger moves destroy the author's composition.
MAX_RHYTHM_NUDGE_PX = 15.0
# Skip pairs already close enough to the (dynamic) target gap.
RHYTHM_DEADBAND_PX = 6.0
# Treat nearly-touching or overlapping content as the highest priority.
OVERLAP_GAP_PX = 2.0
# Cap how many local pairs we touch in one suggestion (avoids mass reshuffles).
MAX_AUTO_ADJUST_PAIRS = 8
MAX_GPT_ADJUST_PAIRS = 8
# Cap GPT-authored absolute moves in one suggestion.
MAX_GPT_RHYTHM_MOVES = 12
# Need enough clean samples before trusting the author's majority rhythm.
MIN_GAP_SAMPLES = 3
_SNAPSHOT_CATEGORIES = {
    "text", "textarea", "line", "image", "rectangle", "circle", "ellipse",
}
_VALID_PAIR_ACTIONS = {"tighten", "loosen", "fix"}
_GAP_KINDS = ("stack", "after_rule", "record", "section")
_DEFAULT_GAP_PROFILE = {
    "stack": float(SPACE_STACK),
    "after_rule": float(SPACE_AFTER_RULE),
    "record": float(SPACE_RECORD),
    "section": float(SPACE_SECTION),
}
# Clamp inferred gaps so one extreme freestyle value cannot become the target.
_GAP_CLAMP = {
    "stack": (2.0, 20.0),
    "after_rule": (4.0, 28.0),
    "record": (6.0, 40.0),
    "section": (10.0, 56.0),
}
_SECTION_HEADING_HINTS = (
    "PODSUMOWANIE", "DOŚWIADCZENIE", "WYKSZTAŁCENIE", "UMIEJĘTNOŚCI", "JĘZYKI",
    "SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "LANGUAGES", "PROJEKTY",
    "PROJECTS", "KONTAKT", "CONTACT", "CERTYFIKAT", "CERTIFICATIONS", "HOBBY",
)
_FROZEN_IDENTITY_ROLES = {
    "name", "identity", "job_label", "headline_role", "role_title", "full_name",
}


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
    keep_ids = {
        str(element_id)
        for element_id in (raw.get("keep_element_ids") or [])
        if isinstance(element_id, str) and element_id in known_ids
    }
    # keep ⊆ freeze: intentional composition must not be nudged.
    ignored |= keep_ids
    adjust_pairs = _parse_adjust_pairs(raw.get("adjust_pairs"), known_ids)
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
        "keep_element_ids": keep_ids,
        "adjust_pairs": adjust_pairs,
        "classified_ids": used_ids,
    }


def _parse_adjust_pairs(raw_pairs: object, known_ids: set[str]) -> list[dict[str, str]]:
    """Parse GPT-nominated gap pairs; drop unknowns and duplicates."""
    if not isinstance(raw_pairs, list):
        return []
    parsed: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for entry in raw_pairs:
        if not isinstance(entry, dict):
            continue
        before_id = str(
            entry.get("before_id")
            or entry.get("before")
            or entry.get("from_id")
            or ""
        )
        after_id = str(
            entry.get("after_id")
            or entry.get("after")
            or entry.get("to_id")
            or ""
        )
        action = str(entry.get("action") or "fix").strip().lower()
        if action not in _VALID_PAIR_ACTIONS:
            action = "fix"
        if before_id not in known_ids or after_id not in known_ids:
            continue
        if before_id == after_id:
            continue
        key = (before_id, after_id)
        if key in seen:
            continue
        seen.add(key)
        parsed.append({
            "before_id": before_id,
            "after_id": after_id,
            "action": action,
        })
        if len(parsed) >= MAX_GPT_ADJUST_PAIRS:
            break
    return parsed


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
        "keep_element_ids": set(),
        "adjust_pairs": [],
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


def _gap_kind(previous: dict[str, Any], current: dict[str, Any]) -> str:
    """Classify the semantic gap between two consecutive flow items."""
    if previous["section_id"] != current["section_id"]:
        return "section"
    if previous["block_id"] != current["block_id"]:
        return "record"
    prev_role = previous["role"]
    if prev_role == "heading" and current["role"] == "rule":
        return "stack"
    if prev_role in {"heading", "rule"}:
        return "after_rule"
    return "stack"


def _expected_gap(
    previous: dict[str, Any],
    current: dict[str, Any],
    profile: dict[str, float] | None = None,
) -> float:
    """Return the target rhythm gap (document majority or template fallback)."""
    gaps = profile or _DEFAULT_GAP_PROFILE
    kind = _gap_kind(previous, current)
    return float(gaps.get(kind, _DEFAULT_GAP_PROFILE[kind]))


def _clamp_gap(kind: str, value: float) -> float:
    low, high = _GAP_CLAMP.get(kind, (0.0, 80.0))
    return max(low, min(high, value))


def _infer_gap_profile(
    flow: list[dict[str, Any]],
    bounds_by_id: dict[str, dict[str, Any]],
    page_height: float,
) -> tuple[dict[str, float], dict[str, Any]]:
    """Derive STACK/RECORD/SECTION targets from the majority of existing gaps.

    Overlaps are excluded from the sample set so collisions do not pull the
    median downward. Fewer than ``MIN_GAP_SAMPLES`` clean gaps for a class
    keeps the template ``SPACE_*`` default for that class.
    """
    samples: dict[str, list[float]] = {kind: [] for kind in _GAP_KINDS}
    for index in range(1, len(flow)):
        previous_meta = flow[index - 1]
        current_meta = flow[index]
        before = bounds_by_id.get(previous_meta["element_id"])
        after = bounds_by_id.get(current_meta["element_id"])
        if before is None or after is None:
            continue
        actual = _actual_gap(before, after, page_height)
        # Negative / near-zero gaps are defects, not the author's intended rhythm.
        if actual < OVERLAP_GAP_PX:
            continue
        kind = _gap_kind(previous_meta, current_meta)
        samples[kind].append(actual)

    profile = dict(_DEFAULT_GAP_PROFILE)
    derived_kinds: list[str] = []
    sample_counts = {kind: len(values) for kind, values in samples.items()}
    for kind, values in samples.items():
        if len(values) < MIN_GAP_SAMPLES:
            continue
        inferred = _clamp_gap(kind, float(median(values)))
        profile[kind] = round(inferred, 2)
        derived_kinds.append(kind)

    meta = {
        "sample_counts": sample_counts,
        "derived_kinds": derived_kinds,
        "used_document_majority": bool(derived_kinds),
    }
    return profile, meta


def _document_top(item: dict[str, Any], page_height: float) -> float:
    return (item["page"] - 1) * page_height + item["top"]


def _is_frozen_identity(
    raw: dict[str, Any],
    item: dict[str, Any],
    *,
    role: str = "",
) -> bool:
    """Freeze the candidate name and professional role line — never nudge them."""
    if role in _FROZEN_IDENTITY_ROLES:
        return True
    if item.get("category") not in {"text", "textarea"}:
        return False
    if int(item.get("page") or 1) != 1 or _number(item.get("top"), 999) > 240:
        return False

    font_size = _number(raw.get("fontSize"), item.get("fontSize", 12.0))
    content = str(raw.get("content") or "").strip()
    # Display name (large type near the top of page 1).
    if font_size >= 18:
        return True
    # Role under the name: short uppercase label that is not a section heading.
    if content and 10 <= font_size <= 16 and "\n" not in content and 3 <= len(content) <= 48:
        upper = content.upper()
        if content == upper and not any(hint in upper for hint in _SECTION_HEADING_HINTS):
            return True
    return False


def _clamped_top(
    original: dict[str, Any],
    desired_abs: float,
    page_height: float,
    max_nudge: float = MAX_RHYTHM_NUDGE_PX,
) -> float | None:
    """Return a same-page top clamped toward ``desired_abs``, or None if unchanged."""
    orig_abs = _document_top(original, page_height)
    delta = desired_abs - orig_abs
    if abs(delta) <= EPSILON:
        return None
    delta = max(-max_nudge, min(max_nudge, delta))
    page = int(original["page"])
    top = (orig_abs + delta) - (page - 1) * page_height
    top = max(0.0, min(top, page_height - max(original["height"], 1.0)))
    top = round(top, 2)
    if abs(top - original["top"]) <= EPSILON:
        return None
    return top


def _actual_gap(
    previous: dict[str, Any],
    current: dict[str, Any],
    page_height: float,
) -> float:
    """Vertical gap between original bottoms/tops in document space (may be negative)."""
    prev_bottom = _document_top(previous, page_height) + previous["height"]
    return _document_top(current, page_height) - prev_bottom


def _pair_sort_key(
    actual_gap: float,
    expected: float,
    *,
    action: str = "fix",
) -> tuple[int, float] | None:
    """Priority for a gap pair. ``None`` means leave the pair alone (deadband).

    Tier 0 = overlap / near-touch, 1 = too tight, 2 = too loose.
    GPT ``tighten``/``loosen`` still respects deadband unless the direction matches.
    """
    error = actual_gap - expected
    overlaps = actual_gap < OVERLAP_GAP_PX
    if overlaps:
        return (0, -actual_gap)

    if action == "tighten":
        # Close an oversized gap (move after upward toward the expected rhythm).
        if error <= RHYTHM_DEADBAND_PX:
            return None
        return (2, abs(error))
    if action == "loosen":
        # Open a cramped gap (move after downward toward the expected rhythm).
        if error >= -RHYTHM_DEADBAND_PX:
            return None
        return (1, abs(error))

    if abs(error) <= RHYTHM_DEADBAND_PX:
        return None
    if error < 0:
        return (1, abs(error))
    return (2, abs(error))


def _candidate_pairs_from_flow(
    flow: list[dict[str, Any]],
    bounds_by_id: dict[str, dict[str, Any]],
    page_height: float,
    movable_ids: set[str],
    frozen_ids: set[str],
    profile: dict[str, float],
) -> list[dict[str, Any]]:
    """Build consecutive reading-order gap candidates from the classified flow."""
    candidates: list[dict[str, Any]] = []
    for index in range(1, len(flow)):
        previous_meta = flow[index - 1]
        current_meta = flow[index]
        after_id = current_meta["element_id"]
        if after_id in frozen_ids or after_id not in movable_ids:
            continue
        before = bounds_by_id.get(previous_meta["element_id"])
        after = bounds_by_id.get(after_id)
        if before is None or after is None:
            continue
        expected = _expected_gap(previous_meta, current_meta, profile)
        actual = _actual_gap(before, after, page_height)
        sort_key = _pair_sort_key(actual, expected)
        if sort_key is None:
            continue
        candidates.append({
            "before_id": previous_meta["element_id"],
            "after_id": after_id,
            "expected": expected,
            "actual": actual,
            "action": "fix",
            "sort_key": sort_key,
            "gap_kind": _gap_kind(previous_meta, current_meta),
        })
    return candidates


def _candidate_pairs_from_gpt(
    adjust_pairs: list[dict[str, str]],
    meta_by_id: dict[str, dict[str, Any]],
    bounds_by_id: dict[str, dict[str, Any]],
    page_height: float,
    movable_ids: set[str],
    frozen_ids: set[str],
    profile: dict[str, float],
) -> list[dict[str, Any]]:
    """Resolve GPT-nominated pairs against original geometry and roles."""
    candidates: list[dict[str, Any]] = []
    for pair in adjust_pairs:
        after_id = pair["after_id"]
        before_id = pair["before_id"]
        if after_id in frozen_ids or after_id not in movable_ids:
            continue
        before = bounds_by_id.get(before_id)
        after = bounds_by_id.get(after_id)
        prev_meta = meta_by_id.get(before_id)
        curr_meta = meta_by_id.get(after_id)
        if before is None or after is None or prev_meta is None or curr_meta is None:
            continue
        expected = _expected_gap(prev_meta, curr_meta, profile)
        actual = _actual_gap(before, after, page_height)
        sort_key = _pair_sort_key(actual, expected, action=pair["action"])
        if sort_key is None:
            continue
        candidates.append({
            "before_id": before_id,
            "after_id": after_id,
            "expected": expected,
            "actual": actual,
            "action": pair["action"],
            "sort_key": sort_key,
            "gap_kind": _gap_kind(prev_meta, curr_meta),
        })
    return candidates


def _select_pairs(
    candidates: list[dict[str, Any]],
    *,
    limit: int,
) -> list[dict[str, Any]]:
    """Keep the worst outliers; one patch per ``after_id`` (highest priority wins)."""
    candidates = sorted(candidates, key=lambda item: item["sort_key"])
    selected: list[dict[str, Any]] = []
    used_after: set[str] = set()
    for candidate in candidates:
        after_id = candidate["after_id"]
        if after_id in used_after:
            continue
        used_after.add(after_id)
        selected.append(candidate)
        if len(selected) >= limit:
            break
    return selected


def pack_rhythm_classification(
    elements: list[dict[str, Any]],
    classification: dict[str, Any],
    page_size: dict[str, Any] | None,
) -> tuple[dict[str, Any] | None, str]:
    """Fix only local vertical-gap outliers — preserve freestyle composition.

    - Infers STACK/RECORD/SECTION targets from the document's majority gaps.
    - Never moves candidate name / professional role (identity freeze).
    - Skips pairs already within ``RHYTHM_DEADBAND_PX`` of the target gap.
    - Nudges each selected element relative to the *original* neighbour (no cascade).
    - Each move is capped at ``MAX_RHYTHM_NUDGE_PX`` (±15).
    - Prefer GPT ``adjust_pairs`` when present; otherwise auto-pick top outliers.
    - Never changes page, left, width, or height.
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
    raw_by_id = {
        str(element.get("element_id")): element
        for element in elements
        if element.get("element_id")
    }
    known_ids = set(raw_by_id)
    normalized = _normalize_classification(classification, known_ids)
    used_fallback = False
    if normalized is None:
        normalized = _heuristic_classification(elements, bounds_by_id)
        used_fallback = True
        if not normalized["sections"]:
            return None, "classification_empty"

    role_by_id: dict[str, str] = {}
    for section in normalized["sections"]:
        for block in section["blocks"]:
            for member in block["elements"]:
                role_by_id[member["element_id"]] = member["role"]

    ignored = set(normalized.get("ignored_element_ids") or set())
    classified_ids: set[str] = set(normalized["classified_ids"])
    frozen_ids: set[str] = set()
    chain_ids: set[str] = set()
    movable_ids: set[str] = set()

    for element_id in classified_ids | ignored:
        item = bounds_by_id.get(element_id)
        raw = raw_by_id.get(element_id)
        if item is None or raw is None:
            continue
        if item.get("category") not in _FLOW_CATEGORIES:
            continue
        role = role_by_id.get(element_id, "")
        if (
            raw.get("locked")
            or raw.get("fixedToPage")
            or element_id in ignored
            or _is_frozen_identity(raw, item, role=role)
        ):
            frozen_ids.add(element_id)
            if element_id in classified_ids:
                chain_ids.add(element_id)
            continue
        if element_id in classified_ids:
            chain_ids.add(element_id)
            movable_ids.add(element_id)

    if len(movable_ids) < 1 or len(chain_ids) < 2:
        return None, "too_few_movable"

    flow = _flatten_flow(normalized, chain_ids, bounds_by_id)
    if len(flow) < 2:
        return None, "too_few_movable"

    meta_by_id = {item["element_id"]: item for item in flow}
    gap_profile, gap_meta = _infer_gap_profile(flow, bounds_by_id, page_height)
    gpt_pairs = list(normalized.get("adjust_pairs") or [])
    used_gpt_pairs = False
    selected: list[dict[str, Any]] = []
    if gpt_pairs:
        gpt_candidates = _candidate_pairs_from_gpt(
            gpt_pairs,
            meta_by_id,
            bounds_by_id,
            page_height,
            movable_ids,
            frozen_ids,
            gap_profile,
        )
        selected = _select_pairs(gpt_candidates, limit=MAX_GPT_ADJUST_PAIRS)
        used_gpt_pairs = bool(selected)

    if not selected:
        # No usable GPT pairs (missing, already in deadband, or frozen) →
        # fall back to the worst geometric outliers only.
        auto_candidates = _candidate_pairs_from_flow(
            flow,
            bounds_by_id,
            page_height,
            movable_ids,
            frozen_ids,
            gap_profile,
        )
        selected = _select_pairs(auto_candidates, limit=MAX_AUTO_ADJUST_PAIRS)
        used_gpt_pairs = False

    if not selected:
        return None, "no_position_changes"

    patches: list[dict[str, Any]] = []
    patched_ids: set[str] = set()
    working_by_id = {
        item["element_id"]: dict(item)
        for item in all_bounds
        if item["category"] in AUTO_LAYOUT_CATEGORIES or item["element_id"] in chain_ids
    }

    for candidate in selected:
        before = bounds_by_id[candidate["before_id"]]
        after = bounds_by_id[candidate["after_id"]]
        # Anchor exclusively on the original neighbour so fixing one pair cannot
        # cascade into unrelated elements further down the column.
        prev_bottom = _document_top(before, page_height) + before["height"]
        desired_abs = prev_bottom + candidate["expected"]
        new_top = _clamped_top(after, desired_abs, page_height)
        if new_top is None:
            continue
        patches.append({
            "element_id": candidate["after_id"],
            "left": round(after["left"], 2),
            "top": new_top,
            "page": after["page"],
        })
        patched_ids.add(candidate["after_id"])
        working = working_by_id[candidate["after_id"]]
        working["top"] = new_top
        working["page"] = after["page"]

    if not patches:
        return None, "no_position_changes"

    def _fits_page(item: dict[str, Any]) -> bool:
        return (
            item["left"] >= -EPSILON
            and item["top"] >= -EPSILON
            and item["left"] + item["width"] <= page_width + EPSILON
            and item["top"] + item["height"] <= page_height + EPSILON
        )

    # Soft rhythm must not be blocked by pre-existing freestyle overflow
    # (wide name blocks, decorative lines past the margin, etc.).
    validation_items = []
    for element_id, item in working_by_id.items():
        original = bounds_by_id.get(element_id, item)
        if element_id in patched_ids or _fits_page(original):
            validation_items.append(item)
    if not validation_items:
        validation_items = [working_by_id[patch["element_id"]] for patch in patches]

    profile_bits = (
        f"stack={gap_profile['stack']:g}, after_rule={gap_profile['after_rule']:g}, "
        f"record={gap_profile['record']:g}, section={gap_profile['section']:g}"
    )
    rhythm_source = (
        "rytm z większości odstępów w CV"
        if gap_meta.get("used_document_majority")
        else "rytm szablonowy (za mało próbek w dokumencie)"
    )
    reason_bits = [
        f"Lokalne korekty odstępów (max {len(patches)} miejsc): {rhythm_source} "
        f"[{profile_bits}], deadband ±{RHYTHM_DEADBAND_PX:g} px, "
        f"przesunięcie max ±{MAX_RHYTHM_NUDGE_PX:g} px.",
        "Imię i rola zawodowa nie są ruszane. Left, szerokość i strona zostają.",
    ]
    if used_gpt_pairs:
        reason_bits.append("Priorytet par wskazanych przez GPT (adjust_pairs).")
    else:
        reason_bits.append("Wybrano największe outliery względem rytmu dokumentu.")
    if used_fallback:
        reason_bits.append("Użyto zapasowej kolejności Y (GPT zwrócił nieparsowalną strukturę).")

    title = f"Popraw odstępy lokalnie ({len(patches)}×, max ±15 px)"
    reason = " ".join(reason_bits)
    severity = "high" if any(c["sort_key"][0] == 0 for c in selected) else "medium"

    group = _group(
        group_id="rhythm-reflow",
        title=title,
        reason=reason,
        severity=severity,
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
            severity=severity,
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


def build_a4_canvas_snapshot(
    elements: list[dict[str, Any]],
    page_size: dict[str, Any] | None,
) -> dict[str, Any]:
    """Build the full A4 JSON handed to GPT for freestyle rhythm decisions."""
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
        elif category == "line":
            preview = "[line]"
        elif category in {"rectangle", "circle", "ellipse"}:
            preview = f"[{category}]"
        else:
            preview = content[:240]

        item: dict[str, Any] = {
            "element_id": element_id,
            "category": category,
            "page": int(_number(element.get("page"), 1)),
            "left": round(_number(element.get("left")), 2),
            "top": round(_number(element.get("top")), 2),
            "width": round(_number(element.get("width")), 2),
            "height": round(_number(element.get("height")), 2),
            "zIndex": int(_number(element.get("zIndex"), 1)),
            "movable": not locked,
            "locked": locked,
            "fixedToPage": bool(element.get("fixedToPage")),
            "content": preview,
        }
        if category in {"text", "textarea"}:
            item["fontSize"] = element.get("fontSize")
            item["fontFamily"] = element.get("fontFamily")
            item["bold"] = bool(element.get("bold"))
            item["italic"] = bool(element.get("italic"))
            item["align"] = element.get("align")
            item["color"] = element.get("color")
            item["lineHeight"] = element.get("lineHeight")
        if category == "line":
            item["color"] = element.get("color")
            item["strokeWidth"] = element.get("strokeWidth") or element.get("borderWidth")
        items.append(item)

    items.sort(key=lambda row: (row["page"], row["top"], row["left"], row["element_id"]))
    movable_count = sum(1 for row in items if row["movable"])
    return {
        "page": {
            "width": page_width,
            "height": page_height,
            "unit": "px",
            "format": "A4",
        },
        "element_count": len(items),
        "movable_count": movable_count,
        "elements": items,
        "constraints": {
            "max_moves": MAX_GPT_RHYTHM_MOVES,
            "max_delta_px": MAX_RHYTHM_NUDGE_PX,
            "freeze_roles": ["name", "job_label"],
            "forbid_page_change": True,
            "forbid_resize": True,
        },
    }


def _coerce_moves_list(value: object) -> list | None:
    """Return a list when GPT used ``moves`` or a common alias."""
    if isinstance(value, list):
        return value
    return None


def _unwrap_moves_payload(raw: dict[str, Any]) -> dict[str, Any]:
    """Accept common wrappers / aliases around a GPT moves payload."""
    if not isinstance(raw, dict):
        return {}

    move_keys = (
        "moves", "patches", "adjustments", "shifts", "changes",
        "repositions", "position_changes",
    )

    for key in move_keys:
        moves = _coerce_moves_list(raw.get(key))
        if moves is not None:
            payload = dict(raw)
            payload["moves"] = moves
            return payload

    for wrap_key in ("result", "data", "rhythm", "layout", "proposal", "response"):
        nested = raw.get(wrap_key)
        if not isinstance(nested, dict):
            continue
        for key in move_keys:
            moves = _coerce_moves_list(nested.get(key))
            if moves is not None:
                payload = dict(nested)
                payload["moves"] = moves
                if isinstance(raw.get("keep_element_ids"), list) and "keep_element_ids" not in payload:
                    payload["keep_element_ids"] = raw["keep_element_ids"]
                if raw.get("summary") and not payload.get("summary"):
                    payload["summary"] = raw["summary"]
                return payload

    # Corrections that already carry absolute geometry can act as moves.
    corrections = raw.get("corrections")
    if isinstance(corrections, list) and corrections:
        geo_moves = [
            item for item in corrections
            if isinstance(item, dict)
            and item.get("element_id")
            and ("top" in item or "left" in item or "dy" in item or "dx" in item)
        ]
        if geo_moves:
            payload = dict(raw)
            payload["moves"] = geo_moves
            return payload

    return raw


def apply_gpt_rhythm_moves(
    elements: list[dict[str, Any]],
    gpt_raw: dict[str, Any],
    page_size: dict[str, Any] | None,
) -> tuple[dict[str, Any] | None, str]:
    """Validate GPT absolute moves and emit a soft freestyle preview group.

    Safety rails (non-negotiable):
    - only known element ids;
    - name / job_label / large identity heuristics stay frozen;
    - each left/top change clamped to ±``MAX_RHYTHM_NUDGE_PX``;
    - page, width, and height never change;
    - at most ``MAX_GPT_RHYTHM_MOVES`` patches.
    """
    page_size = page_size or {}
    page_width = _number(page_size.get("width"), 595.0)
    page_height = _number(page_size.get("height"), float(A4_H))
    if page_width <= 0 or page_height <= 0:
        return None, "invalid_page_size"

    payload = _unwrap_moves_payload(gpt_raw if isinstance(gpt_raw, dict) else {})
    moves_raw = payload.get("moves")
    if not isinstance(moves_raw, list):
        return None, "moves_missing"
    # Explicit empty list = model judged the freestyle layout already fine.
    if not moves_raw:
        return None, "moves_none_needed"

    keep_ids = {
        str(element_id)
        for element_id in (payload.get("keep_element_ids") or [])
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

    patches: list[dict[str, Any]] = []
    reasons: list[str] = []
    used_ids: set[str] = set()
    working_by_id = {item["element_id"]: dict(item) for item in all_bounds}

    for entry in moves_raw:
        if len(patches) >= MAX_GPT_RHYTHM_MOVES:
            break
        if not isinstance(entry, dict):
            continue
        element_id = str(
            entry.get("element_id")
            or entry.get("id")
            or entry.get("elementId")
            or ""
        )
        if not element_id or element_id in used_ids:
            continue
        original = bounds_by_id.get(element_id)
        raw = raw_by_id.get(element_id)
        if original is None or raw is None:
            continue
        if raw.get("locked") or raw.get("fixedToPage"):
            continue
        if element_id in keep_ids or _is_frozen_identity(raw, original):
            continue

        # Absolute targets preferred; relative dx/dy accepted as a fallback.
        if "top" in entry or "left" in entry:
            desired_left = _number(entry.get("left"), original["left"])
            desired_top = _number(entry.get("top"), original["top"])
        else:
            desired_left = original["left"] + _number(entry.get("dx") or entry.get("delta_x"), 0.0)
            desired_top = original["top"] + _number(entry.get("dy") or entry.get("delta_y"), 0.0)

        delta_left = max(
            -MAX_RHYTHM_NUDGE_PX,
            min(MAX_RHYTHM_NUDGE_PX, desired_left - original["left"]),
        )
        delta_top = max(
            -MAX_RHYTHM_NUDGE_PX,
            min(MAX_RHYTHM_NUDGE_PX, desired_top - original["top"]),
        )
        new_left = round(original["left"] + delta_left, 2)
        new_top = round(original["top"] + delta_top, 2)
        # Keep the element on the same page and inside the canvas as much as possible.
        new_top = max(0.0, min(new_top, page_height - max(original["height"], 1.0)))
        new_left = max(0.0, min(new_left, page_width - max(original["width"] * 0.25, 1.0)))

        if (
            abs(new_left - original["left"]) <= EPSILON
            and abs(new_top - original["top"]) <= EPSILON
        ):
            continue

        used_ids.add(element_id)
        patch = {
            "element_id": element_id,
            "left": new_left,
            "top": new_top,
            "page": original["page"],
        }
        patches.append(patch)
        working = working_by_id[element_id]
        working["left"] = new_left
        working["top"] = new_top
        reason = str(entry.get("reason") or entry.get("why") or "").strip()
        if reason:
            reasons.append(f"{element_id}: {reason[:120]}")

    if not patches:
        return None, "no_position_changes"

    def _fits_page(item: dict[str, Any]) -> bool:
        return (
            item["left"] >= -EPSILON
            and item["top"] >= -EPSILON
            and item["left"] + item["width"] <= page_width + EPSILON
            and item["top"] + item["height"] <= page_height + EPSILON
        )

    validation_items = []
    patched_ids = {patch["element_id"] for patch in patches}
    for element_id, item in working_by_id.items():
        original = bounds_by_id.get(element_id, item)
        if element_id in patched_ids or _fits_page(original):
            validation_items.append(item)
    if not validation_items:
        validation_items = [working_by_id[patch["element_id"]] for patch in patches]

    summary = str(payload.get("summary") or payload.get("message") or "").strip()
    title = f"Korekty rytmu z GPT ({len(patches)}×, max ±15 px)"
    reason_parts = [
        "GPT wskazał elementy do przesunięcia na podstawie pełnego JSON A4. "
        f"Python przyciął każde przesunięcie do ±{MAX_RHYTHM_NUDGE_PX:g} px "
        "i zamroził imię/rolę. Szerokość, wysokość i strona bez zmian.",
    ]
    if summary:
        reason_parts.append(summary[:240])
    if reasons:
        reason_parts.append(" ".join(reasons[:6]))

    group = _group(
        group_id="rhythm-reflow",
        title=title,
        reason=" ".join(reason_parts),
        severity="medium",
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
            reason=" ".join(reason_parts) + " Podgląd wymagany — mogą pozostać kolizje.",
            severity="medium",
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
