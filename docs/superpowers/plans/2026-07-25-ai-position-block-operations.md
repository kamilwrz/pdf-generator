# AI-directed block position operations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a position instruction target a whole multi-element block (e.g. one job entry's title + company + description) so it moves as one rigid unit, instead of only ever targeting individual elements.

**Architecture:** A directive can now carry `target_groups: list[list[str]]` (an alternative to the existing `target_element_ids`) — each inner list is the element ids forming one block. `resolve_directed_operation` builds a synthetic "block item" per group from the union bounding box of its real members, runs the *existing, unchanged* `resolve_shift`/`resolve_align`/`resolve_distribute` against those synthetic items (identical geometry math, just operating on block boxes instead of individual elements), then expands each resulting block-level patch into one patch per real member via a rigid translation (same delta applied to every member, preserving their layout relative to each other). The expanded, real patches are re-validated through the existing `_group`/`_is_safe_group` safety net before being returned. `_chat()`'s only change is prompt text teaching GPT when and how to use `target_groups` — its Python code already forwards whatever directive GPT returns to `resolve_directed_operation` unchanged.

**Tech Stack:** Python (FastAPI backend), `unittest`/`unittest.mock` for tests. No frontend changes — the existing `layout_groups`/`LayoutGroupCard` UI already renders whatever member-level patches come back, and `measureElements` already sends full geometry for every element.

## Global Constraints

- GPT never supplies a coordinate for a block any more than it does for an individual element — it only names which element ids form each block; every actual `left`/`top` is computed and validated in Python.
- `resolve_shift`/`resolve_align`/`resolve_distribute` themselves do not change. Block support is an adapter layer in `resolve_directed_operation` that builds synthetic items and expands their results — this keeps every existing test for those three functions valid unchanged.
- A block moves as a rigid unit: every member is translated by the identical delta, so their positions relative to each other never change.
- A block whose members span more than one page is rejected with an explanation, same as the existing cross-page rejection for flat targets. Blocks on different pages from each other are likewise rejected.
- `target_groups` and `target_element_ids` are not combined in one directive — if `target_groups` is present and non-empty, it takes priority and `target_element_ids` is ignored for that directive.
- `distribute`'s existing "≥3 targets" rule applies to the number of *blocks* when using `target_groups` (falls out for free — the adapter just hands `resolve_distribute` a list with one synthetic item per block).
- Still CV-only, still position (`left`/`top`) only. No size changes, no page-count changes, no new frontend UI.

Reference: `docs/superpowers/specs/2026-07-25-ai-position-block-operations-design.md`

---

### Task 1: Block-aware resolution in `layout_analysis.py`

**Files:**
- Modify: `backend/app/services/layout_analysis.py`
- Test: `backend/tests/test_layout_analysis.py` (extend existing file)

**Interfaces:**
- Consumes: `resolve_shift`, `resolve_align`, `resolve_distribute` (all unchanged, already defined), `_group`, `extract_bounds`, `_number`, `_NO_CHANGE`, `_VALID_OPERATIONS`, `_VALID_AXES`, `_VALID_ANCHORS` — all already defined, unchanged.
- Produces: `_block_bbox(members: list[dict]) -> dict[str, float] | None` — union bounding box (`left`, `top`, `width`, `height`) of a block's member items, or `None` if `members` is empty.
- Produces: `_resolve_block_operation(items, op_type, directive, raw_groups, page_width, page_height) -> dict[str, Any]` — the block adapter. Same return shape as `resolve_directed_operation` (`{"layout_groups": [...], "layout_issues": [...]}`).
- Modifies: `resolve_directed_operation`'s body (signature unchanged) to branch to `_resolve_block_operation` when `directive["target_groups"]` is a non-empty list, otherwise keep today's flat-target behavior.

- [ ] **Step 1: Write the failing tests**

Open `backend/tests/test_layout_analysis.py` and add these test methods inside the existing `DirectedOperationTests` class (after the existing tests, same indentation, still inside the class):

