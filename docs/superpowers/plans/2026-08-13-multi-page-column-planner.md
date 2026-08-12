# Multi-page-aware two-column section placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize Sterling's two-column section planner so a continuation page's otherwise-empty sidebar rail can receive short sections (e.g. Certifications), instead of every leftover section piling into the main column once it spills past page 1.

**Architecture:** `column_planner.py`'s pure `plan_columns` partitioner grows from one hard-coded page-1 sidebar bucket to N page-scoped `SidebarBucket`s. A new orchestrator, `plan_columns_multi_page`, resolves the circular dependency between "which sections are in the sidebar" and "how many pages the main column needs" with a bounded iteration (≤3 passes) that alternates the pure partitioner with a real pagination measurement supplied by the caller. Sterling wires this in by extracting its main-column render dispatch into a function reusable for both the throwaway measurement pass and the final render, and by generalizing its sidebar-rendering block to run once per bucket instead of only for page 1.

**Tech Stack:** Python (backend generator + planner), pytest (backend tests). No frontend changes — `packSidebarLane` (`frontend/src/utils/sectionStructure.js`) is already page-agnostic (confirmed during design; see spec §3).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-multi-page-column-planner-design.md` — read it before touching code; every task below implements a section of it.
- **Sterling-only rollout.** Tessera and Slate are not touched (spec §2, §10).
- **Row-level Y alignment between a sidebar entry and a specific main-column record is out of scope** (spec §2, §10) — a bucket's content starts at the top of that page's rail, independent of main-column cursor position.
- **Never invent a page.** A sidebar bucket for page P only exists once the main column's real measurement shows it already uses page P (spec §2, §6).
- `plan_columns`'s signature and `ColumnPlan`'s shape are a **breaking change** — Sterling is the only caller in the repo (confirmed via grep) and is updated in the same change.
- Every step that changes `backend/app/services/cv_templates/shared/column_planner.py` or `backend/app/services/cv_templates/templates/sterling.py` must update `README.md` (English + Polish) in the same task per the repository's documentation policy — done in Task 5.
- Budgets (Sterling, spec §5.4): `page1_sidebar_budget = 760 - content_top`, `continuation_sidebar_budget = 760 - PAGE_TOP`, `page1_main_budget = 770 - content_top`, `continuation_main_budget = 770 - PAGE_TOP`. `PAGE_TOP` (66) and the literal `770`/`760` bounds are existing constants from `app/services/cv_generator_primitives.py`; Sterling already uses the `770`/`760` literals today and does not override `continuation_top()`.

---

## Task 1: Generalize the pure partitioner to N sidebar buckets

**Files:**
- Modify: `backend/app/services/cv_templates/shared/column_planner.py`
- Test: `backend/tests/test_column_planner.py`

**Interfaces:**
- Produces: `SidebarBucket(page: int, budget: float)`, `ColumnPlan(main: list[str], sidebar_by_page: dict[int, list[str]])`, `plan_columns(sections, *, sidebar_buckets: list[SidebarBucket], main_budget: float, imbalance_tolerance: float = 60.0, min_improvement: float = 24.0) -> ColumnPlan`. `PlaceableSection` is unchanged. These are consumed by Task 2 (`plan_columns_multi_page` calls `plan_columns` directly) and Task 3 (Sterling calls the orchestrator from Task 2, not `plan_columns` directly).

- [ ] **Step 1: Write the failing tests (adapt the existing 9 + add 2 bucket-aware cases)**

Replace the full contents of `backend/tests/test_column_planner.py` with:

```python
"""Unit tests for the pure two-column section placement planner.

These exercise the partitioning algorithm with synthetic heights, independent
of the CV generation stack, so the balancing rules are pinned precisely.
"""
from app.services.cv_templates.shared.column_planner import (
    ColumnPlan,
    PlaceableSection,
    SidebarBucket,
    plan_columns,
)


def _sections_short_experience():
    # Experience is short, so Education (main-affinity) stays in the main column
    # and the main column still has room for a balancing move.
    return [
        PlaceableSection("summary", 0, "sidebar", main_height=110, sidebar_height=130),
        PlaceableSection("experience", 1, "main", main_height=120, sidebar_height=None, anchored_main=True),
        PlaceableSection("education", 2, "main", main_height=80, sidebar_height=100),
        PlaceableSection("skills", 3, "sidebar", main_height=140, sidebar_height=150),
        PlaceableSection("languages", 4, "sidebar", main_height=50, sidebar_height=60),
    ]


def test_experience_is_always_in_the_main_column():
    plan = plan_columns(
        _sections_short_experience(), sidebar_buckets=[SidebarBucket(1, 400)], main_budget=400,
    )
    assert "experience" in plan.main
    assert "experience" not in plan.sidebar_by_page[1]


def test_partition_is_a_disjoint_cover_of_the_input():
    sections = _sections_short_experience()
    plan = plan_columns(sections, sidebar_buckets=[SidebarBucket(1, 400)], main_budget=400)
    placed = sorted(plan.main + plan.sidebar_by_page[1])
    assert placed == sorted(s.key for s in sections)
    assert set(plan.main).isdisjoint(plan.sidebar_by_page[1])


def test_sidebar_assignment_never_exceeds_its_budget():
    sections = _sections_short_experience()
    plan = plan_columns(sections, sidebar_buckets=[SidebarBucket(1, 400)], main_budget=400)
    by_key = {s.key: s for s in sections}
    side_total = sum(by_key[k].sidebar_height for k in plan.sidebar_by_page[1])
    assert side_total <= 400 + 0.01


def test_short_experience_keeps_education_in_main():
    plan = plan_columns(
        _sections_short_experience(), sidebar_buckets=[SidebarBucket(1, 400)], main_budget=400,
    )
    assert "education" in plan.main


def test_columns_are_ordered_by_rank():
    plan = plan_columns(
        _sections_short_experience(), sidebar_buckets=[SidebarBucket(1, 400)], main_budget=400,
    )
    order = {"summary": 0, "experience": 1, "education": 2, "skills": 3, "languages": 4}
    assert plan.main == sorted(plan.main, key=order.__getitem__)
    assert plan.sidebar_by_page[1] == sorted(plan.sidebar_by_page[1], key=order.__getitem__)


def test_large_experience_pushes_education_to_sidebar():
    # Experience nearly fills the main column, so Education (main-affinity) is
    # moved into the sidebar to balance rather than overflowing main further.
    sections = [
        PlaceableSection("experience", 1, "main", main_height=380, sidebar_height=None, anchored_main=True),
        PlaceableSection("education", 2, "main", main_height=80, sidebar_height=100),
        PlaceableSection("skills", 3, "sidebar", main_height=140, sidebar_height=150),
        PlaceableSection("languages", 4, "sidebar", main_height=50, sidebar_height=70),
    ]
    plan = plan_columns(sections, sidebar_buckets=[SidebarBucket(1, 400)], main_budget=400)
    assert "education" in plan.sidebar_by_page[1]
    assert "experience" in plan.main


def test_huge_experience_keeps_sidebar_feasible_and_paginates_main():
    # Experience alone exceeds a page; the sidebar must still fit page 1.
    sections = [
        PlaceableSection("experience", 1, "main", main_height=1200, sidebar_height=None, anchored_main=True),
        PlaceableSection("education", 2, "main", main_height=90, sidebar_height=110),
        PlaceableSection("skills", 3, "sidebar", main_height=140, sidebar_height=150),
    ]
    plan = plan_columns(sections, sidebar_buckets=[SidebarBucket(1, 400)], main_budget=400)
    by_key = {s.key: s for s in sections}
    side_total = sum(by_key[k].sidebar_height for k in plan.sidebar_by_page[1])
    assert side_total <= 400 + 0.01
    assert "experience" in plan.main


