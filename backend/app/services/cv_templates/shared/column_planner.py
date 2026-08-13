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

    ``content_height`` is the total main-column height the render consumed (in
    the same points the budgets use). It lets the orchestrator learn how much
    of page 1 the skeleton fills *including* record-style extras that are
    invisible to the pure planner's per-section descriptor heights. Callers
    that do not compute it leave it 0.0, which the orchestrator reads as "no
    extra overhead beyond the tracked descriptors".
    """

    pages_used: int
    start_page_by_key: dict[str, int] = field(default_factory=dict)
    content_height: float = 0.0


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
       with one bucket per *skeleton* page. This balances page 1 (main vs
       page-1 rail) like the single-page planner and first-fits sidebar-affinity
       overflow (e.g. Languages that does not fit page 1) onto the continuation
       rails — but only onto skeleton pages, which are guaranteed to carry main
       content. Overflow with no safe skeleton rail is evicted back to main by
       ``plan_columns`` and flows down the main column there (this is what
       stops a section such as Certifications from stranding itself on a rail
       whose main column would be empty). The balance ``main_budget`` is
       ``page1_main_budget`` only when the skeleton fits one page; once the
       skeleton spans two or more pages, page-1 main is already full of
       non-movable content (Experience + record extras, which are invisible to
       the pure planner's descriptor heights), so the budget is 0 — otherwise
       ``empty_main`` would look large and the balancer would pull sidebar
       overflow off a continuation rail into the main column to "fill page 1".
       Passing a lump sum spanning every page would have the same draining
       effect for the opposite reason (a phantom multi-page main capacity).

    3. **Move movable leftovers to the page they really land on.** A real
       ``measure_main(plan.main)`` reports each remaining main section's start
       page. A movable leftover (non-anchored, sidebar-capable, still in main —
       Education, or an overflow section evicted in step 2) whose start page
       ``P`` is a page the current main column actually reaches (``2 <= P <=
       measured main pages`` — this may exceed ``skeleton_pages`` when the
       leftovers themselves create a page) and that fits page ``P``'s rail is
       moved there, but only while page ``P`` still survives WITHOUT it
       (a per-section measurement check). So a rail is never populated beside
       an empty main column, and when two leftovers share a new page the first
       is railed while the second holds the main column. The check runs
       greedily, re-measuring each round; because it only ever removes sections
       from main, main shrinks monotonically and it always terminates.

    A CV whose main fits page 1 has a one-page skeleton, seeds nothing beyond
    page 1, and finds no leftover on page >= 2, so it reduces to the
    single-page planner exactly.
    """
    by_key = {section.key: section for section in sections}
    anchored_keys = [section.key for section in sections if section.anchored_main]
    skeleton = measure_main(anchored_keys)
    skeleton_pages = max(1, skeleton.pages_used)

    def rail_budget(page: int) -> float:
        return page1_sidebar_budget if page == 1 else continuation_sidebar_budget

    # Step 2: page-1 balance. Seed sidebar-affinity overflow ONLY onto pages the
    # skeleton reaches — those are guaranteed to carry main content, so an
    # overflow section there always sits beside a non-empty main column.
    # Overflow with nowhere safe to go is evicted back to the main column by
    # `plan_columns` (single-page behaviour) and simply flows down the page
    # there; step 3 may still rail it later if it lands on a surviving page.
    seed_buckets = [SidebarBucket(1, page1_sidebar_budget)] + [
        SidebarBucket(page, continuation_sidebar_budget)
        for page in range(2, skeleton_pages + 1)
    ]
    # The pure planner sees only per-section descriptor heights, so it cannot
    # see record-style extras (Projects) that also consume the main column.
    # Scope the balance budget to the REAL page-1 main headroom, measured from
    # the skeleton, so `empty_main` reflects the space movable sections could
    # actually fill on page 1:
    #   * Skeleton spans >= 2 pages -> page-1 main is already full, headroom 0.
    #     (Stops the balancer pulling page-2 rail overflow such as Certifications
    #     into main to "fill page 1" when that content renders on page 2.)
    #   * Skeleton fits one page -> headroom is what's left after the skeleton's
    #     measured height, i.e. page1_main_budget minus the record-extra overhead
    #     the descriptors omit (skeleton height above the anchored descriptors).
    #     Without this, a page-1 main that Experience + Projects fill looks
    #     half-empty, so Education is kept in main and pushed to page 2 instead
    #     of onto the roomy page-1 rail. A genuinely short Experience leaves real
    #     headroom, so Education still fills the main column
    #     (test_short_experience_keeps_education_in_main).
    if skeleton_pages >= 2:
        balance_main_budget = 0.0
    else:
        anchored_height = sum(
            float(section.main_height) for section in sections if section.anchored_main
        )
        extra_overhead = max(0.0, skeleton.content_height - anchored_height)
        balance_main_budget = max(0.0, page1_main_budget - extra_overhead)
    plan = plan_columns(
        sections, sidebar_buckets=seed_buckets, main_budget=balance_main_budget,
        imbalance_tolerance=imbalance_tolerance, min_improvement=min_improvement,
    )

    # Step 3: move movable leftovers (Education, or any sidebar-affinity section
    # evicted back to main in step 2) onto the continuation rail of the page
    # they truly land on — but only while the page survives WITHOUT them, so a
    # continuation page never ends up with rail content beside an empty main
    # column. A section may target ANY page the current main column actually
    # reaches, not just skeleton pages, so a page that exists only because of
    # movable content (Education spilling past a one-page skeleton) can still
    # host one of them in its rail while another holds its main column. Greedy
    # and verified by real measurement each round; bounded by the leftover
    # count, so it always terminates.
    def _movable(key: str) -> bool:
        section = by_key.get(key)
        return (
            section is not None
            and not section.anchored_main
            and section.sidebar_height is not None
        )

    remaining_main = list(plan.main)
    sidebar_by_page: dict[int, list[str]] = {
        page: list(keys) for page, keys in plan.sidebar_by_page.items()
    }
    rail_used: dict[int, float] = {
        page: sum(float(by_key[key].sidebar_height or 0.0) for key in keys)
        for page, keys in sidebar_by_page.items()
    }

    while True:
        measurement = measure_main(remaining_main)
        main_pages = measurement.pages_used
        start_page = measurement.start_page_by_key
        chosen: str | None = None
        chosen_page = 0
        for key in remaining_main:
            if not _movable(key):
                continue
            page = start_page.get(key)
            if page is None or page < 2 or page > main_pages:
                continue
            height = float(by_key[key].sidebar_height)
            if rail_used.get(page, 0.0) + height > rail_budget(page) + 0.01:
                continue
            # The page must still be reached by main content once this leftover
            # leaves — otherwise railing it would blank that page's main column.
            trial = [other for other in remaining_main if other != key]
            if measure_main(trial).pages_used >= page:
                chosen, chosen_page = key, page
                break
        if chosen is None:
            break
        rail_used[chosen_page] = rail_used.get(chosen_page, 0.0) + float(by_key[chosen].sidebar_height)
        sidebar_by_page.setdefault(chosen_page, []).append(chosen)
        remaining_main.remove(chosen)

    for page in sidebar_by_page:
        sidebar_by_page[page].sort(key=lambda key: by_key[key].order_rank)
    return ColumnPlan(main=remaining_main, sidebar_by_page=sidebar_by_page)