```python
    def test_target_groups_shift_moves_a_block_as_one_rigid_unit(self):
        # PAGE_SIZE is 100x100 (this file's test convention) — widths must
        # stay well under that or the shift below would legitimately be
        # rejected as leaving the page, defeating the point of this test.
        elements = [
            block("title", 10, 10, width=30, height=15),
            block("company", 10, 30, width=30, height=12),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {"type": "shift", "target_groups": [["title", "company"]], "dx": 20, "dy": 5},
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(len(result["layout_groups"]), 1)
        changed = {p["element_id"]: (p["left"], p["top"]) for p in result["layout_groups"][0]["patches"]}
        self.assertEqual(changed, {"title": (30.0, 15.0), "company": (30.0, 35.0)})

    def test_target_groups_distribute_moves_middle_block_preserving_internal_layout(self):
        elements = [
            block("a-title", 0, 0, width=20, height=5),
            block("a-desc", 0, 6, width=20, height=4),
            block("b-title", 0, 15, width=20, height=5),
            block("b-desc", 0, 21, width=20, height=4),
            block("c-title", 0, 50, width=20, height=5),
            block("c-desc", 0, 56, width=20, height=4),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {
                "type": "distribute",
                "target_groups": [["a-title", "a-desc"], ["b-title", "b-desc"], ["c-title", "c-desc"]],
                "axis": "y",
            },
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(len(result["layout_groups"]), 1)
        changed = {p["element_id"]: p["top"] for p in result["layout_groups"][0]["patches"]}
        self.assertEqual(changed, {"b-title": 25.0, "b-desc": 31.0})

    def test_target_groups_align_moves_blocks_to_a_shared_value(self):
        elements = [
            block("a1", 10, 10, width=20, height=10),
            block("a2", 10, 25, width=20, height=8),
            block("b1", 40, 10, width=20, height=10),
            block("b2", 40, 25, width=20, height=8),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {
                "type": "align",
                "target_groups": [["a1", "a2"], ["b1", "b2"]],
                "axis": "x",
                "anchor": "start",
                "target": 5,
            },
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(len(result["layout_groups"]), 1)
        changed = {p["element_id"]: p["left"] for p in result["layout_groups"][0]["patches"]}
        self.assertEqual(changed, {"a1": 5.0, "a2": 5.0, "b1": 5.0, "b2": 5.0})

    def test_target_groups_rejects_a_block_whose_members_span_multiple_pages(self):
        elements = [
            block("title", 10, 10, page=1),
            block("desc", 10, 30, page=2),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {"type": "shift", "target_groups": [["title", "desc"]], "dx": 5, "dy": 0},
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(len(result["layout_issues"]), 1)

    def test_target_groups_rejects_blocks_on_different_pages(self):
        elements = [
            block("a1", 10, 10, page=1),
            block("a2", 10, 30, page=1),
            block("b1", 10, 10, page=2),
            block("b2", 10, 30, page=2),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {"type": "shift", "target_groups": [["a1", "a2"], ["b1", "b2"]], "dx": 5, "dy": 0},
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(len(result["layout_issues"]), 1)

    def test_target_groups_skips_empty_or_unmatched_groups(self):
        elements = [
            block("title", 10, 10, width=20, height=10),
            block("desc", 10, 25, width=20, height=8),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {"type": "shift", "target_groups": [["title", "desc"], ["ghost"], []], "dx": 5, "dy": 0},
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(len(result["layout_groups"]), 1)
        changed = {p["element_id"]: p["left"] for p in result["layout_groups"][0]["patches"]}
        self.assertEqual(changed, {"title": 15.0, "desc": 15.0})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`:
```
./.venv/Scripts/python.exe -m unittest tests.test_layout_analysis -v
```
Expected: the 20 pre-existing tests still **PASS**; the 6 new tests **FAIL** with `KeyError: 'target_groups'` or a `TypeError`/`AssertionError` — `resolve_directed_operation` doesn't look at `target_groups` yet, so a directive with only that field (no `target_element_ids`) falls through to `"Nie rozpoznano poprawnego polecenia..."` and none of the assertions about `layout_groups` patches will hold.

- [ ] **Step 3: Implement**

In `backend/app/services/layout_analysis.py`, find the current `resolve_directed_operation` function in full:

```python
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

    if group == _NO_CHANGE:
        return {
            "layout_groups": [],
            "layout_issues": [{
                "severity": "low",
                "message": "Wskazane elementy już spełniają żądaną pozycję — nie ma czego zmieniać.",
            }],
        }
    if group is None:
        return _issue(
            "Nie można bezpiecznie wykonać tego polecenia — zmiana wyszłaby poza stronę "
            "lub elementy nie mieszczą się w wybranym układzie."
        )
    return {"layout_groups": [group], "layout_issues": []}
```

