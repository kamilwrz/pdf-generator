"""Unit tests for the pure two-column section placement planner.

These exercise the partitioning algorithm with synthetic heights, independent
of the CV generation stack, so the balancing rules are pinned precisely.
"""
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


def test_education_stays_in_page_one_main_when_a_later_extra_paginates():
    # Guard for the overflow catcher: a short Experience block still has room
    # for Education on page 1. A later record-kind extra (Volunteer) that
    # paginates must not yank Education onto page 2's empty rail just to fill
    # it — that would break test_short_experience_keeps_education_in_main
    # once a continuation bucket exists.
    sections = [
        PlaceableSection("summary", 0, "sidebar", main_height=110, sidebar_height=130),
        PlaceableSection("experience", 1, "main", main_height=120, sidebar_height=None, anchored_main=True),
        PlaceableSection("education", 2, "main", main_height=80, sidebar_height=100),
        PlaceableSection("skills", 3, "sidebar", main_height=140, sidebar_height=150),
        PlaceableSection("languages", 4, "sidebar", main_height=50, sidebar_height=60),
        PlaceableSection("volunteer", 6, "main", main_height=500, sidebar_height=None),
    ]
    plan = plan_columns(
        sections,
        sidebar_buckets=[SidebarBucket(1, 400), SidebarBucket(2, 400)],
        main_budget=400,
    )
    assert "education" in plan.main
    assert "education" not in plan.sidebar_by_page[2]
    assert "volunteer" in plan.main


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


def _make_measure(heights, page_size, *, base=0.0):
    """Build a fake ``measure_main`` from synthetic per-key main heights.

    ``base`` models content the caller always renders regardless of the key
    list it is given (e.g. Sterling's record-style Projects extra) — so
    ``measure([anchored])`` returns the main-column skeleton. A section that
    would not fit the remaining page space starts whole on the next page
    (modelling ``Builder.need_section`` — the reason Education can start on
    page 2 even when the skeleton fills only page 1).
    """
    def measure(order):
        pages = 1
        cursor = base
        total = base
        start = {}
        for key in order:
            height = heights.get(key, 0.0)
            if cursor > 0.0 and cursor + height > page_size + 1e-9:
                pages += 1
                cursor = 0.0
            start[key] = pages
            cursor += height
            total += height
            while cursor > page_size + 1e-9:
                pages += 1
                cursor -= page_size
        return MainMeasurement(
            pages_used=pages, start_page_by_key=start, content_height=total,
        )
    return measure


# Summary + Skills exactly fill the 400pt page-1 rail in the orchestrator
# tests below, so Education (affinity "main") cannot be pulled onto page 1 by
# the balance loop and is genuinely a main-column leftover — the realistic
# Sterling situation where the rail is already full of Summary and a long
# Skills list.
def _page_one_filling_sidebar():
    return [
        PlaceableSection("summary", 0, "sidebar", main_height=200, sidebar_height=200),
        PlaceableSection("skills", 3, "sidebar", main_height=200, sidebar_height=200),
    ]


def test_orchestrator_rails_a_leftover_onto_a_page_the_skeleton_reaches():
    # Experience alone spans two pages (the skeleton), so page 2 exists no
    # matter where Education goes. Education is affinity "main" (never seeds to
    # the sidebar) and really starts on page 2 of the main column, so the
    # orchestrator must move it onto page 2's rail rather than leave that rail
    # empty beside the Experience continuation.
    sections = _page_one_filling_sidebar() + [
        PlaceableSection("experience", 1, "main", main_height=900, sidebar_height=None, anchored_main=True),
        PlaceableSection("education", 2, "main", main_height=120, sidebar_height=120),
    ]
    measure = _make_measure({"experience": 900, "education": 120}, page_size=700)
    plan = plan_columns_multi_page(
        sections,
        page1_sidebar_budget=400,
        continuation_sidebar_budget=400,
        page1_main_budget=595,
        measure_main=measure,
    )
    assert plan.sidebar_by_page[1] == ["summary", "skills"]
    assert plan.sidebar_by_page[2] == ["education"]
    assert plan.main == ["experience"]


def test_orchestrator_keeps_a_leftover_that_alone_creates_its_page():
    # The skeleton (Experience only) fits one page. Education is the sole
    # reason the document spills onto page 2. Railing it would blank page 2's
    # main column, so the survival check must keep Education in the main column
    # and leave page 2's rail empty (the lesser evil).
    sections = _page_one_filling_sidebar() + [
        PlaceableSection("experience", 1, "main", main_height=500, sidebar_height=None, anchored_main=True),
        PlaceableSection("education", 2, "main", main_height=400, sidebar_height=120),
    ]
    measure = _make_measure({"experience": 500, "education": 400}, page_size=700)
    plan = plan_columns_multi_page(
        sections,
        page1_sidebar_budget=400,
        continuation_sidebar_budget=400,
        page1_main_budget=595,
        measure_main=measure,
    )
    assert "education" in plan.main
    assert plan.sidebar_by_page.get(2, []) == []


