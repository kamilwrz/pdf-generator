# AI-driven CV position operations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the CV AI assistant's chat box handle positional instructions ("move all section headings left by 50px", "align these at x=50", "the job entries should be spaced more evenly") by having GPT select a parametrized operation (never a raw coordinate) that Python resolves against real element bounds and validates before it's ever shown.

**Architecture:** `layout_analysis.py` gains three deterministic, independently-testable resolver functions (`resolve_shift`, `resolve_align`, `resolve_distribute`) built on its existing `_group`/`_is_safe_group`/`_apply_patches` safety primitives — the same ones the auto-scanner already uses. `_chat()` gains a fourth response mode: alongside question/content-edit/clarify, it can now return a `position_operation` directive (operation type + target element ids + parameters) that gets resolved through the new functions into the existing `layout_groups`/`layout_issues` response fields — which the frontend already fully renders (preview/accept/reject) for any chat message. The one frontend change is unrelated to UI: the geometry sent to the backend needs to reflect real rendered size (especially for wrapped `textarea` content), so a DOM-measurement helper already used for canvas dragging gets extracted into a shared util and reused for the chat snapshot.

**Tech Stack:** Python (FastAPI backend), React (frontend), `unittest`/`unittest.mock` for backend tests. No JS test framework exists in this repo (confirmed: `frontend/package.json` has no test script or test dependency) — the frontend task is verified manually in a browser, matching this repo's existing pattern for frontend-only changes.

## Global Constraints

