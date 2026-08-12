"""Unit tests for the pure two-column section placement planner.

These exercise the partitioning algorithm with synthetic heights, independent
of the CV generation stack, so the balancing rules are pinned precisely.
"""
import pytest

from app.services.cv_templates.shared.column_planner import (
    ColumnPlan,
    MainMeasurement,
    PlaceableSection,
    SidebarBucket,
    plan_columns,
    plan_columns_multi_page,
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


def test_sidebar_content_that_fits_page_one_is_not_split_onto_page_two():
    # Regression: with a long (paginating) main column and MORE than one
    # sidebar bucket available, every sidebar section that fits page 1's rail
    # must stay on page 1 — the continuation rail is an overflow catcher, not
    # a column to balance page 1 against. A prior cost function that took the
    # max empty space over *every* bucket minimised the worst empty bucket,
    # which equalised fill across the two sidebar pages: it moved sections off
    # a half-full page-1 rail onto the empty page-2 rail, visibly draining
    # page 1 even though page 1 had room. Here all four sidebar sections total
    # 570 <= page 1's 585 budget, so all four belong on page 1 and page 2's
    # rail stays empty.
    sections = [
        PlaceableSection("summary", 0, "sidebar", main_height=200, sidebar_height=160),
        PlaceableSection("experience", 1, "main", main_height=1400, sidebar_height=None, anchored_main=True),
        PlaceableSection("skills", 3, "sidebar", main_height=250, sidebar_height=200),
        PlaceableSection("languages", 4, "sidebar", main_height=90, sidebar_height=90),
        PlaceableSection("certifications", 5, "sidebar", main_height=150, sidebar_height=120),
    ]
    plan = plan_columns(
        sections,
        sidebar_buckets=[SidebarBucket(1, 585), SidebarBucket(2, 694)],
        main_budget=595,
    )
    assert plan.sidebar_by_page[1] == ["summary", "skills", "languages", "certifications"]
    assert plan.sidebar_by_page[2] == []
    assert plan.main == ["experience"]


def test_sidebar_content_that_overflows_page_one_spills_to_page_two():
    # The complementary case to the regression above: when page 1's rail
    # genuinely cannot hold every sidebar section, the ascending-page first-fit
    # seed fills page 1 to its budget and spills only the remainder onto the
    # page-2 rail — the multi-page overflow feature still works after the
    # page-1-only cost change.
    sections = [
        PlaceableSection("summary", 0, "sidebar", main_height=200, sidebar_height=300),
        PlaceableSection("experience", 1, "main", main_height=1400, sidebar_height=None, anchored_main=True),
        PlaceableSection("skills", 3, "sidebar", main_height=250, sidebar_height=250),
        PlaceableSection("certifications", 5, "sidebar", main_height=150, sidebar_height=250),
    ]
    plan = plan_columns(
        sections,
        sidebar_buckets=[SidebarBucket(1, 585), SidebarBucket(2, 694)],
        main_budget=595,
    )
    # summary (300) + skills (250) = 550 <= 585 fit page 1; certifications (250)
    # would overflow page 1 (800 > 585) so it seeds onto the page-2 rail.
    assert plan.sidebar_by_page[1] == ["summary", "skills"]
    assert plan.sidebar_by_page[2] == ["certifications"]


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
        measure_main=fake_measure_main,
    )
    single = plan_columns(sections, sidebar_buckets=[SidebarBucket(1, 400)], main_budget=400)
    assert multi.main == single.main
    assert multi.sidebar_by_page == single.sidebar_by_page


def test_plan_columns_multi_page_derives_a_page_two_bucket():
    # Experience fills page 1's main budget, so `empty_main` is 0 and the
    # balance loop never pulls sidebar content into main. `languages` cannot
    # fit page 1's rail beside `skills`, so once the second measurement pass
    # derives a page-2 bucket, `languages` lands on that continuation rail
    # instead of being evicted to the main column.
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
        measure_main=fake_measure_main,
    )
    assert plan.sidebar_by_page[1] == ["skills"]
    assert plan.sidebar_by_page[2] == ["languages"]


def test_plan_columns_multi_page_does_not_drain_page1_sidebar_into_main():
    # Regression: a long (paginating) Experience block used to inflate
    # `main_budget` to a lump sum spanning every occupied page. `empty_main`
    # then looked enormous and the greedy loop pulled skills/languages into
    # the main column to fill that phantom capacity — a two-page Sterling CV
    # with an empty page-1 rail. With page-1-scoped `main_budget`, both
    # sidebar sections fit page 1's rail and must stay there even though
    # `measure_main` reports two pages.
    sections = [
        PlaceableSection("experience", 1, "main", main_height=900, sidebar_height=None, anchored_main=True),
        PlaceableSection("skills", 3, "sidebar", main_height=140, sidebar_height=150),
        PlaceableSection("languages", 4, "sidebar", main_height=50, sidebar_height=60),
    ]

    def fake_measure_main(order):
        return MainMeasurement(pages_used=2)

    plan = plan_columns_multi_page(
        sections,
        page1_sidebar_budget=400,
        continuation_sidebar_budget=400,
        page1_main_budget=400,
        measure_main=fake_measure_main,
    )
    assert plan.sidebar_by_page[1] == ["skills", "languages"]
    assert plan.sidebar_by_page[2] == []
    assert plan.main == ["experience"]


def test_plan_columns_multi_page_converges_when_bucket_list_stabilizes():
    # A fake measure_main that always reports 2 pages derives a page-2 bucket
    # on iteration 1 and finds the *same* page count measuring against that
    # 2-bucket plan on iteration 2 — the derived bucket list stops changing,
    # so the loop must stop calling measure_main after that.
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
        measure_main=flapping_measure_main,
        max_iterations=3,
    )
    assert call_count == 3
    assert plan is not None


def test_plan_columns_multi_page_rejects_zero_max_iterations():
    # With `max_iterations < 1` the `for` loop body never executes, so `plan`
    # would remain `None` at the `return plan` statement — a silent contract
    # violation of the `-> ColumnPlan` return type. Guard against it eagerly
    # instead of returning `None` to the caller.
    with pytest.raises(ValueError):
        plan_columns_multi_page(
            _sections_short_experience(),
            page1_sidebar_budget=400,
            continuation_sidebar_budget=400,
            page1_main_budget=400,
            measure_main=lambda order: MainMeasurement(pages_used=1),
            max_iterations=0,
        )
