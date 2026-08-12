"""Unit tests for the pure two-column section placement planner.

These exercise the partitioning algorithm with synthetic heights, independent
of the CV generation stack, so the balancing rules are pinned precisely.
"""
from app.services.cv_templates.shared.column_planner import (
    ColumnPlan,
    PlaceableSection,
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
        _sections_short_experience(), sidebar_budget=400, main_budget=400,
    )
    assert "experience" in plan.main
    assert "experience" not in plan.sidebar


def test_partition_is_a_disjoint_cover_of_the_input():
    sections = _sections_short_experience()
    plan = plan_columns(sections, sidebar_budget=400, main_budget=400)
    placed = sorted(plan.main + plan.sidebar)
    assert placed == sorted(s.key for s in sections)
    assert set(plan.main).isdisjoint(plan.sidebar)


def test_sidebar_assignment_never_exceeds_its_budget():
    sections = _sections_short_experience()
    plan = plan_columns(sections, sidebar_budget=400, main_budget=400)
    by_key = {s.key: s for s in sections}
    side_total = sum(by_key[k].sidebar_height for k in plan.sidebar)
    assert side_total <= 400 + 0.01


def test_short_experience_keeps_education_in_main():
    plan = plan_columns(
        _sections_short_experience(), sidebar_budget=400, main_budget=400,
    )
    assert "education" in plan.main


def test_columns_are_ordered_by_rank():
    plan = plan_columns(
        _sections_short_experience(), sidebar_budget=400, main_budget=400,
    )
    order = {"summary": 0, "experience": 1, "education": 2, "skills": 3, "languages": 4}
    assert plan.main == sorted(plan.main, key=order.__getitem__)
    assert plan.sidebar == sorted(plan.sidebar, key=order.__getitem__)


def test_large_experience_pushes_education_to_sidebar():
    # Experience nearly fills the main column, so Education (main-affinity) is
    # moved into the sidebar to balance rather than overflowing main further.
    sections = [
        PlaceableSection("experience", 1, "main", main_height=380, sidebar_height=None, anchored_main=True),
        PlaceableSection("education", 2, "main", main_height=80, sidebar_height=100),
        PlaceableSection("skills", 3, "sidebar", main_height=140, sidebar_height=150),
        PlaceableSection("languages", 4, "sidebar", main_height=50, sidebar_height=70),
    ]
    plan = plan_columns(sections, sidebar_budget=400, main_budget=400)
    assert "education" in plan.sidebar
    assert "experience" in plan.main


def test_huge_experience_keeps_sidebar_feasible_and_paginates_main():
    # Experience alone exceeds a page; the sidebar must still fit page 1.
    sections = [
        PlaceableSection("experience", 1, "main", main_height=1200, sidebar_height=None, anchored_main=True),
        PlaceableSection("education", 2, "main", main_height=90, sidebar_height=110),
        PlaceableSection("skills", 3, "sidebar", main_height=140, sidebar_height=150),
    ]
    plan = plan_columns(sections, sidebar_budget=400, main_budget=400)
    by_key = {s.key: s for s in sections}
    side_total = sum(by_key[k].sidebar_height for k in plan.sidebar)
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
        sections, sidebar_budget=400, main_budget=400,
        imbalance_tolerance=60, min_improvement=24,
    )
    assert plan.main == ["experience", "education"]
    assert plan.sidebar == ["skills"]


def test_section_too_tall_for_sidebar_is_forced_into_main():
    sections = [
        PlaceableSection("experience", 1, "main", main_height=100, sidebar_height=None, anchored_main=True),
        PlaceableSection("skills", 3, "sidebar", main_height=140, sidebar_height=None),
    ]
    plan = plan_columns(sections, sidebar_budget=400, main_budget=400)
    assert "skills" in plan.main
    assert plan.sidebar == []