- GPT never supplies a `left`/`top` coordinate. It only ever selects an operation type, target `element_id`s, and parameters (offset, axis, anchor, optional explicit value). Every actual coordinate is computed in Python from the elements' real current bounds.
- Every resolved operation is validated with the same rules `_is_safe_group` already enforces: no result element leaves the page, and no result introduces an overlap that didn't already exist. Distance is NOT capped for these directed operations (unlike the auto-scanner's `MAX_SAFE_SNAP_MOVE`/`MAX_SAFE_BOUNDS_MOVE`) — only bounds/overlap safety applies.
- If a directive can't be resolved safely, the response explains why via `layout_issues` / the chat `message` — never silently drops the request or produces a broken result.
- `distribute` requires at least 3 targets (matching `layout_analysis.py`'s existing `MIN_CLUSTER_SIZE = 3` convention).
- Targets spanning more than one page are rejected — position/size fields are page-local coordinates, so cross-page alignment/distribution is meaningless.
- This spec is CV-only, position (`left`/`top`) only — no size/`width`/`height` changes, no page-count changes, no deck/article changes. `_chat()`'s existing content/style correction path (`corrections`, `_ALLOWED_FIELDS`) is unchanged.
- No new frontend UI component. Proposals flow through the existing `layout_groups`/`layout_issues` fields and the existing `LayoutGroupCard` preview/accept/reject component.

Reference: `docs/superpowers/specs/2026-07-24-ai-cv-position-operations-design.md`

---

### Task 1: Deterministic position-operation resolvers in `layout_analysis.py`

**Files:**
- Modify: `backend/app/services/layout_analysis.py`
- Test: `backend/tests/test_layout_analysis.py` (extend existing file)

**Interfaces:**
- Consumes: `_group(*, group_id, title, reason, severity, patches, items, page_width, page_height) -> dict | None` — already defined, unchanged. Returns `None` if `_is_safe_group` rejects the patches (bounds or new-overlap violation).
- Consumes: `_bounds_for(element) -> dict | None` — already defined, unchanged. Returns `{element_id, category, page, left, top, width, height}` (all coordinates as floats, `page` as int) or `None` if the element isn't measurable/movable.
- Consumes: `EPSILON = 0.5`, `MIN_CLUSTER_SIZE = 3` — already-defined module constants, reused as-is.
- Produces: `extract_bounds(elements: list[dict]) -> list[dict]` — public bounds extraction (was previously inlined in `analyze_layout`), used by Task 2.
- Produces: `resolve_shift(items, target_ids: set[str], dx: float, dy: float, page_width: float, page_height: float) -> dict | None`
- Produces: `resolve_align(items, target_ids: set[str], axis: str, anchor: str, target: float | None, page_width: float, page_height: float) -> dict | None`
- Produces: `resolve_distribute(items, target_ids: set[str], axis: str, page_width: float, page_height: float) -> dict | None`
- Produces: `resolve_directed_operation(elements: list[dict], directive: dict, page_size: dict | None) -> dict` — the entry point Task 2 calls. Always returns `{"layout_groups": [...], "layout_issues": [...]}` with at most one item in `layout_groups`.

- [ ] **Step 1: Write the failing tests**

Open `backend/tests/test_layout_analysis.py` and add this import at the top (alongside the existing `from app.services.layout_analysis import analyze_layout`):

```python
from app.services import layout_analysis
```

Then add this test class at the end of the file (after the existing `LayoutAnalysisTests` class, same indentation level, still inside the file — do not remove anything existing):

```python
class DirectedOperationTests(unittest.TestCase):
    def test_shift_moves_targets_by_relative_offset(self):
        items = layout_analysis.extract_bounds([
            block("moved", 10, 10),
            block("stays", 50, 50),
        ])
        group = layout_analysis.resolve_shift(items, {"moved"}, 10.0, 5.0, 100, 100)
        self.assertIsNotNone(group)
        self.assertEqual(group["patches"], [{"element_id": "moved", "left": 20.0, "top": 15.0}])

    def test_shift_rejects_move_that_leaves_the_page(self):
        items = layout_analysis.extract_bounds([block("edge", 90, 10, width=12, height=10)])
        group = layout_analysis.resolve_shift(items, {"edge"}, 50.0, 0.0, 100, 100)
        self.assertIsNone(group)

    def test_align_to_explicit_target_value(self):
        items = layout_analysis.extract_bounds([
            block("one", 10, 10),
            block("two", 30, 40),
        ])
        group = layout_analysis.resolve_align(items, {"one", "two"}, "x", "start", 20.0, 100, 100)
        self.assertIsNotNone(group)
        changed = {p["element_id"]: p["left"] for p in group["patches"]}
        self.assertEqual(changed, {"one": 20.0, "two": 20.0})

    def test_align_with_omitted_target_uses_median_of_selection(self):
        # Distinct `top` values — these represent elements stacked in a
        # column (e.g. section headings at different heights) being aligned
        # on the x-axis. Same-row elements would legitimately overlap once
        # forced to a shared x, which is a different scenario this test
        # isn't exercising.
        items = layout_analysis.extract_bounds([
            block("one", 10, 10),
            block("two", 20, 40),
            block("three", 60, 70),
        ])
        group = layout_analysis.resolve_align(items, {"one", "two", "three"}, "x", "start", None, 100, 100)
        self.assertIsNotNone(group)
        changed = {p["element_id"]: p["left"] for p in group["patches"]}
        self.assertEqual(changed, {"one": 20.0, "three": 20.0})

    def test_distribute_equalizes_gaps_holding_ends_fixed(self):
        items = layout_analysis.extract_bounds([
            block("first", 0, 0, width=10, height=10),
            block("middle", 0, 15, width=10, height=10),
            block("last", 0, 90, width=10, height=10),
        ])
        group = layout_analysis.resolve_distribute(items, {"first", "middle", "last"}, "y", 100, 100)
        self.assertIsNotNone(group)
        changed = {p["element_id"]: p["top"] for p in group["patches"]}
        self.assertEqual(changed, {"middle": 45.0})

    def test_distribute_requires_at_least_three_targets(self):
        items = layout_analysis.extract_bounds([
            block("first", 0, 0, width=10, height=10),
            block("last", 0, 90, width=10, height=10),
        ])
        group = layout_analysis.resolve_distribute(items, {"first", "last"}, "y", 100, 100)
        self.assertIsNone(group)

    def test_resolve_directed_operation_rejects_targets_spanning_multiple_pages(self):
        elements = [
            block("one", 10, 10, page=1),
            block("two", 10, 10, page=2),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {"type": "shift", "target_element_ids": ["one", "two"], "dx": 5, "dy": 0},
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(len(result["layout_issues"]), 1)

    def test_resolve_directed_operation_ignores_unknown_target_ids(self):
        elements = [block("real", 10, 10)]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {"type": "shift", "target_element_ids": ["ghost"], "dx": 5, "dy": 0},
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(len(result["layout_issues"]), 1)

    def test_resolve_directed_operation_applies_a_valid_align_directive(self):
        elements = [
            block("one", 10, 10),
            block("two", 30, 40),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {
                "type": "align",
                "target_element_ids": ["one", "two"],
                "axis": "x",
                "anchor": "start",
                "target": 20,
            },
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(len(result["layout_groups"]), 1)
        changed = {p["element_id"]: p["left"] for p in result["layout_groups"][0]["patches"]}
        self.assertEqual(changed, {"one": 20.0, "two": 20.0})
```

This file already defines `PAGE_SIZE = {"width": 100, "height": 100}` and a `block(element_id, left, top, *, width=12, height=10, page=1, category="textarea")` helper near the top — reuse both as-is, do not redefine them.

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`:
```
./.venv/Scripts/python.exe -m unittest tests.test_layout_analysis -v
```
Expected: the 6 pre-existing `LayoutAnalysisTests` still **PASS**; all 9 new `DirectedOperationTests` **FAIL** with `AttributeError: module 'app.services.layout_analysis' has no attribute 'extract_bounds'` (or `resolve_shift`/etc.) — none of these functions exist yet.

- [ ] **Step 3: Implement the resolvers**

In `backend/app/services/layout_analysis.py`, find this existing function (it currently ends the "core helpers" section, right before `_is_safe_group`):

```python
def _apply_patches(
    items: list[dict[str, Any]],
    patches: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_id = {patch["element_id"]: patch for patch in patches}
    return [
        {
            **item,
            **({"left": by_id[item["element_id"]]["left"]} if item["element_id"] in by_id else {}),
            **({"top": by_id[item["element_id"]]["top"]} if item["element_id"] in by_id else {}),
        }
        for item in items
    ]
```

Immediately after it (still before `_is_safe_group`), insert:

```python
def extract_bounds(elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Public bounds extraction, shared by the deterministic scanner and
    GPT-directed position operations so both reason about identical geometry."""
    return [bound for element in elements if (bound := _bounds_for(element))]
```

Then find `analyze_layout` near the end of the file:

```python
    items = [bound for element in elements if (bound := _bounds_for(element))]
    if not items:
```

Replace just that first line with a call to the new public function (keep the `if not items:` line and everything after it unchanged):

```python
    items = extract_bounds(elements)
    if not items:
```

Now append this entire new section at the very end of the file, after `analyze_layout`'s closing `}` and return statement:

```python


# ── GPT-directed position operations ────────────────────────────────────────
# GPT selects an operation type, target element ids, and parameters — never a
# coordinate. Everything below computes and validates the actual left/top
# values from the elements' real current bounds, reusing the same
# _group/_is_safe_group safety net the deterministic scanner above uses.

_MIN_DISTRIBUTE_TARGETS = MIN_CLUSTER_SIZE
_VALID_OPERATIONS = {"shift", "align", "distribute"}
_VALID_AXES = {"x", "y"}
_VALID_ANCHORS = {"start", "center", "end"}


def resolve_shift(
    items: list[dict[str, Any]],
    target_ids: set[str],
    dx: float,
    dy: float,
    page_width: float,
    page_height: float,
) -> dict[str, Any] | None:
    targets = [item for item in items if item["element_id"] in target_ids]
    if not targets:
        return None
    if abs(dx) <= EPSILON and abs(dy) <= EPSILON:
        return None

    patches = [
        {
            "element_id": item["element_id"],
            "left": round(item["left"] + dx, 2),
            "top": round(item["top"] + dy, 2),
        }
        for item in targets
    ]
    return _group(
        group_id="directed-shift",
        title=f"Przesuń {len(targets)} {'element' if len(targets) == 1 else 'elementy'}",
        reason="Bezpośrednie polecenie przesunięcia elementów.",
        severity="review",
        patches=patches,
        items=items,
        page_width=page_width,
        page_height=page_height,
    )


def resolve_align(
    items: list[dict[str, Any]],
    target_ids: set[str],
    axis: str,
    anchor: str,
    target: float | None,
    page_width: float,
    page_height: float,
) -> dict[str, Any] | None:
    targets = [item for item in items if item["element_id"] in target_ids]
    if not targets:
        return None

    size_key = "width" if axis == "x" else "height"
    pos_key = "left" if axis == "x" else "top"

    def anchor_value(item: dict[str, Any]) -> float:
        if anchor == "start":
            return item[pos_key]
        if anchor == "center":
            return item[pos_key] + item[size_key] / 2
        return item[pos_key] + item[size_key]

    def offset_for(item: dict[str, Any]) -> float:
        if anchor == "start":
            return 0.0
        if anchor == "center":
            return item[size_key] / 2
        return item[size_key]

    value = target if target is not None else median(anchor_value(item) for item in targets)

    patches = []
    for item in targets:
        new_pos = round(value - offset_for(item), 2)
        if abs(new_pos - item[pos_key]) <= EPSILON:
            continue
        patches.append({
            "element_id": item["element_id"],
            "left": new_pos if axis == "x" else round(item["left"], 2),
            "top": new_pos if axis == "y" else round(item["top"], 2),
        })

    if not patches:
        return None

    return _group(
        group_id="directed-align",
        title=f"Wyrównaj {len(targets)} {'element' if len(targets) == 1 else 'elementy'}",
        reason="Bezpośrednie polecenie wyrównania elementów.",
        severity="review",
        patches=patches,
        items=items,
        page_width=page_width,
        page_height=page_height,
    )


def resolve_distribute(
    items: list[dict[str, Any]],
    target_ids: set[str],
    axis: str,
    page_width: float,
    page_height: float,
) -> dict[str, Any] | None:
    targets = [item for item in items if item["element_id"] in target_ids]
    if len(targets) < _MIN_DISTRIBUTE_TARGETS:
        return None

    pos_key = "left" if axis == "x" else "top"
    size_key = "width" if axis == "x" else "height"
    ordered = sorted(targets, key=lambda item: item[pos_key])

    first, last = ordered[0], ordered[-1]
    total_span = (last[pos_key] + last[size_key]) - first[pos_key]
    total_size = sum(item[size_key] for item in ordered)
    gap_count = len(ordered) - 1
    gap = (total_span - total_size) / gap_count

    if gap < 0:
        return None

    patches = []
    cursor = first[pos_key] + first[size_key] + gap
    for item in ordered[1:-1]:
        new_pos = round(cursor, 2)
        if abs(new_pos - item[pos_key]) > EPSILON:
            patches.append({
                "element_id": item["element_id"],
                "left": new_pos if axis == "x" else round(item["left"], 2),
                "top": new_pos if axis == "y" else round(item["top"], 2),
            })
        cursor += item[size_key] + gap

    if not patches:
        return None

    return _group(
        group_id="directed-distribute",
        title=f"Rozłóż równomiernie {len(targets)} elementów",
        reason="Bezpośrednie polecenie równomiernego rozłożenia odstępów.",
        severity="review",
        patches=patches,
        items=items,
        page_width=page_width,
        page_height=page_height,
    )


def resolve_directed_operation(
    elements: list[dict[str, Any]],
    directive: dict[str, Any],
    page_size: dict[str, Any] | None,
) -> dict[str, Any]:
    """Resolve one GPT-selected position directive into a safe, previewable
    layout group, or an explanation of why it can't be applied. GPT never
    supplies a coordinate — only an operation type, target element ids, and
    parameters; every actual left/top value is computed and validated here."""
    page_size = page_size or {}
    page_width = _number(page_size.get("width"), 595.0)
    page_height = _number(page_size.get("height"), 842.0)

    items = extract_bounds(elements)
    op_type = directive.get("type") if isinstance(directive, dict) else None
    raw_ids = directive.get("target_element_ids") if isinstance(directive, dict) else None
    target_ids = {str(i) for i in raw_ids} if isinstance(raw_ids, list) else set()

    def _issue(message: str) -> dict[str, Any]:
        return {"layout_groups": [], "layout_issues": [{"severity": "warning", "message": message}]}

    if op_type not in _VALID_OPERATIONS or not target_ids:
        return _issue("Nie rozpoznano poprawnego polecenia dotyczącego pozycji elementów.")

    targets = [item for item in items if item["element_id"] in target_ids]
    if not targets:
        return _issue("Nie znaleziono wskazanych elementów na kanwie.")
    if len({item["page"] for item in targets}) > 1:
        return _issue(
            "Wskazane elementy znajdują się na różnych stronach — nie mogę wykonać tej operacji między stronami."
        )

    if op_type == "shift":
        dx = _number(directive.get("dx"), 0.0)
        dy = _number(directive.get("dy"), 0.0)
        group = resolve_shift(items, target_ids, dx, dy, page_width, page_height)
    elif op_type == "align":
        axis = directive.get("axis") if directive.get("axis") in _VALID_AXES else "x"
        anchor = directive.get("anchor") if directive.get("anchor") in _VALID_ANCHORS else "start"
        raw_target = directive.get("target")
        target = _number(raw_target) if raw_target is not None else None
        group = resolve_align(items, target_ids, axis, anchor, target, page_width, page_height)
    else:
        axis = directive.get("axis") if directive.get("axis") in _VALID_AXES else "y"
        group = resolve_distribute(items, target_ids, axis, page_width, page_height)

    if group is None:
        return _issue(
            "Nie można bezpiecznie wykonać tego polecenia — zmiana wyszłaby poza stronę "
            "lub nałożyłaby się na inny element."
        )
    return {"layout_groups": [group], "layout_issues": []}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run from `backend/`:
```
./.venv/Scripts/python.exe -m unittest tests.test_layout_analysis -v
```
Expected: **PASS** — `Ran 15 tests ... OK` (6 pre-existing + 9 new).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/layout_analysis.py backend/tests/test_layout_analysis.py
git commit -m "feat: add deterministic shift/align/distribute position resolvers"
```

---

### Task 2: Wire `_chat()` to emit and resolve position directives

**Files:**
- Modify: `backend/app/services/ai_assistant_service.py`
- Test: `backend/tests/test_ai_chat_command.py` (extend existing file)

**Interfaces:**
- Consumes (from Task 1): `extract_bounds(elements) -> list[dict]`, `resolve_directed_operation(elements, directive, page_size) -> {"layout_groups": [...], "layout_issues": [...]}`.
- Consumes: `_extract_structured(elements) -> list[dict]` — already defined, unchanged.
- Produces: `_extract_positional(elements: list[dict]) -> list[dict]` — new helper, used only by `_chat`.
- Produces: `_chat(message: str, elements: list[dict], page_size: dict | None) -> dict` — **signature change**, gains a `page_size` parameter. Only caller is `analyze_action`'s dispatcher, updated in this task.

Requires `env` with `API_GPT_KEY` set for the module to import (see the environment-setup step from the prior chat-command plan — `backend/app/services/ai_assistant_service.py` constructs its OpenAI client at import time). Load it the same way before running tests:

```powershell
Get-Content backend/.env | ForEach-Object {
    if ($_ -match '^([^=#][^=]*)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim("'").Trim('"'))
    }
}
```

- [ ] **Step 1: Write the failing tests (and fix one assertion this task obsoletes)**

Open `backend/tests/test_ai_chat_command.py`. The existing
`test_dispatcher_gives_chat_structured_elements_and_filters_hallucinated_fields`
test has this assertion inside its `fake_gpt`:

```python
            # And it must never carry positional data GPT has no business touching.
            self.assertNotIn('"left":', user)
```

This is about to become false **by design**, not by regression: this task's
whole point is that `_chat()` now intentionally includes position in the
prompt (via `_extract_positional`) so GPT can reason about position
operations. The actual safety guarantee was never "GPT never sees position"
— it's "GPT's output corrections can never carry a position field," which
the very next assertion in this same test already covers
(`_safe_result` stripping the hallucinated `left`/`page` fields from
`corrections`). Update the existing test now, before adding new ones, so the
obsolete assertion doesn't linger:

Replace:

```python
        def fake_gpt(system, user):
            # The prompt must carry structured per-element data (id + style),
            # not just the element's plain joined text.
            self.assertIn('"element_id": "heading-1"', user)
            self.assertIn('"fontSize": 16', user)
            # And it must never carry positional data GPT has no business touching.
            self.assertNotIn('"left":', user)
            return {
                "message": "Zmieniono rozmiar czcionki nagłówka na 13px.",
                "corrections": [
                    {"element_id": "heading-1", "fontSize": 13, "left": 999, "page": 2},
                ],
            }
```

with:

```python
        def fake_gpt(system, user):
            # The prompt must carry structured per-element data (id + style),
            # not just the element's plain joined text. Position is now
            # intentionally included too (see _extract_positional) — the
            # safety guarantee lives in the OUTPUT filter below, not in
            # withholding position from the prompt.
            self.assertIn('"element_id": "heading-1"', user)
            self.assertIn('"fontSize": 16', user)
            return {
                "message": "Zmieniono rozmiar czcionki nagłówka na 13px.",
                "corrections": [
                    {"element_id": "heading-1", "fontSize": 13, "left": 999, "page": 2},
                ],
            }
```

(The final `self.assertEqual(result["corrections"], [{"element_id": "heading-1", "fontSize": 13}])`
assertion at the end of that test is unchanged — leave it as-is.)

Now add these three new test methods inside the same `ChatCommandTests` class (after the existing test method, same indentation, still inside the class):

```python
    def test_dispatcher_resolves_position_operation_directive_into_layout_groups(self):
        elements = [
            {
                "element_id": "heading-1",
                "category": "text",
                "content": "WYKSZTAŁCENIE",
                "fontSize": 16,
                "bold": True,
                "italic": False,
                "align": "left",
                "left": 100, "top": 40, "width": 150, "height": 22, "zIndex": 3, "page": 1,
            },
        ]

        def fake_gpt(system, user):
            self.assertIn('"left": 100.0', user)
            return {
                "message": "Przesunąłem nagłówek o 50px w lewo.",
                "corrections": [],
                "position_operation": {
                    "type": "shift",
                    "target_element_ids": ["heading-1"],
                    "dx": -50,
                    "dy": 0,
                },
            }

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="przesuń ten nagłówek o 50px w lewo",
                page_size={"width": 595, "height": 842},
            )

        self.assertEqual(len(result["layout_groups"]), 1)
        self.assertEqual(
            result["layout_groups"][0]["patches"],
            [{"element_id": "heading-1", "left": 50.0, "top": 40.0}],
        )
        self.assertEqual(result["layout_issues"], [])

    def test_dispatcher_reports_an_issue_instead_of_a_broken_position_operation(self):
        elements = [
            {
                "element_id": "heading-1",
                "category": "text",
                "content": "WYKSZTAŁCENIE",
                "fontSize": 16,
                "bold": True,
                "italic": False,
                "align": "left",
                "left": 20, "top": 40, "width": 150, "height": 22, "zIndex": 3, "page": 1,
            },
        ]

        def fake_gpt(system, user):
            return {
                "message": "Przesuwam nagłówek o 900px w lewo.",
                "corrections": [],
                "position_operation": {
                    "type": "shift",
                    "target_element_ids": ["heading-1"],
                    "dx": -900,
                    "dy": 0,
                },
            }

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="przesuń ten nagłówek o 900px w lewo",
                page_size={"width": 595, "height": 842},
            )

        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(len(result["layout_issues"]), 1)

    def test_extract_positional_includes_images_with_geometry(self):
        # _extract_structured() alone excludes images (they have no content
        # to edit), but a position instruction like "move the photo" needs
        # GPT to see the image's element_id and geometry at all.
        elements = [
            {
                "element_id": "heading-1",
                "category": "text",
                "content": "WYKSZTAŁCENIE",
                "fontSize": 16,
                "left": 20, "top": 40, "width": 150, "height": 22, "page": 1,
            },
            {
                "element_id": "photo-1",
                "category": "image",
                "content": "",
                "left": 450, "top": 20, "width": 100, "height": 100, "page": 1,
            },
        ]

        result = ai_assistant_service._extract_positional(elements)

        by_id = {item["element_id"]: item for item in result}
        self.assertIn("photo-1", by_id)
        self.assertEqual(by_id["photo-1"]["category"], "image")
        self.assertEqual(by_id["photo-1"]["left"], 450.0)
        self.assertEqual(by_id["photo-1"]["top"], 20.0)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`:
```
./.venv/Scripts/python.exe -m unittest tests.test_ai_chat_command -v
```
Expected: the pre-existing test still **PASSES**; the 3 new tests **FAIL**, for different reasons since `_chat`/`_extract_positional` don't exist yet:
- `test_dispatcher_resolves_position_operation_directive_into_layout_groups` fails with an **`AssertionError`** from inside `fake_gpt` — the old `_chat` still builds its prompt from `_extract_structured` (position-blind), so `user` never contains `"left": 100.0` at all.
- `test_dispatcher_reports_an_issue_instead_of_a_broken_position_operation` has no assertion inside `fake_gpt`, so it runs to completion and fails with a **`KeyError: 'layout_groups'`** — the old `_chat` returns `_safe_result(...)`'s dict as-is, which has no `layout_groups` key.
- `test_extract_positional_includes_images_with_geometry` fails with an **`AttributeError: module 'app.services.ai_assistant_service' has no attribute '_extract_positional'`** — the function doesn't exist yet.

- [ ] **Step 3: Implement**

In `backend/app/services/ai_assistant_service.py`, change the import line near the top:

```python
from app.services.layout_analysis import analyze_layout
```

to:

```python
from app.services.layout_analysis import analyze_layout, extract_bounds, resolve_directed_operation
```

Find `_extract_structured` (used as the insertion anchor):

```python
def _extract_structured(elements: list[dict]) -> list[dict]:
    return [
        {
            "element_id": el.get("element_id"),
            "category": el.get("category"),
            "content": el.get("content", ""),
            "fontSize": el.get("fontSize"),
            "bold": el.get("bold", False),
            "italic": el.get("italic", False),
            "align": el.get("align", "left"),
        }
        for el in elements
        if el.get("category") in ("text", "textarea") and el.get("content")
    ]
```

Immediately after it, insert:

```python
def _extract_positional(elements: list[dict]) -> list[dict]:
    """Content, style, AND geometry for text/textarea, plus a geometry-only
    entry for images (e.g. a photo) so position instructions can target them
    too — used only by _chat(), the one action that may propose position
    operations (via a directive Python resolves, never a raw coordinate GPT
    invents). _extract_structured() alone excludes images entirely, which is
    correct for content/style edits but would make an image untargetable by
    a position instruction like "move the photo left"."""
    bounds_by_id = {b["element_id"]: b for b in extract_bounds(elements)}
    structured = _extract_structured(elements)
    for item in structured:
        bounds = bounds_by_id.get(item["element_id"])
        if bounds:
            item["left"] = bounds["left"]
            item["top"] = bounds["top"]
            item["width"] = bounds["width"]
            item["height"] = bounds["height"]
            item["page"] = bounds["page"]

    included_ids = {item["element_id"] for item in structured}
    for el in elements:
        element_id = el.get("element_id")
        if el.get("category") != "image" or element_id in included_ids:
            continue
        bounds = bounds_by_id.get(element_id)
        if not bounds:
            continue
        structured.append({
            "element_id": element_id,
            "category": "image",
            "content": "[obraz]",
            "left": bounds["left"],
            "top": bounds["top"],
            "width": bounds["width"],
            "height": bounds["height"],
            "page": bounds["page"],
        })
    return structured
```

Now replace the entire existing `_chat` function:

```python
def _chat(message: str, elements: list[dict]) -> dict:
    structured = _extract_structured(elements)

    system = (
        "Jesteś ekspertem i coachem CV. Masz pełną treść i strukturę CV użytkownika jako kontekst. "
        "Wiadomość użytkownika może być PYTANIEM (np. \"Czy moje podsumowanie jest za długie?\") "
        "albo POLECENIEM edycji (np. \"zmień rozmiar czcionki wszystkich nagłówków na 13px\", "
        "\"popraw sekcję wykształcenie\").\n"
        "Jeśli to pytanie — odpowiedz konkretnie w polu message, zostaw corrections jako pustą listę.\n"
        "Jeśli to polecenie edycji — znajdź w ELEMENTACH te, których dotyczy polecenie "
        "(np. \"nagłówki\" to elementy o wyraźnie większym lub pogrubionym fontSize niż otaczający tekst; "
        "\"sekcja X\" to elementy sąsiadujące w kolejności czytania z nagłówkiem o treści zbliżonej do X), "
        "i zwróć po jednej poprawce na każdy pasujący element w polu corrections. "
        "Każda poprawka może zawierać WYŁĄCZNIE pola: content, fontSize, fontFamily, color, bold, italic, align. "
        "NIGDY nie zwracaj pól left, top, width, height, zIndex ani page — nie masz wpływu na pozycję elementów.\n"
        "Jeśli polecenie wymaga przesunięcia, zmiany rozmiaru lub pozycji elementów, albo zmiany liczby stron "
        "(np. \"zmieść CV na jednej stronie\", \"przesuń zdjęcie wyżej\") — NIE próbuj tego obejść zmianą treści lub stylu bez wyjaśnienia. "
        "W message wyjaśnij, że nie możesz jeszcze zmieniać pozycji, rozmiaru ani liczby stron, "
        "a w tips zaproponuj osiągalną alternatywę opartą wyłącznie o treść lub styl "
        "(np. zmniejszenie czcionki lub skrócenie tekstu). "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""ELEMENTY CV (id, typ, treść, styl — bez pozycji):
{json.dumps(structured, ensure_ascii=False)}

WIADOMOŚĆ UŻYTKOWNIKA:
{message}

Zwróć JSON:
{{
  "message": "<Twoja odpowiedź — konkretna i oparta na powyższych elementach>",
  "rating": null,
  "tips": ["<wskazówka lub osiągalna alternatywa, jeśli istotna>"],
  "corrections": [
    {{"element_id": "<id>", "fontSize": 13}}
  ],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user))
```

with:

```python
def _chat(message: str, elements: list[dict], page_size: dict | None) -> dict:
    structured = _extract_positional(elements)

    system = (
        "Jesteś ekspertem i coachem CV. Masz pełną treść, styl i pozycję (px, 1:1 z PDF) "
        "każdego elementu CV użytkownika jako kontekst. Wiadomość użytkownika może być:\n"
        "(1) PYTANIEM — odpowiedz konkretnie w message, zostaw corrections jako pustą listę "
        "i position_operation jako null.\n"
        "(2) POLECENIEM edycji treści lub stylu (np. \"zmień rozmiar czcionki nagłówków na 13px\", "
        "\"popraw sekcję wykształcenie\") — znajdź pasujące elementy i zwróć po jednej poprawce "
        "w corrections. Poprawka może zawierać WYŁĄCZNIE pola: content, fontSize, fontFamily, "
        "color, bold, italic, align. NIGDY nie zwracaj left/top/width/height/zIndex/page w corrections.\n"
        "(3) POLECENIEM dotyczącym POZYCJI elementów (np. \"przesuń nagłówki sekcji o 50px w lewo\", "
        "\"wyrównaj te elementy na x=50\", \"rozłóż wpisy w sekcji doświadczenia równomiernie\") — "
        "zwróć position_operation zamiast corrections:\n"
        "  {\"type\": \"shift\"|\"align\"|\"distribute\", \"target_element_ids\": [\"...\"], "
        "\"dx\": <liczba>, \"dy\": <liczba>, \"axis\": \"x\"|\"y\", "
        "\"anchor\": \"start\"|\"center\"|\"end\", \"target\": <liczba lub pomiń>}\n"
        "  - shift: przesunięcie względne (dx, dy) w px wybranych elementów.\n"
        "  - align: ustawia wybrane elementy na wspólnej wartości jednej osi (axis) przy "
        "zakotwiczeniu (anchor: start = lewa/górna krawędź, center = środek, end = prawa/dolna "
        "krawędź). Jeśli użytkownik podał konkretną wartość (np. \"na x=50\"), podaj ją jako target. "
        "Jeśli chodzi tylko o wzajemne wyrównanie bez podanej wartości, pomiń target.\n"
        "  - distribute: równomiernie rozkłada odstępy między co najmniej 3 wybranymi elementami "
        "wzdłuż osi (axis); pierwszy i ostatni z wybranych elementów pozostają na miejscu.\n"
        "NIGDY sam nie podawaj wartości left/top — Python obliczy rzeczywiste współrzędne na "
        "podstawie bieżącej, aktualnej pozycji elementów i sam odrzuci operację, jeśli wyszłaby "
        "poza stronę lub nałożyłaby się na inny element.\n"
        "(4) Jeśli polecenie wymaga zmiany rozmiaru elementów lub liczby stron (np. \"zmieść CV na "
        "jednej stronie\"), albo jest zbyt niejednoznaczne, by bezpiecznie określić elementy "
        "docelowe i operację — NIE zgaduj. W message wyjaśnij ograniczenie lub zadaj pytanie "
        "doprecyzowujące, zostaw corrections puste i position_operation jako null.\n"
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""ELEMENTY CV (id, typ, treść, styl, pozycja i rozmiar w px):
{json.dumps(structured, ensure_ascii=False)}

WIADOMOŚĆ UŻYTKOWNIKA:
{message}

Zwróć JSON:
{{
  "message": "<Twoja odpowiedź — konkretna i oparta na powyższych elementach>",
  "rating": null,
  "tips": ["<wskazówka lub osiągalna alternatywa, jeśli istotna>"],
  "corrections": [],
  "position_operation": null,
  "web_sources": []
}}"""
    raw = _gpt(system, user)
    result = _safe_result(raw)

    directive = raw.get("position_operation")
    if isinstance(directive, dict):
        resolved = resolve_directed_operation(elements, directive, page_size)
        result["layout_groups"] = resolved["layout_groups"]
        result["layout_issues"] = resolved["layout_issues"]
    else:
        result["layout_groups"] = []
        result["layout_issues"] = []

    return result
```

Finally, in `analyze_action`'s dispatcher dict, change:

```python
        "chat":            lambda: _chat(message, elements),
```

to:

```python
        "chat":            lambda: _chat(message, elements, page_size),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run from `backend/`:
```
./.venv/Scripts/python.exe -m unittest tests.test_ai_chat_command -v
```
Expected: **PASS** — `Ran 4 tests ... OK`.

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run from `backend/`:
```
./.venv/Scripts/python.exe -m unittest discover -s tests -v
```
Expected: same pass/fail counts as the pre-existing baseline plus the 9 new `layout_analysis` tests and 2 new `ai_chat_command` tests, all passing. (One pre-existing, unrelated failure — a test requiring live Postgres connectivity — is expected and not something this task touches.)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ai_assistant_service.py backend/tests/test_ai_chat_command.py
git commit -m "feat: let the CV chat action propose position operations"
```

---

### Task 3: Accurate shared geometry measurement for the AI snapshot

**Why this is needed:** `resolve_shift`/`resolve_align`/`resolve_distribute` are only as good as the bounds they're given. The frontend function that currently builds the geometry snapshot sent to the backend (`createLayoutSnapshot` in `AiAssistant.jsx`) only estimates size for `category === "text"` via `canvas.measureText`, and falls back to raw stored `width`/`height` for everything else — including `textarea`, which is exactly what multi-line job-experience entries are. The frontend already has a more accurate, DOM-measurement-based helper (`getElementBounds` in `useA4Elements.js`, used for on-canvas drag-and-drop), which this task extracts into a shared util and reuses for the AI snapshot.

**Files:**
- Create: `frontend/src/utils/elementBounds.js`
- Modify: `frontend/src/hooks/useA4Elements.js` (replace local `getElementBounds` with the shared import)
- Modify: `frontend/src/components/ai/AiAssistant/AiAssistant.jsx` (replace `createLayoutSnapshot` with the shared `measureElements`)

**Interfaces:**
- Produces: `getElementBounds(element) -> {width, height}` — moved verbatim from `useA4Elements.js`; same behavior, same callers (`moveElementsByDelta`), no behavior change.
- Produces: `measureElements(elements) -> elements'` — new. Attaches `layout_bounds: {left, top, width, height}` to any element with a live, positively-sized DOM node; leaves elements with no live node **unchanged** (no `layout_bounds` key) rather than guessing — the backend's own `_bounds_for` fallback (already content-aware for text) takes over for those.

No JS test framework exists in this repo — this task is verified manually in a running browser, per this repo's established pattern for frontend-only changes.

- [ ] **Step 1: Create the shared util**

Create `frontend/src/utils/elementBounds.js`:

```js
// Shared element-measurement helpers. Both the canvas drag logic
// (useA4Elements.js) and the AI assistant's geometry snapshot sent to the
// backend need the real rendered size of an element, not stale stored
// values — especially for textareas, whose height depends on wrapped text.

export function getElementBounds(element) {
  const node = typeof document !== "undefined"
    ? document.getElementById(element.element_id)
    : null;
  if (node) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const canvas = node.closest("#A4");
      const canvasRect = canvas?.getBoundingClientRect();
      const scaleX = canvasRect?.width / (canvas?.clientWidth || canvasRect?.width || 1);
      const scaleY = canvasRect?.height / (canvas?.clientHeight || canvasRect?.height || 1);
      return { width: rect.width / scaleX, height: rect.height / scaleY };
    }
  }

  return {
    width: parseFloat(element.width) || 0,
    height: parseFloat(element.height)
      || (element.category === "text" ? (element.fontSize || 12) * 1.35 : 0),
  };
}

// Attaches a real, DOM-measured layout_bounds to every element that's
// currently mounted on screen (i.e. on the page currently being viewed).
// Elements with no live DOM node are left unchanged — the backend's own
// bounds fallback already handles a missing layout_bounds.
export function measureElements(elements) {
  return elements.map(element => {
    const node = typeof document !== "undefined"
      ? document.getElementById(element.element_id)
      : null;
    if (!node) return element;

    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return element;

    const canvas = node.closest("#A4");
    const canvasRect = canvas?.getBoundingClientRect();
    const scaleX = canvasRect?.width / (canvas?.clientWidth || canvasRect?.width || 1);
    const scaleY = canvasRect?.height / (canvas?.clientHeight || canvasRect?.height || 1);

    return {
      ...element,
      layout_bounds: {
        left: Number(element.left) || 0,
        top: Number(element.top) || 0,
        width: rect.width / scaleX,
        height: rect.height / scaleY,
      },
    };
  });
}
```

- [ ] **Step 2: Point `useA4Elements.js` at the shared helper**

In `frontend/src/hooks/useA4Elements.js`, change the top of the file from:

```js
import { useState, useEffect, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
```

to:

```js
import { useState, useEffect, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import { getElementBounds } from '../utils/elementBounds';
```

Then delete the local `getElementBounds` function definition entirely (it currently sits right after the `presetFromDims` export, before `moveElementsByDelta`):

```js
function getElementBounds(element) {
  const node = typeof document !== "undefined"
    ? document.getElementById(element.element_id)
    : null;
  if (node) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const canvas = node.closest("#A4");
      const canvasRect = canvas?.getBoundingClientRect();
      const scaleX = canvasRect?.width / (canvas?.clientWidth || canvasRect?.width || 1);
      const scaleY = canvasRect?.height / (canvas?.clientHeight || canvasRect?.height || 1);
      return { width: rect.width / scaleX, height: rect.height / scaleY };
    }
  }

  return {
    width: parseFloat(element.width) || 0,
    height: parseFloat(element.height)
      || (element.category === "text" ? (element.fontSize || 12) * 1.35 : 0),
  };
}
```

`moveElementsByDelta` (the only caller) needs no changes — it already just calls `getElementBounds(element)`, which now resolves to the imported version.

- [ ] **Step 3: Point `AiAssistant.jsx` at the shared helper**

In `frontend/src/components/ai/AiAssistant/AiAssistant.jsx`, change the import block from:

```jsx
import { PdfContext } from "../../../store/pdfgenerator-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";
```

to:

```jsx
import { PdfContext } from "../../../store/pdfgenerator-context";
import { ApiClient, ENDPOINTS } from "../../../services/api";
import { measureElements } from "../../../utils/elementBounds";
```

Delete the local `createLayoutSnapshot` function entirely (it sits right before `export default function AiAssistant()`):

```jsx
function createLayoutSnapshot(elements) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    return elements.map(element => {
        const left = Number(element.left) || 0;
        const top = Number(element.top) || 0;
        let width = Number(element.width) || 0;
        let height = Number(element.height) || 0;

        if (element.category === "text" && context) {
            const fontSize = Number(element.fontSize) || 12;
            const weight = element.bold ? 700 : 400;
            const style = element.italic ? "italic" : "normal";
            context.font = `${style} ${weight} ${fontSize}px ${element.fontFamily || "sans-serif"}`;
            width = Math.max(
                ...String(element.content || "").split("\n").map(line => context.measureText(line).width),
                fontSize
            );
            height = Math.max(fontSize * 1.35, (element.fontSize || fontSize) * 1.35);
        }

        return {
            ...element,
            layout_bounds: { left, top, width, height },
        };
    });
}
```

Then, inside the `send` callback, change:

```jsx
                    elements: action === "layout" ? createLayoutSnapshot(A4_Elements) : A4_Elements,
```

to:

```jsx
                    elements: measureElements(A4_Elements),
```

- [ ] **Step 4: Verify in a running browser against a local backend**

`frontend/src/services/api.js` hardcodes the production API URL with no env override, and Task 2's `_chat()` needs an OpenAI key to even start — so this check runs against a local backend, not production, same recipe as the prior chat-command feature's verification:

1. Start the local backend against an isolated SQLite database — not the
   production Postgres instance `backend/app/models/database.py` defaults to
   — by overriding `DATABASE_URL` (that file already supports a `sqlite:///`
   URL). Run from `backend/`:
```powershell
Get-Content backend/.env | ForEach-Object {
    if ($_ -match '^([^=#][^=]*)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim("'").Trim('"'))
    }
}
$env:DATABASE_URL = "sqlite:///./task3_verify.db"
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```
2. Temporarily edit `frontend/src/services/api.js`'s `API_BASE_URL` to `http://127.0.0.1:8000` (throwaway local edit — you will revert it in Step 5, confirm via `git diff` that it shows no changes when done).
3. Run `npm run dev` from `frontend/`, register a fresh throwaway account against the local backend, and create or open a CV with at least one `textarea` element containing multi-line wrapped text (e.g. a job experience entry with 2-3 lines of bullet content) and at least 2-3 other text elements (headings, name).
4. Open the floating AI assistant panel and click the "Układ" (layout) quick-action button — confirm it still returns sensible results with no error (this proves the `createLayoutSnapshot` → `measureElements` swap didn't break the existing deterministic scan).
5. Type a simple, low-risk position instruction into the chat box, e.g. "przesuń nazwisko o 20px w prawo" (referring to the name/title element) — confirm a layout-group card appears in the chat reply. Click "Podgląd" (preview) and confirm the element visibly shifts on the canvas; click "Zastosuj" (apply) and confirm it actually moves and stays moved.

- [ ] **Step 5: Clean up**

Revert the temporary `frontend/src/services/api.js` edit and confirm `git status`/`git diff` show it unchanged. Stop the local backend/frontend processes. Delete `backend/task3_verify.db` (the throwaway SQLite database created in Step 4).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/elementBounds.js frontend/src/hooks/useA4Elements.js frontend/src/components/ai/AiAssistant/AiAssistant.jsx
git commit -m "refactor: share DOM-measured element bounds between drag and AI snapshot"
```

---

### Task 4: Verify operation selection and safety against a real model

Task 1 and Task 2's automated tests prove the plumbing (resolvers compute correct geometry; unsafe directives are rejected with an explanation) using mocked GPT responses. They cannot prove the model actually chooses the right operation/targets/parameters from natural language — that needs a real call, per the design spec's testing section.

**Files:** none (verification only; the script below is not committed to the repo).

- [ ] **Step 1: Make sure the OpenAI key is available in your shell**

Same loader as prior steps — if not already set in this shell session:
```powershell
Get-Content backend/.env | ForEach-Object {
    if ($_ -match '^([^=#][^=]*)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim("'").Trim('"'))
    }
}
$env:PYTHONIOENCODING = "utf-8"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```

- [ ] **Step 2: Save and run the verification script**

Save as `verify_position_operations.py` in a scratch/temp directory of your choice (throwaway, not committed):

```python
"""Manual verification for GPT-directed position operations. Not part of the test suite."""
import sys
sys.path.insert(0, r"c:\Users\Kamil\learningCode\PROJECTS\PDF\pdf-generator\backend")

from app.services.ai_assistant_service import analyze_action

PAGE_SIZE = {"width": 595, "height": 842}

ELEMENTS = [
    {"element_id": "name",      "category": "text",     "content": "Jan Kowalski",
     "fontSize": 24, "bold": True,  "italic": False, "align": "left",
     "left": 40,  "top": 20,  "width": 200, "height": 30, "page": 1},
    {"element_id": "photo",     "category": "image",    "content": "",
     "left": 450, "top": 20,  "width": 100, "height": 100, "page": 1},
    {"element_id": "exp-head",  "category": "text",     "content": "DOŚWIADCZENIE ZAWODOWE",
     "fontSize": 16, "bold": True,  "italic": False, "align": "left",
     "left": 40,  "top": 120, "width": 300, "height": 20, "page": 1},
    {"element_id": "job-1",     "category": "textarea", "content": "Firma A — Programista\n2020-2022",
     "fontSize": 11, "bold": False, "italic": False, "align": "left",
     "left": 40,  "top": 150, "width": 400, "height": 30, "page": 1},
    {"element_id": "job-2",     "category": "textarea", "content": "Firma B — Starszy Programista\n2022-2023",
     "fontSize": 11, "bold": False, "italic": False, "align": "left",
     "left": 40,  "top": 195, "width": 400, "height": 30, "page": 1},
    {"element_id": "job-3",     "category": "textarea", "content": "Firma C — Tech Lead\n2023-obecnie",
     "fontSize": 11, "bold": False, "italic": False, "align": "left",
     "left": 40,  "top": 260, "width": 400, "height": 30, "page": 1},
]

SCENARIOS = [
    ("explicit shift",        "przesuń zdjęcie o 30px w lewo"),
    ("explicit align",        "wyrównaj nazwisko i nagłówek doświadczenia na x=40"),
    ("implicit/mutual align", "wyrównaj wpisy o pracę do siebie w pionie po lewej stronie"),
    ("abstract distribute",   "wpisy w sekcji doświadczenia powinny być rozłożone bardziej równomiernie"),
    ("unsafe request",        "przesuń nagłówek doświadczenia o 2000px w prawo"),
    ("ambiguous request",     "spraw żeby ta sekcja wyglądała lepiej"),
]

for label, message in SCENARIOS:
    print(f"\n=== {label}: {message!r} ===")
    result = analyze_action(action="chat", elements=ELEMENTS, message=message, page_size=PAGE_SIZE)
    print("message:", result["message"])
    print("tips:", result.get("tips"))
    print("layout_groups:", result.get("layout_groups"))
    print("layout_issues:", result.get("layout_issues"))
```

Run it with the backend venv's interpreter, passing the script's full path:
```
c:\Users\Kamil\learningCode\PROJECTS\PDF\pdf-generator\backend\.venv\Scripts\python.exe <full-path-to>\verify_position_operations.py
```

- [ ] **Step 3: Confirm each scenario against these expectations**

1. **Explicit shift** — `layout_groups` has one entry patching `photo`'s `left` down by ~30 (600 - width - 30, i.e. `left: 420`ish), `layout_issues` empty.
2. **Explicit align** — `layout_groups` has one entry patching both `name` and `exp-head` to `left: 40` (already equal in the seed data — if the model correctly recognizes they're already aligned, it's also acceptable for it to report that verbally with no `layout_groups`; either is a pass, but it must not report a nonsensical change).
3. **Implicit/mutual align** — `layout_groups` patches `job-1`/`job-2`/`job-3` (or a subset) to a common `left` value, without a user-specified number — confirm the model didn't invent an explicit `target` where none was requested (check the reasoning is "align to each other," not "align to some arbitrary value").
4. **Abstract distribute** — the model should resolve "rozłożone bardziej równomiernie" to a `distribute` operation over `job-1`/`job-2`/`job-3` (or an equivalent effect via align) — confirm `layout_groups` targets those three and `job-1`/`job-3`'s positions are unchanged (held fixed) if `distribute` was chosen.
5. **Unsafe request** — confirm this either produces `layout_issues` (Python rejected an actually-attempted 2000px shift) or the model's own `message` declines/scales down the request — either way, `layout_groups` must not silently contain a patch that would place `exp-head` off the 595-wide page.
6. **Ambiguous request** — confirm `message` asks a clarifying question rather than guessing an operation; `layout_groups` and `corrections` should both be empty.

If a scenario doesn't match, that's a prompt-wording issue in Task 2's `_chat()` system prompt, not a plumbing bug (Task 1/2's automated tests already prove the plumbing) — adjust the wording, re-run this script, and re-run `tests.test_ai_chat_command` to confirm the automated test still passes before moving on.

- [ ] **Step 4: No commit** — this is a verification pass, not a code change. If you tweak the prompt in `_chat()` as a result, that's a normal edit to the existing `ai_assistant_service.py` file — commit it with a message describing what the prompt fix addresses.
