"""Balance-driven two-column section placement for sidebar CV templates.

Given each section's measured height in the sidebar and in the main column,
partition the sections into the main column and one or more page-scoped
sidebar rails ("buckets"), subject to:

  * Experience (any section with ``anchored_main=True``) stays in the main
    column.
  * Each sidebar bucket is a page-scoped rail that cannot paginate, so its
    assignment is a HARD fit (sum of sidebar heights <= ``bucket.budget``).
  * The main column may paginate, so exceeding ``main_budget`` is allowed (the
    overflow flows onto later pages) and is NOT counted as wasted space.

The planner is pure: callers measure sections with the existing per-column
helpers and pass the heights in. This keeps the algorithm unit-testable with
synthetic heights and independent of the generation stack.

A second function, ``plan_columns_multi_page`` (added alongside this
partitioner separately), composes it with a bounded iteration that derives
one sidebar bucket per page the main column actually occupies, so a
continuation page's otherwise-empty rail can also receive content. See
docs/superpowers/specs/2026-08-12-multi-page-column-planner-design.md.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


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
class SidebarBucket:
    """One page-scoped sidebar rail available to receive sections.

    ``page`` is the 1-indexed document page. ``budget`` is that page's rail
    vertical capacity — page 1 differs from continuation pages because the
    masthead consumes space above page 1's rail.
    """

    page: int
    budget: float


@dataclass(frozen=True)
class ColumnPlan:
    """Result of partitioning: section keys per column, in reading order.

    ``sidebar_by_page`` has one entry per bucket passed to ``plan_columns``
    (possibly an empty list), keyed by ``SidebarBucket.page``.
    """

    main: list[str]
    sidebar_by_page: dict[int, list[str]]


def _column_heights(
    assignment: dict[str, str | int],
    sections: list[PlaceableSection],
    buckets: list[SidebarBucket],
) -> tuple[float, dict[int, float]]:
    """Return (main_height, {bucket_page: sidebar_height})."""
    main_h = 0.0
    side_h = {bucket.page: 0.0 for bucket in buckets}
    for section in sections:
        target = assignment[section.key]
        if target == "main":
            main_h += float(section.main_height)
        else:
            side_h[target] += float(section.sidebar_height or 0.0)
    return main_h, side_h


def _cost(
    assignment: dict[str, str | int],
    sections: list[PlaceableSection],
    buckets: list[SidebarBucket],
    *,
    main_budget: float,
) -> float:
    """Imbalance cost: the largest of the main and every bucket's empty space.

    An over-budget bucket is infeasible (it cannot paginate) and returns
    infinity. An over-budget main column is fine — its overflow flows to the
    next page, so its empty space clamps to zero rather than going negative.
    """
    main_h, side_h = _column_heights(assignment, sections, buckets)
    budget_by_page = {bucket.page: bucket.budget for bucket in buckets}
    for page, height in side_h.items():
        if height > budget_by_page[page] + 0.01:
            return float("inf")
    empty_main = max(0.0, main_budget - main_h)
    empty_sides = [max(0.0, budget_by_page[page] - height) for page, height in side_h.items()]
    return max([empty_main, *empty_sides])


def plan_columns(
    sections: list[PlaceableSection],
    *,
    sidebar_buckets: list[SidebarBucket],
    main_budget: float,
    imbalance_tolerance: float = 60.0,
    min_improvement: float = 24.0,
) -> ColumnPlan:
    """Partition ``sections`` into the main column and N sidebar buckets.

    Greedy local search over a small section set (typically 4-7):

    1. Seed sidebar-affinity sections by first-fit across buckets in
       ascending page order (a section that fits no bucket outright seeds
       into the highest-page bucket so the repair pass below evicts it
       correctly); anchored and sidebar-infeasible sections seed into main.
    2. Force every bucket under budget: process buckets in ascending page
       order and evict each overflowing bucket's lowest-priority (highest
       ``order_rank``) member back to main.
    3. Repeatedly apply the single section move — to main, or to any bucket
       it fits — that most reduces ``max(empty_main, *empty_buckets)``, until
       the columns are balanced (cost <= ``imbalance_tolerance``) or no move
       clears ``min_improvement``.

    The section count is tiny, so evaluating every legal single move each
    pass is cheap and deterministic. With exactly one bucket
    (``[SidebarBucket(1, budget)]``) every sidebar-affinity section seeds into
    that bucket regardless of fit (the first-fit "doesn't fit anywhere"
    fallback also targets it, since it is the only bucket), so this reduces
    to the single-page behavior exactly.
    """
    if not sidebar_buckets:
        raise ValueError("plan_columns requires at least one sidebar bucket")
    by_key = {section.key: section for section in sections}
    ordered_buckets = sorted(sidebar_buckets, key=lambda bucket: bucket.page)

    # 1. Seed: sidebar-affinity sections first-fit across buckets in ascending
    #    page order. Anchored and sidebar-infeasible sections go straight to
    #    main.
    assignment: dict[str, str | int] = {}
    running_totals = {bucket.page: 0.0 for bucket in ordered_buckets}
    for section in sections:
        if section.anchored_main or section.sidebar_height is None or section.affinity != "sidebar":
            assignment[section.key] = "main"
            continue
        for bucket in ordered_buckets:
            if running_totals[bucket.page] + section.sidebar_height <= bucket.budget + 0.01:
                assignment[section.key] = bucket.page
                running_totals[bucket.page] += section.sidebar_height
                break
        else:
            overflow_bucket = ordered_buckets[-1]
            assignment[section.key] = overflow_bucket.page
            running_totals[overflow_bucket.page] += section.sidebar_height

    def can_move(section: PlaceableSection, target: str | int) -> bool:
        if section.anchored_main:
            return False
        if target != "main" and section.sidebar_height is None:
            return False
        return assignment[section.key] != target

    # 2. Feasibility: process buckets in ascending page order (page 1's budget
    #    is fixed and independent of the multi-page orchestrator's iteration;
    #    later pages' budgets are themselves derived there, so repairing them
    #    first would repair a number that's about to change anyway). While a
    #    bucket overflows, evict its lowest-priority non-anchored member back
    #    to main.
    for bucket in ordered_buckets:
        while True:
            _, side_h = _column_heights(assignment, sections, sidebar_buckets)
            if side_h[bucket.page] <= bucket.budget + 0.01:
                break
            movers = [
                section for section in sections
                if assignment[section.key] == bucket.page and not section.anchored_main
            ]
            if not movers:
                break
            victim = max(movers, key=lambda section: section.order_rank)
            assignment[victim.key] = "main"

    # 3. Balance loop: apply the best cost-reducing single move each pass. A
    #    move target is "main" or a specific bucket page.
    move_targets: list[str | int] = ["main", *(bucket.page for bucket in ordered_buckets)]
    current = _cost(assignment, sections, sidebar_buckets, main_budget=main_budget)
    while current > imbalance_tolerance:
        best_gain = 0.0
        best_key: str | None = None
        best_target: str | int | None = None
        for section in sections:
            for target in move_targets:
                if not can_move(section, target):
                    continue
                trial = dict(assignment)
                trial[section.key] = target
                trial_cost = _cost(trial, sections, sidebar_buckets, main_budget=main_budget)
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
    sidebar_by_page: dict[int, list[str]] = {bucket.page: [] for bucket in sidebar_buckets}
    for section in sections:
        target = assignment[section.key]
        if target != "main":
            sidebar_by_page[target].append(section.key)
    for page in sidebar_by_page:
        sidebar_by_page[page].sort(key=lambda key: by_key[key].order_rank)

    return ColumnPlan(main=main_keys, sidebar_by_page=sidebar_by_page)


@dataclass(frozen=True)
class MainMeasurement:
    """Result of actually rendering a candidate main-column section order."""

    pages_used: int


def plan_columns_multi_page(
    sections: list[PlaceableSection],
    *,
    page1_sidebar_budget: float,
    continuation_sidebar_budget: float,
    page1_main_budget: float,
    continuation_main_budget: float,
    measure_main: Callable[[list[str]], MainMeasurement],
    imbalance_tolerance: float = 60.0,
    min_improvement: float = 24.0,
    max_iterations: int = 3,
) -> ColumnPlan:
    """Resolve the circular main-pagination / sidebar-bucket dependency.

    Which sections belong in the sidebar depends on how many pages the main
    column needs; how many pages the main column needs depends on which
    sections are (not) in the sidebar. This alternates a cheap partition pass
    (``plan_columns``) with a real measurement pass (``measure_main``,
    supplied by the caller's template generator, since only the template
    knows how to render its own main column) that reports how many pages the
    resulting ``main`` order actually needs. Each measured page count >= 2
    derives one additional sidebar bucket, so a continuation page's
    otherwise-empty rail can receive content.

    Converges when the derived bucket list and total main budget stop
    changing between iterations — which happens immediately (after the first
    pass) for any CV whose main column fits on page 1, since no bucket beyond
    page 1 is ever derived in that case, matching today's single-page
    behavior exactly (see ``test_plan_columns_multi_page_one_page_matches_plan_columns``).
    A hard ``max_iterations`` cap guarantees termination even if a
    pathological ``measure_main`` never stabilizes (the last computed plan is
    returned instead of looping forever).
    """
    if max_iterations < 1:
        raise ValueError("plan_columns_multi_page requires max_iterations >= 1")
    buckets = [SidebarBucket(1, page1_sidebar_budget)]
    total_main_budget = page1_main_budget
    plan: ColumnPlan | None = None
    for _ in range(max_iterations):
        plan = plan_columns(
            sections, sidebar_buckets=buckets, main_budget=total_main_budget,
            imbalance_tolerance=imbalance_tolerance, min_improvement=min_improvement,
        )
        pages_used = max(1, measure_main(plan.main).pages_used)
        new_buckets = [SidebarBucket(1, page1_sidebar_budget)] + [
            SidebarBucket(page, continuation_sidebar_budget)
            for page in range(2, pages_used + 1)
        ]
        new_total_main_budget = (
            page1_main_budget + max(0, pages_used - 1) * continuation_main_budget
        )
        converged = (
            [bucket.page for bucket in new_buckets] == [bucket.page for bucket in buckets]
            and new_total_main_budget == total_main_budget
        )
        if converged:
            break
        buckets, total_main_budget = new_buckets, new_total_main_budget
    # NOTE: On convergence the last `plan` was measured against its own bucket
    # list, so `plan.sidebar_by_page` matches `plan.main`'s real page span. On
    # `max_iterations` exhaustion (a `measure_main` that never stabilizes) the
    # returned plan may have been partitioned against a bucket list one step
    # stale. This is safe in practice: `plan_columns` only leaves content in a
    # page-N bucket when the main column is correspondingly full (its budget
    # scales with page count), so a populated continuation bucket implies the
    # main column really reaches that page — the planner never fabricates a
    # page with no main content. The `max_iterations` cap (spec §6) is a
    # bounded, deterministic fallback, not a correctness guarantee to lean on.
    return plan