def test_orchestrator_keeps_overflow_in_main_rather_than_railing_an_empty_page():
    # A sidebar-affinity section (Certifications) cannot fit page 1's full rail
    # and the skeleton is only one page, so there is no safe continuation rail
    # to seed it onto — it is evicted back to the main column. It then starts
    # on page 2 of the main column, but page 2 exists ONLY because of
    # Certifications itself, so the survival check must keep it in the main
    # column instead of railing it onto a page whose main column would be
    # empty. This is the regression behind a near-empty final page: overflow
    # flows down the main column rather than isolating itself on its own rail.
    sections = [
        PlaceableSection("summary", 0, "sidebar", main_height=200, sidebar_height=200),
        PlaceableSection("experience", 1, "main", main_height=300, sidebar_height=None, anchored_main=True),
        PlaceableSection("skills", 3, "sidebar", main_height=200, sidebar_height=200),
        PlaceableSection("certifications", 5, "sidebar", main_height=500, sidebar_height=200),
    ]
    measure = _make_measure(
        {"experience": 300, "certifications": 500}, page_size=700,
    )
    plan = plan_columns_multi_page(
        sections,
        page1_sidebar_budget=400,
        continuation_sidebar_budget=400,
        page1_main_budget=595,
        measure_main=measure,
    )
    assert "certifications" in plan.main
    assert plan.sidebar_by_page[1] == ["summary", "skills"]
    assert plan.sidebar_by_page.get(2, []) == []


def test_orchestrator_keeps_overflow_on_the_rail_when_skeleton_fills_page_one():
    # Skeleton (Experience plus the always-rendered record extras modelled by
    # `base`) already spans two pages, so page-1 main is full — even though the
    # pure planner's descriptor height for Experience alone looks short. The
    # balance loop must NOT drag the page-2 Certifications rail section into the
    # main column to "fill page 1": that content renders on page 2 regardless,
    # and pulling it in would leave page 2's rail empty. Certifications must stay
    # on the page-2 rail. (Regression: descriptor heights exclude record extras,
    # so `empty_main` looked large and the balancer emptied the continuation
    # rail into main.)
    sections = _page_one_filling_sidebar() + [
        PlaceableSection("experience", 1, "main", main_height=300, sidebar_height=None, anchored_main=True),
        PlaceableSection("education", 2, "main", main_height=100, sidebar_height=100),
        PlaceableSection("certifications", 5, "sidebar", main_height=150, sidebar_height=150),
    ]
    measure = _make_measure(
        {"experience": 300, "education": 100, "certifications": 150},
        page_size=700, base=500,
    )
    plan = plan_columns_multi_page(
        sections,
        page1_sidebar_budget=400,
        continuation_sidebar_budget=400,
        page1_main_budget=595,
        measure_main=measure,
    )
    assert "certifications" in plan.sidebar_by_page[2]
    assert "certifications" not in plan.main


def test_orchestrator_keeps_rail_overflow_when_a_one_page_skeleton_fills_page_one():
    # Skeleton fits one page, but Experience + record extras (modelled by
    # `base`) fill most of it. The pure planner's descriptor height for
    # Experience alone is short, so without the measured skeleton height the
    # balancer would think page-1 main is half-empty and pull Certifications off
    # the rail into main to "fill" it (the same drain as the >=2-page skeleton
    # case, one page down). Scoping the balance budget to the measured skeleton
    # height keeps Certifications on the page-1 rail.
    sections = [
        PlaceableSection("summary", 0, "sidebar", main_height=180, sidebar_height=180),
        PlaceableSection("experience", 1, "main", main_height=200, sidebar_height=None, anchored_main=True),
        PlaceableSection("certifications", 5, "sidebar", main_height=150, sidebar_height=150),
    ]
    measure = _make_measure(
        {"experience": 200, "certifications": 150}, page_size=700, base=350,
    )
    plan = plan_columns_multi_page(
        sections,
        page1_sidebar_budget=400,
        continuation_sidebar_budget=400,
        page1_main_budget=595,
        measure_main=measure,
    )
    assert "certifications" in plan.sidebar_by_page[1]
    assert "certifications" not in plan.main


def test_orchestrator_rails_one_leftover_and_keeps_another_to_fill_both_columns():
    # Two main-affinity leftovers both land on page 2, which the skeleton
    # (Experience plus the always-rendered ``base`` record extra) does not
    # reach on its own. Railing BOTH would blank page 2's main column, so the
    # greedy survival check rails the first (page 2 still reached by the
    # second) and keeps the second in main — page 2 ends with content in BOTH
    # columns. This is the Jakub case: Education to the rail, Languages in main.
    sections = _page_one_filling_sidebar() + [
        PlaceableSection("experience", 1, "main", main_height=450, sidebar_height=None, anchored_main=True),
        PlaceableSection("education", 2, "main", main_height=200, sidebar_height=120),
        PlaceableSection("languages", 4, "main", main_height=200, sidebar_height=120),
    ]
    measure = _make_measure(
        {"experience": 450, "education": 200, "languages": 200}, page_size=700, base=100,
    )
    plan = plan_columns_multi_page(
        sections,
        page1_sidebar_budget=400,
        continuation_sidebar_budget=400,
        page1_main_budget=595,
        measure_main=measure,
    )
    assert plan.sidebar_by_page[2] == ["education"]
    assert plan.main == ["experience", "languages"]