def test_min_improvement_prevents_a_trivial_move():
    # Seed is already balanced within tolerance; nothing should move.
    # main = experience+education = 380 (empty 20); sidebar = skills = 360
    # (empty 40); cost = 40 <= tolerance, so the seed is returned unchanged.
    sections = [
        PlaceableSection("experience", 1, "main", main_height=190, sidebar_height=None, anchored_main=True),
        PlaceableSection("education", 2, "main", main_height=190, sidebar_height=180),
        PlaceableSection("skills", 3, "sidebar", main_height=200, sidebar_height=360),
    ]
    plan = plan_columns(
        sections, sidebar_buckets=[SidebarBucket(1, 400)], main_budget=400,
        imbalance_tolerance=60, min_improvement=24,
    )
    assert plan.main == ["experience", "education"]
    assert plan.sidebar_by_page[1] == ["skills"]


def test_section_too_tall_for_sidebar_is_forced_into_main():
    sections = [
        PlaceableSection("experience", 1, "main", main_height=100, sidebar_height=None, anchored_main=True),
        PlaceableSection("skills", 3, "sidebar", main_height=140, sidebar_height=None),
    ]
    plan = plan_columns(sections, sidebar_buckets=[SidebarBucket(1, 400)], main_budget=400)
    assert "skills" in plan.main
    assert plan.sidebar_by_page[1] == []


def test_section_that_overflows_bucket_one_seeds_into_bucket_two():
    # Skills alone already fills bucket 1's rail; Languages doesn't fit what's
    # left there but fits bucket 2's rail outright, so first-fit seeding
    # across buckets (ascending page order) places it there directly. Main is
    # already over its own budget from Experience alone, so the balance loop
    # has no incentive to pull anything back into main afterward.
    sections = [
        PlaceableSection("experience", 1, "main", main_height=900, sidebar_height=None, anchored_main=True),
        PlaceableSection("skills", 3, "sidebar", main_height=140, sidebar_height=90),
        PlaceableSection("languages", 4, "sidebar", main_height=50, sidebar_height=90),
    ]
    plan = plan_columns(
        sections,
        sidebar_buckets=[SidebarBucket(1, 100), SidebarBucket(2, 100)],
        main_budget=400,
    )
    assert plan.sidebar_by_page[1] == ["skills"]
    assert plan.sidebar_by_page[2] == ["languages"]
    assert plan.main == ["experience"]


def test_feasibility_repair_generalizes_to_any_bucket_page():
    # Two equal-sized sidebar-affinity sections both seed into the sole bucket
    # (numbered 2, not 1 — proving repair isn't hardcoded to page 1) and
    # overflow its budget; repair evicts the lowest-priority one back to main.
    # Main is already at its budget from Experience alone, so the balance loop
    # has no incentive to move anything back into the bucket afterward.
    sections = [
        PlaceableSection("experience", 1, "main", main_height=300, sidebar_height=None, anchored_main=True),
        PlaceableSection("skills", 3, "sidebar", main_height=50, sidebar_height=60),
        PlaceableSection("languages", 4, "sidebar", main_height=50, sidebar_height=60),
    ]
    plan = plan_columns(
        sections, sidebar_buckets=[SidebarBucket(2, 100)], main_budget=300,
    )
    assert plan.sidebar_by_page[2] == ["skills"]
    assert "languages" in plan.main
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_column_planner.py -v`
Expected: FAIL — `ImportError: cannot import name 'SidebarBucket'` (and/or `TypeError: plan_columns() got an unexpected keyword argument 'sidebar_buckets'`), since `column_planner.py` still has the single-bucket API.

- [ ] **Step 3: Implement the generalized partitioner**

Replace the full contents of `backend/app/services/cv_templates/shared/column_planner.py` with:

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_column_planner.py -v`
Expected: PASS — all 11 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/cv_templates/shared/column_planner.py backend/tests/test_column_planner.py
git commit -m "feat: generalize column planner to N page-scoped sidebar buckets"
```

---

## Task 2: Add the multi-page orchestrator (`plan_columns_multi_page`)

**Files:**
- Modify: `backend/app/services/cv_templates/shared/column_planner.py`
- Test: `backend/tests/test_column_planner.py`

**Interfaces:**
- Consumes: `plan_columns`, `SidebarBucket`, `ColumnPlan`, `PlaceableSection` (Task 1).
- Produces: `MainMeasurement(pages_used: int)`, `plan_columns_multi_page(sections, *, page1_sidebar_budget, continuation_sidebar_budget, page1_main_budget, continuation_main_budget, measure_main: Callable[[list[str]], MainMeasurement], imbalance_tolerance=60.0, min_improvement=24.0, max_iterations=3) -> ColumnPlan`. Consumed by Task 3 (Sterling calls this instead of `plan_columns` directly).

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_column_planner.py`, replace the import block at the top of the file:

```python
from app.services.cv_templates.shared.column_planner import (
    ColumnPlan,
    PlaceableSection,
    SidebarBucket,
    plan_columns,
)
```

with:

```python
from app.services.cv_templates.shared.column_planner import (
    ColumnPlan,
    MainMeasurement,
    PlaceableSection,
    SidebarBucket,
    plan_columns,
    plan_columns_multi_page,
)
```

Then append these test functions at the end of the file:

```python
def test_plan_columns_multi_page_one_page_matches_plan_columns():
    # A fake measure_main that always reports 1 page never derives a bucket
    # beyond page 1, so the orchestrator's output must match a direct
    # single-bucket plan_columns call exactly (spec §7, regression safety).
    sections = _sections_short_experience()

    def fake_measure_main(order):
        return MainMeasurement(pages_used=1)

    multi = plan_columns_multi_page(
        sections,
        page1_sidebar_budget=400,
        continuation_sidebar_budget=400,
        page1_main_budget=400,
        continuation_main_budget=400,
        measure_main=fake_measure_main,
    )
    single = plan_columns(sections, sidebar_buckets=[SidebarBucket(1, 400)], main_budget=400)
    assert multi.main == single.main
    assert multi.sidebar_by_page == single.sidebar_by_page


def test_plan_columns_multi_page_derives_a_page_two_bucket():
    # Experience alone exceeds even the 2-page main budget, so the main
    # column never has slack to "win" the balance loop — sidebar-affinity
    # content that doesn't fit page 1's rail lands on page 2's instead of
    # being pulled back into main.
    sections = [
        PlaceableSection("experience", 1, "main", main_height=900, sidebar_height=None, anchored_main=True),
        PlaceableSection("skills", 3, "sidebar", main_height=140, sidebar_height=90),
        PlaceableSection("languages", 4, "sidebar", main_height=50, sidebar_height=90),
    ]

    def fake_measure_main(order):
        return MainMeasurement(pages_used=2)

    plan = plan_columns_multi_page(
        sections,
        page1_sidebar_budget=100,
        continuation_sidebar_budget=100,
        page1_main_budget=400,
        continuation_main_budget=400,
        measure_main=fake_measure_main,
    )
    assert plan.sidebar_by_page[1] == ["skills"]
    assert plan.sidebar_by_page[2] == ["languages"]


def test_plan_columns_multi_page_converges_when_bucket_list_stabilizes():
    # A fake measure_main that always reports 2 pages derives a page-2 bucket
    # on iteration 1 and finds the *same* page count measuring against that
    # 2-bucket plan on iteration 2 — the bucket list and main budget stop
    # changing, so the loop must stop calling measure_main after that.
    calls = []
    sections = _sections_short_experience()

    def fake_measure_main(order):
        calls.append(order)
        return MainMeasurement(pages_used=2)

    plan_columns_multi_page(
        sections,
        page1_sidebar_budget=400,
        continuation_sidebar_budget=400,
        page1_main_budget=400,
        continuation_main_budget=400,
        measure_main=fake_measure_main,
        max_iterations=5,
    )
    assert len(calls) == 2


def test_plan_columns_multi_page_never_infinite_loops():
    sections = _sections_short_experience()
    call_count = 0

    def flapping_measure_main(order):
        nonlocal call_count
        call_count += 1
        # Alternates between 2 and 1 pages every call, so the derived bucket
        # list never stabilizes — the hard `max_iterations` cap must still
        # terminate the loop deterministically instead of looping forever.
        return MainMeasurement(pages_used=2 if call_count % 2 else 1)

    plan = plan_columns_multi_page(
        sections,
        page1_sidebar_budget=400,
        continuation_sidebar_budget=400,
        page1_main_budget=400,
        continuation_main_budget=400,
        measure_main=flapping_measure_main,
        max_iterations=3,
    )
    assert call_count == 3
    assert plan is not None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_column_planner.py -v`
