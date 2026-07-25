"""Safe, deterministic layout analysis for canvas documents.

The assistant may describe findings, but this module is the sole authority for
layout coordinates. That prevents an LLM from inventing positions that cause
overlaps or break a template's decorative elements.
"""
from __future__ import annotations

import math
from collections import defaultdict
from statistics import median
from typing import Any


# Automatic layout analysis deliberately excludes decorations. Explicit AI
# commands may target them, however, so their bounds need a broader category
# set than the scanner uses.
AUTO_LAYOUT_CATEGORIES = {"text", "textarea", "image"}
DIRECTED_POSITION_CATEGORIES = AUTO_LAYOUT_CATEGORIES | {"line", "rectangle"}
DECORATIVE_CATEGORIES = {"line", "rectangle", "connector"}
MAX_SNAP_DISTANCE = 12.0
MAX_SAFE_SNAP_MOVE = 18.0
MAX_SAFE_BOUNDS_MOVE = 96.0
MIN_CLUSTER_SIZE = 3
EPSILON = 0.5


def _number(value: Any, default: float = 0.0) -> float:
    """Return a finite float, falling back to a predictable value."""
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if math.isfinite(parsed) else default


def _text_dimensions(element: dict[str, Any]) -> tuple[float, float]:
    """Fallback dimensions when the frontend could not measure a text node."""
    font_size = max(_number(element.get("fontSize"), 12.0), 1.0)
    content = str(element.get("content") or "")
    longest_line = max((len(line) for line in content.splitlines()), default=1)
    return max(font_size * 0.55 * longest_line, font_size), font_size * 1.35


def _bounds_for(
    element: dict[str, Any],
    allowed_categories: set[str] | None = None,
) -> dict[str, Any] | None:
    """Build normalized bounds from frontend measurements and stored geometry."""
    category = element.get("category")
    allowed_categories = allowed_categories or DIRECTED_POSITION_CATEGORIES
    if category not in allowed_categories:
        return None

    measured = element.get("layout_bounds") or {}
    if category == "text":
        fallback_width, fallback_height = _text_dimensions(element)
    else:
        fallback_width, fallback_height = 0.0, 0.0

    width = _number(measured.get("width", element.get("width")), fallback_width)
    height = _number(measured.get("height", element.get("height")), fallback_height)
    if width <= 0 or height <= 0:
        return None

    element_id = element.get("element_id")
    if not element_id:
        return None

    return {
        "element_id": str(element_id),
        "category": category,
        "page": max(1, int(_number(element.get("page"), 1))),
        "fixedToPage": bool(element.get("fixedToPage", False)),
        "left": _number(measured.get("left", element.get("left"))),
        "top": _number(measured.get("top", element.get("top"))),
        "width": width,
        "height": height,
    }


def _rects_overlap(first: dict[str, Any], second: dict[str, Any]) -> bool:
    """Return true only when two boxes share visible area, not a touching edge."""
    return (
        first["left"] + first["width"] > second["left"] + EPSILON
        and second["left"] + second["width"] > first["left"] + EPSILON
        and first["top"] + first["height"] > second["top"] + EPSILON
        and second["top"] + second["height"] > first["top"] + EPSILON
    )


