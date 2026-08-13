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
partitioner separately), composes it with real main-column measurement to
derive one sidebar bucket per page the main column's *skeleton* (Experience
plus record-style extras) already occupies, then moves main-affinity
leftovers such as Education that genuinely land on a continuation page onto
that page's rail — so a rail that would otherwise sit empty next to page-2+
content carries content instead. See
docs/superpowers/specs/2026-08-12-multi-page-column-planner-design.md.
"""
from __future__ import annotations

from dataclasses import dataclass, field
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
    """Imbalance cost: the larger of the main and *first-page* sidebar empties.

    An over-budget bucket is infeasible (it cannot paginate) and returns
    infinity — this check covers EVERY bucket, because each rail is a hard
    per-page fit. An over-budget main column is fine — its overflow flows to
    the next page, so its empty space clamps to zero rather than going
    negative.

    Only the first (lowest ``page``) bucket's empty space enters the balance
    objective. Continuation-page rails are overflow catchers, not columns to
    balance against: counting their empty space (an earlier ``max`` over every
    bucket) made the greedy loop *equalise* fill across sidebar pages — it
    would move sections off a half-full page-1 rail onto an empty page-2 rail
    to shrink the worst empty bucket, visibly draining page 1 even when page 1
    had room. The visual balance that matters is page 1 (the masthead page):
    fill it against the main column exactly as the single-page planner did,
    and let seeding's ascending-page first-fit spill only genuine overflow
    onto later rails. With one bucket this is identical to the original
    ``max(empty_side, empty_main)``.
    """
    main_h, side_h = _column_heights(assignment, sections, buckets)
    budget_by_page = {bucket.page: bucket.budget for bucket in buckets}
    for page, height in side_h.items():
        if height > budget_by_page[page] + 0.01:
            return float("inf")
    empty_main = max(0.0, main_budget - main_h)
    first_page = min(budget_by_page)
    empty_first_side = max(0.0, budget_by_page[first_page] - side_h[first_page])
    return max(empty_main, empty_first_side)


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
       it fits — that most reduces ``max(empty_main, empty_first_bucket)``
       (see ``_cost``: only the first/page-1 rail is balanced; later rails are
       overflow catchers), until the columns are balanced (cost <=
       ``imbalance_tolerance``) or no move clears ``min_improvement``.

    This pure partitioner decides page-1 balance and seeds sidebar-affinity
    overflow onto continuation rails. It does NOT move *main-affinity*
    leftovers (Education) onto continuation rails — that needs the real
    per-page main measurement and lives in ``plan_columns_multi_page``.

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
    """Result of actually rendering a candidate main-column section order.

    ``pages_used`` is the 1-indexed page count. ``start_page_by_key`` maps each
    measured section key to the real 1-indexed page its rendering *starts* on
    (from the actual Builder pass, so it already accounts for record atomicity
    and page-break rules a height sum cannot model). Keys the caller does not
    track per-section (e.g. record-style extras rendered in bulk) may be
    absent; callers must treat a missing key as "page unknown" and leave that
    section in the main column.
    """

    pages_used: int
    start_page_by_key: dict[str, int] = field(default_factory=dict)


def plan_columns_multi_page(
    sections: list[PlaceableSection],
    *,
    page1_sidebar_budget: float,
    continuation_sidebar_budget: float,
    page1_main_budget: float,
    measure_main: Callable[[list[str]], MainMeasurement],
    imbalance_tolerance: float = 60.0,
    min_improvement: float = 24.0,
) -> ColumnPlan:
    """Place sections across the main column and every page's sidebar rail.

    The naive circular dependency — sidebar assignment depends on main
    pagination, which depends on sidebar assignment — is broken by anchoring
    the page count to the main column's **skeleton**: the sections that must
    stay in main no matter what (the ``anchored_main`` ones, plus whatever
    record-style extras ``measure_main`` always renders regardless of the key
    list it is given). The skeleton's page span is independent of where the
    movable sections go, so it is a fixed point we can measure once.

    Three deterministic steps (no iteration, so no oscillation):

    1. **Skeleton pages.** ``skeleton_pages = measure_main([anchored keys])``.
       Passing only the anchored keys makes the caller's ``measure_main``
       render main with every movable section skipped, leaving exactly the
       skeleton. Every page ``2..skeleton_pages`` is a "safe" continuation
       page: it exists because of non-movable content, so moving a movable
       section onto its rail can never leave that page's main column empty or
       change the page count.

    2. **Page-1 balance + overflow seeding.** Run the pure ``plan_columns``
       with one bucket per skeleton page and ``main_budget =
       page1_main_budget``. This balances page 1 (main vs page-1 rail) exactly
       like the single-page planner and first-fits sidebar-affinity overflow
       (e.g. Languages that does not fit page 1) onto the continuation rails.
       ``main_budget`` is page-1-scoped on purpose: a lump sum spanning every
       page would make ``empty_main`` look enormous and pull sidebar content
       *into* main to fill a phantom multi-page capacity, draining the rail.

    3. **Move main-affinity leftovers to the page they really land on.** A
       real ``measure_main(plan.main)`` reports each remaining main section's
       start page. A movable leftover (non-anchored, sidebar-capable, still in
       main — Education is the canonical case) whose start page ``P`` is a safe
       continuation page (``2 <= P <= skeleton_pages``) and that fits page
       ``P``'s rail is moved there, so the rail beside it is not empty. A
       leftover past the skeleton's last page is left in main: it is what
       *creates* that page, so railing it would leave the main column empty.

    With a one-page skeleton no continuation bucket exists and step 3 is
    skipped, so a CV whose main fits page 1 reduces to the single-page planner
    exactly.
    """
    by_key = {section.key: section for section in sections}
    anchored_keys = [section.key for section in sections if section.anchored_main]
    skeleton_pages = max(1, measure_main(anchored_keys).pages_used)

    # The rail budget is uniform on every continuation page, so provision a
    # generous bucket list up front (one per page the FULL main could plausibly
    # reach). Continuation buckets past the real main page count simply stay
    # empty; step 3's per-section checks below never place onto a page the main
    # column does not actually reach.
    full_pages = max(skeleton_pages, measure_main([s.key for s in sections]).pages_used)
    buckets = [SidebarBucket(1, page1_sidebar_budget)] + [
        SidebarBucket(page, continuation_sidebar_budget)
        for page in range(2, full_pages + 1)
    ]
    plan = plan_columns(
        sections, sidebar_buckets=buckets, main_budget=page1_main_budget,
        imbalance_tolerance=imbalance_tolerance, min_improvement=min_improvement,
    )
    if full_pages < 2:
        return plan

    # Step 3: move main-affinity leftovers (Education is the canonical case)
    # onto the continuation rail of the page they truly land on — but only
    # while the page survives WITHOUT them, so a continuation page never ends
    # up with content in the rail and an empty main column. This is a greedy
    # pass verified by real measurement: each round re-measures the current
    # main, rails the first (reading-order) leftover whose page both (a) has
    # rail room and (b) is still reached by the remaining main once that
    # leftover is removed, then repeats. Bounded by the leftover count (tiny),
    # so it always terminates.
    budget_by_page = {bucket.page: bucket.budget for bucket in buckets}
    rail_used = {
        bucket.page: sum(
            float(by_key[key].sidebar_height or 0.0)
            for key in plan.sidebar_by_page.get(bucket.page, [])
        )
        for bucket in buckets
    }
    remaining_main = list(plan.main)
    railed: dict[int, list[str]] = {bucket.page: [] for bucket in buckets}

    def _movable(key: str) -> bool:
        section = by_key.get(key)
        return (
            section is not None
            and not section.anchored_main
            and section.sidebar_height is not None
        )

    while True:
        start_page = measure_main(remaining_main).start_page_by_key
        chosen: str | None = None
        chosen_page = 0
        for key in remaining_main:
            if not _movable(key):
                continue
            page = start_page.get(key)
            if page is None or page < 2 or page not in budget_by_page:
                continue
            height = float(by_key[key].sidebar_height)
            if rail_used[page] + height > budget_by_page[page] + 0.01:
                continue
            # Page must still be reached by main content once this leftover
            # leaves — otherwise railing it would blank that page's main column.
            trial = [other for other in remaining_main if other != key]
            if measure_main(trial).pages_used >= page:
                chosen, chosen_page = key, page
                break
        if chosen is None:
            break
        rail_used[chosen_page] += float(by_key[chosen].sidebar_height)
        railed[chosen_page].append(chosen)
        remaining_main.remove(chosen)

    if not any(railed.values()):
        return plan

    new_sidebar = {
        page: list(plan.sidebar_by_page.get(page, [])) for page in budget_by_page
    }
    for page, keys in railed.items():
        new_sidebar[page].extend(keys)
        new_sidebar[page].sort(key=lambda key: by_key[key].order_rank)
    return ColumnPlan(main=remaining_main, sidebar_by_page=new_sidebar)
