"""Balance-driven two-column section placement for sidebar CV templates.

Given each section's measured height in the sidebar and in the main column,
partition the sections into the two columns to minimise page-1 imbalance,
subject to:

  * Experience (any section with ``anchored_main=True``) stays in the main
    column.
  * The sidebar cannot paginate, so the sidebar assignment is a HARD page-1
    fit (sum of sidebar heights <= ``sidebar_budget``).
  * The main column may paginate, so exceeding ``main_budget`` is allowed (the
    overflow flows onto later pages) and is NOT counted as wasted space.

The planner is pure: callers measure sections with the existing per-column
helpers and pass the heights in. This keeps the algorithm unit-testable with
synthetic heights and independent of the generation stack.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PlaceableSection:
    """One CV section that can be routed to either column.

    ``main_height`` is the section's page-flow height in the main column
    (including its heading chrome). ``sidebar_height`` is its height in the
    narrow rail (including the rail's kicker chrome), or ``None`` when the
    section cannot render in the sidebar for this template. ``affinity`` is the
    natural home used to seed placement; ``anchored_main`` pins a section to the
    main column so the balancer never moves it.
    """

    key: str
    order_rank: int
    affinity: str  # "main" | "sidebar"
    main_height: float
    sidebar_height: float | None
    anchored_main: bool = False


@dataclass(frozen=True)
class ColumnPlan:
    """Result of partitioning: section keys per column, in reading order."""

    main: list[str]
    sidebar: list[str]


def _column_heights(
    assignment: dict[str, str], sections: list[PlaceableSection]
) -> tuple[float, float]:
    """Return (main_height, sidebar_height) for a candidate assignment."""
    main_h = 0.0
    side_h = 0.0
    for section in sections:
        if assignment[section.key] == "sidebar":
            side_h += float(section.sidebar_height or 0.0)
        else:
            main_h += float(section.main_height)
    return main_h, side_h


def _cost(
    assignment: dict[str, str],
    sections: list[PlaceableSection],
    *,
    sidebar_budget: float,
    main_budget: float,
) -> float:
    """Imbalance cost: the larger of the two page-1 empty columns.

    An over-budget sidebar is infeasible (it cannot paginate) and returns
    infinity. An over-budget main column is fine — its overflow flows to page
    2+, so its empty space clamps to zero rather than going negative.
    """
    main_h, side_h = _column_heights(assignment, sections)
    if side_h > sidebar_budget + 0.01:
        return float("inf")
    empty_side = max(0.0, sidebar_budget - side_h)
    empty_main = max(0.0, main_budget - main_h)
    return max(empty_side, empty_main)


def plan_columns(
    sections: list[PlaceableSection],
    *,
    sidebar_budget: float,
    main_budget: float,
    imbalance_tolerance: float = 60.0,
    min_improvement: float = 24.0,
) -> ColumnPlan:
    """Partition ``sections`` into the two columns to minimise page-1 imbalance.

    Greedy local search over a small section set (typically 4-7): seed by
    affinity, force the sidebar under budget, then repeatedly apply the single
    section move that most reduces the imbalance cost until the columns are
    balanced (cost <= ``imbalance_tolerance``) or no move clears
    ``min_improvement``. The section count is tiny, so evaluating every legal
    single move each pass is cheap and deterministic.
    """
    by_key = {section.key: section for section in sections}

    # 1. Seed by affinity. Anchored and sidebar-infeasible sections go to main.
    assignment: dict[str, str] = {}
    for section in sections:
        if section.anchored_main or section.sidebar_height is None:
            assignment[section.key] = "main"
        else:
            assignment[section.key] = section.affinity

    def can_move(section: PlaceableSection, target: str) -> bool:
        if section.anchored_main:
            return False
        if target == "sidebar" and section.sidebar_height is None:
            return False
        return assignment[section.key] != target

    # 2. Feasibility: while the sidebar overflows, move its lowest-priority
    #    (highest order_rank) section to the main column.
    while _column_heights(assignment, sections)[1] > sidebar_budget + 0.01:
        movers = [
            section for section in sections
            if assignment[section.key] == "sidebar" and not section.anchored_main
        ]
        if not movers:
            break
        victim = max(movers, key=lambda section: section.order_rank)
        assignment[victim.key] = "main"

    # 3. Balance loop: apply the best cost-reducing single move each pass.
    current = _cost(
        assignment, sections, sidebar_budget=sidebar_budget, main_budget=main_budget,
    )
    while current > imbalance_tolerance:
        best_gain = 0.0
        best_key: str | None = None
        best_target: str | None = None
        for section in sections:
            for target in ("main", "sidebar"):
                if not can_move(section, target):
                    continue
                trial = dict(assignment)
                trial[section.key] = target
                trial_cost = _cost(
                    trial, sections,
                    sidebar_budget=sidebar_budget, main_budget=main_budget,
                )
                gain = current - trial_cost
                if gain > best_gain:
                    best_gain, best_key, best_target = gain, section.key, target
        if best_key is None or best_gain < min_improvement:
            break
        assignment[best_key] = best_target
        current -= best_gain

    main_keys = sorted(
        (section.key for section in sections if assignment[section.key] == "main"),
        key=lambda key: by_key[key].order_rank,
    )
    side_keys = sorted(
        (section.key for section in sections if assignment[section.key] == "sidebar"),
        key=lambda key: by_key[key].order_rank,
    )
    return ColumnPlan(main=main_keys, sidebar=side_keys)
