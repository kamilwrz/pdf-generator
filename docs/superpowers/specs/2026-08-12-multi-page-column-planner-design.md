# Multi-page-aware two-column section placement

**Date:** 2026-08-12
**Status:** Implemented (2026-08-13; see `docs/superpowers/plans/2026-08-13-multi-page-column-planner.md`)
**Pilot template:** Sterling (`backend/app/services/cv_templates/templates/sterling.py`)
**Builds on:** `docs/superpowers/specs/2026-08-12-two-column-section-placement-design.md`
(the single-page balance-driven planner, already implemented in
`backend/app/services/cv_templates/shared/column_planner.py`)

## 1. Problem

The current planner treats the sidebar as a single page-1-only bucket: any
section that doesn't fit page 1's rail falls through to the main column,
which is then free to paginate. This is correct as far as it goes, but once a
CV is long enough that the main column spills onto page 2+, every
continuation page's sidebar rail is decorated (tint + divider already draw on
every page) but **carries no content** — it is dead space — while the main
column on that same page gets *everything* that didn't fit page 1's sidebar
(Education, Awards, Certifications, …), even when some of that content would
read far better as a short rail entry next to whatever main content already
occupies that page.

Concretely (user's example, a two-page Sterling CV): Wykształcenie and Awards
could sit in the page-1 sidebar; Certyfikaty could sit in the page-2 sidebar,
which is otherwise empty next to the last Technical Projects record. Today
none of that happens — all four pile into the main column.

## 2. Goal

Generalize the already-implemented planner so **any page the main column
already occupies can also receive sidebar content**, using the same
balance-driven logic (minimize the worst bucket's empty space) already
validated for the single-page case — not a bespoke "page 2 special case."

Decisions locked during brainstorming:

- **Row-level alignment is out of scope.** A sidebar section placed on page 2
  starts at the top of that page's rail (the same Y where the main column's
  continuation content starts), not pinned to a specific main-column record's
  Y position. The two columns remain independent cursors, exactly as today —
  this is what keeps the design tractable and consistent with the existing
  "two independent flow lanes" architecture (`packSidebarLane` in
  `frontend/src/utils/sectionStructure.js` already assumes this).
- **A sidebar bucket only exists for a page the main column already uses.**
  The planner never grows the document (invents page 3) just to give a
  section somewhere to go — it only ever *reclaims* rail space on pages that
  already exist.
- **Rollout: Sterling only**, matching the original planner's pilot scope.
  Tessera and Slate are unaffected.

## 3. Why this is solvable without a rewrite

A grep through the frontend reflow code (`frontend/src/utils/sectionStructure.js`)
confirms the "sidebar is page-1-only" behavior is a **backend generator
convention**, not a rendering-pipeline limit:

- `isSidebarLaneElement`, `listSidebarSections`, `isSidebarSectionHeading` key
  off `flowLane === "sidebar"` / `flowRole === "sidebar-chrome"` — none of
  them filter on `page`.
- `packSidebarLane` → `placeStrip` already converts an absolute Y cursor to a
  `(page, top)` pair via `pageTopFromOrigin(abs, relTop, pageHeight)` — the
  exact same page-wrapping mechanism the main-column packer uses. Multi-page
  sidebar content is something this code can already re-pack after a user
  edit; it has simply never been *populated* by a generator.

So this is a backend planning + generation change. The frontend needs no new
capability, only content to exist where today it doesn't.

## 4. The circular dependency, and how the design resolves it

Which sections belong in the sidebar depends on how many pages the main
column needs. How many pages the main column needs depends on which sections
are (not) in the sidebar. This is resolved with a **bounded iteration**
around the existing pure partitioner, alternating a cheap partition pass with
a real measurement pass:

1. **Seed** — partition assuming only the page-1 sidebar bucket exists (today's
   behavior).
2. **Measure** — actually render the resulting main-column section order
   through Sterling's real per-section renderers (the same code that produces
   the final output) into a throwaway `Builder`, and read off how many pages
   it used.