Expected: FAIL — `ImportError: cannot import name 'MainMeasurement'` (and/or `'plan_columns_multi_page'`).

- [ ] **Step 3: Implement the orchestrator**

Append to the end of `backend/app/services/cv_templates/shared/column_planner.py`:

```python
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
    return plan
```

Also update the module's `from dataclasses import dataclass` import line to add `Callable`:

```python
from dataclasses import dataclass
from typing import Callable
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_column_planner.py -v`
Expected: PASS — all 15 tests green (11 from Task 1 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/cv_templates/shared/column_planner.py backend/tests/test_column_planner.py
git commit -m "feat: add plan_columns_multi_page orchestrator for continuation-page sidebar buckets"
```

---

## Task 3: Wire Sterling to the multi-page orchestrator

**Files:**
- Modify: `backend/app/services/cv_templates/templates/sterling.py`

**Interfaces:**
- Consumes: `SidebarBucket` (unused directly — via `plan_columns_multi_page`), `MainMeasurement`, `PlaceableSection`, `plan_columns_multi_page` (Task 2). `PAGE_TOP` from `app.services.cv_generator_primitives`.
- Produces: no new public interface — `_gen_sterling`'s return shape (`list[dict]`) is unchanged; sidebar elements may now carry `page` values > 1.

- [ ] **Step 1: Replace `backend/app/services/cv_templates/templates/sterling.py` in full**

```python
from __future__ import annotations

"""Sterling CV template generator.

An elegant, harmonious blue-gray two-column layout. The centered masthead
(serif display name, tracked uppercase title, mid-dot contact line) sits on a
full-width tinted "letterhead band", closed at the bottom by a horizontal rule
that separates it from the two-column body. The band reuses the rail tint and
the sidebar divider only begins at the band's bottom edge, so the divider never
runs up through the centered name/title/contact (which span the page center and
cross the sidebar column boundary). A wide sidebar rail carries Summary,
Education, Skills, and Languages (plus any other simple/flat extra section)
to the left of a thin vertical divider; the main column carries only
Experience (plus any record-style extras, e.g. Projects). One rule color
(`C['rule']`, a soft blue-gray) is reused for the masthead underline, the
sidebar divider, and every section rule, so the page reads as one coherent,
quiet system rather than a collection of separately-styled dividers.

Structural family: the same proven two-column shape as Tessera / Slate /
Harbor. Sidebar content lives on an independent `flowLane: "sidebar"`
cursor (`sectionStructure.js`'s `packSidebarLane`), with its kickers tagged
`flowRole: "sidebar-chrome"` so density knobs retarget the rail without it
ever entering the main-column packer (`listDocumentSections` /
`sameColumnAsHeading`). Sterling puts every "simple" (flat-list) section in
the sidebar via the shared, unfiltered `_sidebar_candidates` /
`_fit_sidebar_sections` fitting mechanism (Skills, Languages, and any
flattenable extras), with Education as the one structured exception that
mechanism already supports (`_education_sidebar_content`). Main column
records (Experience, and any record-kind extras `_sidebar_candidates` never
offers to the rail in the first place) reuse the shared
`_place_experience_record` / `_place_education_record` helpers unchanged —
no same-row or individually-positioned decoration was introduced, so this
inherits the packer-safety guarantees documented in `blueprint.py` without
needing to re-derive them.

Continuation pages can also receive sidebar content: the balance-driven
planner in `column_planner.py` generalizes to one bucket per page the main
column already occupies, so a rail that would otherwise sit empty next to
page-2+ content can carry a short section instead — see
docs/superpowers/specs/2026-08-12-multi-page-column-planner-design.md.

Layout decisions are deterministic Python (never sent to the model).
"""

from app.services.cv_data import skill_groups
from app.services.cv_generator_primitives import (
    Builder,
    get_spacing,
    PAGE_TOP,
    _line,
    _text,
)
from app.services.cv_templates.shared.column_planner import (
    MainMeasurement,
    PlaceableSection,
    plan_columns_multi_page,
)
from app.services.cv_templates.shared.extras import (
    _extra_sections,
    _fit_sidebar_sections,
    _fitted_sidebar_body_elements,
    _sidebar_candidates,
    _sidebar_education_type_sizes,
    _sidebar_wrapped_height,
)
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _experience_record_height,
    _place_education_record,
    _place_experience_record,
    _sidebar_education_entries,
    _sidebar_education_section_height,
)
from app.services.cv_templates.shared.text import (
    _compact_text,
    _contact_line,
    _labels,
    _language_entries,
    _measure_languages_grid_height,
    _measure_skills_body,
    _place_skills_section,
)


