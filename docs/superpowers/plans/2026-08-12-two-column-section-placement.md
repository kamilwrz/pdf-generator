# Two-column section placement planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a balance-driven rule that measures each CV section's height in both the sidebar and the main column and partitions sections between the two columns to minimise page-1 imbalance, piloted on the Sterling template.

**Architecture:** A new pure module `column_planner.py` holds a `PlaceableSection` descriptor (carrying each section's precomputed height in each column) and a `plan_columns(...)` greedy-local-search partitioner. Sterling's generator builds descriptors using the existing per-column measure helpers, calls `plan_columns`, then renders each column's assigned sections through the existing sidebar and main render paths. No new renderers or measurers are written.

**Tech Stack:** Python 3.11, ReportLab metrics (via `Builder.measure_block`), `pytest`; Node `node --test` for the frontend starter tests.

## Global Constraints

- The sidebar cannot paginate: sidebar assignment is a HARD page-1 fit (`sum(sidebar heights) <= sidebar_budget`); the main column may paginate, so exceeding `main_budget` is allowed and is NOT counted as wasted space.
- Experience is anchored to the main column and always renders first there.
- Sections are atomic with respect to the column decision — a section is wholly in one column, never split.
- This iteration wires the planner into **Sterling only**. Tessera, Slate, Harbor are untouched.
- The frontend starter (`frontend/src/templates/sterling.js`) is generator output; regenerate it, and revert the incidental random-`flowGroup` churn the regeneration script produces on every OTHER starter. Same for mockups: keep only `sterling.png`.
- README must be updated in both English and Polish (repository policy).
- Reuse existing helpers; do not duplicate measurement or rendering logic.

---

### Task 1: Pure two-column planner (`column_planner.py`)

**Files:**
- Create: `backend/app/services/cv_templates/shared/column_planner.py`
- Test: `backend/tests/test_column_planner.py`

**Interfaces:**
- Consumes: nothing (pure module; only the standard library `dataclasses`).
- Produces:
  - `PlaceableSection(key: str, order_rank: int, affinity: str, main_height: float, sidebar_height: float | None, anchored_main: bool = False)` — frozen dataclass. `affinity` is `"main"` or `"sidebar"`. `sidebar_height=None` means the section cannot render in the sidebar.
  - `ColumnPlan(main: list[str], sidebar: list[str])` — frozen dataclass; each is section keys in `order_rank` order.
  - `plan_columns(sections: list[PlaceableSection], *, sidebar_budget: float, main_budget: float, imbalance_tolerance: float = 60.0, min_improvement: float = 24.0) -> ColumnPlan`

- [ ] **Step 1: Write the failing tests (seed + invariants)**

Create `backend/tests/test_column_planner.py`:

```python
from app.services.cv_templates.shared.column_planner import (
    ColumnPlan,
    PlaceableSection,
    plan_columns,
)


def _sections_short_experience():
    # Experience is short, so Education (main-affinity) stays in main and the
    # main column still has room; one simple section balances across.
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
    # Keys appear in ascending order_rank within each column.
    order = {"summary": 0, "experience": 1, "education": 2, "skills": 3, "languages": 4}
    assert plan.main == sorted(plan.main, key=order.__getitem__)
    assert plan.sidebar == sorted(plan.sidebar, key=order.__getitem__)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_column_planner.py -q`
Expected: FAIL with `ModuleNotFoundError: ... column_planner`.

- [ ] **Step 3: Implement the planner**

Create `backend/app/services/cv_templates/shared/column_planner.py`:

```python
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


def _column_heights(assignment: dict[str, str], sections: list[PlaceableSection]) -> tuple[float, float]:
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
    ``min_improvement``.
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_column_planner.py -q`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/cv_templates/shared/column_planner.py backend/tests/test_column_planner.py
git commit -m "feat: pure two-column section placement planner"
```

- [ ] **Step 6: Write the failing tests (balancing behaviour)**

Append to `backend/tests/test_column_planner.py`:

```python
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
    # Seed is already balanced within tolerance; no section should move even
    # though a tiny improvement is arithmetically possible.
    sections = [
        PlaceableSection("experience", 1, "main", main_height=190, sidebar_height=None, anchored_main=True),
        PlaceableSection("education", 2, "main", main_height=190, sidebar_height=180),
        PlaceableSection("skills", 3, "sidebar", main_height=200, sidebar_height=360),
    ]
    plan = plan_columns(sections, sidebar_budget=400, main_budget=400, imbalance_tolerance=60, min_improvement=24)
    # main = experience+education = 380 (empty 20); sidebar = skills = 360
    # (empty 40); cost = 40 <= tolerance, so the seed is returned unchanged.
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
```

- [ ] **Step 7: Run the new tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_column_planner.py -q`
Expected: PASS (9 tests total). The implementation from Step 3 already satisfies these; if any fail, fix the planner (do not weaken the tests).

- [ ] **Step 8: Commit**

```bash
git add backend/tests/test_column_planner.py
git commit -m "test: balancing behaviour for the column planner"
```

---

### Task 2: Section-descriptor builder + Sterling wiring

**Files:**
- Modify: `backend/app/services/cv_templates/templates/sterling.py` (replace the fixed sidebar/main split in `_gen_sterling`)
- Test: `backend/tests/test_cv_template_layouts.py` (add a Sterling placement test)

**Interfaces:**
- Consumes: `plan_columns`, `PlaceableSection`, `ColumnPlan` from Task 1; existing helpers `_sidebar_candidates`, `_fit_sidebar_sections`, `_fitted_sidebar_body_elements`, `_sidebar_wrapped_height`, `_sidebar_education_section_height`, `_sidebar_education_type_sizes`, `_experience_record_height`, `_education_record_height`, `_place_experience_record`, `_place_education_record`, `_place_skills_section`, `_extra_sections`, `_measure_languages_grid_height`, `_measure_skills_body`, `Builder.measure_block`, `get_spacing`, `section_chrome_height`.
- Produces: no new public symbols; `_gen_sterling` keeps its signature `(_gen_sterling(cv: dict) -> list[dict])`.

**Key geometry (already in `sterling.py`):** `SIDE_L = 34`, `SIDE_W = 152`, `MAIN_L = 245`, `MAIN_W = 300`, sidebar budget bottom `760`, `content_top = rule_y + 30`, `SECTION_CHROME = HEADING_FS*1.05 + 6 + 1 + get_spacing().after_rule`, main content bottom `CONTENT_BOTTOM = 770`. Sidebar fitted body font/line-height top tier: `8.3 / 12.04`.

- [ ] **Step 1: Add a Sterling placement test (failing)**

Add to `backend/tests/test_cv_template_layouts.py` (near the other Sterling-free generic tests):

```python
    def test_sterling_balances_education_into_the_main_column(self):
        """Short experience → Education renders in the main column, not the rail."""
        from app.services.cv_generator import generate_resume
        cv = {
            "name": "Maja Zielińska",
            "title": "Studentka Marketingu",
            "email": "maja@example.com",
            "summary": "Krótkie podsumowanie zawodowe kandydatki.",
            "experience": [
                {
                    "title": "Praktyka studencka",
                    "company": "Dział Marketingu",
                    "period": "2023",
                    "bullets": ["Wsparcie kampanii", "Treści na blogi"],
                },
            ],
            "education": [
                {"degree": "Magister, Marketing", "school": "Uniwersytet Miejski", "period": "2015 - 2019"},
            ],
            "skills": ["Analiza danych", "SEO", "Content marketing"],
            "languages": [{"name": "Angielski", "level": "C1"}],
        }
        elements = generate_resume("sterling", cv)
        # Education heading renders in the main column (left == MAIN_L == 245),
        # not as a sidebar kicker (left == SIDE_L == 34).
        edu_heading = next(
            e for e in elements
            if e.get("category") == "text"
            and str(e.get("content", "")).upper().startswith("WYKSZTA")
        )
        self.assertEqual(edu_heading["left"], 245)
        # Experience is always in the main column.
        exp_heading = next(
            e for e in elements
            if e.get("category") == "text"
            and "DOŚWIADCZENIE" in str(e.get("content", "")).upper()
        )
        self.assertEqual(exp_heading["left"], 245)
        # No section is dropped or duplicated: exactly one WYKSZTAŁCENIE heading.
        edu_headings = [
            e for e in elements
            if e.get("category") == "text"
            and str(e.get("content", "")).upper().startswith("WYKSZTA")
        ]
        self.assertEqual(len(edu_headings), 1)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && python -m pytest tests/test_cv_template_layouts.py -k sterling_balances -q`
Expected: FAIL — today Education renders as a sidebar kicker at `left == 34`.

- [ ] **Step 3: Add the descriptor builder to `sterling.py`**

Inside `_gen_sterling`, after `content_top` is computed and the type-size constants (`BODY_FS`, `BODY_LH`, `SIDE_SUMMARY_FS`, `SIDE_SUMMARY_LH`, `SECTION_CHROME`, `TITLE_FS2`, `TITLE_LH2`, `META_FS`, `META_LH`) are known, build the descriptor list. Add imports at the top:

```python
from app.services.cv_templates.shared.column_planner import (
    PlaceableSection,
    plan_columns,
)
from app.services.cv_templates.shared.extras import (
    _sidebar_wrapped_height,
)
from app.services.cv_templates.shared.records import (
    _sidebar_education_entries,
    _sidebar_education_section_height,
)
from app.services.cv_templates.shared.extras import _sidebar_education_type_sizes
```

(Keep the existing imports; add only the missing names.)

Helper to measure a main-column section body with a throwaway probe Builder (chrome added separately):

```python
    # Rank map: Summary first, Experience anchored next, then the shared sidebar
    # order (skills, languages, certifications, interests, education). Education
    # sorts after the simple lists in reading order but is main-affinity.
    RANK = {
        "summary": 0, "experience": 1, "skills": 3, "languages": 4,
        "certifications": 5, "interests": 6, "education": 7,
    }
    # Sidebar section chrome advance used by `_fit_sidebar_sections`.
    SIDEBAR_CHROME = 10 + 5 + 18  # kicker + tick gap + trailing gap
    sidebar_budget = 760.0 - content_top
    main_budget = 770.0 - content_top

    probe = Builder(0.0)
    descriptors: list[PlaceableSection] = []

    def main_body_plus_chrome(height: float) -> float:
        return SECTION_CHROME + height + get_spacing().section
```

Then append one descriptor per present section. Summary:

```python
    if cv.get("summary"):
        side_h = _sidebar_wrapped_height(cv["summary"], SIDE_W, SIDE_SUMMARY_FS, SIDE_SUMMARY_LH) + SIDEBAR_CHROME
        main_h = main_body_plus_chrome(
            probe.measure_block(cv["summary"], MAIN_W, BODY_FS, BODY_LH, SANS)
        )
        descriptors.append(PlaceableSection(
            "summary", RANK["summary"], "sidebar", main_height=main_h, sidebar_height=side_h,
        ))
```

Experience (anchored, no sidebar height):

```python
    if cv.get("experience"):
        jobs = cv["experience"]
        exp_body = 0.0
        for index, job in enumerate(jobs):
            exp_body += _experience_record_height(
                probe, job, MAIN_W, SANS, title_fs=TITLE_FS2, title_lh=TITLE_LH2,
                meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
            )
            if index < len(jobs) - 1:
                exp_body += get_spacing().record
        descriptors.append(PlaceableSection(
            "experience", RANK["experience"], "main",
            main_height=main_body_plus_chrome(exp_body), sidebar_height=None,
            anchored_main=True,
        ))
```

Education (main-affinity, has a sidebar height):

```python
    edu_entries = _sidebar_education_entries(cv.get("education"))
    if edu_entries:
        type_sizes = _sidebar_education_type_sizes(SIDE_SUMMARY_FS, SIDE_SUMMARY_LH)
        side_h = _sidebar_education_section_height(edu_entries, SIDE_W, SANS, **type_sizes) + SIDEBAR_CHROME
        main_body = 0.0
        for index, edu in enumerate(edu_entries):
            main_body += _education_record_height(
                probe, edu, MAIN_W, SANS, degree_fs=TITLE_FS2, degree_lh=TITLE_LH2,
                meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
            )
            if index < len(edu_entries) - 1:
                main_body += get_spacing().record
        descriptors.append(PlaceableSection(
            "education", RANK["education"], "main",
            main_height=main_body_plus_chrome(main_body), sidebar_height=side_h,
        ))
```

Simple sidebar candidates (skills / languages / interests / certifications) reuse `_sidebar_candidates`, skipping education (handled above). Each gets a sidebar height from its candidate content and a main height from the matching main measurer:

```python
    for cand in _sidebar_candidates(cv, lbl):
        if cand["kind"] == "education":
            continue
        side_h = _sidebar_wrapped_height(
            cand["content"], SIDE_W, SIDE_SUMMARY_FS, SIDE_SUMMARY_LH,
        ) + SIDEBAR_CHROME
        if cand["kind"] == "skills":
            from app.services.cv_data import skill_groups
            main_body = _measure_skills_body(
                probe, skill_groups(cv.get("skills")), MAIN_W, BODY_FS, BODY_LH, SANS,
            )
        elif cand["kind"] == "languages":
            from app.services.cv_templates.shared.text import _language_entries
            main_body = _measure_languages_grid_height(
                probe, _language_entries(cv), MAIN_W, font=SANS, fs=BODY_FS, lh=BODY_LH,
            )
        else:  # interests / certifications → flat bullet block
            main_body = probe.measure_block(
                cand["content"], MAIN_W, BODY_FS, BODY_LH, SANS, bulletList=True,
            )
        descriptors.append(PlaceableSection(
            cand["key"], RANK.get(cand["kind"], 6), cand["affinity"] if "affinity" in cand else "sidebar",
            main_height=main_body_plus_chrome(main_body), sidebar_height=side_h,
        ))
```

Add the missing imports used above at the top of the module:

```python
from app.services.cv_templates.shared.text import _measure_skills_body
from app.services.cv_templates.shared.extras import _measure_languages_grid_height  # if re-exported; else import from text
```

(Verify the exact module each name lives in: `_measure_skills_body` and `_measure_languages_grid_height` are defined in `shared/text.py`; import them from there.)

- [ ] **Step 4: Call the planner and split candidates by column**

Replace the current "summary always sidebar + `_fit_sidebar_sections` on all candidates + experience-only main" logic with:

```python
    plan = plan_columns(
        descriptors, sidebar_budget=sidebar_budget, main_budget=main_budget,
    )
    main_keys = set(plan.main)
    # Candidate lookup for whichever simple sections landed in the sidebar.
    cand_by_key = {c["key"]: c for c in _sidebar_candidates(cv, lbl)}
    sidebar_cand_keys = [k for k in plan.sidebar if k in cand_by_key and k != "education"]
```

- [ ] **Step 5: Render the sidebar for the planned sidebar set**

Build the sidebar exactly as before but only for the planned keys. Summary (if sidebar) keeps its explicit first placement; the remaining sidebar candidates + education (if sidebar) go through `_fit_sidebar_sections` starting under the summary. Reuse the existing `sidebar_kicker`, `_fitted_sidebar_body_elements`, and the loop already in `_gen_sterling` — the only change is the candidate list fed to `_fit_sidebar_sections` is now `[cand_by_key[k] for k in plan.sidebar if k in cand_by_key]` (which already excludes education unless education is in `plan.sidebar`, in which case its education candidate must be included). Concretely:

```python
    sidebar: list[dict] = []
    cursor = content_top
    if "summary" in plan.sidebar and cv.get("summary"):
        sidebar.extend(sidebar_kicker(lbl["summary"], cursor))
        body_top = cursor + CHROME_GAP
        body_h = Builder.measure_block(cv["summary"], SIDE_W, SIDE_SUMMARY_FS, SIDE_SUMMARY_LH, SANS)
        sidebar.append({
            "category": "textarea", "content": cv["summary"], "left": SIDE_L, "top": body_top,
            "width": SIDE_W, "height": body_h, "fontSize": SIDE_SUMMARY_FS, "lineHeight": SIDE_SUMMARY_LH,
            "letterSpacing": 0, "color": C["ink"], "fontFamily": SANS, "zIndex": 3, "page": 1,
            "bold": False, "italic": False, "align": "left", "bulletList": False,
            "autoHeight": True, "preserveInitialLayout": True,
        })
        cursor = body_top + body_h + 26.0

    sidebar_planned = [c for c in _sidebar_candidates(cv, lbl) if c["key"] in set(plan.sidebar)]
    fitted_sections, _ = _fit_sidebar_sections(
        sidebar_planned, width=SIDE_W, start_y=cursor, bottom_y=760, font=SANS,
    )
    for section_data in fitted_sections:
        top = float(section_data["top"])
        sidebar.extend(sidebar_kicker(section_data["title"], top))
        sidebar.extend(_fitted_sidebar_body_elements(
            section_data, left=SIDE_L, width=SIDE_W,
            ink=C["ink"], muted=C["muted"], body=C["ink"], font=SANS,
        ))

    sidebar = [{**el, "page": 1, "flowRole": el.get("flowRole", "content"), "flowLane": "sidebar"} for el in sidebar]
```

- [ ] **Step 6: Render the main column for the planned main set**

Drive the main column from `plan.main` in order. Experience first (anchored). For each key, dispatch to the existing renderer:

```python
    b = Builder(content_top)
    for key in plan.main:
        if key == "summary" and cv.get("summary"):
            b.need_section(SECTION_CHROME, probe.measure_block(cv["summary"], MAIN_W, BODY_FS, BODY_LH, SANS))
            section(lbl["summary"])
            b.block(cv["summary"], MAIN_L, MAIN_W, BODY_FS, BODY_LH, C["ink"], SANS)
            close_section()
        elif key == "experience" and cv.get("experience"):
            jobs = cv["experience"]
            b.need_section(SECTION_CHROME, experience_height(jobs[0]))
            section(lbl["experience"])
            for index, job in enumerate(jobs):
                _place_experience_record(
                    b, job, MAIN_L, MAIN_W, ink=C["ink"], muted=C["muted"], body=C["ink"], font=SANS,
                    title_fs=TITLE_FS2, title_lh=TITLE_LH2, meta_fs=META_FS, meta_lh=META_LH,
                    body_fs=BODY_FS, body_lh=BODY_LH,
                    after_gap=get_spacing().record if index < len(jobs) - 1 else None,
                )
            close_section()
        elif key == "education" and edu_entries:
            b.need_section(SECTION_CHROME, _education_record_height(
                b, edu_entries[0], MAIN_W, SANS, degree_fs=TITLE_FS2, degree_lh=TITLE_LH2,
                meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH))
            section(lbl["education"])
            for index, edu in enumerate(edu_entries):
                _place_education_record(
                    b, edu, MAIN_L, MAIN_W, ink=C["ink"], muted=C["muted"], body=C["ink"], font=SANS,
                    degree_fs=TITLE_FS2, degree_lh=TITLE_LH2, meta_fs=META_FS, meta_lh=META_LH,
                    body_fs=BODY_FS, body_lh=BODY_LH,
                    after_gap=get_spacing().record if index < len(edu_entries) - 1 else None,
                )
            close_section()
        elif key == "skills":
            if _place_skills_section(b, cv, section, MAIN_L, MAIN_W, C["ink"], SANS, BODY_FS, BODY_LH, section_chrome_h=SECTION_CHROME):
                close_section()
    # Languages / interests / certifications that landed in main render via the
    # shared extras placer (indices already excluded from the sidebar).
    main_extra_indices = {
        cand_by_key[k]["extra_index"]
        for k in plan.main
        if k in cand_by_key and isinstance(cand_by_key[k].get("extra_index"), int)
    }
    sidebar_extra_indices = {
        cand_by_key[k]["extra_index"]
        for k in plan.sidebar
        if k in cand_by_key and isinstance(cand_by_key[k].get("extra_index"), int)
    }
    _extra_sections(
        b, cv, "after_experience", section, {"body": C["ink"], "accent": C["accent"]},
        MAIN_L, MAIN_W, SANS, fs=BODY_FS, lh=BODY_LH,
        skip_indices=sidebar_extra_indices, section_chrome_h=SECTION_CHROME,
    )
    _extra_sections(
        b, cv, "after_skills", section, {"body": C["ink"], "accent": C["accent"]},
        MAIN_L, MAIN_W, SANS, fs=BODY_FS, lh=BODY_LH,
        skip_indices=sidebar_extra_indices, section_chrome_h=SECTION_CHROME,
    )
    flow = b.build()
```

**Note for the implementer:** `_sidebar_candidates` does not currently attach an `affinity` field. Add `"affinity": "sidebar"` (and `"main"` for the education candidate) to each candidate dict it returns in `extras.py`, OR default affinity in the descriptor builder as shown in Step 3 (`cand.get("affinity", "sidebar")`). Prefer defaulting in the builder to avoid touching the shared candidate list this iteration.

- [ ] **Step 7: Run the Sterling placement test + full layout suite**

Run: `cd backend && python -m pytest tests/test_cv_template_layouts.py -q`
Expected: PASS, including `test_sterling_balances_education_into_the_main_column`. Fix `_gen_sterling` until green. Watch for: no duplicated section, sidebar within page 1, no `KeyError` on missing sections.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/cv_templates/templates/sterling.py backend/tests/test_cv_template_layouts.py
git commit -m "feat: route Sterling sections via the two-column planner"
```

---

### Task 3: Regenerate starter + mockup, refresh frontend tests, update README

**Files:**
- Regenerate: `frontend/src/templates/sterling.js`, `frontend/public/template-mockups/sterling.png`
- Modify: `frontend/src/templates/sterling.test.js`, `frontend/src/templates/sterling.pack.test.js` (only if the demo split changed which column a section is in), `frontend/src/templates/sterling.multipage.fixture.json` (regenerate if the pack test asserts on it)
- Modify: `README.md` (English + Polish Sterling sections), `docs/superpowers/specs/2026-08-12-two-column-section-placement-design.md` reference in the Features list

**Interfaces:**
- Consumes: the regeneration scripts `scripts/regenerate_template_starters.py`, `frontend/scripts/dump-iconic-templates.mjs`, `scripts/render_iconic_mockups.py`.
- Produces: no code symbols — updated assets, tests, and docs.

- [ ] **Step 1: Regenerate the Sterling starter**

Run:
```bash
cd "$(git rev-parse --show-toplevel)" && python scripts/regenerate_template_starters.py
```
Then revert the incidental `flowGroup`-hash churn on every OTHER starter (keep only `sterling.js`):
```bash
git checkout -- $(git diff --name-only frontend/src/templates/*.js | grep -v 'sterling.js')
```

- [ ] **Step 2: Inspect the regenerated `sterling.js`**

Confirm the demo CV (Jan Kowalski) now routes Education into the main column and that page-1 fits (the regeneration script fails loudly if any element spills to page 2). Read the head decorations are unchanged (letterhead band from the previous change is intact).

- [ ] **Step 3: Update the frontend Sterling tests**

Open `frontend/src/templates/sterling.test.js`. The existing test asserts "exactly one main-column section (Experience)". With the planner, the demo CV now has **Experience + Education** (and possibly more) in the main column. Update the relevant assertions:

```javascript
    // ── Main column: Experience is always present; the planner may also place
    // Education (and other sections) here to balance the columns. ────────────
    const headingLabels = sterlingTemplate.filter(
        (element) => element.flowRole === "section-chrome" && element.category === "text",
    );
    assert.ok(headingLabels.some((h) => h.content === "DOŚWIADCZENIE ZAWODOWE"));
    assert.ok(headingLabels.every((h) => h.left === MAIN_L));
```

(Replace the previous `assert.equal(headingLabels.length, 1)` block. Keep every other assertion.)

- [ ] **Step 4: Run the frontend Sterling tests**

Run:
```bash
cd frontend && node --test src/templates/sterling.test.js
```
Expected: PASS. If `sterling.pack.test.js` fails because the fixture is stale, regenerate the fixture from the backend generator for the four-job document it documents (see the file's header comment) and re-run; the pack test only inspects `flowLane === "sidebar"` elements and main-column section gluing, so a fixture refresh is sufficient.

- [ ] **Step 5: Regenerate the mockup**

Run:
```bash
cd "$(git rev-parse --show-toplevel)" && node frontend/scripts/dump-iconic-templates.mjs && python scripts/render_iconic_mockups.py
```
Keep only `sterling.png`; revert the other re-encoded mockups:
```bash
git checkout -- $(git diff --name-only frontend/public/template-mockups/*.png | grep -v 'sterling.png')
```
Open `frontend/public/template-mockups/sterling.png` and verify the columns are visibly more balanced (Education now under Experience in the main column, sidebar lighter).

- [ ] **Step 6: Update the README (English + Polish)**

In `README.md`, in both the English "Sterling" section (~line 900) and the Polish "Szablon Sterling" section (~line 2512), add a paragraph describing the planner. English draft:

> **Section placement is balance-driven.** Rather than filling the sidebar first, Sterling measures every section's height in both column widths and calls the shared `plan_columns` planner (`backend/app/services/cv_templates/shared/column_planner.py`) to partition sections between the columns, minimising page-1 imbalance. Experience is anchored to the main column; every other section is movable. Because the sidebar cannot paginate, the sidebar assignment is a hard page-1 fit while the main column may overflow onto later pages. In practice a short Experience block lets Education sit in the main column beside a lighter sidebar; a long Experience block pushes Education (and, if needed, another section) into the sidebar.

Polish draft:

> **Rozmieszczanie sekcji jest sterowane balansem.** Zamiast najpierw wypełniać sidebar, Sterling mierzy wysokość każdej sekcji w obu szerokościach kolumn i wywołuje wspólny planer `plan_columns` (`backend/app/services/cv_templates/shared/column_planner.py`), który dzieli sekcje między kolumny, minimalizując nierównowagę na stronie 1. Doświadczenie jest zakotwiczone w kolumnie głównej; każda inna sekcja jest ruchoma. Ponieważ sidebar nie może dzielić się na strony, jego przydział to twarde dopasowanie do strony 1, podczas gdy kolumna główna może przechodzić na kolejne strony. W praktyce krótkie Doświadczenie pozwala umieścić Wykształcenie w kolumnie głównej obok lżejszego sidebara; długie Doświadczenie przenosi Wykształcenie (a w razie potrzeby kolejną sekcję) do sidebara.

Also add a Features entry (English + Polish Features sections) with verified references:
- `backend/app/services/cv_templates/shared/column_planner.py` — `plan_columns`, `PlaceableSection`, `ColumnPlan`
- `backend/tests/test_column_planner.py` — planner unit tests
- `backend/app/services/cv_templates/templates/sterling.py` — descriptor builder + planner call in `_gen_sterling`

Verify the line numbers of the Sterling section against the current file before writing them (they shift as the README grows).

- [ ] **Step 7: Run the full backend suite + commit**

Run:
```bash
cd backend && python -m pytest tests/test_column_planner.py tests/test_cv_template_layouts.py -q
```
Expected: PASS.

```bash
cd "$(git rev-parse --show-toplevel)"
git add frontend/src/templates/sterling.js frontend/src/templates/sterling.test.js \
        frontend/public/template-mockups/sterling.png README.md
# add the fixture only if it was regenerated in Step 4
git commit -m "feat: balance-driven Sterling layout — regenerate starter/mockup, docs"
```

---

## Self-Review

**Spec coverage:**
- Balance objective (`max(empty_side, empty_main)`) → Task 1 Step 3 `_cost`. ✓
- Sidebar hard-fit / main soft-overflow → Task 1 `_cost` (infeasible sidebar; clamped main). ✓
- Experience anchored → `anchored_main`, Task 1 `can_move`; asserted Task 1 Step 1 + Task 2 test. ✓
- Any section movable to either column → descriptors carry `main_height` for all kinds; Task 2 dispatch renders skills/languages/interests in main. ✓
- Affinity seed + min-improvement guardrail → Task 1 Step 3 seed + balance loop; asserted Task 1 Step 6. ✓
- Ordering by `order_rank` → Task 1 Step 3 final sort; asserted Task 1 Step 1. ✓
- Disjoint cover (no drop/duplicate) → asserted Task 1 Step 1 + Task 2 test. ✓
- Sterling-only rollout → only `sterling.py` modified; other templates reverted after regeneration. ✓
- Regenerate starter + mockup, keep only Sterling → Task 3 Steps 1/5. ✓
- README EN + PL → Task 3 Step 6. ✓
- Edge cases (huge experience, sidebar-infeasible section) → Task 1 Steps 6-7. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". One implementer note in Task 2 Step 3 flags verifying the module a helper is imported from — that is a verification instruction, not a missing detail (the module, `shared/text.py`, is named).

**Type consistency:** `plan_columns` / `PlaceableSection` / `ColumnPlan` names and fields match between Task 1 (definition) and Task 2 (consumption). `main_height: float`, `sidebar_height: float | None`, `anchored_main: bool` used consistently. `ColumnPlan.main` / `.sidebar` are `list[str]` in both definition and Sterling consumption.

**Known risk to watch during execution (Task 2):** the descriptor heights are estimates; the planner's decision is only as good as the height math. If a planned-sidebar section fails to place in `_fit_sidebar_sections` (height estimate slightly optimistic), it silently drops. Mitigation: `_fit_sidebar_sections`'s budget (`bottom_y=760`) matches `sidebar_budget`, and the planner uses the same `_sidebar_wrapped_height` / education-height functions, so estimates agree. The Task 2 Step 7 run and the Task 3 Step 2 starter inspection are the verification gates.
