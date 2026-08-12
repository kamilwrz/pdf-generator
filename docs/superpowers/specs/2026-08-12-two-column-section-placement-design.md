# Two-column section placement planner for sidebar CV templates

**Date:** 2026-08-12
**Status:** Design approved, pending spec review
**Pilot template:** Sterling (`backend/app/services/cv_templates/templates/sterling.py`)

## 1. Problem

Sidebar CV templates currently place sections with a **one-directional greedy
fill**: `_sidebar_candidates` builds a movable pool (skills, languages,
certifications, interests, education), `_fit_sidebar_sections` packs as many as
fit the page-1 sidebar budget top-down, and anything that does not fit "falls
through" to the main column. Experience always renders in the main column.

The consequence, visible in Sterling: for a short CV the sidebar fills to the
brim (summary, skills, languages, interests, education) while the main column —
holding only two short experience records — leaves roughly half of page 1 empty.
The page reads as lopsided because placement never measures the main column's
free space; it only ever measures the sidebar and spills the remainder.

## 2. Goal

An **abstract, shared rule** that distributes sections between the sidebar and
the main column by measuring the free vertical space in each and balancing the
two, rather than filling the sidebar first. Concretely:

- Experience is always anchored to the main column.
- Every other section is movable and may land in **either** column.
- The planner measures each section's height in **both** column widths and
  assigns sections to minimise page-1 imbalance between the two columns.
- Example the rule must satisfy: with a short Experience block, Education (and,
  if the sidebar is still overfull, one more section) moves into the main column
  to fill it; with a large Experience block that already fills page 1, Education
  stays in / moves to the sidebar.

Decisions locked during brainstorming:

- **Objective:** balance the columns (minimise the worse of the two page-1 empty
  spaces), not merely spill on overflow.
- **Eligibility:** any section may render in the main column if balancing calls
  for it (not restricted to Experience/Education/records).
- **Rollout:** build the mechanism as a shared abstraction but enable it on
  **Sterling only** in this iteration. Tessera, Slate, and Harbor keep their
  current behaviour until the mechanism is validated.

## 3. Constraints that shape the design

1. **The sidebar cannot paginate.** All sidebar content is fixed to page 1
   (`fixedToPage`, `flowLane: "sidebar"`). Therefore the sidebar assignment is a
   **hard** page-1 fit; the main assignment is **soft** (it flows onto page 2+).
2. **Experience is anchored to the main column** and always renders first there.
3. **Sections are atomic with respect to the column decision.** A section is
   wholly in one column; it is never split across columns. (Records already stay
   atomic across *pages* via `keep_together` / `flowGroup`; that is unchanged.)
4. **Per-column render paths already exist for every section kind** — the design
   adds no new renderers:
   - Sidebar: `sidebar_kicker` (per template) + `_fitted_sidebar_body_elements`
     (flat textareas; structured education stack), sized by the
     `_fit_sidebar_sections` font ladder (`_SIDEBAR_FONT_SIZES = 8.3/8.0/7.5`).
   - Main: `_place_experience_record`, `_place_education_record`,
     `_place_skills_section`, `_extra_sections` (languages grid + flat lists),
     and `Builder.block` for the summary paragraph.
5. **Per-column measurement already exists** and is reused, not reinvented:
   - Sidebar: `_sidebar_wrapped_height`, `_sidebar_education_section_height`.
   - Main: `_experience_record_height`, `_education_record_height`,
     `_measure_record_section_body`, `_measure_languages_grid_height`,
     `Builder.measure_block`.

## 4. Design (Approach A: two-column planner abstraction)

### 4.1 New shared module

`backend/app/services/cv_templates/shared/column_planner.py`

Two responsibilities: describe placeable sections, and partition them.

### 4.2 `PlaceableSection` descriptor

One descriptor per section present in the CV. Fields:

- `key: str` — stable identity (`"experience"`, `"education"`, `"skills"`,
  `"languages"`, `"summary"`, `f"extra:{index}"`, …).