3. **Derive buckets** — one `SidebarBucket` per main-column page ≥ 2 that the
   measurement found. If the main column only ever needs 1 page, no bucket
   beyond page 1 is derived, and the loop converges immediately (see §7,
   regression safety).
4. **Re-partition** — call the pure partitioner again, now aware of every
   currently-derived bucket. A section may move from `main` into *any*
   feasible bucket, or (feasibility repair) back from an over-budget bucket
   into `main`.
5. **Repeat from step 2** — moving sections out of `main` can only shrink or
   hold its page count (never grow it, since nothing is ever added to
   `main`), so this settles quickly. Capped at `max_iterations = 3` as a
   safety valve; convergence is declared when the derived bucket list and
   total main budget stop changing between iterations.

## 5. Design

### 5.1 Generalizing the pure partitioner

`column_planner.py`'s existing `plan_columns` (single `sidebar_budget: float`,
`ColumnPlan.sidebar: list[str]`) generalizes to N buckets. This is a breaking
change to the module's existing public shape — see §8, Migration.

```python
@dataclass(frozen=True)
class SidebarBucket:
    """One page-scoped sidebar rail available to receive sections.

    `page` is the 1-indexed document page. `budget` is that page's rail
    vertical capacity — page 1 differs from continuation pages because the
    masthead consumes space above page 1's rail.
    """
    page: int
    budget: float


@dataclass(frozen=True)
class ColumnPlan:
    """Result of partitioning: section keys per column, in reading order.

    `sidebar_by_page` always contains key `1` (possibly an empty list) plus
    one entry per additional bucket the planner used.
    """
    main: list[str]
    sidebar_by_page: dict[int, list[str]]


def plan_columns(
    sections: list[PlaceableSection],
    *,
    sidebar_buckets: list[SidebarBucket],
    main_budget: float,
    imbalance_tolerance: float = 60.0,
    min_improvement: float = 24.0,
) -> ColumnPlan:
    ...
```

`PlaceableSection` is unchanged — a section's `sidebar_height` is a single
number regardless of which page's rail eventually renders it (the rail is the
same width on every page), so no new per-page measurement is needed there.

**Cost function**, generalized: `cost = max(empty_main, max(empty(bucket) for
bucket in sidebar_buckets))`, where `empty(bucket) = max(0, bucket.budget -
sum of sidebar_height for sections assigned to that bucket)`, and `empty_main
= max(0, main_budget - sum of main_height for sections assigned to main)`.
With exactly one bucket (`[SidebarBucket(1, budget)]`) this is *identical* to
today's `max(empty_side, empty_main)` — the single-page case is a special
case of the general one, not a separate code path.

**Feasibility repair**, generalized: process buckets in ascending `page`
order; while a bucket's assigned total exceeds its budget, evict its
lowest-priority (highest `order_rank`) non-anchored member back to `main`.
Page 1 is repaired first because its budget is fixed and independent of the
iteration; later pages' budgets are themselves derived, so repairing them
first would be repairing a number that's about to change anyway.

**Balance loop**, generalized: a "move target" is `"main"` or a specific
bucket `page` number. Each pass evaluates every legal single move — a section
to `main`, or to *any* bucket whose `sidebar_height` it fits — and applies
whichever reduces `cost` the most, subject to the existing `min_improvement`
gate. This is the same greedy local search as today, just no longer capped at
two targets. Moves are `main ↔ bucket`; a bucket-to-bucket move is not a
primitive (if bucket 2 is fuller than bucket 3, a two-step main-mediated
re-balance already reaches the same result, and this keeps the move space
small and easy to reason about).

### 5.2 Why `main_budget` is a *lump sum*, not per-page

The pure partitioner has no notion of pagination internally — like today, it
just sums `main_height` over whatever it assigns to `main` and compares to a
single number. Once the main column can span multiple pages, that number
represents **total currently-allocated main capacity**:

```
main_budget = page1_main_budget + max(0, pages_used - 1) * continuation_main_budget
```

