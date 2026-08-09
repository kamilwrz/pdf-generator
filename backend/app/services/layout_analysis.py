"""Safe, deterministic geometry helpers for chat-directed canvas edits.

The assistant may describe findings, but this module is the sole authority for
layout coordinates used by chat ``position_operation`` / structure / clone /
delete resolvers. That prevents an LLM from inventing positions that cause
overlaps or break a template's decorative elements.
"""
from __future__ import annotations

import math
import re
from collections import defaultdict
from statistics import median
from typing import Any


# Automatic layout analysis deliberately excludes decorations. Explicit AI
# commands may target them, however, so their bounds need a broader category
# set than the scanner uses.
AUTO_LAYOUT_CATEGORIES = {"text", "textarea", "image"}
DIRECTED_POSITION_CATEGORIES = AUTO_LAYOUT_CATEGORIES | {"line", "rectangle", "circle", "ellipse"}
DECORATIVE_CATEGORIES = {"line", "rectangle", "circle", "ellipse", "connector"}
MAX_SNAP_DISTANCE = 12.0
MAX_SAFE_SNAP_MOVE = 18.0
MAX_SAFE_BOUNDS_MOVE = 96.0
MIN_CLUSTER_SIZE = 3
EPSILON = 0.5
# Match cv_generator SPACE_RECORD (+ slack): gap when unstacking overlapping content.
STACK_CONTENT_GAP = 14.0
# Match cv_generator SPACE_STACK: gap after a section rule before body text.
STACK_CHROME_GAP = 4.0
CLIP_HEIGHT_EPSILON = 1.0
STACK_RESOLVE_PASSES = 64
_SEVERITY_RANK = {
    "critical": 0,
    "high": 1,
    "medium": 2,
    "review": 3,
    "low": 4,
    "warning": 5,
}


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

    # Prefer an explicit frontend measurement of scroll/content height. Do not
    # invent clip findings from wrap estimates for every textarea — short boxes
    # with short labels would otherwise always look "clipped" and suppress
    # cosmetic alignment. Estimate only when the client marked the element as
    # clipped/unmeasured or already provided content_height.
    reported_content_height = _number(element.get("content_height"), 0.0)
    clipped_flag = bool(element.get("clipped", False))
    if (
        category == "textarea"
        and reported_content_height <= 0
        and (clipped_flag or bool(element.get("bounds_estimated", False)))
    ):
        reported_content_height = _wrapped_textarea_height(
            {
                "fontSize": element.get("fontSize"),
                "lineHeight": element.get("lineHeight"),
                "content": element.get("content"),
            },
            width,
        )
    if (
        not clipped_flag
        and category == "textarea"
        and reported_content_height > height + CLIP_HEIGHT_EPSILON
        and (
            element.get("content_height") is not None
            or bool(element.get("clipped", False))
            or bool(element.get("bounds_estimated", False))
        )
    ):
        clipped_flag = True

    return {
        "element_id": str(element_id),
        "category": category,
        "page": max(1, int(_number(element.get("page"), 1))),
        "fixedToPage": bool(element.get("fixedToPage", False)),
        "locked": bool(element.get("locked", False)),
        "content": str(element.get("content") or ""),
        "fontSize": _number(element.get("fontSize"), 12.0),
        "lineHeight": _number(element.get("lineHeight"), _number(element.get("fontSize"), 12.0) * 1.35),
        "zIndex": int(_number(element.get("zIndex"), 0)),
        "left": _number(measured.get("left", element.get("left"))),
        "top": _number(measured.get("top", element.get("top"))),
        "width": width,
        "height": height,
        "content_height": reported_content_height,
        "clipped": clipped_flag,
        "bounds_estimated": bool(element.get("bounds_estimated", False)),
        "flowRole": str(element.get("flowRole") or ""),
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
            **({"width": by_id[item["element_id"]]["width"]} if item["element_id"] in by_id and "width" in by_id[item["element_id"]] else {}),
            **({"height": by_id[item["element_id"]]["height"]} if item["element_id"] in by_id and "height" in by_id[item["element_id"]] else {}),
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
            # Cascading normalize: each item is measured against the already-corrected
            # previous top so a single outlier does not leave the rest of the column uneven.
            for previous, current in zip(column, column[1:]):
                expected_top += previous["height"] + target_gap
                # Prefer the patched previous top when we already adjusted it.
                prev_patch = next(
                    (p for p in patches if p["element_id"] == previous["element_id"]),
                    None,
                )
                if prev_patch is not None:
                    expected_top = prev_patch["top"] + previous["height"] + target_gap
                distance = abs(current["top"] - expected_top)
                # Allow a larger correction than generic snaps — this is still a
                # median-gap normalize within one column, not a free redesign.
                if EPSILON < distance <= max(MAX_SAFE_SNAP_MOVE, target_gap):
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


def _same_column(first: dict[str, Any], second: dict[str, Any]) -> bool:
    """True when two boxes share a horizontal lane (same column)."""
    return (
        first["left"] + first["width"] > second["left"] + EPSILON
        and second["left"] + second["width"] > first["left"] + EPSILON
    )


def _document_top(item: dict[str, Any], page_height: float) -> float:
    return (item["page"] - 1) * page_height + item["top"]


def _stack_sort_key(item: dict[str, Any], page_height: float) -> tuple[float, int, str]:
    # Document order: earlier top first; higher zIndex stays above on ties.
    return (_document_top(item, page_height), -int(item.get("zIndex", 0)), str(item["element_id"]))


def _is_movable_content(item: dict[str, Any]) -> bool:
    return (
        item.get("category") in AUTO_LAYOUT_CATEGORIES
        and not item.get("locked")
        and not item.get("fixedToPage")
    )


def _content_bottom_margin(page_height: float) -> float:
    return page_height - _content_bottom(page_height)


def _place_below(
    upper: dict[str, Any],
    mover: dict[str, Any],
    page_height: float,
    gap: float,
) -> tuple[int, float]:
    """Place ``mover`` just below ``upper`` with page-aware wrapping."""
    absolute = _document_top(upper, page_height) + upper["height"] + gap
    page, top, _ = _structure_page_position(
        absolute,
        mover["height"],
        page_height,
        page_top=36.0,
        bottom_margin=_content_bottom_margin(page_height),
    )
    return page, top


def _working_copy(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [dict(item) for item in items]


def _patches_from_diff(
    original: list[dict[str, Any]],
    proposed: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    original_by_id = {item["element_id"]: item for item in original}
    patches: list[dict[str, Any]] = []
    for item in proposed:
        source = original_by_id.get(item["element_id"])
        if source is None:
            continue
        changed = (
            abs(item["left"] - source["left"]) > EPSILON
            or abs(item["top"] - source["top"]) > EPSILON
            or abs(item["height"] - source["height"]) > EPSILON
            or abs(item.get("width", source["width"]) - source["width"]) > EPSILON
            or item["page"] != source["page"]
        )
        if not changed:
            continue
        patch: dict[str, Any] = {
            "element_id": item["element_id"],
            "left": round(item["left"], 2),
            "top": round(item["top"], 2),
        }
        if abs(item["height"] - source["height"]) > EPSILON:
            patch["height"] = round(item["height"], 2)
        if abs(item.get("width", source["width"]) - source["width"]) > EPSILON:
            patch["width"] = round(item["width"], 2)
        if item["page"] != source["page"]:
            patch["page"] = item["page"]
        patches.append(patch)
    return patches


def _resolve_content_overlaps(
    working: list[dict[str, Any]],
    page_height: float,
) -> bool:
    """Push lower movable content below upper neighbors until overlaps clear.

    Returns False when a remaining overlap involves only immovable elements.
    """
    for _ in range(STACK_RESOLVE_PASSES):
        ordered = sorted(working, key=lambda item: _stack_sort_key(item, page_height))
        blocking: tuple[dict[str, Any], dict[str, Any]] | None = None
        for index, first in enumerate(ordered):
            if first.get("category") not in AUTO_LAYOUT_CATEGORIES:
                continue
            for second in ordered[index + 1:]:
                if second.get("category") not in AUTO_LAYOUT_CATEGORIES:
                    continue
                if first["page"] != second["page"] or not _rects_overlap(first, second):
                    continue
                if not _same_column(first, second):
                    continue
                blocking = (first, second)
                break
            if blocking is not None:
                break
        if blocking is None:
            return True

        upper, lower = sorted(blocking, key=lambda item: _stack_sort_key(item, page_height))
        if _is_movable_content(lower):
            mover = lower
            anchor = upper
        elif _is_movable_content(upper):
            # Unusual: lower item is locked/fixed. Pull the upper block above it
            # by stacking the movable one just above the immovable lower edge —
            # still deterministic and better than leaving a crush.
            mover = upper
            target_abs = _document_top(lower, page_height) - mover["height"] - STACK_CONTENT_GAP
            page, top, _ = _structure_page_position(
                max(0.0, target_abs),
                mover["height"],
                page_height,
                page_top=36.0,
                bottom_margin=_content_bottom_margin(page_height),
            )
            if page == mover["page"] and abs(top - mover["top"]) <= EPSILON:
                return False
            mover["page"] = page
            mover["top"] = top
            continue
        else:
            return False

        page, top = _place_below(anchor, mover, page_height, STACK_CONTENT_GAP)
        if page == mover["page"] and abs(top - mover["top"]) <= EPSILON:
            # Already at the required slot but still overlapping — grow gap once.
            page, top = _place_below(anchor, mover, page_height, STACK_CONTENT_GAP + STACK_CHROME_GAP)
            if page == mover["page"] and abs(top - mover["top"]) <= EPSILON:
                return False
        mover["page"] = page
        mover["top"] = top
    return False


def _stack_resolve_overlap_groups(
    items: list[dict[str, Any]],
    page_width: float,
    page_height: float,
) -> tuple[list[dict[str, Any]], set[str], list[dict[str, str]]]:
    """Critical groups that unstack overlapping content in document order."""
    issues: list[dict[str, str]] = []
    overlap_pairs = [
        (first, second)
        for index, first in enumerate(items)
        for second in items[index + 1:]
        if (
            first["page"] == second["page"]
            and _same_column(first, second)
            and _rects_overlap(first, second)
        )
    ]
    if not overlap_pairs:
        return [], set(), issues

    working = _working_copy(items)
    resolved = _resolve_content_overlaps(working, page_height)
    patches = _patches_from_diff(items, working)
    if not patches:
        for first, second in overlap_pairs:
            issues.append({
                "severity": "warning",
                "message": (
                    f"Dwa elementy treści nakładają się na stronie {first['page']} "
                    f"({first['element_id']}, {second['element_id']}), ale nie można ich "
                    "automatycznie rozsunąć — sprawdź elementy zablokowane lub przypięte do strony."
                ),
            })
        return [], set(), issues

    suggestion = _group(
        group_id="stack-resolve-overlaps",
        title="Rozsuń nachodzące bloki treści",
        reason=(
            "Elementy treści nachodzą na siebie. Zostaną ułożone w kolejności od góry "
            f"z odstępem {STACK_CONTENT_GAP:g} px; w razie potrzeby treść przejdzie na następną stronę."
        ),
        severity="critical",
        patches=patches,
        items=items,
        page_width=page_width,
        page_height=page_height,
    )
    if suggestion is None:
        for first, second in overlap_pairs:
            issues.append({
                "severity": "warning",
                "message": (
                    f"Dwa elementy treści nakładają się na stronie {first['page']}. "
                    "Automatyczne rozsunięcie nie przeszło walidacji bezpieczeństwa."
                ),
            })
        return [], set(), issues

    if not resolved:
        issues.append({
            "severity": "warning",
            "message": (
                "Część kolizji treści została rozłożona, ale pozostały nakładania z elementami "
                "zablokowanymi lub przypiętymi do strony — wymaga ręcznej korekty."
            ),
        })

    changed = {patch["element_id"] for patch in patches}
    return [suggestion], changed, issues


def _clip_groups(
    items: list[dict[str, Any]],
    page_width: float,
    page_height: float,
    excluded_ids: set[str],
) -> tuple[list[dict[str, Any]], set[str], list[dict[str, str]]]:
    """Grow clipped textareas to content height and reflow neighbors below."""
    groups: list[dict[str, Any]] = []
    changed_ids: set[str] = set()
    issues: list[dict[str, str]] = []

    clipped = [
        item for item in items
        if (
            item["element_id"] not in excluded_ids
            and item.get("category") == "textarea"
            and item.get("clipped")
            and _is_movable_content(item)
            and item.get("content_height", 0) > item["height"] + CLIP_HEIGHT_EPSILON
        )
    ]
    if not clipped:
        return groups, changed_ids, issues

    working = _working_copy(items)
    by_id = {item["element_id"]: item for item in working}
    for item in clipped:
        target = by_id[item["element_id"]]
        new_height = round(min(item["content_height"], page_height - 36.0), 2)
        if new_height <= target["height"] + CLIP_HEIGHT_EPSILON:
            continue
        # Reject growth that cannot fit on any single page.
        if new_height > page_height - 36.0 - _content_bottom_margin(page_height):
            issues.append({
                "severity": "warning",
                "message": (
                    f"Pole tekstu „{(item.get('content') or '')[:40]}” jest ucięte, "
                    "ale pełna treść nie mieści się na jednej stronie — skróć tekst lub podziel ręcznie."
                ),
            })
            continue
        target["height"] = new_height
        # Keep the grown box on-page; if it overflows the bottom, wrap to next page.
        page, top, _ = _structure_page_position(
            _document_top(target, page_height),
            target["height"],
            page_height,
            page_top=36.0,
            bottom_margin=_content_bottom_margin(page_height),
        )
        target["page"] = page
        target["top"] = top

    _resolve_content_overlaps(working, page_height)
    patches = _patches_from_diff(items, working)
    if not patches:
        return groups, changed_ids, issues

    suggestion = _group(
        group_id="clip-expand-textareas",
        title="Dopasuj wysokość uciętych pól tekstu",
        reason=(
            "Treść w textarea jest wyższa niż zapisany prostokąt. "
            "Pola zostaną powiększone, a sąsiedzi w kolumnie przesunięci w dół."
        ),
        severity="critical",
        patches=patches,
        items=items,
        page_width=page_width,
        page_height=page_height,
    )
    if suggestion:
        groups.append(suggestion)
        changed_ids.update(patch["element_id"] for patch in patches)
    return groups, changed_ids, issues


def _is_section_rule(item: dict[str, Any]) -> bool:
    """Heuristic: thin, wide horizontal rules used as section underlines."""
    if item.get("category") != "line":
        return False
    return item["height"] <= 4.0 + EPSILON and item["width"] >= 24.0


def _decoration_collision_groups(
    content_items: list[dict[str, Any]],
    elements: list[dict[str, Any]],
    page_width: float,
    page_height: float,
    excluded_ids: set[str],
) -> tuple[list[dict[str, Any]], set[str], list[dict[str, str]]]:
    """Push content below section rules that cut through text/headings."""
    decorations = extract_bounds(elements, {"line", "rectangle"})
    rules = [item for item in decorations if _is_section_rule(item)]
    if not rules:
        return [], set(), []

    working = _working_copy(content_items)
    moved_any = False

    for rule in rules:
        for item in working:
            if item["element_id"] in excluded_ids or not _is_movable_content(item):
                continue
            if item["page"] != rule["page"] or not _rects_overlap(item, rule):
                continue
            if not _same_column(item, rule):
                continue
            # Content whose top is clearly above the rule and only grazes it can
            # stay; rules cutting through the body/heading must clear below.
            if item["top"] + STACK_CHROME_GAP < rule["top"] and item["top"] + item["height"] <= rule["top"] + rule["height"] + EPSILON:
                continue
            page, top = _place_below(rule, item, page_height, STACK_CHROME_GAP + STACK_CONTENT_GAP)
            if page != item["page"] or abs(top - item["top"]) > EPSILON:
                item["page"] = page
                item["top"] = top
                moved_any = True

    if not moved_any:
        return [], set(), []

    _resolve_content_overlaps(working, page_height)
    patches = _patches_from_diff(content_items, working)
    if not patches:
        return [], set(), []

    suggestion = _group(
        group_id="decoration-clear-rules",
        title="Odsuń treść od linii sekcji",
        reason=(
            "Linia dekoracyjna przecina tekst lub nagłówek. "
            "Treść zostanie przesunięta poniżej linii; stałe tła szablonu pozostają nietknięte."
        ),
        severity="high",
        patches=patches,
        items=content_items,
        page_width=page_width,
        page_height=page_height,
    )
    if suggestion is None:
        return [], set(), [{
            "severity": "warning",
            "message": "Wykryto linię przecinającą treść, ale automatyczna korekta nie przeszła walidacji.",
        }]
    return [suggestion], {patch["element_id"] for patch in patches}, []


def _overlap_issues(
    items: list[dict[str, Any]],
    *,
    unresolved_only: bool = False,
) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    for index, first in enumerate(items):
        for second in items[index + 1:]:
            if first["page"] != second["page"] or not _rects_overlap(first, second):
                continue
            if not _same_column(first, second):
                continue
            if unresolved_only and (_is_movable_content(first) and _is_movable_content(second)):
                # Movable pairs are handled by stack-resolve; only report leftovers.
                continue
            movable = _is_movable_content(first) and _is_movable_content(second)
            issues.append({
                "severity": "warning",
                "message": (
                    f"Dwa elementy treści nakładają się na stronie {first['page']}. "
                    + (
                        "Automatyczne rozsunięcie nie było możliwe."
                        if not movable
                        else "Sprawdź ręcznie, jeśli sugestia rozsunięcia nie wystarczy."
                    )
                ),
            })
    return issues


# ── GPT-directed position operations ────────────────────────────────────────
# GPT selects an operation type, target element ids, and parameters — never a
# coordinate. Everything below computes and validates the actual left/top
# values from the elements' real current bounds, reusing the same
# _group/_is_safe_group safety net the deterministic scanner above uses.

_MIN_DISTRIBUTE_TARGETS = MIN_CLUSTER_SIZE
_VALID_OPERATIONS = {"shift", "align", "distribute", "space", "move_to_page", "move_to_sidebar"}
_VALID_AXES = {"x", "y"}
_VALID_ANCHORS = {"start", "center", "end"}
_NO_CHANGE = "no_change"
# Match cv_generator bottom margin on A4; scale down for tiny test pages.
_CONTENT_BOTTOM_MARGIN_A4 = 72.0
# Soft breathing room before the next content block that ends the region.
_DISTRIBUTE_BREATHING_Y = 8.0
# Cap equal gaps so empty lower page does not explode CV rhythm.
_MAX_DISTRIBUTE_GAP_Y = 56.0


def _content_bottom(page_height: float) -> float:
    """Bottom edge of usable content area for the given page height."""
    margin = min(_CONTENT_BOTTOM_MARGIN_A4, max(4.0, page_height * 0.12))
    return page_height - margin


def _distribution_end_y(
    ordered: list[dict[str, Any]],
    context_items: list[dict[str, Any]],
    page_width: float,
    page_height: float,
    exclude_ids: set[str],
) -> float:
    """Return the Y coordinate that ends the free vertical region for distribute.

    Prefer the top of the next overlapping-column content item below the
    selection; otherwise use the page content bottom. Large fixed frames and
    decorations are ignored so sidebars/backgrounds do not steal the span.
    """
    page = ordered[0]["page"]
    first_top = ordered[0]["top"]
    last = ordered[-1]
    last_bottom = last["top"] + last["height"]
    lane_left = min(item["left"] for item in ordered)
    lane_right = max(item["left"] + item["width"] for item in ordered)
    page_end = _content_bottom(page_height)

    blockers: list[float] = []
    for item in context_items:
        if item["element_id"] in exclude_ids:
            continue
        if item.get("page") != page:
            continue
        if item.get("fixedToPage") or item.get("locked"):
            continue
        category = item.get("category")
        if category in DECORATIVE_CATEGORIES or category == "block":
            # Ignore synthetic blocks and decorations; only real content
            # (text/textarea/image) should close the distribution region.
            continue
        if category not in AUTO_LAYOUT_CATEGORIES:
            continue
        # Different column — do not treat as the vertical neighbor.
        if item["left"] + item["width"] <= lane_left + EPSILON:
            continue
        if item["left"] >= lane_right - EPSILON:
            continue
        if item["top"] + item["height"] <= first_top + EPSILON:
            continue
        # Starts at or below the last target's bottom → content after selection.
        if item["top"] >= last_bottom - EPSILON:
            blockers.append(item["top"])

    if blockers:
        return min(blockers) - _DISTRIBUTE_BREATHING_Y
    return page_end
_STRUCTURE_ROLES = {"heading", "entry_title", "entry_meta", "body", "list"}
_STRUCTURE_MAX_BLOCKS = 12
_FLOWABLE_CATEGORIES = DIRECTED_POSITION_CATEGORIES
# Vertical gap inserted when a rebuilt section must push colliding content
# down, matching the structure's own inter-block rhythm.
_STRUCTURE_FLOW_GAP = 6.0
# Every push strictly lowers one element, so this cap only guards degenerate
# canvases; ordinary cascades settle within a handful of passes.
_STRUCTURE_COLLISION_PASSES = 48
_NEARBY_DECORATION_CATEGORIES = {"line", "rectangle", "circle", "ellipse"}
_DECORATION_LANE_TOLERANCE = 32.0


def _rects_too_close(
    first: dict[str, Any],
    second: dict[str, Any],
    gap: float = 4.0,
) -> bool:
    """True when boxes overlap or sit closer than ``gap`` on both axes."""
    return (
        first["left"] + first["width"] + gap > second["left"] + EPSILON
        and second["left"] + second["width"] + gap > first["left"] + EPSILON
        and first["top"] + first["height"] + gap > second["top"] + EPSILON
        and second["top"] + second["height"] + gap > first["top"] + EPSILON
    )


def _shift_obstacles(
    context_items: list[dict[str, Any]],
    exclude_ids: set[str],
) -> list[dict[str, Any]]:
    """Content that must not be crushed by a directed shift."""
    obstacles = []
    for item in context_items:
        if item["element_id"] in exclude_ids:
            continue
        if item.get("fixedToPage") or item.get("locked"):
            continue
        if item.get("category") not in AUTO_LAYOUT_CATEGORIES:
            continue
        obstacles.append(item)
    return obstacles


def _shift_scale_is_safe(
    targets: list[dict[str, Any]],
    obstacles: list[dict[str, Any]],
    original_close: set[frozenset[str]],
    dx: float,
    dy: float,
    scale: float,
    page_width: float,
    page_height: float,
) -> bool:
    sdx = dx * scale
    sdy = dy * scale
    for item in targets:
        left = item["left"] + sdx
        top = item["top"] + sdy
        # Strict page edges (no ±EPSILON slack): binary-search clamp must not
        # accept a hair over the boundary as "safe".
        if (
            left < 0
            or top < 0
            or left + item["width"] > page_width
            or top + item["height"] > page_height
        ):
            return False
        moved = {**item, "left": left, "top": top}
        for other in obstacles:
            if other["page"] != item["page"]:
                continue
            pair = frozenset((item["element_id"], other["element_id"]))
            if pair in original_close:
                continue
            if _rects_too_close(moved, other):
                return False
    return True


def _clamp_shift_offset(
    targets: list[dict[str, Any]],
    obstacles: list[dict[str, Any]],
    dx: float,
    dy: float,
    page_width: float,
    page_height: float,
) -> tuple[float, float] | None:
    """Shrink (dx, dy) along its direction until page-safe and non-colliding.

    Returns None when even a tiny step would leave the page or crush content
    that was intentionally left in place (e.g. „zachowaj górny akapit”).
    """
    original_close = {
        frozenset((item["element_id"], other["element_id"]))
        for item in targets
        for other in obstacles
        if item["page"] == other["page"] and _rects_too_close(item, other)
    }
    if _shift_scale_is_safe(
        targets, obstacles, original_close, dx, dy, 1.0, page_width, page_height,
    ):
        return dx, dy

    lo, hi = 0.0, 1.0
    for _ in range(28):
        mid = (lo + hi) / 2
        if _shift_scale_is_safe(
            targets, obstacles, original_close, dx, dy, mid, page_width, page_height,
        ):
            lo = mid
        else:
            hi = mid

    if lo * max(abs(dx), abs(dy)) <= EPSILON:
        return None
    return dx * lo, dy * lo


def resolve_shift(
    items: list[dict[str, Any]],
    target_ids: set[str],
    dx: float,
    dy: float,
    page_width: float,
    page_height: float,
    *,
    context_items: list[dict[str, Any]] | None = None,
    exclude_ids: set[str] | None = None,
) -> dict[str, Any] | str | None:
    """Translate targets by (dx, dy), clamping so they do not crush other content.

    GPT often overshoots „przesuń do góry” — Python keeps the requested
    direction but shortens the move until a ≥4px gap remains to stationary
    text/images (and the page edges).
    """
    targets = [item for item in items if item["element_id"] in target_ids]
    if not targets:
        return None
    if abs(dx) <= EPSILON and abs(dy) <= EPSILON:
        return _NO_CHANGE

    context = context_items if context_items is not None else items
    excluded = set(exclude_ids or ()) | {item["element_id"] for item in targets}
    obstacles = _shift_obstacles(context, excluded)
    clamped = _clamp_shift_offset(targets, obstacles, dx, dy, page_width, page_height)
    if clamped is None:
        return None
    dx, dy = clamped
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
        reason="Bezpośrednie polecenie przesunięcia elementów (ograniczone, by nie nachodzić na pozostałą treść).",
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
    *,
    context_items: list[dict[str, Any]] | None = None,
    exclude_ids: set[str] | None = None,
) -> dict[str, Any] | str | None:
    """Equalize gaps along an axis.

    For axis=x the classic first/last-fixed span is used.
    For axis=y the first item stays put and equal gaps are computed from the
    free vertical region: until the next content in the same column, or the
    page content bottom. The last item may move. Gaps are capped so leftover
    empty page does not create absurd spacing.
    """
    targets = [item for item in items if item["element_id"] in target_ids]
    if len(targets) < _MIN_DISTRIBUTE_TARGETS:
        return None

    pos_key = "left" if axis == "x" else "top"
    size_key = "width" if axis == "x" else "height"
    ordered = sorted(targets, key=lambda item: item[pos_key])
    gap_count = len(ordered) - 1
    total_size = sum(item[size_key] for item in ordered)
    start = ordered[0][pos_key]

    if axis == "y":
        context = context_items if context_items is not None else items
        excluded = set(exclude_ids or ()) | {item["element_id"] for item in ordered}
        region_end = _distribution_end_y(
            ordered, context, page_width, page_height, excluded,
        )
        available = region_end - start
        if available < total_size - EPSILON:
            return None
        gap = (available - total_size) / gap_count
        if gap > _MAX_DISTRIBUTE_GAP_Y:
            gap = _MAX_DISTRIBUTE_GAP_Y
        if gap < 0:
            return None
        # Place every item from the first (inclusive); last may move.
        place_slice = ordered
        cursor = start
    else:
        # Horizontal: keep first and last fixed (standard distribute).
        first, last = ordered[0], ordered[-1]
        total_span = (last[pos_key] + last[size_key]) - first[pos_key]
        gap = (total_span - total_size) / gap_count
        if gap < 0:
            return None
        place_slice = ordered[1:-1]
        cursor = first[pos_key] + first[size_key] + gap

    patches = []
    if axis == "y":
        for index, item in enumerate(place_slice):
            new_pos = round(cursor, 2)
            if abs(new_pos - item[pos_key]) > EPSILON:
                patches.append({
                    "element_id": item["element_id"],
                    "left": round(item["left"], 2),
                    "top": new_pos,
                })
            if index < len(place_slice) - 1:
                cursor = new_pos + item[size_key] + gap
        # Safety: final bottom must stay inside the page content area.
        last_item = ordered[-1]
        last_top = next(
            (p["top"] for p in patches if p["element_id"] == last_item["element_id"]),
            last_item["top"],
        )
        if last_top + last_item["height"] > _content_bottom(page_height) + EPSILON:
            return None
    else:
        for item in place_slice:
            new_pos = round(cursor, 2)
            if abs(new_pos - item[pos_key]) > EPSILON:
                patches.append({
                    "element_id": item["element_id"],
                    "left": new_pos,
                    "top": round(item["top"], 2),
                })
            cursor += item[size_key] + gap

    if not patches:
        return _NO_CHANGE

    return _group(
        group_id="directed-distribute",
        title=f"Rozłóż równomiernie {len(targets)} elementów",
        reason=(
            "Równomierne odstępy pionowe w dostępnym miejscu na stronie "
            "(do następnej treści lub dolnego marginesu)."
            if axis == "y"
            else "Bezpośrednie polecenie równomiernego rozłożenia odstępów."
        ),
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
    if any(item.get("fixedToPage") or item.get("locked") for item in moving):
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


def _wrapped_textarea_height(item: dict[str, Any], width: float) -> float:
    """Estimate a textarea's natural height after a constrained-width move."""
    font_size = max(_number(item.get("fontSize"), 12.0), 1.0)
    line_height = max(_number(item.get("lineHeight"), font_size * 1.35), 1.0)
    chars_per_line = max(10, int(width / (font_size * 0.52)))
    rendered_lines = sum(
        max(1, math.ceil(len(line.strip()) / chars_per_line))
        if line.strip() else 1
        for line in str(item.get("content") or "").split("\n")
    )
    return round(max(rendered_lines * line_height + 6, line_height + 6), 2)


def resolve_move_to_sidebar(
    items: list[dict[str, Any]],
    target_ids: set[str],
    target_page: int,
    reference_element_id: str | None,
    gap: float,
    page_width: float,
    page_height: float,
) -> dict[str, Any] | None:
    """Move a text section beneath an existing sidebar item as one safe edit.

    The existing sidebar item's left edge and width define the destination
    column. Textareas are resized to that width and remeasured before collision
    checks, so a section from the main column cannot spill back into it.
    """
    if not target_ids or not reference_element_id or gap < 0:
        return None

    items_by_id = {item["element_id"]: item for item in items}
    reference = items_by_id.get(str(reference_element_id))
    targets = [item for item in items if item["element_id"] in target_ids]
    if (
        reference is None
        or reference["page"] != target_page
        or reference["element_id"] in target_ids
        or any(item.get("locked") or item.get("fixedToPage") for item in targets)
        or any(item["category"] not in {"text", "textarea"} for item in targets)
    ):
        return None

    sidebar_width = min(reference["width"], page_width - reference["left"])
    if sidebar_width <= EPSILON:
        return None

    ordered_targets = sorted(targets, key=lambda item: (item["top"], item["left"], item["element_id"]))
    # Stack the moved sections directly under the reference. Page-aware, so an
    # unusually tall stack flows onto the next page instead of refusing.
    absolute_cursor = (target_page - 1) * page_height + reference["top"] + reference["height"] + gap
    patches: list[dict[str, Any]] = []
    for index, item in enumerate(ordered_targets):
        height = (
            _wrapped_textarea_height(item, sidebar_width)
            if item["category"] == "textarea"
            else item["height"]
        )
        page, top, resolved_absolute = _structure_page_position(absolute_cursor, height, page_height)
        patches.append({
            "element_id": item["element_id"],
            "left": round(reference["left"], 2),
            "top": round(top, 2),
            "width": round(sidebar_width, 2),
            "height": round(height, 2),
            "page": page,
        })
        absolute_cursor = resolved_absolute + height + (6 if index < len(ordered_targets) - 1 else 0)

    # Existing content the incoming stack would overlap is pushed further down
    # (cascading, onto later pages) so the move makes room instead of refusing.
    # Only locked or page-fixed content in the way still blocks the operation.
    moved_ids = set(target_ids)
    proposed = _apply_patches(items, patches)
    if not _reflow_collisions_downward(proposed, moved_ids, page_height):
        return None

    original_by_id = {item["element_id"]: item for item in items}
    for item in proposed:
        element_id = item["element_id"]
        if element_id in moved_ids:
            continue
        original = original_by_id[element_id]
        if item["page"] != original["page"] or abs(item["top"] - original["top"]) > EPSILON:
            patches.append({
                "element_id": element_id,
                "left": round(original["left"], 2),
                "top": round(item["top"], 2),
                "page": item["page"],
            })

    group = _group(
        group_id="directed-move-to-sidebar",
        title=f"Przenieś {len(targets)} {'element' if len(targets) == 1 else 'elementy'} do sidebara",
        reason=(
            "Sekcja zostanie ustawiona pod wskazanym elementem sidebara, "
            "z szerokością tej kolumny i ponownie obliczoną wysokością tekstu."
        ),
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
        if any(member.get("locked") for member in members):
            return _issue("Jeden ze wskazanych bloków zawiera zablokowany element — AI nie może zmienić jego położenia.")
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
    member_ids = {
        member["element_id"]
        for members in block_members.values()
        for member in members
    }
    if op_type == "shift":
        dx = _number(directive.get("dx"), 0.0)
        dy = _number(directive.get("dy"), 0.0)
        group = resolve_shift(
            block_items,
            block_target_ids,
            dx,
            dy,
            page_width,
            page_height,
            context_items=items,
            exclude_ids=member_ids,
        )
    elif op_type == "align":
        axis = directive.get("axis") if directive.get("axis") in _VALID_AXES else "x"
        anchor = directive.get("anchor") if directive.get("anchor") in _VALID_ANCHORS else "start"
        raw_target = directive.get("target")
        target = _number(raw_target) if raw_target is not None else None
        group = resolve_align(block_items, block_target_ids, axis, anchor, target, page_width, page_height)
    elif op_type == "distribute":
        axis = directive.get("axis") if directive.get("axis") in _VALID_AXES else "y"
        group = resolve_distribute(
            block_items,
            block_target_ids,
            axis,
            page_width,
            page_height,
            context_items=items,
            exclude_ids=member_ids,
        )
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


def _canonical_structure_content(value: object) -> str:
    """Compare section content without making whitespace a structural concern."""
    return " ".join(re.findall(r"\S+", str(value or "")))


def _structure_text_height(content: str, width: float, font_size: float, line_height: float) -> float:
    chars_per_line = max(10, int(width / (font_size * 0.52)))
    line_count = sum(
        max(1, math.ceil(len(line.strip()) / chars_per_line)) if line.strip() else 1
        for line in content.split("\n")
    )
    return round(max(line_count * line_height + 6, line_height + 6), 2)


def _structure_page_position(
    absolute_top: float,
    height: float,
    page_height: float,
    *,
    page_top: float = 36.0,
    bottom_margin: float = 40.0,
) -> tuple[int, float, float]:
    """Place an item on a safe page position, creating trailing pages if needed."""
    absolute_top = max(0.0, absolute_top)
    page = int(absolute_top // page_height) + 1
    top = absolute_top - (page - 1) * page_height
    if height <= page_height - page_top - bottom_margin and top + height > page_height - bottom_margin:
        page += 1
        top = page_top
    return page, round(top, 2), (page - 1) * page_height + top


def _belongs_to_structure_lane(source: dict[str, Any], item: dict[str, Any]) -> bool:
    source_right = source["left"] + source["width"]
    item_right = item["left"] + item["width"]
    if min(source_right, item_right) - max(source["left"], item["left"]) > EPSILON:
        return True
    if item["category"] not in _NEARBY_DECORATION_CATEGORIES:
        return False
    horizontal_gap = max(source["left"] - item_right, item["left"] - source_right, 0.0)
    return horizontal_gap <= _DECORATION_LANE_TOLERANCE


def _reflow_collisions_downward(
    proposed: list[dict[str, Any]],
    anchor_ids: set[str],
    page_height: float,
    *,
    seed_moved_ids: set[str] | frozenset[str] = frozenset(),
) -> bool:
    """Resolve operation-caused overlaps by pushing movable elements downward.

    ``anchor_ids`` are the elements the operation just placed — they never move;
    any other element may be pushed further down (cascading, onto later pages)
    to clear a collision with them. Only overlaps that involve an anchor or an
    already-relocated element count as operation-caused; a pre-existing overlap
    elsewhere on the canvas is the user's own layout and is left untouched.
    Mutates the ``top``/``page`` of pushed items in place. Returns True once no
    operation-caused overlap remains, or False when clearing one would require
    moving a locked, page-fixed, or anchor element.
    """
    moved_ids = set(seed_moved_ids)

    def _abs_top(item: dict[str, Any]) -> float:
        return (item["page"] - 1) * page_height + item["top"]

    def _blocking_pair() -> tuple[dict[str, Any], dict[str, Any]] | None:
        ordered = sorted(
            proposed,
            key=lambda it: (it["page"], it["top"], it["left"], it["element_id"]),
        )
        for index, first in enumerate(ordered):
            if first.get("fixedToPage") or first["category"] in DECORATIVE_CATEGORIES:
                continue
            for second in ordered[index + 1:]:
                if (
                    second.get("fixedToPage")
                    or second["category"] in DECORATIVE_CATEGORIES
                    or first["page"] != second["page"]
                    or not _rects_overlap(first, second)
                ):
                    continue
                if not {first["element_id"], second["element_id"]} & (anchor_ids | moved_ids):
                    # A pre-existing overlap the operation did not create; the
                    # user's own layout is not ours to police here.
                    continue
                return first, second
        return None

    def _movable(item: dict[str, Any]) -> bool:
        return (
            item["element_id"] not in anchor_ids
            and not item.get("locked")
            and not item.get("fixedToPage")
            and item["category"] in _FLOWABLE_CATEGORIES
        )

    for _ in range(_STRUCTURE_COLLISION_PASSES):
        pair = _blocking_pair()
        if pair is None:
            return True
        upper, lower = sorted(pair, key=_abs_top)
        # Prefer pushing the lower element so document order is preserved.
        mover = lower if _movable(lower) else upper if _movable(upper) else None
        if mover is None:
            return False
        other = upper if mover is lower else lower
        page, top, _ = _structure_page_position(
            _abs_top(other) + other["height"] + _STRUCTURE_FLOW_GAP,
            mover["height"],
            page_height,
        )
        mover["top"] = top
        mover["page"] = page
        moved_ids.add(mover["element_id"])
    return _blocking_pair() is None


def resolve_restructure_section(
    elements: list[dict[str, Any]],
    directive: dict[str, Any],
    page_size: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Safely replace one text section with deterministic semantic elements.

    GPT is restricted to semantic roles and exact content. This resolver is the
    sole authority for element types, styling, coordinates, reflow, and IDs.
    """
    page_size = page_size or {}
    page_width = _number(page_size.get("width"), 595.0)
    page_height = _number(page_size.get("height"), 842.0)
    if page_width <= 0 or page_height <= 0:
        return None

    source_id = str(directive.get("source_element_id") or "")
    if (
        directive.get("type") != "restructure_section"
        or set(directive) - {"type", "source_element_id", "blocks"}
    ):
        return None
    raw_by_id = {str(element.get("element_id")): element for element in elements if element.get("element_id")}
    source_raw = raw_by_id.get(source_id)
    bounds_by_id = {item["element_id"]: item for item in extract_bounds(elements)}
    source = bounds_by_id.get(source_id)
    if (
        source_raw is None
        or source is None
        or source["category"] not in {"text", "textarea"}
        or source.get("locked")
        or source.get("fixedToPage")
    ):
        return None

    raw_blocks = directive.get("blocks")
    if not isinstance(raw_blocks, list) or not 2 <= len(raw_blocks) <= _STRUCTURE_MAX_BLOCKS:
        return None

    blocks: list[dict[str, str]] = []
    heading_count = 0
    for raw_block in raw_blocks:
        if not isinstance(raw_block, dict) or set(raw_block) != {"role", "content"}:
            return None
        role = str(raw_block.get("role") or "")
        content = raw_block.get("content")
        if role not in _STRUCTURE_ROLES or not isinstance(content, str) or not content.strip():
            return None
        heading_count += role == "heading"
        blocks.append({"role": role, "content": content})
    if heading_count > 1:
        return None
    if _canonical_structure_content(source_raw.get("content")) != _canonical_structure_content(
        "\n".join(block["content"] for block in blocks)
    ):
        return None

    existing_ids = set(raw_by_id)
    base_font_size = max(8.0, min(_number(source_raw.get("fontSize"), 11.0), 24.0))
    source_color = str(source_raw.get("color") or "#2B2B2B")
    source_family = str(source_raw.get("fontFamily") or "Inter")
    source_z_index = int(_number(source_raw.get("zIndex"), 3.0))
    source_page = source["page"]
    source_absolute_top = (source_page - 1) * page_height + source["top"]
    cursor = source_absolute_top
    additions: list[dict[str, Any]] = []

    def add_element(spec: dict[str, Any], height: float) -> None:
        nonlocal cursor
        page, top, resolved_absolute_top = _structure_page_position(cursor, height, page_height)
        additions.append({**spec, "top": top, "page": page, "height": height})
        cursor = resolved_absolute_top + height

    for index, block in enumerate(blocks):
        role, content = block["role"], block["content"]
        font_size = (
            max(9.0, base_font_size * 1.08) if role == "heading"
            else max(8.0, base_font_size * 0.88) if role == "entry_meta"
            else base_font_size
        )
        line_height = round(max(font_size * 1.35, 11.0), 2)
        element_id = f"{source_id}__structure_{index}_{role}"
        if element_id in existing_ids:
            return None
        existing_ids.add(element_id)
        short_single_line = "\n" not in content and len(content) * font_size * 0.55 <= source["width"]
        category = "text" if role in {"heading", "entry_title", "entry_meta"} and short_single_line else "textarea"
        height = round(font_size * 1.35, 2) if category == "text" else _structure_text_height(
            content, source["width"], font_size, line_height
        )
        add_element({
            "element_id": element_id,
            "category": category,
            "content": content,
            "fontSize": round(font_size, 2),
            "fontFamily": source_family,
            "color": "#667085" if role == "entry_meta" else source_color,
            "left": source["left"],
            "width": source["width"],
            "lineHeight": line_height,
            "letterSpacing": 0,
            "bold": role in {"heading", "entry_title"},
            "italic": False,
            "underline": False,
            "align": "left",
            # Existing bullet glyphs are content and must remain untouched;
            # only let the canvas add bullets when the source lines are plain.
            "bulletList": role == "list" and not bool(re.search(r"^[•\-–—]\s", content, re.MULTILINE)),
            "autoHeight": category == "textarea",
            "locked": False,
            "zIndex": source_z_index,
        }, height)

        if role == "heading":
            cursor += 3
            rule_id = f"{source_id}__structure_rule"
            if rule_id in existing_ids:
                return None
            existing_ids.add(rule_id)
            add_element({
                "element_id": rule_id,
                "category": "line",
                "backgroundColor": source_color,
                "left": source["left"],
                "width": min(72.0, source["width"]),
                "lineHeight": 0,
                "letterSpacing": 0,
                "bold": False,
                "italic": False,
                "underline": False,
                "align": "left",
                "bulletList": False,
                "autoHeight": False,
                "locked": False,
                "zIndex": max(1, source_z_index - 1),
            }, 1.5)
            cursor += 7
        else:
            cursor += 6

    structure_end = cursor - 6
    source_end = source_absolute_top + source["height"]
    flow_delta = structure_end - source_end
    items = list(bounds_by_id.values())
    patches: list[dict[str, Any]] = []
    for item in items:
        if (
            item["element_id"] == source_id
            or item.get("fixedToPage")
            or item["category"] not in _FLOWABLE_CATEGORIES
        ):
            continue
        absolute_top = (item["page"] - 1) * page_height + item["top"]
        if absolute_top + EPSILON < source_end or not _belongs_to_structure_lane(source, item):
            continue
        if item.get("locked"):
            return None
        page, top, _ = _structure_page_position(
            absolute_top + flow_delta, item["height"], page_height
        )
        if page != item["page"] or abs(top - item["top"]) > EPSILON:
            patches.append({
                "element_id": item["element_id"],
                "left": round(item["left"], 2),
                "top": top,
                "page": page,
            })

    moved_by_id = {patch["element_id"]: patch for patch in patches}
    proposed: list[dict[str, Any]] = []
    for item in items:
        if item["element_id"] == source_id:
            continue
        patch = moved_by_id.get(item["element_id"])
        proposed.append({
            **item,
            **({"left": patch["left"], "top": patch["top"], "page": patch["page"]} if patch else {}),
        })
    proposed.extend({
        "element_id": addition["element_id"],
        "category": addition["category"],
        "left": addition["left"],
        "top": addition["top"],
        "width": addition["width"],
        "height": addition["height"],
        "page": addition["page"],
        "fixedToPage": False,
    } for addition in additions)

    # Collisions the rebuild creates are resolved by pushing the colliding
    # content further down (cascading, page-aware) instead of refusing. Only
    # locked/fixed conflicts and content that cannot fit a page still refuse.
    # The new structure elements are the anchors that stay put; the reflowed
    # patches are seeded as already-moved so their collisions count too.
    addition_ids = {addition["element_id"] for addition in additions}
    if not _reflow_collisions_downward(
        proposed,
        addition_ids,
        page_height,
        seed_moved_ids={patch["element_id"] for patch in patches},
    ):
        return None

    for item in proposed:
        if (
            item["left"] < -EPSILON
            or item["top"] < -EPSILON
            or item["left"] + item["width"] > page_width + EPSILON
            or item["top"] + item["height"] > page_height + EPSILON
        ):
            return None

    # Push-downs may have moved more items (or moved them further), so derive
    # the final patch list from the proposal instead of the initial reflow.
    patches = []
    for item in proposed:
        if item["element_id"] in addition_ids:
            continue
        original = bounds_by_id[item["element_id"]]
        if item["page"] != original["page"] or abs(item["top"] - original["top"]) > EPSILON:
            patches.append({
                "element_id": item["element_id"],
                "left": round(original["left"], 2),
                "top": round(item["top"], 2),
                "page": item["page"],
            })

    max_page = max(
        [source_page, *(addition["page"] for addition in additions), *(patch["page"] for patch in patches)]
    )
    return {
        "id": "directed-restructure-section",
        "title": f"Przebuduj sekcję na {len(additions)} elementów",
        "reason": "Sekcja zostanie rozbita na edytowalne pola z zachowaniem pełnej treści i przepływu dokumentu.",
        "severity": "review",
        "remove_element_ids": [source_id],
        "add_elements": additions,
        "patches": patches,
        "target_page": min(addition["page"] for addition in additions),
        "page_count": max_page,
    }


_CLONEABLE_CATEGORIES = {"text", "textarea", "line", "rectangle", "circle", "ellipse", "image"}
_CLONE_PLACEMENTS = {"below", "above", "right", "left", "offset"}
_CLONE_ALIGN = {"start", "center", "end"}
_CLONE_MATCH_SIZE = {"none", "width", "height", "both"}
_CLONE_COPY_KEYS = (
    "category", "content", "fontSize", "fontFamily", "color", "bold", "italic", "underline",
    "align", "lineHeight", "letterSpacing", "width", "height", "backgroundColor", "borderWidth",
    "filled", "src", "img_id", "zIndex", "bulletList", "autoHeight", "alignWithText", "arrow",
)
_MAX_CLONES_PER_OPERATION = 20


def _clone_align_x(reference: dict[str, Any], width: float, align: str) -> float:
    if align == "center":
        return reference["left"] + (reference["width"] - width) / 2
    if align == "end":
        return reference["left"] + reference["width"] - width
    return reference["left"]


def _clone_align_y(reference: dict[str, Any], height: float, align: str) -> float:
    if align == "center":
        return reference["top"] + (reference["height"] - height) / 2
    if align == "end":
        return reference["top"] + reference["height"] - height
    return reference["top"]


def _build_clone_element(
    source_raw: dict[str, Any],
    source_bounds: dict[str, Any],
    *,
    new_id: str,
    left: float,
    top: float,
    page: int,
    width: float,
    height: float,
) -> dict[str, Any]:
    clone = {
        key: source_raw[key]
        for key in _CLONE_COPY_KEYS
        if key in source_raw and source_raw[key] is not None
    }
    clone.update({
        "element_id": new_id,
        "category": source_bounds["category"],
        "left": round(left, 2),
        "top": round(top, 2),
        "width": round(width, 2),
        "height": round(height, 2),
        "page": page,
        "locked": False,
        "fixedToPage": False,
        "zIndex": int(_number(source_raw.get("zIndex"), source_bounds.get("zIndex", 2))),
    })
    return clone


def resolve_clone_operation(
    elements: list[dict[str, Any]],
    directive: dict[str, Any],
    page_size: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Clone existing canvas elements and place copies via abstract rules.

    GPT never invents geometry or styles — it only names source ids and a
    placement relative to an optional reference (below/above/left/right/offset).
    Python copies the source fields and computes safe left/top/page.
    """
    page_size = page_size or {}
    page_width = _number(page_size.get("width"), 595.0)
    page_height = _number(page_size.get("height"), 842.0)
    if page_width <= 0 or page_height <= 0:
        return None
    if (
        not isinstance(directive, dict)
        or directive.get("type") != "clone_elements"
        or set(directive) - {"type", "clones"}
    ):
        return None

    raw_clones = directive.get("clones")
    if not isinstance(raw_clones, list) or not 1 <= len(raw_clones) <= _MAX_CLONES_PER_OPERATION:
        return None

    raw_by_id = {
        str(element.get("element_id")): element
        for element in elements
        if element.get("element_id")
    }
    bounds_by_id = {item["element_id"]: item for item in extract_bounds(elements)}
    existing_ids = set(raw_by_id)
    additions: list[dict[str, Any]] = []

    for index, raw in enumerate(raw_clones):
        if not isinstance(raw, dict):
            return None
        allowed_keys = {
            "source_element_id", "reference_element_id", "placement",
            "gap", "dx", "dy", "align", "match_size",
        }
        if set(raw) - allowed_keys:
            return None

        source_id = str(raw.get("source_element_id") or "")
        source_raw = raw_by_id.get(source_id)
        source = bounds_by_id.get(source_id)
        if (
            source_raw is None
            or source is None
            or source["category"] not in _CLONEABLE_CATEGORIES
            or source.get("locked")
            or source.get("fixedToPage")
            or source["category"] == "connector"
        ):
            return None

        placement = raw.get("placement") if raw.get("placement") in _CLONE_PLACEMENTS else None
        if placement is None:
            return None
        align = raw.get("align") if raw.get("align") in _CLONE_ALIGN else "start"
        match_size = raw.get("match_size") if raw.get("match_size") in _CLONE_MATCH_SIZE else "none"
        gap = max(0.0, _number(raw.get("gap"), 8.0))
        dx = _number(raw.get("dx"), 15.0)
        dy = _number(raw.get("dy"), 15.0)

        reference_id = str(raw.get("reference_element_id") or "")
        if placement == "offset":
            reference = source
        else:
            if not reference_id:
                return None
            reference = bounds_by_id.get(reference_id)
            if reference is None:
                return None

        width = source["width"]
        height = source["height"]
        if match_size in {"width", "both"}:
            width = max(1.0, reference["width"])
        if match_size in {"height", "both"}:
            height = max(1.0, reference["height"])
        if width > page_width or height > page_height:
            return None

        if placement == "offset":
            left = source["left"] + dx
            top = source["top"] + dy
            page = int(source["page"])
        elif placement == "below":
            left = _clone_align_x(reference, width, align)
            top = reference["top"] + reference["height"] + gap
            page = int(reference["page"])
        elif placement == "above":
            left = _clone_align_x(reference, width, align)
            top = reference["top"] - height - gap
            page = int(reference["page"])
        elif placement == "right":
            left = reference["left"] + reference["width"] + gap
            top = _clone_align_y(reference, height, align)
            page = int(reference["page"])
        else:  # left
            left = reference["left"] - width - gap
            top = _clone_align_y(reference, height, align)
            page = int(reference["page"])

        left = round(left, 2)
        top = round(top, 2)
        if (
            left < -EPSILON
            or top < -EPSILON
            or left + width > page_width + EPSILON
            or top + height > page_height + EPSILON
        ):
            return None

        new_id = f"{source_id}__clone_{index}"
        if new_id in existing_ids:
            new_id = f"{source_id}__clone_{index}_{len(additions)}"
        if new_id in existing_ids:
            return None
        existing_ids.add(new_id)
        additions.append(_build_clone_element(
            source_raw,
            source,
            new_id=new_id,
            left=left,
            top=top,
            page=page,
            width=width,
            height=height,
        ))

    count = len(additions)
    return {
        "id": f"directed-clone-{additions[0]['element_id']}",
        "title": f"Sklonuj {count} {'element' if count == 1 else 'elementy'}",
        "reason": (
            "Kopie dziedziczą styl i geometrię źródła; pozycja wynika z reguły "
            "umieszczenia względem wskazanego elementu referencyjnego."
        ),
        "severity": "review",
        "remove_element_ids": [],
        "add_elements": additions,
        "patches": [],
    }


def resolve_delete_operation(
    elements: list[dict[str, Any]],
    directive: dict[str, Any],
) -> dict[str, Any] | None:
    """Validate an explicit AI deletion request for user review.

    The model may select existing element IDs only. Fixed page artwork and
    position-locked elements are intentionally protected from bulk deletion.
    """
    if (
        not isinstance(directive, dict)
        or directive.get("type") != "delete_elements"
        or set(directive) != {"type", "target_element_ids"}
    ):
        return None

    raw_ids = directive.get("target_element_ids")
    if not isinstance(raw_ids, list) or not 1 <= len(raw_ids) <= 80:
        return None
    target_ids = [str(element_id) for element_id in raw_ids if isinstance(element_id, str) and element_id]
    if len(target_ids) != len(raw_ids) or len(set(target_ids)) != len(target_ids):
        return None

    by_id = {
        str(element.get("element_id")): element
        for element in elements
        if element.get("element_id")
    }
    targets = [by_id.get(element_id) for element_id in target_ids]
    if (
        any(element is None for element in targets)
        or any(
            element.get("fixedToPage")
            or element.get("locked")
            or element.get("category") == "connector"
            for element in targets
        )
    ):
        return None

    pages = {
        max(1, int(_number(element.get("page"), 1)))
        for element in targets
    }
    count = len(target_ids)
    return {
        "id": f"directed-delete-{target_ids[0]}",
        "title": f"Usuń {count} {'element' if count == 1 else 'elementy'}",
        "reason": (
            "Elementy znikną po zatwierdzeniu. Stałe tła i dekoracje stron "
            "pozostają chronione."
        ),
        "severity": "high",
        "remove_element_ids": target_ids,
        "target_page": next(iter(pages)) if len(pages) == 1 else None,
    }


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
    if op_type in {"move_to_page", "move_to_sidebar"}:
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
        if any(item.get("locked") for item in items if item["element_id"] in requested_ids):
            return _issue("Nie można przenieść ani wyrównać zablokowanego elementu.")

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

        if op_type == "move_to_sidebar":
            group = resolve_move_to_sidebar(
                items,
                target_ids,
                target_page,
                str(reference_id) if reference_id is not None else None,
                _number(directive.get("gap"), 16.0),
                page_width,
                page_height,
            )
            if group is None:
                return _issue(
                    "Nie można bezpiecznie umieścić tej sekcji w sidebarze — w miejscu docelowym "
                    "jest zablokowany lub przypięty do strony element, którego nie wolno przesunąć."
                )
            return {"layout_groups": [group], "layout_issues": []}

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
    if any(item.get("locked") for item in targets):
        return _issue("Nie można zmienić położenia zablokowanego elementu.")
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