def _gen_sterling(cv: dict) -> list[dict]:
    """Centered letterhead masthead, wide sidebar rail, single-section main column."""
    C = {
        'paper': '#F7F8FA', 'ink': '#26313F',
        'accent': '#4A6FA5', 'accent_deep': '#33517A',
        'muted': '#6B7684', 'sidebar_bg': '#EDF1F6', 'rule': '#C7CFDA',
        'display': 'CormorantGaramond', 'sans': 'Montserrat',
    }
    SANS, DISPLAY = (C['sans'], C['display'])
    lbl = _labels(cv)

    # "szerszym sidebarem" — wide 210 pt rail (vs typical ~180 pt sidebars).
    SIDEBAR_W = 210.0
    DIVIDER_W = 1.0
    SIDE_L = 34.0
    SIDE_W = SIDEBAR_W - SIDE_L - 24.0  # 152
    MAIN_L = SIDEBAR_W + DIVIDER_W + 34.0  # 245
    MAIN_W = 595.0 - MAIN_L - 50.0  # 300
    PAGE_CENTER = 297.5
    LETTERHEAD_W = 460.0
    LETTERHEAD_L = PAGE_CENTER - LETTERHEAD_W / 2.0

    # ── Masthead: centered "letterhead" — name / title / contact — closed by a
    # horizontal rule that separates it from the two-column body below. Every
    # element carries flowRole "masthead" (exempt from all section packing),
    # so centering it is free of the column-detection concerns that apply to
    # section headings. ────────────────────────────────────────────────────
    NAME_FS, NAME_LH = (30.0, 34.0)
    TITLE_FS, TITLE_LH = (11.5, 15.0)
    CONTACT_FS, CONTACT_LH = (9.4, 13.5)
    MAST_TOP = 46.0

    name = _compact_text(cv.get('name'), 40)
    title = _compact_text(cv.get('title'), 60).upper()
    contact = _compact_text(_contact_line(cv), 130)

    header: list[dict] = []
    cursor_y = MAST_TOP
    if name:
        name_h = Builder.measure_block(name, LETTERHEAD_W, NAME_FS, NAME_LH, DISPLAY, bold=True)
        header.append({
            'category': 'textarea', 'content': name, 'left': LETTERHEAD_L, 'top': cursor_y,
            'width': LETTERHEAD_W, 'height': name_h, 'fontSize': NAME_FS, 'lineHeight': NAME_LH,
            'letterSpacing': 0, 'color': C['ink'], 'fontFamily': DISPLAY, 'zIndex': 3,
            'page': 1, 'bold': True, 'italic': False, 'align': 'center', 'bulletList': False,
            'autoHeight': True, 'preserveInitialLayout': True,
        })
        cursor_y += name_h + 6.0
    if title:
        title_h = Builder.measure_block(title, LETTERHEAD_W, TITLE_FS, TITLE_LH, SANS)
        header.append({
            'category': 'textarea', 'content': title, 'left': LETTERHEAD_L, 'top': cursor_y,
            'width': LETTERHEAD_W, 'height': title_h, 'fontSize': TITLE_FS, 'lineHeight': TITLE_LH,
            'letterSpacing': 2.0, 'color': C['accent'], 'fontFamily': SANS, 'zIndex': 3,
            'page': 1, 'bold': False, 'italic': False, 'align': 'center', 'bulletList': False,
            'autoHeight': True, 'preserveInitialLayout': True,
        })
        cursor_y += title_h + 10.0
    if contact:
        contact_h = Builder.measure_block(contact, LETTERHEAD_W, CONTACT_FS, CONTACT_LH, SANS)
        header.append({
            'category': 'textarea', 'content': contact, 'left': LETTERHEAD_L, 'top': cursor_y,
            'width': LETTERHEAD_W, 'height': contact_h, 'fontSize': CONTACT_FS, 'lineHeight': CONTACT_LH,
            'letterSpacing': 0.3, 'color': C['muted'], 'fontFamily': SANS, 'zIndex': 3,
            'page': 1, 'bold': False, 'italic': False, 'align': 'center', 'bulletList': False,
            'autoHeight': True, 'preserveInitialLayout': True,
        })
        cursor_y += contact_h

    rule_y = cursor_y + 20.0
    header.append(_line(SIDE_L, rule_y, (595.0 - 50.0) - SIDE_L, 1, C['rule'], zIndex=1))
    header = [{**element, 'flowRole': 'masthead'} for element in header]

    content_top = rule_y + 30.0

    # ── Type scale shared by both columns. Defined up front because the section
    # planner measures every section in both column widths before any rendering.
    KICKER_FS = 9.4
    BODY_FS, BODY_LH = (9.5, 13.8)
    # Sidebar body font: the top tier of `_fit_sidebar_sections`' auto-fit ladder
    # (`_SIDEBAR_FONT_SIZES[0]` = 8.3, paired line height `round(max(fs*1.45,
    # 11.0), 2)`), so the summary reads at the same size as the fitted sidebar
    # candidates (`test_summary_matches_experience_body_type_size`).
    SIDE_SUMMARY_FS, SIDE_SUMMARY_LH = (8.3, 12.04)
    CHROME_GAP = KICKER_FS * 1.2 + 5.0 + 1.4 + 10.0
    HEADING_FS = 14.0
    SECTION_CHROME = HEADING_FS * 1.05 + 6.0 + 1.0 + get_spacing().after_rule
    TITLE_FS2, TITLE_LH2 = (11.2, 14.0)
    META_FS, META_LH = (8.6, 11.8)
    # Per-section sidebar chrome advance used by `_fit_sidebar_sections`
    # (kicker 10 + tick gap 5 + trailing 18); the summary uses `CHROME_GAP`.
    SIDEBAR_CHROME = 10 + 5 + 18
    # Canonical reading order. Education sorts right after Experience for the
    # MAIN column; the sidebar keeps its own order because `_fit_sidebar_sections`
    # preserves the `_sidebar_candidates` sequence (education last there).
    RANK = {
        'summary': 0, 'experience': 1, 'education': 2,
        'skills': 3, 'languages': 4, 'certifications': 5, 'interests': 6,
    }

    def sidebar_kicker(label: str, top: float) -> list[dict]:
        heading = _text(label.upper(), KICKER_FS, SANS, C['accent_deep'], SIDE_L, top, zIndex=3, bold=True)
        heading['letterSpacing'] = 1.3
        heading['flowRole'] = 'sidebar-chrome'
        tick = _line(SIDE_L, top + KICKER_FS * 1.2 + 5.0, 22, 1.4, C['accent'], zIndex=2)
        tick['flowRole'] = 'sidebar-chrome'
        return [heading, tick]

    def section(b: "Builder", label: str) -> None:
        y = b.y
        page = b.pg
        heading = _text(label, HEADING_FS, SANS, C['ink'], MAIN_L, y, zIndex=3, page=page, bold=True)
        heading['letterSpacing'] = 0.8
        heading['flowRole'] = 'section-chrome'
        b.els.append(heading)
        rule_line_y = y + HEADING_FS * 1.05 + 6.0
        rule = _line(MAIN_L, rule_line_y, MAIN_W, 1, C['rule'], zIndex=2, page=page)
        rule['flowRole'] = 'section-chrome'
        b.els.append(rule)
        b.y = rule_line_y + 1.0 + get_spacing().after_rule

    def close_section(b: "Builder") -> None:
        b.gap(get_spacing().section)

    def experience_height(job: dict) -> float:
        return _experience_record_height(
            probe, job, MAIN_W, SANS, title_fs=TITLE_FS2, title_lh=TITLE_LH2,
            meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
        )

    # ── Section placement. Measure each present section in both column widths
    # and let the shared planner partition them so every page the main column
    # occupies is as balanced as possible. Experience is anchored to the main
    # column; each sidebar bucket is a hard per-page fit; the main column may
    # paginate. See
    # docs/superpowers/specs/2026-08-12-multi-page-column-planner-design.md
    probe = Builder(content_top)
    candidates = _sidebar_candidates(cv, lbl)
    cand_by_key = {candidate['key']: candidate for candidate in candidates}
    edu_entries = _sidebar_education_entries(cv.get('education'))
    sidebar_budget = 760.0 - content_top
    main_budget = 770.0 - content_top

    def main_section_height(body_h: float) -> float:
        """Main-column advance for one section: heading chrome + body + gap."""
        return SECTION_CHROME + body_h + get_spacing().section

    descriptors: list[PlaceableSection] = []

    if cv.get('summary'):
        summary_side_body = Builder.measure_block(cv['summary'], SIDE_W, SIDE_SUMMARY_FS, SIDE_SUMMARY_LH, SANS)
        descriptors.append(PlaceableSection(
            'summary', RANK['summary'], 'sidebar',
            main_height=main_section_height(
                Builder.measure_block(cv['summary'], MAIN_W, BODY_FS, BODY_LH, SANS)
            ),
            # Summary's rail advance = kicker gap + body + trailing 26 (matches
            # the explicit placement below).
            sidebar_height=CHROME_GAP + summary_side_body + 26.0,
        ))

    if cv.get('experience'):
        jobs = cv['experience']
        exp_body = 0.0
        for index, job in enumerate(jobs):
            exp_body += _experience_record_height(
                probe, job, MAIN_W, SANS, title_fs=TITLE_FS2, title_lh=TITLE_LH2,
                meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
            )
            if index < len(jobs) - 1:
                exp_body += get_spacing().record
        descriptors.append(PlaceableSection(
            'experience', RANK['experience'], 'main',
            main_height=main_section_height(exp_body), sidebar_height=None,
            anchored_main=True,
        ))

    for candidate in candidates:
        kind = candidate['kind']
        if kind == 'education':
            edu_type = _sidebar_education_type_sizes(SIDE_SUMMARY_FS, SIDE_SUMMARY_LH)
            side_h = _sidebar_education_section_height(
                candidate['entries'], SIDE_W, SANS, **edu_type,
            ) + SIDEBAR_CHROME
            edu_body = 0.0
            for index, edu in enumerate(edu_entries):
                edu_body += _education_record_height(
                    probe, edu, MAIN_W, SANS, degree_fs=TITLE_FS2, degree_lh=TITLE_LH2,
                    meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
                )
                if index < len(edu_entries) - 1:
                    edu_body += get_spacing().record
            descriptors.append(PlaceableSection(
                candidate['key'], RANK['education'], 'main',
                main_height=main_section_height(edu_body), sidebar_height=side_h,
            ))
            continue
        side_h = _sidebar_wrapped_height(
            candidate['content'], SIDE_W, SIDE_SUMMARY_FS, SIDE_SUMMARY_LH,
            font=SANS, bulletList=bool(candidate.get('bulletList')),
        ) + SIDEBAR_CHROME
        if kind == 'skills':
            main_body = _measure_skills_body(
                probe, skill_groups(cv.get('skills')), MAIN_W, BODY_FS, BODY_LH, SANS,
            )
        elif kind == 'languages':
            main_body = _measure_languages_grid_height(
                probe, _language_entries(cv), MAIN_W, font=SANS, fs=BODY_FS, lh=BODY_LH,
            )
        else:  # interests / certifications → flat bullet block
            main_body = Builder.measure_block(
                candidate['content'], MAIN_W, BODY_FS, BODY_LH, SANS, bulletList=True,
            )
        descriptors.append(PlaceableSection(
            candidate['key'], RANK.get(kind, 6), 'sidebar',
            main_height=main_section_height(main_body), sidebar_height=side_h,
        ))

    def _sidebar_extra_indices_for(main_keys: list[str]) -> set[int]:
        """Extra-section indices the planner routed out of ``main_keys``.

        Every ``_sidebar_candidates`` key ends up in exactly one of
        ``plan.main`` or a sidebar bucket (``ColumnPlan`` is a disjoint
        cover), so anything with an ``extra_index`` absent from
        ``main_keys`` was placed in some sidebar bucket and must be skipped
        by ``_extra_sections``'s own placement-based iteration below to
        avoid rendering it twice.
        """
        main_set = set(main_keys)
        return {
            candidate['extra_index']
            for candidate in candidates
            if candidate['key'] not in main_set and isinstance(candidate.get('extra_index'), int)
        }

    def _render_main_column(order: list[str], b: "Builder", skip_indices: set[int]) -> None:
        """Render one ordered main-column section list into ``b``.

        Shared verbatim between the throwaway measurement pass
        (``measure_main``, called by ``plan_columns_multi_page`` to learn how
        many pages a candidate ``main`` order needs) and the final render, so
        the page count the planner iterates against always matches what the
        document actually draws.
        """
        def section_fn(label: str):
            return section(b, label)

        for key in order:
            if key == 'summary' and cv.get('summary'):
                b.need_section(SECTION_CHROME, Builder.measure_block(cv['summary'], MAIN_W, BODY_FS, BODY_LH, SANS))
                section(b, lbl['summary'])
                b.block(cv['summary'], MAIN_L, MAIN_W, BODY_FS, BODY_LH, C['ink'], SANS)
                close_section(b)
            elif key == 'experience' and cv.get('experience'):
                jobs = cv['experience']
                b.need_section(SECTION_CHROME, experience_height(jobs[0]))
                section(b, lbl['experience'])
                for index, job in enumerate(jobs):
                    _place_experience_record(
                        b, job, MAIN_L, MAIN_W, ink=C['ink'], muted=C['muted'], body=C['ink'], font=SANS,
                        title_fs=TITLE_FS2, title_lh=TITLE_LH2, meta_fs=META_FS, meta_lh=META_LH,
                        body_fs=BODY_FS, body_lh=BODY_LH,
                        after_gap=get_spacing().record if index < len(jobs) - 1 else None,
                    )
                close_section(b)
                # Record-kind extras (projects/references) live right after Experience.
                _extra_sections(
                    b, cv, 'after_experience', section_fn, {'body': C['ink'], 'accent': C['accent']},
                    MAIN_L, MAIN_W, SANS, fs=BODY_FS, lh=BODY_LH,
                    skip_indices=skip_indices, section_chrome_h=SECTION_CHROME,
                )
            elif key == 'education' and edu_entries:
                b.need_section(SECTION_CHROME, _education_record_height(
                    b, edu_entries[0], MAIN_W, SANS, degree_fs=TITLE_FS2, degree_lh=TITLE_LH2,
                    meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
                ))
                section(b, lbl['education'])
                for index, edu in enumerate(edu_entries):
                    _place_education_record(
                        b, edu, MAIN_L, MAIN_W, ink=C['ink'], muted=C['muted'], body=C['ink'], font=SANS,
                        degree_fs=TITLE_FS2, degree_lh=TITLE_LH2, meta_fs=META_FS, meta_lh=META_LH,
                        body_fs=BODY_FS, body_lh=BODY_LH,
                        after_gap=get_spacing().record if index < len(edu_entries) - 1 else None,
                    )
                close_section(b)
            elif key == 'skills':
                if _place_skills_section(
                    b, cv, section_fn, MAIN_L, MAIN_W, C['ink'], SANS, BODY_FS, BODY_LH,
                    section_chrome_h=SECTION_CHROME,
                ):
                    close_section(b)

        # Simple extras (languages / interests / certifications) the planner left
        # in the main column render here; those routed to any sidebar bucket
        # are skipped via `skip_indices`.
        _extra_sections(
            b, cv, 'after_skills', section_fn, {'body': C['ink'], 'accent': C['accent']},
            MAIN_L, MAIN_W, SANS, fs=BODY_FS, lh=BODY_LH,
            skip_indices=skip_indices, section_chrome_h=SECTION_CHROME,
        )

    def measure_main(order: list[str]) -> MainMeasurement:
        """Render ``order`` into a throwaway ``Builder`` and report its page count.

        Used only by ``plan_columns_multi_page``'s bounded iteration to learn
        how many pages a candidate ``main`` assignment needs; the elements it
        produces are discarded.
        """
        probe_builder = Builder(content_top)
        _render_main_column(order, probe_builder, _sidebar_extra_indices_for(order))
        return MainMeasurement(pages_used=probe_builder.pg)

    plan = plan_columns_multi_page(
        descriptors,
        page1_sidebar_budget=sidebar_budget,
        continuation_sidebar_budget=760.0 - PAGE_TOP,
        page1_main_budget=main_budget,
        continuation_main_budget=770.0 - PAGE_TOP,
        measure_main=measure_main,
    )
    sidebar_extra_indices = _sidebar_extra_indices_for(plan.main)

    def _render_sidebar_bucket(page: int, keys: list[str], start_y: float) -> list[dict]:
        """Render one page's sidebar rail content for the planner-assigned ``keys``.

        Summary keeps its distinct inline rendering (fixed body font size,
        not the auto-fit ladder ``_fit_sidebar_sections`` uses for the rest)
        on whichever page the planner places it; every other candidate goes
        through the shared fitting mechanism. This is the exact page-1 logic
        run once per bucket, not a page-2 special case — page 1 differs only
        in ``start_y``.
        """
        key_set = set(keys)
        elements: list[dict] = []
        cursor = start_y
        if 'summary' in key_set and cv.get('summary'):
            elements.extend(sidebar_kicker(lbl['summary'], cursor))
            body_top = cursor + CHROME_GAP
            body_h = Builder.measure_block(cv['summary'], SIDE_W, SIDE_SUMMARY_FS, SIDE_SUMMARY_LH, SANS)
            elements.append({
                'category': 'textarea', 'content': cv['summary'], 'left': SIDE_L, 'top': body_top,
                'width': SIDE_W, 'height': body_h, 'fontSize': SIDE_SUMMARY_FS, 'lineHeight': SIDE_SUMMARY_LH,
                'letterSpacing': 0, 'color': C['ink'], 'fontFamily': SANS, 'zIndex': 3, 'page': page,
                'bold': False, 'italic': False, 'align': 'left', 'bulletList': False,
                'autoHeight': True, 'preserveInitialLayout': True,
            })
            cursor = body_top + body_h + 26.0

        # The planner already guaranteed this subset fits this bucket's rail,
        # so `_fit_sidebar_sections` places all of them (it also assigns their
        # fonts).
        bucket_planned = [candidate for candidate in candidates if candidate['key'] in key_set]
        fitted_sections, _ = _fit_sidebar_sections(
            bucket_planned, width=SIDE_W, start_y=cursor, bottom_y=760, font=SANS,
        )
        for section_data in fitted_sections:
            top = float(section_data['top'])
            elements.extend(sidebar_kicker(section_data['title'], top))
            # Education becomes diploma / school / meta / bullet elements; flat
            # sections (skills, languages, …) stay a single textarea.
            elements.extend(_fitted_sidebar_body_elements(
                section_data,
                left=SIDE_L,
                width=SIDE_W,
                ink=C['ink'],
                muted=C['muted'],
                body=C['ink'],
                font=SANS,
            ))

        return [{
            **element,
            'page': page,
            'flowRole': element.get('flowRole', 'content'),
            'flowLane': 'sidebar',
        } for element in elements]

    # ── Sidebar: one bucket per page the planner used. ────────────────────
    sidebar: list[dict] = []
    for page in sorted(plan.sidebar_by_page.keys()):
        start_y = content_top if page == 1 else PAGE_TOP
        sidebar.extend(_render_sidebar_bucket(page, plan.sidebar_by_page[page], start_y))

    # ── Main column for the planned main set, in canonical reading order. Each
    # anchored/movable "primary" section (summary, experience, education, skills)
    # dispatches to its existing renderer; simple extras routed to main are
    # emitted by `_extra_sections` inside `_render_main_column`. ──────────────
    b = Builder(content_top)
    _render_main_column(plan.main, b, sidebar_extra_indices)

    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + sidebar + flow] or [1])

    # ── Page chrome. On page 1 a full-width "letterhead band" (the same tint as
    # the rail) sits behind the centered masthead, and BOTH the rail fill and the
    # vertical divider begin at the band's bottom edge (`rule_y`) instead of at
    # y = 0. Sterling centers the name/title/contact across the page, so those
    # lines cross the x = SIDEBAR_W column boundary; a full-height divider run
    # up from y = 0 would visually "cut" straight through the centered letterhead
    # (the reason this band exists). Reusing the rail tint makes the top band and
    # the left rail read as one continuous field — Sterling's single quiet system
    # — while the main column below the band stays on paper. Continuation pages
    # carry no masthead, so their rail and divider run the full page height. ────
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations.append(
            {**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}
        )
        if page == 1:
            # Full-width letterhead band, closed at the bottom by the masthead
            # rule that `header` already draws at `rule_y`.
            page_decorations.append(
                {**_line(0, 0, 595, rule_y, C['sidebar_bg'], zIndex=1, page=1), 'fixedToPage': True}
            )
            # Rail fill and divider start under the band so neither crosses the
            # centered masthead above them.
            page_decorations.append(
                {**_line(0, rule_y, SIDEBAR_W, 842 - rule_y, C['sidebar_bg'], zIndex=1, page=1),
                 'fixedToPage': True}
            )
            page_decorations.append(
                {**_line(SIDEBAR_W, rule_y, DIVIDER_W, 842 - rule_y, C['rule'], zIndex=2, page=1),
                 'fixedToPage': True}
            )
        else:
            # Continuation pages: no repeated letterhead or sidebar copy — only the
            # rail background/divider above and a quiet footer page number.
            page_decorations.append(
                {**_line(0, 0, SIDEBAR_W, 842, C['sidebar_bg'], zIndex=1, page=page), 'fixedToPage': True}
            )
            page_decorations.append(
                {**_line(SIDEBAR_W, 0, DIVIDER_W, 842, C['rule'], zIndex=2, page=page), 'fixedToPage': True}
            )
        page_decorations.append(
            {**_text(f'{page:02d}', 9, SANS, C['muted'], 545.0 - 14.0, 806, page=page),
             'fixedToPage': True}
        )
    return page_decorations + header + sidebar + flow