Replace it entirely with this (adds the two new functions before it, and restructures its body to branch to block handling):

```python
def _block_bbox(members: list[dict[str, Any]]) -> dict[str, float] | None:
    """Union bounding box of a block's member elements — the block moves as
    this single rigid shape; members keep their position relative to it."""
    if not members:
        return None
    left = min(m["left"] for m in members)
    top = min(m["top"] for m in members)
    right = max(m["left"] + m["width"] for m in members)
    bottom = max(m["top"] + m["height"] for m in members)
    return {"left": left, "top": top, "width": right - left, "height": bottom - top}


def _resolve_block_operation(
    items: list[dict[str, Any]],
    op_type: str,
    directive: dict[str, Any],
    raw_groups: list[Any],
    page_width: float,
    page_height: float,
) -> dict[str, Any]:
    """Adapter: treat each group of element ids as one rigid block by
    building a synthetic item for its union bounding box, running the exact
    same per-item resolver used for flat targets against those synthetic
    items, then expanding the resulting block-level patch into one patch
    per real member — a pure translation that preserves each member's
    position relative to the others in its block."""

    def _issue(message: str) -> dict[str, Any]:
        return {"layout_groups": [], "layout_issues": [{"severity": "warning", "message": message}]}

    items_by_id = {item["element_id"]: item for item in items}
    block_items: list[dict[str, Any]] = []
    block_members: dict[str, list[dict[str, Any]]] = {}

    for index, raw_ids in enumerate(raw_groups):
        if not isinstance(raw_ids, list):
            continue
        members = [items_by_id[str(mid)] for mid in raw_ids if str(mid) in items_by_id]
        if not members:
            continue
        if len({m["page"] for m in members}) > 1:
            return _issue(
                "Jeden ze wskazanych bloków obejmuje elementy z różnych stron — nie mogę wykonać "
                "tej operacji na blokach rozdzielonych między strony."
            )
        bbox = _block_bbox(members)
        block_id = f"__block_{index}__"
        block_items.append({
            "element_id": block_id,
            "category": "block",
            "page": members[0]["page"],
            **bbox,
        })
        block_members[block_id] = members

    if not block_items:
        return _issue("Nie znaleziono wskazanych elementów na kanwie.")
    if len({b["page"] for b in block_items}) > 1:
        return _issue(
            "Wskazane bloki znajdują się na różnych stronach — nie mogę wykonać tej operacji między stronami."
        )

    block_target_ids = {b["element_id"] for b in block_items}
    if op_type == "shift":
        dx = _number(directive.get("dx"), 0.0)
        dy = _number(directive.get("dy"), 0.0)
        group = resolve_shift(block_items, block_target_ids, dx, dy, page_width, page_height)
    elif op_type == "align":
        axis = directive.get("axis") if directive.get("axis") in _VALID_AXES else "x"
        anchor = directive.get("anchor") if directive.get("anchor") in _VALID_ANCHORS else "start"
        raw_target = directive.get("target")
        target = _number(raw_target) if raw_target is not None else None
        group = resolve_align(block_items, block_target_ids, axis, anchor, target, page_width, page_height)
    else:
        axis = directive.get("axis") if directive.get("axis") in _VALID_AXES else "y"
        group = resolve_distribute(block_items, block_target_ids, axis, page_width, page_height)

    if group == _NO_CHANGE:
        return {
            "layout_groups": [],
            "layout_issues": [{
                "severity": "low",
                "message": "Wskazane bloki już spełniają żądaną pozycję — nie ma czego zmieniać.",
            }],
        }
    if group is None:
        return _issue(
            "Nie można bezpiecznie wykonać tego polecenia — zmiana wyszłaby poza stronę "
            "lub bloki nie mieszczą się w wybranym układzie."
        )

    block_by_id = {b["element_id"]: b for b in block_items}
    expanded_patches = []
    for patch in group["patches"]:
        source_block = block_by_id[patch["element_id"]]
        dx_block = patch["left"] - source_block["left"]
        dy_block = patch["top"] - source_block["top"]
        for member in block_members[patch["element_id"]]:
            expanded_patches.append({
                "element_id": member["element_id"],
                "left": round(member["left"] + dx_block, 2),
                "top": round(member["top"] + dy_block, 2),
            })

    final_group = _group(
        group_id=group["id"],
        title=group["title"],
        reason=group["reason"],
        severity=group["severity"],
        patches=expanded_patches,
        items=items,
        page_width=page_width,
        page_height=page_height,
        allow_overlap=True,
    )
    if final_group is None:
        return _issue("Nie można bezpiecznie wykonać tego polecenia — zmiana wyszłaby poza stronę.")
    return {"layout_groups": [final_group], "layout_issues": []}


def resolve_directed_operation(
    elements: list[dict[str, Any]],
    directive: dict[str, Any],
    page_size: dict[str, Any] | None,
) -> dict[str, Any]:
    """Resolve one GPT-selected position directive into a safe, previewable
    layout group, or an explanation of why it can't be applied. GPT never
    supplies a coordinate — only an operation type, target element ids (or
    target_groups of ids for a multi-element block), and parameters; every
    actual left/top value is computed and validated here."""
    page_size = page_size or {}
    page_width = _number(page_size.get("width"), 595.0)
    page_height = _number(page_size.get("height"), 842.0)

    items = extract_bounds(elements)
    op_type = directive.get("type") if isinstance(directive, dict) else None

    def _issue(message: str) -> dict[str, Any]:
        return {"layout_groups": [], "layout_issues": [{"severity": "warning", "message": message}]}

    if op_type not in _VALID_OPERATIONS:
        return _issue("Nie rozpoznano poprawnego polecenia dotyczącego pozycji elementów.")

    raw_groups = directive.get("target_groups") if isinstance(directive, dict) else None
    if isinstance(raw_groups, list) and raw_groups:
        return _resolve_block_operation(items, op_type, directive, raw_groups, page_width, page_height)

    raw_ids = directive.get("target_element_ids") if isinstance(directive, dict) else None
    target_ids = {str(i) for i in raw_ids} if isinstance(raw_ids, list) else set()
    if not target_ids:
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

    if group == _NO_CHANGE:
        return {
            "layout_groups": [],
            "layout_issues": [{
                "severity": "low",
                "message": "Wskazane elementy już spełniają żądaną pozycję — nie ma czego zmieniać.",
            }],
        }
    if group is None:
        return _issue(
            "Nie można bezpiecznie wykonać tego polecenia — zmiana wyszłaby poza stronę "
            "lub elementy nie mieszczą się w wybranym układzie."
        )
    return {"layout_groups": [group], "layout_issues": []}
```