def _apply_patches(
    items: list[dict[str, Any]],
    patches: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_id = {patch["element_id"]: patch for patch in patches}
    return [
        {
            **item,
            **({"left": by_id[item["element_id"]]["left"]} if item["element_id"] in by_id else {}),
            **({"top": by_id[item["element_id"]]["top"]} if item["element_id"] in by_id else {}),
            **({"page": by_id[item["element_id"]]["page"]} if item["element_id"] in by_id and "page" in by_id[item["element_id"]] else {}),
        }
        for item in items
    ]


def extract_bounds(
    elements: list[dict[str, Any]],
    allowed_categories: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Normalize geometric bounds for the requested set of element types."""
    return [
        bound
        for element in elements
        if (bound := _bounds_for(element, allowed_categories))
    ]


def _is_safe_group(
    items: list[dict[str, Any]],
    patches: list[dict[str, Any]],
    page_width: float,
    page_height: float,
    allow_overlap: bool = False,
) -> bool:
    """Reject proposals that leave the page or, unless allow_overlap is set,
    introduce new content overlaps. allow_overlap is for explicit,
    GPT-directed operations (the user asked for this move specifically) —
    the deterministic auto-scanner never sets it, since it's guessing intent
    rather than executing an instruction."""
    if not patches:
        return False

    known_ids = {item["element_id"] for item in items}
    patch_ids = [patch.get("element_id") for patch in patches]
    if len(set(patch_ids)) != len(patch_ids) or any(item_id not in known_ids for item_id in patch_ids):
        return False
    if any(
        "page" in patch
        and (
            not isinstance(patch["page"], int)
            or isinstance(patch["page"], bool)
            or patch["page"] < 1
        )
        for patch in patches
    ):
        return False

    original_overlaps = {
        frozenset((first["element_id"], second["element_id"]))
        for index, first in enumerate(items)
        for second in items[index + 1:]
        if first["page"] == second["page"] and _rects_overlap(first, second)
    }
    proposed = _apply_patches(items, patches)

    for item in proposed:
        if (
            item["left"] < -EPSILON
            or item["top"] < -EPSILON
            or item["left"] + item["width"] > page_width + EPSILON
            or item["top"] + item["height"] > page_height + EPSILON
        ):
            return False

    if allow_overlap:
        return True

    for index, first in enumerate(proposed):
        for second in proposed[index + 1:]:
            if first["page"] != second["page"] or not _rects_overlap(first, second):
                continue
            pair = frozenset((first["element_id"], second["element_id"]))
            if pair not in original_overlaps:
                return False
    return True


def _group(
    *,
    group_id: str,
    title: str,
    reason: str,
    severity: str,
    patches: list[dict[str, Any]],
    items: list[dict[str, Any]],
    page_width: float,
    page_height: float,
    allow_overlap: bool = False,
) -> dict[str, Any] | None:
    if not _is_safe_group(items, patches, page_width, page_height, allow_overlap):
        return None
    return {
        "id": group_id,
        "title": title,
        "reason": reason,
        "severity": severity,
        "patches": patches,
    }


def _clusters_for_anchor(
    items: list[dict[str, Any]],
    anchor,
) -> list[list[dict[str, Any]]]:
    """Find nearby edges or centers that are almost, but not quite, aligned."""
    sorted_items = sorted(items, key=anchor)
    clusters: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []

    for item in sorted_items:
        if not current or anchor(item) - anchor(current[-1]) <= MAX_SNAP_DISTANCE:
            current.append(item)
            continue
        if len(current) >= MIN_CLUSTER_SIZE:
            clusters.append(current)
        current = [item]

    if len(current) >= MIN_CLUSTER_SIZE:
        clusters.append(current)
    return clusters


def _anchor_clusters(items: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    return _clusters_for_anchor(items, lambda item: item["left"])


def _bounds_groups(
    items: list[dict[str, Any]],
    page_width: float,
    page_height: float,
) -> tuple[list[dict[str, Any]], set[str], list[dict[str, str]]]:
    groups: list[dict[str, Any]] = []
    changed_ids: set[str] = set()
    issues: list[dict[str, str]] = []

    for item in items:
        max_left = page_width - item["width"]
        max_top = page_height - item["height"]
        if max_left < 0 or max_top < 0:
            issues.append({
                "severity": "warning",
                "message": "Element jest większy niż strona i wymaga ręcznej zmiany rozmiaru.",
            })
            continue

        next_left = min(max(item["left"], 0.0), max_left)
        next_top = min(max(item["top"], 0.0), max_top)
        distance = max(abs(next_left - item["left"]), abs(next_top - item["top"]))
        if distance <= EPSILON:
            continue
        if distance > MAX_SAFE_BOUNDS_MOVE:
            issues.append({
                "severity": "warning",
                "message": "Element jest daleko poza stroną i wymaga ręcznego umieszczenia.",
            })
            continue

        patch = {
            "element_id": item["element_id"],
            "left": round(next_left, 2),
            "top": round(next_top, 2),
        }
        suggestion = _group(
            group_id=f"bounds-{item['page']}-{item['element_id']}",
            title=f"Trzymaj treść w obrębie strony {item['page']}",
            reason="Ten element wychodzi poza obszar do druku.",
            severity="high",
            patches=[patch],
            items=items,
            page_width=page_width,
            page_height=page_height,
        )
        if suggestion:
            groups.append(suggestion)
            changed_ids.add(item["element_id"])
    return groups, changed_ids, issues


def _alignment_groups(
    items: list[dict[str, Any]],
    excluded_ids: set[str],
    page_width: float,
    page_height: float,
) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    by_page: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        if item["element_id"] not in excluded_ids:
            by_page[item["page"]].append(item)

    for page, page_items in by_page.items():
        used_ids: set[str] = set()
        anchors = (
            ("left edge", lambda item: item["left"], lambda item: 0.0),
            ("center", lambda item: item["left"] + item["width"] / 2, lambda item: item["width"] / 2),
            ("right edge", lambda item: item["left"] + item["width"], lambda item: item["width"]),
        )
        for anchor_name, anchor_of, offset_of in anchors:
            anchor_label = {
                "left edge": "lewa krawędź",
                "center": "środek",
                "right edge": "prawa krawędź",
            }[anchor_name]
            candidates = [item for item in page_items if item["element_id"] not in used_ids]
            for cluster_index, cluster in enumerate(_clusters_for_anchor(candidates, anchor_of), start=1):
                target = median(anchor_of(item) for item in cluster)
                patches = [
                    {
                        "element_id": item["element_id"],
                        "left": round(target - offset_of(item), 2),
                        "top": round(item["top"], 2),
                    }
                    for item in cluster
                    if EPSILON < abs(item["left"] - (target - offset_of(item))) <= MAX_SAFE_SNAP_MOVE
                ]
                if not patches:
                    if (
                        anchor_name == "left edge"
                        and max(anchor_of(item) for item in cluster) - min(anchor_of(item) for item in cluster) <= EPSILON
                    ):
                        used_ids.update(item["element_id"] for item in cluster)
                    continue

                suggestion = _group(
                    group_id=f"alignment-{page}-{anchor_name.replace(' ', '-')}-{cluster_index}",
                    title=f"Wyrównaj {len(cluster)} bloków treści na stronie {page}",
                    reason=f"Te bloki mają wspólną {anchor_label}, ale wykazują niewielkie przesunięcie w poziomie.",
                    severity="low",
                    patches=patches,
                    items=items,
                    page_width=page_width,
                    page_height=page_height,
                )
                if suggestion:
                    groups.append(suggestion)
                    used_ids.update(item["element_id"] for item in cluster)
    return groups


def _spacing_groups(
    items: list[dict[str, Any]],
    excluded_ids: set[str],
    page_width: float,
    page_height: float,
) -> list[dict[str, Any]]:
    """Normalize a clearly repetitive vertical rhythm without guessing intent."""
    groups: list[dict[str, Any]] = []
    by_page: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        if item["element_id"] not in excluded_ids:
            by_page[item["page"]].append(item)

    for page, page_items in by_page.items():
        for column_index, column in enumerate(_anchor_clusters(page_items), start=1):
            if len({item["category"] for item in column}) != 1:
                continue
            column = sorted(column, key=lambda item: item["top"])
            gaps = [
                current["top"] - (previous["top"] + previous["height"])
                for previous, current in zip(column, column[1:])
            ]
            if len(gaps) < MIN_CLUSTER_SIZE or any(gap < 0 for gap in gaps):
                continue

            target_gap = median(gaps)
            if target_gap < 4 or target_gap > 32:
                continue

            patches: list[dict[str, Any]] = []
            expected_top = column[0]["top"]
            for previous, current in zip(column, column[1:]):
                expected_top += previous["height"] + target_gap
                distance = abs(current["top"] - expected_top)
                if EPSILON < distance <= MAX_SAFE_SNAP_MOVE:
                    patches.append({
                        "element_id": current["element_id"],
                        "left": round(current["left"], 2),
                        "top": round(expected_top, 2),
                    })

            if not patches:
                continue
            suggestion = _group(
                group_id=f"spacing-{page}-{column_index}",
                title=f"Ujednolić odstępy pionowe na stronie {page}",
                reason="Powtarzające się bloki treści w jednej kolumnie mają niewielkie, niespójne odstępy pionowe.",
                severity="low",
                patches=patches,
                items=items,
                page_width=page_width,
                page_height=page_height,
            )
            if suggestion:
                groups.append(suggestion)
    return groups


def _overlap_issues(items: list[dict[str, Any]]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    for index, first in enumerate(items):
        for second in items[index + 1:]:
            if first["page"] == second["page"] and _rects_overlap(first, second):
                issues.append({
                    "severity": "warning",
                    "message": (
                        f"Dwa elementy treści nakładają się na stronie {first['page']}. "
                        "Ich zamierzona kolejność jest niejednoznaczna, dlatego nie zaproponowano automatycznego przesunięcia."
                    ),
                })
    return issues


def analyze_layout(elements: list[dict[str, Any]], page_size: dict[str, Any] | None) -> dict[str, Any]:
    """Return safe, reviewable correction groups and non-destructive findings."""
    page_size = page_size or {}
    page_width = _number(page_size.get("width"), 595.0)
    page_height = _number(page_size.get("height"), 842.0)
    if page_width <= 0 or page_height <= 0:
        raise ValueError("page_size musi zawierać dodatnie wartości width i height.")

    items = extract_bounds(elements, AUTO_LAYOUT_CATEGORIES)
    if not items:
        return {
            "message": "Potrzebuję co najmniej jednego mierzalnego bloku tekstu lub obrazu, aby ocenić układ.",
            "rating": None,
            "tips": [],
            "corrections": [],
            "layout_groups": [],
            "layout_issues": [],
            "web_sources": [],
        }

    groups, changed_ids, issues = _bounds_groups(items, page_width, page_height)
    groups.extend(_alignment_groups(items, changed_ids, page_width, page_height))
    groups.extend(_spacing_groups(items, changed_ids, page_width, page_height))
    issues.extend(_overlap_issues(items))

    if groups:
        n = len(groups)
        if n == 1:
            message = "Znalazłem 1 bezpieczną grupę korekty układu. Podglądaj grupę przed zastosowaniem."
        elif 2 <= n <= 4:
            message = f"Znalazłem {n} bezpieczne grupy korekty układu. Podglądaj grupę przed zastosowaniem."
        else:
            message = f"Znalazłem {n} bezpiecznych grup korekty układu. Podglądaj grupę przed zastosowaniem."
    elif issues:
        message = "Wykryto problemy z układem wymagające ręcznej weryfikacji; brak bezpiecznej automatycznej korekty."
    else:
        message = "Wymierzalna treść mieści się w granicach i jest spójnie wyrównana."

    return {
        "message": message,
        "rating": None,
        "tips": [
            "Korekty układu przesuwają tylko treść; dekoracyjne linie, prostokąty i łączniki pozostają na miejscu.",
            "Nakładające się elementy o niejasnej intencji są zgłaszane do weryfikacji zamiast automatycznego przesuwania.",
        ],
        "corrections": [],
        "layout_groups": groups,
        "layout_issues": issues[:8],
        "web_sources": [],
    }


# ── GPT-directed position operations ────────────────────────────────────────
# GPT selects an operation type, target element ids, and parameters — never a
# coordinate. Everything below computes and validates the actual left/top
# values from the elements' real current bounds, reusing the same
# _group/_is_safe_group safety net the deterministic scanner above uses.

_MIN_DISTRIBUTE_TARGETS = MIN_CLUSTER_SIZE
_VALID_OPERATIONS = {"shift", "align", "distribute", "space", "move_to_page"}
_VALID_AXES = {"x", "y"}
_VALID_ANCHORS = {"start", "center", "end"}
_NO_CHANGE = "no_change"


def resolve_shift(
    items: list[dict[str, Any]],
    target_ids: set[str],
    dx: float,
    dy: float,
    page_width: float,
    page_height: float,
) -> dict[str, Any] | str | None:
    targets = [item for item in items if item["element_id"] in target_ids]
    if not targets:
        return None
    if abs(dx) <= EPSILON and abs(dy) <= EPSILON:
        return _NO_CHANGE

    patches = [
        {
            "element_id": item["element_id"],
            "left": round(item["left"] + dx, 2),
            "top": round(item["top"] + dy, 2),
        }
        for item in targets
    ]
    return _group(
        group_id="directed-shift",
        title=f"Przesuń {len(targets)} {'element' if len(targets) == 1 else 'elementy'}",
        reason="Bezpośrednie polecenie przesunięcia elementów.",
        severity="review",
        patches=patches,
        items=items,
        page_width=page_width,
        page_height=page_height,
        allow_overlap=True,
    )


def resolve_align(
    items: list[dict[str, Any]],
    target_ids: set[str],
    axis: str,
    anchor: str,
    target: float | None,
    page_width: float,
    page_height: float,
) -> dict[str, Any] | str | None:
    targets = [item for item in items if item["element_id"] in target_ids]
    if not targets:
        return None

    size_key = "width" if axis == "x" else "height"
    pos_key = "left" if axis == "x" else "top"

    def anchor_value(item: dict[str, Any]) -> float:
        if anchor == "start":
            return item[pos_key]
        if anchor == "center":
            return item[pos_key] + item[size_key] / 2
        return item[pos_key] + item[size_key]

    def offset_for(item: dict[str, Any]) -> float:
        if anchor == "start":
            return 0.0
        if anchor == "center":
            return item[size_key] / 2
        return item[size_key]

    value = target if target is not None else median(anchor_value(item) for item in targets)

    patches = []
    for item in targets:
        new_pos = round(value - offset_for(item), 2)
        if abs(new_pos - item[pos_key]) <= EPSILON:
            continue
        patches.append({
            "element_id": item["element_id"],
            "left": new_pos if axis == "x" else round(item["left"], 2),
            "top": new_pos if axis == "y" else round(item["top"], 2),
        })

    if not patches:
        return _NO_CHANGE

    return _group(
        group_id="directed-align",
        title=f"Wyrównaj {len(targets)} {'element' if len(targets) == 1 else 'elementy'}",
        reason="Bezpośrednie polecenie wyrównania elementów.",
        severity="review",
        patches=patches,
        items=items,
        page_width=page_width,
        page_height=page_height,
        allow_overlap=True,
    )


def resolve_distribute(
    items: list[dict[str, Any]],
    target_ids: set[str],
    axis: str,
    page_width: float,
    page_height: float,
) -> dict[str, Any] | str | None:
    targets = [item for item in items if item["element_id"] in target_ids]
    if len(targets) < _MIN_DISTRIBUTE_TARGETS:
        return None

    pos_key = "left" if axis == "x" else "top"
    size_key = "width" if axis == "x" else "height"
    ordered = sorted(targets, key=lambda item: item[pos_key])

    first, last = ordered[0], ordered[-1]
    total_span = (last[pos_key] + last[size_key]) - first[pos_key]
    total_size = sum(item[size_key] for item in ordered)
    gap_count = len(ordered) - 1
    gap = (total_span - total_size) / gap_count

    if gap < 0:
        return None

    patches = []
    cursor = first[pos_key] + first[size_key] + gap
    for item in ordered[1:-1]:
        new_pos = round(cursor, 2)
        if abs(new_pos - item[pos_key]) > EPSILON:
            patches.append({
                "element_id": item["element_id"],
                "left": new_pos if axis == "x" else round(item["left"], 2),
                "top": new_pos if axis == "y" else round(item["top"], 2),
            })
        cursor += item[size_key] + gap

    if not patches:
        return _NO_CHANGE

    return _group(
        group_id="directed-distribute",
        title=f"Rozłóż równomiernie {len(targets)} elementów",
        reason="Bezpośrednie polecenie równomiernego rozłożenia odstępów.",
        severity="review",
        patches=patches,
        items=items,
        page_width=page_width,
        page_height=page_height,
        allow_overlap=True,
    )


def resolve_space(
    items: list[dict[str, Any]],
    target_ids: set[str],
    axis: str,
    gap: float,
    page_width: float,
    page_height: float,
) -> dict[str, Any] | str | None:
    """Set an exact edge-to-edge gap while holding the first target in place."""
    targets = [item for item in items if item["element_id"] in target_ids]
    if len(targets) < 2 or gap < 0:
        return None

    pos_key = "left" if axis == "x" else "top"
    size_key = "width" if axis == "x" else "height"
    ordered = sorted(targets, key=lambda item: item[pos_key])

    patches = []
    cursor = ordered[0][pos_key] + ordered[0][size_key] + gap
    for item in ordered[1:]:
        new_pos = round(cursor, 2)
        if abs(new_pos - item[pos_key]) > EPSILON:
            patches.append({
                "element_id": item["element_id"],
                "left": new_pos if axis == "x" else round(item["left"], 2),
                "top": new_pos if axis == "y" else round(item["top"], 2),
            })
        cursor = new_pos + item[size_key] + gap

    if not patches:
        return _NO_CHANGE

    return _group(
        group_id="directed-space",
        title=f"Ustaw odstępy {gap:g}px między {len(targets)} elementami",
        reason=f"Bezpośrednie polecenie ustawienia stałego odstępu {gap:g}px.",
        severity="review",
        patches=patches,
        items=items,
        page_width=page_width,
        page_height=page_height,
        allow_overlap=True,
    )


def resolve_move_to_page(
    items: list[dict[str, Any]],
    target_ids: set[str],
    target_page: int,
    reference_element_id: str | None,
    align_ids: set[str],
    axis: str,
    anchor: str,
    page_width: float,
    page_height: float,
) -> dict[str, Any] | str | None:
    """Move related elements to another page and align selected members.

    All moved elements keep their current coordinates unless listed in
    ``align_ids``. Those members align to the reference element's requested
    edge/center while retaining their coordinate on the other axis.
    """
    items_by_id = {item["element_id"]: item for item in items}
    moving_ids = target_ids | align_ids
    moving = [item for item in items if item["element_id"] in moving_ids]
    if not target_ids or not moving or target_page < 1:
        return None
    if any(item.get("fixedToPage") for item in moving):
        return None

    reference = items_by_id.get(str(reference_element_id)) if reference_element_id else None
    if reference is None:
        reference = next((item for item in moving if item["element_id"] in target_ids), None)
    if reference is None or (
        reference["element_id"] not in moving_ids and reference["page"] != target_page
    ):
        return None

    pos_key = "left" if axis == "x" else "top"
    size_key = "width" if axis == "x" else "height"

    def anchor_value(item: dict[str, Any]) -> float:
        if anchor == "start":
            return item[pos_key]
        if anchor == "center":
            return item[pos_key] + item[size_key] / 2
        return item[pos_key] + item[size_key]

    def anchor_offset(item: dict[str, Any]) -> float:
        if anchor == "start":
            return 0.0
        if anchor == "center":
            return item[size_key] / 2
        return item[size_key]

    reference_value = anchor_value(reference)
    patches: list[dict[str, Any]] = []
    for item in moving:
        left = item["left"]
        top = item["top"]
        if item["element_id"] in align_ids and item["element_id"] != reference["element_id"]:
            aligned_position = round(reference_value - anchor_offset(item), 2)
            if axis == "x":
                left = aligned_position
            else:
                top = aligned_position
        patches.append({
            "element_id": item["element_id"],
            "left": round(left, 2),
            "top": round(top, 2),
            "page": target_page,
        })

    if (
        axis == "x"
        and reference["page"] == target_page
        and reference["element_id"] not in moving_ids
        and any(item["page"] != target_page for item in moving)
    ):
        proposed_moving = [
            item
            for item in _apply_patches(items, patches)
            if item["element_id"] in moving_ids
        ]
        moving_bbox = _block_bbox(proposed_moving)
        if moving_bbox is not None:
            vertical_shift = reference["top"] + reference["height"] + 4 - moving_bbox["top"]
            patches = [
                {**patch, "top": round(patch["top"] + vertical_shift, 2)}
                for patch in patches
            ]

    if all(
        item["page"] == target_page
        and abs(patch["left"] - item["left"]) <= EPSILON
        and abs(patch["top"] - item["top"]) <= EPSILON
        for item, patch in (
            (items_by_id[patch["element_id"]], patch)
            for patch in patches
        )
    ):
        return _NO_CHANGE

    # Moving content must not land on unrelated content. Page-fixed artwork
    # and line/rectangle decorations are ignored because they intentionally
    # sit behind or around the document's text.
    original_overlaps = {
        frozenset((first["element_id"], second["element_id"]))
        for index, first in enumerate(items)
        for second in items[index + 1:]
        if first["page"] == second["page"] and _rects_overlap(first, second)
    }

    def has_content_collision(proposed_items: list[dict[str, Any]]) -> bool:
        for moved in (item for item in proposed_items if item["element_id"] in moving_ids):
            for other in proposed_items:
                if moved["element_id"] == other["element_id"] or moved["page"] != other["page"]:
                    continue
                if other.get("fixedToPage") or other["category"] in DECORATIVE_CATEGORIES:
                    continue
                if not _rects_overlap(moved, other):
                    continue
                pair = frozenset((moved["element_id"], other["element_id"]))
                if other["element_id"] not in moving_ids or pair not in original_overlaps:
                    return True
        return False

    proposed = _apply_patches(items, patches)
    if has_content_collision(proposed):
        # A cross-page command normally carries no raw coordinates. Keeping
        # the source page's `top` can therefore put the element directly on
        # top of destination content. For horizontal alignment operations,
        # search deterministic free slots in the same column instead.
        if axis != "x" or all(item["page"] == target_page for item in moving):
            return None

        proposed_moving = [
            item for item in proposed if item["element_id"] in moving_ids
        ]
        moving_bbox = _block_bbox(proposed_moving)
        if moving_bbox is None:
            return None

        def overlaps_moving_column(item: dict[str, Any]) -> bool:
            return (
                item["left"] < moving_bbox["left"] + moving_bbox["width"] - EPSILON
                and item["left"] + item["width"] > moving_bbox["left"] + EPSILON
            )

        destination_content = [
            item
            for item in items
            if item["page"] == target_page
            and item["element_id"] not in moving_ids
            and not item.get("fixedToPage")
            and item["category"] not in DECORATIVE_CATEGORIES
            and overlaps_moving_column(item)
        ]

        # Fixed footer rules/page numbers define the usable lower boundary.
        # Full-page backgrounds are intentionally ignored.
        footer_tops = [
            item["top"]
            for item in items
            if item["page"] == target_page
            and item.get("fixedToPage")
            and item["top"] > page_height / 2
            and overlaps_moving_column(item)
            and not (
                item["width"] >= page_width * 0.9
                and item["height"] >= page_height * 0.9
            )
        ]
        usable_bottom = min(footer_tops, default=page_height)

        preferred_candidates: list[float] = []
        if reference["page"] == target_page and reference["element_id"] not in moving_ids:
            preferred_candidates.append(reference["top"] + reference["height"] + 4)
        slot_candidates = sorted(
            {
                0.0,
                *(
                    round(item["top"] + item["height"] + 4, 2)
                    for item in destination_content
                ),
            },
            reverse=True,
        )

        placed = False
        for candidate_top in preferred_candidates + slot_candidates:
            vertical_shift = candidate_top - moving_bbox["top"]
            shifted_patches = [
                {**patch, "top": round(patch["top"] + vertical_shift, 2)}
                for patch in patches
            ]
            shifted_bottom = moving_bbox["top"] + vertical_shift + moving_bbox["height"]
            if candidate_top < -EPSILON or shifted_bottom > usable_bottom + EPSILON:
                continue
            shifted_proposed = _apply_patches(items, shifted_patches)
            if has_content_collision(shifted_proposed):
                continue
            patches = shifted_patches
            proposed = shifted_proposed
            placed = True
            break
        if not placed:
            return None

    group = _group(
        group_id="directed-move-to-page",
        title=f"Przenieś {len(moving)} {'element' if len(moving) == 1 else 'elementy'} na stronę {target_page}",
        reason="Przeniesienie elementów między stronami z zachowaniem układu i wskazanego wyrównania.",
        severity="review",
        patches=patches,
        items=items,
        page_width=page_width,
        page_height=page_height,
        allow_overlap=True,
    )
    if group is not None:
        group["target_page"] = target_page
    return group


def _block_bbox(members: list[dict[str, Any]]) -> dict[str, float] | None:
    """Union bounding box of a block's member elements — the block moves as
    this single rigid shape; members keep their position relative to it."""
    if not members:
        return None
    left = min(m["left"] for m in members)
    top = min(m["top"] for m in members)
    right = max(m["left"] + m["width"] for m in members)
    bottom = max(m["top"] + m["height"] for m in members)
    return {"left": left, "top": top, "width": right - left, "height": bottom - top}


def _resolve_block_operation(
    items: list[dict[str, Any]],
    op_type: str,
    directive: dict[str, Any],
    raw_groups: list[Any],
    page_width: float,
    page_height: float,
) -> dict[str, Any]:
    """Adapter: treat each group of element ids as one rigid block by
    building a synthetic item for its union bounding box, running the exact
    same per-item resolver used for flat targets against those synthetic
    items, then expanding the resulting block-level patch into one patch
    per real member — a pure translation that preserves each member's
    position relative to the others in its block."""

    def _issue(message: str) -> dict[str, Any]:
        return {"layout_groups": [], "layout_issues": [{"severity": "warning", "message": message}]}

    items_by_id = {item["element_id"]: item for item in items}
    block_items: list[dict[str, Any]] = []
    block_members: dict[str, list[dict[str, Any]]] = {}

    for index, raw_ids in enumerate(raw_groups):
        if not isinstance(raw_ids, list):
            continue
        members = [items_by_id[str(mid)] for mid in raw_ids if str(mid) in items_by_id]
        if not members:
            continue
        if len({m["page"] for m in members}) > 1:
            return _issue(
                "Jeden ze wskazanych bloków obejmuje elementy z różnych stron — nie mogę wykonać "
                "tej operacji na blokach rozdzielonych między strony."
            )
        bbox = _block_bbox(members)
        block_id = f"__block_{index}__"
        block_items.append({
            "element_id": block_id,
            "category": "block",
            "page": members[0]["page"],
            **bbox,
        })
        block_members[block_id] = members

    if not block_items:
        return _issue("Nie znaleziono wskazanych elementów na kanwie.")
    if len({b["page"] for b in block_items}) > 1:
        return _issue(
            "Wskazane bloki znajdują się na różnych stronach — nie mogę wykonać tej operacji między stronami."
        )

    block_target_ids = {b["element_id"] for b in block_items}
    if op_type == "shift":
        dx = _number(directive.get("dx"), 0.0)
        dy = _number(directive.get("dy"), 0.0)
        group = resolve_shift(block_items, block_target_ids, dx, dy, page_width, page_height)
    elif op_type == "align":
        axis = directive.get("axis") if directive.get("axis") in _VALID_AXES else "x"
        anchor = directive.get("anchor") if directive.get("anchor") in _VALID_ANCHORS else "start"
        raw_target = directive.get("target")
        target = _number(raw_target) if raw_target is not None else None
        group = resolve_align(block_items, block_target_ids, axis, anchor, target, page_width, page_height)
    elif op_type == "distribute":
        axis = directive.get("axis") if directive.get("axis") in _VALID_AXES else "y"
        group = resolve_distribute(block_items, block_target_ids, axis, page_width, page_height)
    else:
        axis = directive.get("axis") if directive.get("axis") in _VALID_AXES else "y"
        gap = _number(directive.get("gap"), -1.0)
        group = resolve_space(block_items, block_target_ids, axis, gap, page_width, page_height)

    if group == _NO_CHANGE:
        return {
            "layout_groups": [],
            "layout_issues": [{
                "severity": "low",
                "message": "Wskazane bloki już spełniają żądaną pozycję — nie ma czego zmieniać.",
            }],
        }
    if group is None:
        return _issue(
            "Nie można bezpiecznie wykonać tego polecenia — zmiana wyszłaby poza stronę "
            "lub bloki nie mieszczą się w wybranym układzie."
        )

    block_by_id = {b["element_id"]: b for b in block_items}
    expanded_patches = []
    for patch in group["patches"]:
        source_block = block_by_id[patch["element_id"]]
        dx_block = patch["left"] - source_block["left"]
        dy_block = patch["top"] - source_block["top"]
        for member in block_members[patch["element_id"]]:
            expanded_patches.append({
                "element_id": member["element_id"],
                "left": round(member["left"] + dx_block, 2),
                "top": round(member["top"] + dy_block, 2),
            })

    final_group = _group(
        group_id=group["id"],
        title=group["title"],
        reason=group["reason"],
        severity=group["severity"],
        patches=expanded_patches,
        items=items,
        page_width=page_width,
        page_height=page_height,
        allow_overlap=True,
    )
    if final_group is None:
        return _issue("Nie można bezpiecznie wykonać tego polecenia — zmiana wyszłaby poza stronę.")
    return {"layout_groups": [final_group], "layout_issues": []}


def resolve_directed_operation(
    elements: list[dict[str, Any]],
    directive: dict[str, Any],
    page_size: dict[str, Any] | None,
) -> dict[str, Any]:
    """Resolve one GPT-selected position directive into a safe, previewable
    layout group, or an explanation of why it can't be applied. GPT never
    supplies a coordinate — only an operation type, target element ids (or
    target_groups of ids for a multi-element block), and parameters; every
    actual left/top value is computed and validated here."""
    page_size = page_size or {}
    page_width = _number(page_size.get("width"), 595.0)
    page_height = _number(page_size.get("height"), 842.0)

    items = extract_bounds(elements)
    op_type = directive.get("type") if isinstance(directive, dict) else None

    def _issue(message: str) -> dict[str, Any]:
        return {"layout_groups": [], "layout_issues": [{"severity": "warning", "message": message}]}

    if op_type not in _VALID_OPERATIONS:
        return _issue("Nie rozpoznano poprawnego polecenia dotyczącego pozycji elementów.")

    raw_ids = directive.get("target_element_ids") if isinstance(directive, dict) else None
    raw_groups = directive.get("target_groups") if isinstance(directive, dict) else None
    if op_type == "move_to_page":
        target_ids = {str(i) for i in raw_ids} if isinstance(raw_ids, list) else set()
        if isinstance(raw_groups, list):
            target_ids.update(
                str(element_id)
                for group in raw_groups
                if isinstance(group, list)
                for element_id in group
            )
        align_raw = directive.get("align_element_ids")
        align_ids = {str(i) for i in align_raw} if isinstance(align_raw, list) else set()
        requested_ids = target_ids | align_ids
        known_ids = {item["element_id"] for item in items}
        if not target_ids or not requested_ids.issubset(known_ids):
            return _issue("Nie znaleziono wszystkich elementów wskazanych do przeniesienia lub wyrównania.")

        raw_target_page = directive.get("target_page")
        target_page_number = _number(raw_target_page, -1.0)
        target_page = int(target_page_number)
        max_page = max((item["page"] for item in items), default=1)
        if (
            isinstance(raw_target_page, bool)
            or target_page_number != target_page
            or target_page < 1
            or target_page > max_page + 1
        ):
            return _issue(
                f"Strona docelowa musi mieć numer od 1 do {max_page + 1}."
            )

        axis = directive.get("axis") if directive.get("axis") in _VALID_AXES else "x"
        anchor = directive.get("anchor") if directive.get("anchor") in _VALID_ANCHORS else "start"
        reference_id = directive.get("reference_element_id")
        if reference_id is not None and str(reference_id) not in known_ids:
            return _issue("Nie znaleziono elementu referencyjnego używanego do wyrównania.")

        group = resolve_move_to_page(
            items,
            target_ids,
            target_page,
            str(reference_id) if reference_id is not None else None,
            align_ids,
            axis,
            anchor,
            page_width,
            page_height,
        )
        if group == _NO_CHANGE:
            return {
                "layout_groups": [],
                "layout_issues": [{
                    "severity": "low",
                    "message": "Wskazane elementy są już na stronie docelowej i mają żądane wyrównanie.",
                }],
            }
        if group is None:
            return _issue(
                "Nie można bezpiecznie przenieść elementów — nie mieszczą się na stronie docelowej "
                "lub kolidowałyby z istniejącą treścią."
            )
        return {"layout_groups": [group], "layout_issues": []}

    if isinstance(raw_groups, list) and raw_groups:
        # A single group with `space` means spacing its own members (such as
        # role, employer/date, and description within one work-history entry).
        # Multiple groups still mean rigid blocks that receive gaps between them.
        if op_type == "space" and len(raw_groups) == 1 and isinstance(raw_groups[0], list):
            raw_ids = raw_groups[0]
        else:
            return _resolve_block_operation(items, op_type, directive, raw_groups, page_width, page_height)

    target_ids = {str(i) for i in raw_ids} if isinstance(raw_ids, list) else set()
    if not target_ids:
        return _issue("Nie rozpoznano poprawnego polecenia dotyczącego pozycji elementów.")

    targets = [item for item in items if item["element_id"] in target_ids]
    if not targets:
        return _issue("Nie znaleziono wskazanych elementów na kanwie.")
    if len({item["page"] for item in targets}) > 1:
        return _issue(
            "Wskazane elementy znajdują się na różnych stronach — nie mogę wykonać tej operacji między stronami."
        )

    if op_type == "shift":
        dx = _number(directive.get("dx"), 0.0)
        dy = _number(directive.get("dy"), 0.0)
        group = resolve_shift(items, target_ids, dx, dy, page_width, page_height)
    elif op_type == "align":
        axis = directive.get("axis") if directive.get("axis") in _VALID_AXES else "x"
        anchor = directive.get("anchor") if directive.get("anchor") in _VALID_ANCHORS else "start"
        raw_target = directive.get("target")
        target = _number(raw_target) if raw_target is not None else None
        group = resolve_align(items, target_ids, axis, anchor, target, page_width, page_height)
    elif op_type == "distribute":
        axis = directive.get("axis") if directive.get("axis") in _VALID_AXES else "y"
        group = resolve_distribute(items, target_ids, axis, page_width, page_height)
    else:
        axis = directive.get("axis") if directive.get("axis") in _VALID_AXES else "y"
        gap = _number(directive.get("gap"), -1.0)
        group = resolve_space(items, target_ids, axis, gap, page_width, page_height)

    if group == _NO_CHANGE:
        return {
            "layout_groups": [],
            "layout_issues": [{
                "severity": "low",
                "message": "Wskazane elementy już spełniają żądaną pozycję — nie ma czego zmieniać.",
            }],
        }
    if group is None:
        return _issue(
            "Nie można bezpiecznie wykonać tego polecenia — zmiana wyszłaby poza stronę "
            "lub elementy nie mieszczą się w wybranym układzie."
        )
    return {"layout_groups": [group], "layout_issues": []}