```

- [ ] **Step 2: Run the existing Sterling tests to verify the regression case still passes**

Run: `cd backend && python -m pytest tests/test_cv_template_layouts.py -k sterling -v`
Expected: PASS — `test_sterling_balances_education_into_the_main_column` (a 1-page CV) still renders Education in the main column at `left == 245`, byte-for-byte equivalent to before, since a 1-page main column never derives a bucket beyond page 1 (spec §7).

Also run the full backend suite to catch any regressions elsewhere:

Run: `cd backend && python -m pytest -q`
Expected: PASS — same pass count as before this task, plus the 15 `test_column_planner.py` tests from Tasks 1–2.

Also run the frontend Sterling tests (unaffected in substance per spec §8 migration notes, but confirm):

Run: `cd frontend && npx vitest run src/templates/sterling.test.js src/templates/sterling.pack.test.js`
Expected: PASS — unchanged, since the current Sterling starter/demo CV (Jan Kowalski) fits on page 1.

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/cv_templates/templates/sterling.py
git commit -m "feat: wire Sterling to the multi-page column planner"
```

---

## Task 4: End-to-end test — a short section lands on the page-2 sidebar rail

**Files:**
- Modify: `backend/tests/test_cv_template_layouts.py`

**Interfaces:**
- Consumes: `generate_resume`, `LONG_CV` (existing module fixtures in this file).