- `order_rank: int` — canonical CV reading order used to sort **within** a
  column after assignment. It extends the existing
  `_SIDEBAR_SECTION_ORDER = (skills, languages, certifications, interests,
  education)` with Summary first and Experience anchored, giving:
  Summary → Experience → Education → Skills → Languages → Certifications →
  Interests → record-extras. Assignment changes a section's *column*, never its
  relative order inside a column.
- `affinity: "main" | "sidebar"` — the natural home:
  - main-preferred: `experience` (also anchored), `education`, record-kind
    extras (projects/references/awards).
  - sidebar-preferred: `summary`, `skills`, `languages`, `certifications`,
    `interests`.
- `anchored_main: bool` — `True` only for `experience`; anchored sections are
  never moved out of the main column.
- `measure_main(width) -> float` — page-flow height in the main column, wrapping
  the existing main measurers.
- `measure_sidebar(width) -> (height, font_size, line_height) | None` — height
  under the sidebar font ladder, wrapping `_fit_sidebar_sections`' own logic.
  Returns `None` for sections that cannot render in the sidebar in this template
  (none, initially — every kind has a sidebar path — but the field keeps the
  abstraction honest for future templates).

Descriptors are built by a helper that extends the existing
`_sidebar_candidates` output with the anchored `experience`, the `education`
candidate, and `summary`, attaching the two measure callbacks.

### 4.3 The partitioner: `plan_columns(...)`

Signature (conceptual):

```
plan_columns(
    sections: list[PlaceableSection],
    *,
    sidebar_width: float,
    main_width: float,
    sidebar_budget: float,     # bottom_y - start_y (page-1 sidebar capacity)
    main_budget: float,        # page content bottom - content_top (page-1 main capacity)
    imbalance_tolerance: float,     # e.g. 60 pt: don't chase moves below this
    min_improvement: float,         # e.g. 24 pt: a move must beat this to apply
) -> ColumnPlan
```

`ColumnPlan = { main: [keys in order_rank order], sidebar: [keys in order_rank
order], sidebar_font_sizes: {key: (fs, lh)} }`.

**Objective function.** For a candidate assignment, compute:

- `side_h` = summed sidebar section heights (each with its chrome advance,
  matching `_fit_sidebar_sections`' `10 + 5 + body + 18`).
- `main_h` = anchored + assigned main heights on page 1, measured via the
  Builder-style advances the template already uses.
- `empty_side = max(0, sidebar_budget - side_h)`,
  `empty_main = max(0, main_budget - main_h)`.
- **cost = max(empty_side, empty_main)** — minimising the worse (larger) empty
  column drives both toward full/equal. Ties broken by (1) total affinity
  violations, then (2) fewer sections moved from affinity.

**Hard feasibility:** any assignment with `side_h > sidebar_budget` is
infeasible (sidebar cannot paginate). `main_h` may exceed `main_budget` — the
overflow flows to page 2+, so exceeding it is allowed but counts as `empty_main
= 0` (a full main column is not "wasted space"; the balancer stops trying to add
more to an already-overflowing main column).

**Algorithm (greedy local search, sections are few — typically 4–7):**

1. **Seed** every section in its `affinity` column; anchored sections in main.
2. If the seed's `side_h > sidebar_budget`, repeatedly move the
   lowest-`order_rank`-priority sidebar section that best reduces cost into the
   main column until the sidebar is feasible. (Feasibility first.)
3. **Balance loop:** while `cost > imbalance_tolerance`, evaluate every legal
   single move (move one non-anchored section to the other column) that keeps
   the sidebar feasible; apply the move with the largest cost reduction, but only
   if that reduction `>= min_improvement`. Stop when no qualifying move remains.
4. Sort each column's keys by `order_rank`; return the plan and the fitted
   sidebar font sizes.

Because the section count is small, evaluating all single moves each iteration is
cheap and deterministic. (If a template ever presents many sections, the loop is
still bounded by O(sections² · iterations); acceptable at this scale.)

### 4.4 Ordering & guardrails

- **Canonical order preserved.** Rendering within a column always follows
  `order_rank`, so a moved section never scrambles the reading order — it only
  changes which column it appears in.
- **Affinity bias.** The natural assignment is the seed; moves happen only when
  they beat `min_improvement`, so a well-balanced CV keeps the conventional look
  (summary + simple lists in the sidebar, experience + education in the main
  column). The screenshot case triggers exactly one or two moves (Education, then
  possibly Interests) into the empty main column.
- **No duplication / no loss.** Every descriptor lands in exactly one column;
  a post-condition asserts `set(main) ∪ set(sidebar)` equals the input key set
  and the two are disjoint.

### 4.5 Sterling wiring

`_gen_sterling` currently: places summary + `_fit_sidebar_sections` candidates in
the sidebar, and renders only Experience (plus record extras) in the main column.

New flow:

1. Build descriptors for all present sections (summary, experience, education,
   skills, languages, extras).
2. Call `plan_columns(...)` with Sterling's geometry (`sidebar_width = SIDE_W =
   152`, `main_width = MAIN_W = 300`, `sidebar_budget = 760 - content_top`,
   `main_budget = ~800 - content_top`).
3. Render `plan.sidebar` through the existing `sidebar_kicker` +
   `_fitted_sidebar_body_elements` path (using `plan.sidebar_font_sizes`), and
   `plan.main` through the existing `section(...)` + record/skills/extras path,
   with Experience always first.
4. The letterhead band / divider work (already shipped) is unaffected.

Tessera, Slate, Harbor: **unchanged** this iteration.

### 4.6 Edge cases

- **CV shorter than one page:** balance loop equalises the two column bottoms
  (the screenshot case) — no page 2.
- **Experience alone exceeds page 1:** sidebar fills to its budget with the
  highest-priority sidebar-affinity sections; Experience paginates onto page 2+;
  Education stays in the sidebar if it fits, else flows in the main column after
  Experience.
- **Only Experience present (no other sections):** plan = all main, empty
  sidebar rail (rail chrome still drawn). Acceptable.
- **A single section too tall for the sidebar** (e.g. a very long skills list):
  infeasible in sidebar → assigned to main automatically by step 2.
- **Summary:** sidebar-affinity, movable. If balance pulls it to the main column
  it renders via `Builder.block` under the masthead; default keeps it at the top
  of the sidebar.

## 5. Testing

New unit tests (`backend/tests/`) for `plan_columns`:

- Short CV → `empty_main` and `empty_side` within `imbalance_tolerance`;
  Education ends in `main`.
- Large Experience (fills ~¾ page) → Education ends in `sidebar`.
- Huge Experience (> 1 page) → sidebar feasible (≤ budget), main paginates.
- Post-conditions: Experience always in `main`; partition is a disjoint cover of
  the input keys; sidebar assignment never exceeds `sidebar_budget`.

Updated template tests:

- `backend/tests/test_cv_template_layouts.py` — Sterling: Experience in main,
  columns within tolerance, sidebar within page 1, no duplicated/dropped section.
- `frontend/src/templates/sterling.test.js` and `sterling.pack.test.js` — refresh
  expectations for whichever sections the demo CV now routes to each column.

Regeneration after the generator change:

- `python scripts/regenerate_template_starters.py` (sterling.js only kept;
  revert incidental `flowGroup`-hash churn on other starters).
- `node frontend/scripts/dump-iconic-templates.mjs` +
  `python scripts/render_iconic_mockups.py` (keep only `sterling.png`).

## 6. Out of scope

- Rolling the planner onto Tessera, Slate, Harbor (follow-up once validated).
- Splitting a single section across columns (sections stay atomic).
- Changing the sidebar's page-1-only nature or introducing multi-page sidebars.
- Any change to the letterhead band / divider work already shipped.

## 7. Documentation

Per repository policy, update `README.md` (English + Polish) Sterling section and
the shared-helpers section to describe the planner, and add a Features entry with
verified file/line references after implementation.