This is an approximation (real pagination has page-break rules and
`keep_together` atomicity that a lump sum can't model exactly), which is why
step 2 of the iteration periodically re-grounds it with a *real* Builder
measurement rather than trusting the lump sum indefinitely. The alternative —
re-measuring pagination with a real Builder pass for every candidate move
inside the greedy search — was considered and rejected: for a CV with ~7
movable sections and 3 buckets, the greedy search alone can evaluate on the
order of 20–150 candidate moves per outer iteration; a full render per
candidate would multiply request latency for a benefit (pixel-exact
per-candidate accuracy) that the periodic re-grounding already captures at
the point that matters — the final chosen plan.

### 5.3 The orchestrator

A new function in the same module composes the pure partitioner with the
iteration:

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
    ...
```

`measure_main` is supplied by the caller (the template generator) because
only the template knows how to actually render its main column. `column_planner.py`
stays free of any `Builder`/ReportLab dependency — the orchestrator's own
logic (loop, bucket derivation, convergence check) is pure and independently
testable with a fake `measure_main`.

Pseudocode:

```
buckets = [SidebarBucket(1, page1_sidebar_budget)]
total_main_budget = page1_main_budget
plan = None
for _ in range(max_iterations):
    plan = plan_columns(sections, sidebar_buckets=buckets, main_budget=total_main_budget, ...)
    pages_used = max(1, measure_main(plan.main).pages_used)
    new_buckets = [SidebarBucket(1, page1_sidebar_budget)] + [
        SidebarBucket(p, continuation_sidebar_budget) for p in range(2, pages_used + 1)
    ]
    new_total_main_budget = page1_main_budget + max(0, pages_used - 1) * continuation_main_budget
    if [b.page for b in new_buckets] == [b.page for b in buckets] and new_total_main_budget == total_main_budget:
        break
    buckets, total_main_budget = new_buckets, new_total_main_budget
return plan
```

### 5.4 Sterling wiring

Two changes to `_gen_sterling`:

1. **Extract the main-column render dispatch** (today's inline `for key in
   plan.main: ...` block) into a callable that renders a given ordered key
   list into a caller-supplied `Builder`. This lets `measure_main` reuse it
   against a throwaway `Builder` (returning just `pages_used`), and the final
   render reuse the *same* function against the real `Builder` — no
   duplicated rendering logic between "measuring" and "producing."
2. **Sidebar rendering runs once per page with a bucket.** Page 1 renders
   exactly as today (`_fit_sidebar_sections` starting at `content_top`,
   bottom `760`). Each additional page `P` in `plan.sidebar_by_page` renders
   the same way — `_fit_sidebar_sections` starting at `PAGE_TOP` (Sterling's
   continuation top), bottom `760` — with results stamped `page: P` instead
   of `page: 1`. `_fit_sidebar_sections`, `_fitted_sidebar_body_elements`,
   and the kicker helper are unchanged; only the caller's `start_y` and the
   `page` stamp differ per bucket.

Budgets used:

- `page1_sidebar_budget = 760 - content_top` (unchanged from today).
- `continuation_sidebar_budget = 760 - PAGE_TOP`.
- `page1_main_budget = 770 - content_top` (`CONTENT_BOTTOM - content_top`,
  unchanged from today).
- `continuation_main_budget = 770 - PAGE_TOP` (`CONTENT_BOTTOM - PAGE_TOP`).

(`PAGE_TOP` and `CONTENT_BOTTOM` are existing constants from
`app/services/cv_generator_primitives.py`; Sterling does not currently
override `continuation_top()`, so its continuation pages start at the
generic `PAGE_TOP`.)

Page decoration (rail tint + divider drawn on every page) is already
per-page in `_gen_sterling`'s `page_decorations` loop and needs no change —
only the *content* on those rails is new.

## 6. Edge cases

- **CV fits on 1 page:** no bucket beyond page 1 is ever derived; behavior is
  byte-for-byte identical to today's single-page planner (see §7).
- **Main shrinks back to fewer pages mid-iteration** (moving sections out of
  main frees enough space that page 3 is no longer needed): because each
  iteration recomputes the *full* partition from scratch against the
  newly-derived bucket list (no incremental/sticky assignment carried
  between iterations), a section previously assigned to a now-dropped bucket
  is automatically re-evaluated by the next `plan_columns` call — it cannot
  end up assigned to a page that no longer exists.
- **A section too tall for every current bucket:** falls through to `main`,
  exactly as the single-bucket case today.
- **`measure_main` disagrees with the lump-sum approximation** (e.g. a
  `keep_together` record forces an earlier-than-expected page break): the
  next iteration's bucket list is derived from the *real* measurement, not
  the approximation, so this self-corrects within the iteration cap.
- **Oscillation:** bounded by `max_iterations`; if convergence isn't reached
  by then, the last computed `plan` is used (a bounded, deterministic
  fallback — never an infinite loop).

## 7. Regression safety

For any CV whose main column fits on page 1 (the common case, and every
existing Sterling test fixture), `plan_columns_multi_page` must produce a
`ColumnPlan` equivalent to today's single-page `plan_columns` output. This
follows structurally (§5.1's cost function reduces to today's exactly when
there is one bucket, and step 3 never derives a second bucket when
`pages_used == 1`), but is also a required explicit regression test (§9).

## 8. Migration (existing code this touches)

- `column_planner.py`: `plan_columns`'s signature and `ColumnPlan`'s shape
  change (breaking). Sterling is the only current caller
  (`backend/app/services/cv_templates/templates/sterling.py`) and is updated
  in the same change to call `plan_columns_multi_page` instead.
- `backend/tests/test_column_planner.py`: all 9 existing unit tests call the
  old signature (`sidebar_budget=...`, `plan.sidebar`) and must be updated to
  the bucket-based signature (`sidebar_buckets=[SidebarBucket(1, ...)]`,
  `plan.sidebar_by_page[1]`). No test's *assertions* need to change in
  substance — only the call shape.
- `backend/tests/test_cv_template_layouts.py`,
  `test_sterling_balances_education_into_the_main_column`: unaffected in
  substance (still a 1-page CV), but should gain a companion multi-page test
  (§9).
- `frontend/src/templates/sterling.js` / `sterling.test.js` /
  `sterling.pack.test.js` / mockup: the current demo CV (Jan Kowalski, 3
  jobs) fits page 1, so the starter is unaffected unless a new multi-page
  demo fixture is introduced for illustration purposes (not required).

## 9. Testing

Unit tests for `plan_columns` (extended from the existing 9, adapted to the
bucket signature):

- All 9 existing cases, adapted, covering the N=1 bucket case.
- A 2-bucket case: a section that doesn't fit bucket 1's budget but fits
  bucket 2's.
- A 2-bucket feasibility-repair case: bucket 2 over budget evicts its
  lowest-priority member back to `main`.

Unit tests for `plan_columns_multi_page` (new, using a fake `measure_main`):

- 1-page CV (fake `measure_main` always returns `pages_used=1`) produces a
  plan with only bucket 1 populated, matching a direct `plan_columns` call
  with a single bucket.
- 2-page CV (fake `measure_main` returns 2 for the seed's `main` list)
  derives a page-2 bucket and can place a section there.
- Convergence within `max_iterations` for a case where the derived bucket
  list changes once then stabilizes.
- A fake `measure_main` that never stabilizes still terminates at
  `max_iterations` (no infinite loop).

End-to-end test in `test_cv_template_layouts.py`:

- A CV long enough to force Sterling onto 2 pages, where Certifications (or
  similar) is short enough to fit the page-2 rail: assert it renders as a
  sidebar kicker with `page: 2`, not in the main column.

## 10. Out of scope

- Row-level Y alignment between a sidebar entry and a specific main-column
  record (§2, explicitly declined during brainstorming).
- Per-candidate-move real pagination simulation inside the greedy search
  (§5.2, rejected for latency; the periodic re-grounding measurement is the
  chosen middle ground).
- Rolling this onto Tessera, Slate, or any other sidebar template.
- Changing the frontend reflow/packing code — confirmed unnecessary (§3).

## 11. Documentation

Per repository policy, update `README.md` (English + Polish) Sterling section
to describe multi-page-aware placement, and add/extend Feature and Test
references with verified file/line numbers after implementation.