- [ ] **Step 1: Write the failing test**

Add this test method to `CvTemplateLayoutTests` in `backend/tests/test_cv_template_layouts.py`, placed directly after `test_sterling_balances_education_into_the_main_column` (currently ending around line 1490):

```python
    def test_sterling_places_overflow_sidebar_content_on_a_continuation_page_rail(self):
        """A CV long enough for Sterling's main column to spill onto page 2, with
        more sidebar-eligible content than page 1's rail can hold, places the
        overflow on page 2's rail instead of piling everything into the main
        column.

        See docs/superpowers/specs/2026-08-12-multi-page-column-planner-design.md
        §9. The assertion checks for *some* sidebar kicker landing on a
        continuation page rather than a specific section by name: which
        section spills over depends on exact ReportLab-measured heights this
        test does not hand-compute, but the planner's page-1-only-vs-N-bucket
        behavior is exactly what's under test either way.
        """
        cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 3,
            "extra_sections": [
                {
                    "title": "Języki obce",
                    "kind": "languages",
                    "placement": "after_skills",
                    "items": ["Angielski — C1", "Niemiecki — B2", "Francuski — A2"],
                },
                {
                    "title": "Zainteresowania",
                    "kind": "interests",
                    "placement": "after_skills",
                    "items": [
                        "Fotografia krajobrazowa", "Bieganie długodystansowe", "Szachy klasyczne",
                        "Podróże górskie", "Gotowanie kuchni azjatyckiej",
                    ],
                },
                {
                    "title": "Certyfikaty",
                    "kind": "certifications",
                    "placement": "after_skills",
                    "items": ["AWS Certified Solutions Architect", "Certyfikat PRINCE2"],
                },
            ],
        }
        elements = generate_resume("sterling", cv)
        self.assertGreater(max(element.get("page", 1) for element in elements), 1)
        sidebar_kickers_page_2_plus = [
            element for element in elements
            if element.get("flowLane") == "sidebar"
            and element.get("flowRole") == "sidebar-chrome"
            and element.get("page", 1) >= 2
        ]
        self.assertTrue(
            sidebar_kickers_page_2_plus,
            "expected at least one sidebar section kicker on a continuation page's rail",
        )
        for element in sidebar_kickers_page_2_plus:
            self.assertNotEqual(
                element["left"], 245,
                "continuation-page rail content must stay out of the main column",
            )
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_cv_template_layouts.py -k test_sterling_places_overflow_sidebar_content_on_a_continuation_page_rail -v`