Note what changed in the flat-target path (bottom half, below `raw_groups` handling): purely a reordering — the `op_type not in _VALID_OPERATIONS` check moved earlier (now shared by both the block and flat paths, before either branches), and `target_ids` being empty now returns the same "not recognized" message it did before (previously this was combined into one `if op_type not in _VALID_OPERATIONS or not target_ids` check; now split so the block path can be tried first). The actual flat-target resolution logic (shift/align/distribute dispatch, `_NO_CHANGE`/`None` handling) is copied verbatim, unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run from `backend/`:
```
./.venv/Scripts/python.exe -m unittest tests.test_layout_analysis -v
```
Expected: **PASS** — `Ran 26 tests ... OK` (20 pre-existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/layout_analysis.py backend/tests/test_layout_analysis.py
git commit -m "feat: resolve multi-element block position operations"
```

---

### Task 2: Teach `_chat()` about `target_groups`

**Files:**
- Modify: `backend/app/services/ai_assistant_service.py`
- Test: `backend/tests/test_ai_chat_command.py` (extend existing file)

**Interfaces:** None new — `_chat()`'s signature and Python logic are unchanged. `raw.get("position_operation")` already gets forwarded to `resolve_directed_operation(elements, directive, page_size)` as a whole dict regardless of its shape (line ~608), so this task is a prompt-text change only, plus fixing one now-stale sentence.

- [ ] **Step 1: Write the failing test**

Open `backend/tests/test_ai_chat_command.py` and add this test method inside the existing `ChatCommandTests` class (after the existing test methods, same indentation, still inside the class):

```python
    def test_dispatcher_routes_target_groups_directive_to_block_resolution(self):
        elements = [
            {
                "element_id": "title-1", "category": "text", "content": "Programista",
                "fontSize": 12, "bold": True, "italic": False, "align": "left",
                "left": 20, "top": 40, "width": 150, "height": 15, "page": 1,
            },
            {
                "element_id": "desc-1", "category": "textarea", "content": "Opis obowiązków.",
                "fontSize": 11, "bold": False, "italic": False, "align": "left",
                "left": 20, "top": 58, "width": 150, "height": 20, "page": 1,
            },
        ]

        def fake_gpt(system, user):
            return {
                "message": "Przesunąłem cały wpis o pracę o 30px w dół.",
                "corrections": [],
                "position_operation": {
                    "type": "shift",
                    "target_groups": [["title-1", "desc-1"]],
                    "dx": 0,
                    "dy": 30,
                },
            }

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="przesuń cały wpis o pracę 30px w dół",
                page_size={"width": 595, "height": 842},
            )

        self.assertEqual(result["layout_issues"], [])
        changed = {p["element_id"]: p["top"] for p in result["layout_groups"][0]["patches"]}
        self.assertEqual(changed, {"title-1": 70.0, "desc-1": 88.0})
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `backend/`:
```
./.venv/Scripts/python.exe -m unittest tests.test_ai_chat_command -v
```
Expected: this new test **PASSES already** — Task 1 already made `resolve_directed_operation` understand `target_groups`, and `_chat()`'s Python code already forwards the directive unchanged, so the plumbing works before this task's prompt change too. This step exists to confirm that (the prompt change in Step 3 is about teaching the *real* GPT to produce this shape — the mocked test can't fail on prompt wording since it hands back a fixed directive regardless of what the prompt says). Confirm all tests in the file pass, including the 4 pre-existing ones — `Ran 5 tests ... OK`.

- [ ] **Step 3: Update the prompt**

In `backend/app/services/ai_assistant_service.py`, find this block inside `_chat()`'s `system` prompt (the `(3) POLECENIEM dotyczącym POZYCJI...` paragraph):

```python
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
        "Jeśli chodzi tylko o wzajemne wyrównanie bez podanej wartości, pomiń target. PRZED zwróceniem "
        "align sprawdź na podstawie podanych pozycji (left/top), czy wskazane elementy już mają "
        "zgodną wartość na tej osi (identyczną lub w granicach 1px) — jeśli tak, NIE zwracaj "
        "position_operation; zamiast tego w message napisz, że są już wyrównane, więc nie ma czego zmieniać.\n"
        "  - distribute: równomiernie rozkłada odstępy między co najmniej 3 wybranymi elementami "
        "wzdłuż osi (axis); pierwszy i ostatni z wybranych elementów pozostają na miejscu.\n"
        "NIGDY sam nie podawaj wartości left/top — Python obliczy rzeczywiste współrzędne na "
        "podstawie bieżącej, aktualnej pozycji elementów i sam odrzuci operację, jeśli wyszłaby "
        "poza stronę lub nałożyłaby się na inny element.\n"
```

Replace it with:

```python
        "(3) POLECENIEM dotyczącym POZYCJI elementów (np. \"przesuń nagłówki sekcji o 50px w lewo\", "
        "\"wyrównaj te elementy na x=50\", \"rozłóż wpisy w sekcji doświadczenia równomiernie\") — "
        "zwróć position_operation zamiast corrections:\n"
        "  {\"type\": \"shift\"|\"align\"|\"distribute\", \"target_element_ids\": [\"...\"] LUB "
        "\"target_groups\": [[\"...\"], [\"...\"]], "
        "\"dx\": <liczba>, \"dy\": <liczba>, \"axis\": \"x\"|\"y\", "
        "\"anchor\": \"start\"|\"center\"|\"end\", \"target\": <liczba lub pomiń>}\n"
        "  - target_element_ids: użyj, gdy polecenie dotyczy pojedynczych elementów (np. nagłówków).\n"
        "  - target_groups: użyj ZAMIAST target_element_ids, gdy polecenie dotyczy CAŁYCH BLOKÓW "
        "złożonych z kilku elementów (np. \"rozłóż wpisy o pracę równomiernie\", gdzie każdy wpis to "
        "osobny tytuł stanowiska + firma/daty + opis). Każda wewnętrzna lista to identyfikatory "
        "elementów tworzących jeden blok — znajdź bloki na podstawie bliskości pozycji i wzorca "
        "treści (powtarzający się układ: tytuł, potem firma/daty, potem opis, dla każdego wpisu). "
        "Blok porusza się jako całość — jego elementy zachowują wzajemny układ. Nie łącz "
        "target_groups z target_element_ids w tym samym poleceniu.\n"
        "  - shift: przesunięcie względne (dx, dy) w px wybranych elementów lub bloków.\n"
        "  - align: ustawia wybrane elementy lub bloki na wspólnej wartości jednej osi (axis) przy "
        "zakotwiczeniu (anchor: start = lewa/górna krawędź, center = środek, end = prawa/dolna "
        "krawędź). Jeśli użytkownik podał konkretną wartość (np. \"na x=50\"), podaj ją jako target. "
        "Jeśli chodzi tylko o wzajemne wyrównanie bez podanej wartości, pomiń target. PRZED zwróceniem "
        "align sprawdź na podstawie podanych pozycji (left/top), czy wskazane elementy już mają "
        "zgodną wartość na tej osi (identyczną lub w granicach 1px) — jeśli tak, NIE zwracaj "
        "position_operation; zamiast tego w message napisz, że są już wyrównane, więc nie ma czego zmieniać.\n"
        "  - distribute: równomiernie rozkłada odstępy między co najmniej 3 wybranymi elementami lub "
        "blokami wzdłuż osi (axis); pierwszy i ostatni pozostają na miejscu.\n"
        "NIGDY sam nie podawaj wartości left/top — Python obliczy rzeczywiste współrzędne na "
        "podstawie bieżącej, aktualnej pozycji elementów i sam odrzuci operację, jeśli wyszłaby "
        "poza stronę.\n"
```

Two changes beyond adding `target_groups`: the `shift`/`align`/`distribute` bullet descriptions now say "elements or blocks," and the final "NIGDY sam nie podawaj..." sentence drops "lub nałożyłaby się na inny element" ("or would overlap another element") — that clause became stale when overlap was allowed for directed operations (see `docs/superpowers/specs/2026-07-25-ai-position-allow-overlap-design.md`); this task is the first time this exact prompt string is touched since that change, so fix it here rather than leave GPT being told an inaccurate constraint.

- [ ] **Step 4: Run the tests to verify nothing broke**

Run from `backend/`:
```
./.venv/Scripts/python.exe -m unittest tests.test_ai_chat_command -v
```
Expected: **PASS** — `Ran 5 tests ... OK` (4 pre-existing plus the one added in Step 1 — none of these tests inspect the system prompt's wording, only its resulting behavior with a mocked `_gpt`, so a prompt-text-only change can't break them).

Then run the full suite for a regression check:
```
./.venv/Scripts/python.exe -m unittest discover -s tests -v
```
Expected: **38 tests total** (31 in the pre-existing baseline + 6 new from Task 1 + 1 new from this task), with the same one pre-existing, unrelated Postgres-connectivity failure and nothing else.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai_assistant_service.py backend/tests/test_ai_chat_command.py
git commit -m "feat: teach the CV chat action to target multi-element blocks"
```

---

### Task 3: Verify block partitioning against a real model

Tasks 1-2's automated tests prove the plumbing (block bbox math, rigid-translation expansion, cross-page rejection) with hand-constructed directives and a mocked GPT. They cannot prove the model actually *partitions* real CV content into the right blocks from a natural-language instruction — that needs a real call.

**Files:** none (verification only; the script below is not committed to the repo).

- [ ] **Step 1: Make sure the OpenAI key is available in your shell**

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

Save as `verify_block_operations.py` in a scratch/temp directory of your choice (throwaway, not committed):

```python
"""Manual verification for GPT-directed block position operations. Not part of the test suite."""
import sys
sys.path.insert(0, r"c:\Users\Kamil\learningCode\PROJECTS\PDF\pdf-generator\backend")

from app.services.ai_assistant_service import analyze_action

PAGE_SIZE = {"width": 595, "height": 842}

# Three job entries, unevenly spaced, each made of 3 separate elements
# (title, company/dates, description) — exactly the shape that made the
# assistant correctly decline this request before this plan.
ELEMENTS = [
    {"element_id": "exp-head", "category": "text", "content": "DOŚWIADCZENIE ZAWODOWE",
     "fontSize": 16, "bold": True, "italic": False, "align": "left",
     "left": 40, "top": 100, "width": 400, "height": 20, "page": 1},

    {"element_id": "job1-title", "category": "text", "content": "Starszy Programista",
     "fontSize": 12, "bold": True, "italic": False, "align": "left",
     "left": 40, "top": 130, "width": 300, "height": 15, "page": 1},
    {"element_id": "job1-company", "category": "text", "content": "Firma A, 2020-2022",
     "fontSize": 10, "bold": False, "italic": True, "align": "left",
     "left": 40, "top": 147, "width": 300, "height": 12, "page": 1},
    {"element_id": "job1-desc", "category": "textarea", "content": "Zbudowałem system rekrutacji.",
     "fontSize": 11, "bold": False, "italic": False, "align": "left",
     "left": 40, "top": 161, "width": 400, "height": 20, "page": 1},

    {"element_id": "job2-title", "category": "text", "content": "Tech Lead",
     "fontSize": 12, "bold": True, "italic": False, "align": "left",
     "left": 40, "top": 220, "width": 300, "height": 15, "page": 1},
    {"element_id": "job2-company", "category": "text", "content": "Firma B, 2022-2023",
     "fontSize": 10, "bold": False, "italic": True, "align": "left",
     "left": 40, "top": 237, "width": 300, "height": 12, "page": 1},
    {"element_id": "job2-desc", "category": "textarea", "content": "Prowadziłem zespół 5 osób.",
     "fontSize": 11, "bold": False, "italic": False, "align": "left",
     "left": 40, "top": 251, "width": 400, "height": 20, "page": 1},

    {"element_id": "job3-title", "category": "text", "content": "Dyrektor Techniczny",
     "fontSize": 12, "bold": True, "italic": False, "align": "left",
     "left": 40, "top": 400, "width": 300, "height": 15, "page": 1},
    {"element_id": "job3-company", "category": "text", "content": "Firma C, 2023-obecnie",
     "fontSize": 10, "bold": False, "italic": True, "align": "left",
     "left": 40, "top": 417, "width": 300, "height": 12, "page": 1},
    {"element_id": "job3-desc", "category": "textarea", "content": "Odpowiadam za całą architekturę.",
     "fontSize": 11, "bold": False, "italic": False, "align": "left",
     "left": 40, "top": 431, "width": 400, "height": 20, "page": 1},
]

MESSAGE = "rozłóż wpisy o pracę w sekcji doświadczenia równomiernie, jako całe bloki"

result = analyze_action(action="chat", elements=ELEMENTS, message=MESSAGE, page_size=PAGE_SIZE)
print("message:", result["message"])
print("tips:", result.get("tips"))
print("layout_issues:", result.get("layout_issues"))
groups = result.get("layout_groups") or []
print(f"\n{len(groups)} layout group(s)")
for group in groups:
    print(f"  {group['title']}")
    for patch in group["patches"]:
        print(f"    {patch['element_id']}: left={patch['left']}, top={patch['top']}")
```

Run it with the backend venv's interpreter, passing the script's full path:
```
c:\Users\Kamil\learningCode\PROJECTS\PDF\pdf-generator\backend\.venv\Scripts\python.exe <full-path-to>\verify_block_operations.py
```

- [ ] **Step 3: Confirm the result against these expectations**

1. GPT should choose `target_groups`, not `target_element_ids` — you can tell from the patches: if only `job2-title`/`job2-company`/`job2-desc` (the middle entry) move and `job1-*`/`job3-*` are absent from the patches, that's the expected "middle block moves, ends stay fixed" distribute behavior working correctly through the block path.
2. Within the moved entry (`job2-*`), confirm the *relative* vertical spacing between `job2-title`, `job2-company`, and `job2-desc` in the patches matches their original relative spacing (17px title→company, 14px company→desc in the seed data) — this is the "rigid block, internal layout preserved" guarantee. Compute each patch's `top` minus the previous element's original relative offset to confirm.
3. `layout_issues` should be empty and exactly one `layout_groups` entry should be present.
4. If GPT instead tried to move `job1-title` alone, or moved all 9 experience elements independently (ignoring the block structure), or declined the request again — that's a prompt-wording gap in Task 2's system prompt, not a plumbing bug (Tasks 1-2's automated tests already prove the plumbing with a hand-built `target_groups` directive). Adjust the wording, re-run this script, and re-run `tests.test_ai_chat_command` to confirm the automated test still passes before moving on.

- [ ] **Step 4: No commit** — this is a verification pass, not a code change. If you tweak the prompt in `_chat()` as a result, that's a normal edit to the existing `ai_assistant_service.py` file — commit it with a message describing what the prompt fix addresses.