Expected before Task 3's changes are present: this should already PASS once Task 3 is committed, since the feature under test is Task 3's implementation, not new production code in this task. If it FAILS (no sidebar kicker reaches page 2 — for example because page 1's rail budget happily fits everything, or the main column never reaches 2 pages with this fixture), treat that as a fixture problem, not a planner problem: increase `experience` repetition (e.g. `LONG_CV["experience"] * 4`) and/or add more items to the `interests` list until `elements` genuinely has a multi-page main column with more sidebar-eligible content than a single page-1 rail can hold. The exact repetition count is not the point — a real multi-page CV with real sidebar overflow is.

- [ ] **Step 3: Run it again to confirm it passes**

Run: `cd backend && python -m pytest tests/test_cv_template_layouts.py -k test_sterling_places_overflow_sidebar_content_on_a_continuation_page_rail -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_cv_template_layouts.py
git commit -m "test: cover Sterling placing overflow sidebar content on a continuation-page rail"
```

---

## Task 5: Update README (English + Polish)

**Files:**
- Modify: `README.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Update the English Sterling section**

In `README.md`, replace the paragraph starting `**Section placement is balance-driven.**` (currently the paragraph right after the Sterling section's opening paragraph, referencing `plan_columns`) with:

```markdown
**Section placement is balance-driven, and generalizes to every page the main column occupies.** Rather than filling the sidebar first, Sterling measures every section's height in both column widths and calls `plan_columns_multi_page` (`backend/app/services/cv_templates/shared/column_planner.py`), which partitions sections into the main column and one `SidebarBucket` per page — minimising imbalance on each. Experience is anchored to the main column; every other section is movable, and may render in any column/bucket. Because a sidebar bucket cannot paginate, its assignment is a hard per-page fit, while the main column may overflow onto later pages (that overflow is therefore not counted as wasted space). Because which sections belong in the sidebar depends on how many pages the main column needs, and vice versa, `plan_columns_multi_page` resolves this with a bounded iteration (≤3 passes): partition with the pure `plan_columns` planner, measure the resulting main-column order's real page count by rendering it into a throwaway `Builder`, derive one `SidebarBucket` per page ≥ 2 that measurement found, and repeat until the bucket list and main budget stop changing. A CV whose main column fits on page 1 never derives a bucket beyond page 1, so this reduces to exactly the original single-page behavior. In practice Education follows Experience in the main column, and moves into the sidebar only when a long Experience block already fills page 1; a short extra section (e.g. Certifications) that doesn't fit page 1's rail can land on page 2's rail instead of the main column, once the main column actually spans 2 pages. The pure partitioner itself is a small greedy local search: seed each sidebar-affinity section by first-fit across buckets in ascending page order, force every bucket under budget (evicting the lowest-priority overflow back to main), then repeatedly apply the single move that most reduces `max(empty_main, *empty_buckets)` until the columns are balanced or no move clears a minimum-improvement threshold. See `docs/superpowers/specs/2026-08-12-multi-page-column-planner-design.md` for the full design, including the circular-dependency resolution and rejected alternatives (e.g. simulating pagination per candidate move, rejected for latency).
```

Then replace the `Implementation:` bullet list's `column_planner.py` and `sterling.py` lines with:

```markdown
- `backend/app/services/cv_templates/shared/column_planner.py`, `SidebarBucket` / `PlaceableSection` / `ColumnPlan` / `plan_columns` — the pure, balance-driven partitioner (main column + N page-scoped sidebar buckets), and `MainMeasurement` / `plan_columns_multi_page` — the orchestrator that derives buckets for continuation pages via a bounded iteration around a caller-supplied `measure_main` callback
- `backend/app/services/cv_templates/templates/sterling.py`, function `_gen_sterling` — centered letterhead masthead + closing rule, `sidebar_kicker`, per-section descriptor building (measures each section in both column widths), `plan_columns_multi_page` call (with a `measure_main` closure that renders a candidate main-column order into a throwaway `Builder` via the shared `_render_main_column`), then per-bucket sidebar rendering (`_render_sidebar_bucket`, reusing `_fit_sidebar_sections` / `_fitted_sidebar_body_elements`) and main-column rendering (`_render_main_column`, reusing `_place_experience_record` / `_place_education_record` / `_place_skills_section` / `_extra_sections`)
```

Then, in the `Tests:` bullet list for the Sterling section, replace the `test_column_planner.py` line with:

```markdown
- `backend/tests/test_column_planner.py` — the pure planner: a disjoint-cover partition, Experience always in main, a short Experience keeping Education in main, a large Experience pushing Education to the sidebar, a huge Experience keeping the sidebar within its page-1 budget, the min-improvement threshold preventing trivial moves, a section overflowing bucket 1 seeding into bucket 2, feasibility repair generalizing to any bucket page — and the orchestrator: a 1-page CV matching a direct single-bucket `plan_columns` call, a 2-page CV deriving a page-2 bucket, convergence stopping `measure_main` calls once the bucket list stabilizes, and a hard `max_iterations` cap terminating a pathological `measure_main` that never stabilizes
```

And add a new bullet immediately after the existing `test_sterling_balances_education_into_the_main_column` line:

```markdown
- `backend/tests/test_cv_template_layouts.py`, `test_sterling_places_overflow_sidebar_content_on_a_continuation_page_rail` — end-to-end: a multi-page CV with more sidebar-eligible content than page 1's rail can hold places at least one sidebar section kicker on a continuation page's rail, not in the main column
```

- [ ] **Step 2: Update the Polish Sterling section**

In `README.md`, replace the paragraph starting `**Rozmieszczanie sekcji jest sterowane balansem.**` with:

```markdown
**Rozmieszczanie sekcji jest sterowane balansem i uogólnia się na każdą stronę, którą zajmuje kolumna główna.** Zamiast najpierw wypełniać sidebar, Sterling mierzy wysokość każdej sekcji w obu szerokościach kolumn i wywołuje `plan_columns_multi_page` (`backend/app/services/cv_templates/shared/column_planner.py`), który dzieli sekcje między kolumnę główną a po jednym `SidebarBucket` na stronę — minimalizując nierównowagę na każdej z nich. Doświadczenie jest zakotwiczone w kolumnie głównej; każda inna sekcja jest ruchoma i może wyrenderować się w dowolnej kolumnie/kubełku. Ponieważ pojedynczy kubełek sidebara nie może dzielić się na strony, jego przydział to twarde dopasowanie na daną stronę, podczas gdy kolumna główna może przechodzić na kolejne strony (jej nadmiar nie jest więc liczony jako zmarnowane miejsce). Ponieważ to, które sekcje należą do sidebara, zależy od liczby stron potrzebnych kolumnie głównej — i odwrotnie — `plan_columns_multi_page` rozwiązuje to ograniczoną iteracją (≤3 przebiegi): partycjonuje czystym planerem `plan_columns`, mierzy rzeczywistą liczbę stron wynikowego porządku kolumny głównej, renderując go do jednorazowego `Builder`, wyprowadza po jednym `SidebarBucket` dla każdej strony ≥ 2, którą wykazał pomiar, i powtarza, aż lista kubełków i budżet kolumny głównej przestaną się zmieniać. CV, którego kolumna główna mieści się na stronie 1, nigdy nie wyprowadza kubełka poza stroną 1, więc sprowadza się to dokładnie do pierwotnego zachowania jednostronicowego. W praktyce Wykształcenie następuje po Doświadczeniu w kolumnie głównej i przechodzi do sidebara tylko wtedy, gdy długie Doświadczenie zapełnia już stronę 1; krótka sekcja dodatkowa (np. Certyfikaty), która nie mieści się w szynie strony 1, może trafić do szyny strony 2 zamiast do kolumny głównej, gdy kolumna główna faktycznie zajmuje 2 strony. Sam czysty partycjoner to małe zachłanne przeszukiwanie lokalne: zasiej każdą sekcję o przynależności do sidebara metodą first-fit po kubełkach w rosnącej kolejności stron, wepchnij każdy kubełek poniżej budżetu (wypychając nadmiar o najniższym priorytecie z powrotem do głównej), a następnie wielokrotnie zastosuj pojedynczy ruch najbardziej redukujący `max(puste_główna, *puste_kubełki)`, aż kolumny się zrównoważą lub żaden ruch nie przekroczy progu minimalnej poprawy. Pełny opis projektu, w tym rozwiązanie cyklicznej zależności i odrzucone alternatywy (np. symulacja paginacji dla każdego kandydującego ruchu, odrzucona ze względu na opóźnienia), znajduje się w `docs/superpowers/specs/2026-08-12-multi-page-column-planner-design.md`.
```

Then replace the `Implementacja:` bullet list's `column_planner.py` and `sterling.py` lines with:

```markdown
- `backend/app/services/cv_templates/shared/column_planner.py`, `SidebarBucket` / `PlaceableSection` / `ColumnPlan` / `plan_columns` — czysty, sterowany balansem partycjoner (kolumna główna + N kubełków sidebara przypisanych do stron), oraz `MainMeasurement` / `plan_columns_multi_page` — orkiestrator wyprowadzający kubełki dla stron kontynuacyjnych w ograniczonej iteracji wokół dostarczonego przez wywołującego callbacku `measure_main`
- `backend/app/services/cv_templates/templates/sterling.py`, funkcja `_gen_sterling` — wycentrowany masthead w stylu papieru firmowego + zamykająca linia, `sidebar_kicker`, budowa deskryptorów sekcji (mierzy każdą sekcję w obu szerokościach kolumn), wywołanie `plan_columns_multi_page` (z domknięciem `measure_main`, które renderuje kandydujący porządek kolumny głównej do jednorazowego `Builder` przez wspólne `_render_main_column`), a następnie renderowanie każdego kubełka sidebara (`_render_sidebar_bucket`, reużywające `_fit_sidebar_sections` / `_fitted_sidebar_body_elements`) i kolumny głównej (`_render_main_column`, reużywające `_place_experience_record` / `_place_education_record` / `_place_skills_section` / `_extra_sections`)
```

Then, in the `Testy:` bullet list for the Sterling section, replace the `test_column_planner.py` line with:

```markdown
- `backend/tests/test_column_planner.py` — czysty planer: partycja jako rozłączne pokrycie, Doświadczenie zawsze w kolumnie głównej, krótkie Doświadczenie utrzymujące Wykształcenie w głównej, duże Doświadczenie przenoszące Wykształcenie do sidebara, ogromne Doświadczenie utrzymujące sidebar w budżecie strony 1, próg minimalnej poprawy blokujący trywialne ruchy, sekcja przepełniająca kubełek 1 zasiewana do kubełka 2, naprawa wykonalności uogólniona na dowolny numer strony kubełka — oraz orkiestrator: jednostronicowe CV zgodne z bezpośrednim wywołaniem `plan_columns` z jednym kubełkiem, dwustronicowe CV wyprowadzające kubełek strony 2, zbieżność zatrzymująca wywołania `measure_main` po ustabilizowaniu listy kubełków, oraz twardy limit `max_iterations` kończący pętlę dla patologicznego `measure_main`, który nigdy się nie stabilizuje
```

And add a new bullet immediately after the existing `test_sterling_balances_education_into_the_main_column` line:

```markdown
- `backend/tests/test_cv_template_layouts.py`, `test_sterling_places_overflow_sidebar_content_on_a_continuation_page_rail` — end-to-end: CV wielostronicowe z większą ilością treści kwalifikującej się do sidebara niż mieści szyna strony 1 umieszcza co najmniej jeden kicker sekcji sidebara na szynie strony kontynuacyjnej, a nie w kolumnie głównej
```

- [ ] **Step 3: Verify no stale references remain**

Run a search to confirm no leftover references to the old single-bucket API remain in prose (code blocks in Tasks 1–4 already replace every call site):

Run: `cd "c:\Users\Kamil\learningCode\PROJECTS\PDF\pdf-generator" && grep -rn "plan.sidebar\b" backend README.md`
Expected: no matches (the old `ColumnPlan.sidebar` / `plan.sidebar` attribute no longer exists anywhere).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: describe the multi-page-aware Sterling column planner (EN + PL)"
```

---

## Final verification (run after Task 5)

- [ ] Run the full backend suite: `cd backend && python -m pytest -q` — expect the same pass count as before this plan, plus 15 new `test_column_planner.py` tests and 1 new `test_cv_template_layouts.py` test (16 net new).
- [ ] Run the full frontend suite for Sterling: `cd frontend && npx vitest run src/templates/sterling.test.js src/templates/sterling.pack.test.js` — expect unchanged pass count (spec §8: no frontend changes required).
- [ ] Confirm `docs/superpowers/specs/2026-08-12-multi-page-column-planner-design.md`'s `Status:` line reflects the design is now implemented (update `**Status:** Design approved, pending spec review` to `**Status:** Implemented` in a final small commit, once everything above is green).
