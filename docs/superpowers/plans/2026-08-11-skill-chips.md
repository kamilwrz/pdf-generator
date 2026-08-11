# Skill Chip Pills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `mode="chips"` rendering style to the shared skills-section generator so any CV template can opt into rendering each skill as its own filled, rounded-pill `rectangle` + centered `text`, wrapped across rows, without breaking page-break/reflow behavior.

**Architecture:** Backend-only, additive extension of `backend/app/services/cv_templates/shared/text.py`'s `_place_skills_section`. A new shared layout pass (`_layout_skill_chips`) computes chip positions and total wrapped height once; both the existing measure step (feeds `Builder.keep_together`) and the new place step consume it, so the whole category (label + every chip row) is guaranteed to move to the next page as one atomic block — never split mid-row. Chips reuse the existing `rectangle`/`text` element categories (already parity-safe between the canvas editor and the PDF renderer); no schema or dispatch changes.

**Tech Stack:** Python (backend generator), `reportlab` for glyph-width measurement, `unittest` for tests (`cd backend && python -m unittest discover -s tests`).

## Global Constraints

- Backend-generated only — no new canvas-editable element type, no frontend changes (per spec decision #1).
- `mode="chips"` is a new **optional** value alongside existing `"inline"`/`"bullets"` in `_place_skills_section`; every other template's default behavior must stay byte-identical (per spec decision #2, acceptance criterion #4).
- Chip colors come from parameters the calling template passes in (`chip_bg`/`chip_fg`) — no new persisted configuration field (per spec decision #3).
- A category (label + all its wrapped chip rows) must never be split across a page boundary — reuse `Builder.keep_together`, no new page-split logic (per spec decision #4, acceptance criterion #3).
- `_rect()` must stay backward-compatible: existing callers that omit the new kwargs must produce the exact element shape they do today (per spec section 5/acceptance criterion #5).
- No guessed line numbers in any documentation — README updates must reference verified file/function names (per `CLAUDE.md`).

Reference: `docs/superpowers/specs/2026-08-11-skill-chips-design.md`.

---

### Task 1: `_rect()` gains `filled` / `borderRadius` kwargs

**Files:**
- Modify: `backend/app/services/cv_generator_primitives.py:168-172` (function `_rect`)
- Test: Create `backend/tests/test_cv_generator_primitives.py`

**Interfaces:**
- Produces: `_rect(left, top, width, height, color, borderWidth=1, *, filled=False, borderRadius=None, zIndex=1, page=1) -> dict` — same positional signature as today, two new optional keyword-only args. Every element dict it returns now always includes `"filled"` and `"borderRadius"` keys (previously absent), matching the pattern `_circle`/`_ellipse` already use.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_cv_generator_primitives.py`:

```python
"""``_rect`` gains filled/borderRadius kwargs without changing existing callers."""
from __future__ import annotations

import unittest

from app.services.cv_generator_primitives import _rect


class RectHelperTests(unittest.TestCase):
    def test_default_call_matches_pre_existing_outline_shape(self):
        element = _rect(10, 20, 100, 40, "#112233", 2, zIndex=3, page=2)
        self.assertEqual(element["category"], "rectangle")
        self.assertEqual(element["left"], 10)
        self.assertEqual(element["top"], 20)
        self.assertEqual(element["width"], 100)
        self.assertEqual(element["height"], 40)
        self.assertEqual(element["backgroundColor"], "#112233")
        self.assertEqual(element["borderWidth"], 2)
        self.assertFalse(element["filled"])
        self.assertIsNone(element["borderRadius"])
        self.assertEqual(element["zIndex"], 3)
        self.assertEqual(element["page"], 2)

    def test_filled_rounded_pill(self):
        element = _rect(0, 0, 60, 20, "#000000", 0, filled=True, borderRadius=10)
        self.assertTrue(element["filled"])
        self.assertEqual(element["borderRadius"], 10)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m unittest tests.test_cv_generator_primitives -v`
Expected: FAIL — `TypeError: _rect() got an unexpected keyword argument 'filled'`

- [ ] **Step 3: Implement the change**

In `backend/app/services/cv_generator_primitives.py`, replace the existing `_rect` function (lines 168-172):

```python
def _rect(left, top, width, height, color, borderWidth=1, *, filled=False, borderRadius=None, zIndex=1, page=1):
    """Outline-only rectangle by default (``backgroundColor`` = border colour).

    ``filled=True`` paints ``color`` as a solid fill instead of a stroke, and
    ``borderRadius`` draws rounded corners (used for pill/chip chrome, e.g.
    skill chips). Existing callers that omit both kwargs get the exact
    element shape they always have.
    """
    return {"category": "rectangle", "left": left, "top": top,
            "width": width, "height": height, "backgroundColor": color,
            "borderWidth": borderWidth, "filled": filled,
            "borderRadius": borderRadius, "zIndex": zIndex, "page": page}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m unittest tests.test_cv_generator_primitives -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/cv_generator_primitives.py backend/tests/test_cv_generator_primitives.py
git commit -m "feat: add filled/borderRadius kwargs to _rect for pill chrome"
```

---

### Task 2: Promote `_text_width` to a shared primitive

**Files:**
- Modify: `backend/app/services/cv_generator_primitives.py` (add `_text_width`, add `stringWidth` import)
- Modify: `backend/app/services/cv_templates/templates/axis.py:1-52` (remove local `_text_width`, use the shared one)
- Test: Modify `backend/tests/test_cv_generator_primitives.py` (append test class)

**Interfaces:**
- Consumes: `PDF_Generator._resolve_font` (already imported in `cv_generator_primitives.py:18`).
- Produces: `_text_width(value: str, font: str, fs: float) -> float` — importable from `app.services.cv_generator_primitives`. Task 3 depends on this.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_cv_generator_primitives.py`:

```python
from app.services.cv_generator_primitives import _text_width


class TextWidthTests(unittest.TestCase):
    def test_longer_text_is_wider(self):
        short = _text_width("SQL", "Helvetica", 10)
        long_text = _text_width("Python Programming", "Helvetica", 10)
        self.assertGreater(short, 0)
        self.assertGreater(long_text, short)

    def test_unknown_font_falls_back_to_char_estimate(self):
        width = _text_width("SQL", "Definitely Not A Real Font", 10)
        self.assertEqual(width, len("SQL") * 10 * 0.55)
```

(Move the `from app.services.cv_generator_primitives import _rect` line and this new import into one combined import statement at the top of the file instead of a second import line.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m unittest tests.test_cv_generator_primitives -v`
Expected: FAIL — `ImportError: cannot import name '_text_width'`

- [ ] **Step 3: Add `_text_width` to `cv_generator_primitives.py`**

Add the import near the top of `backend/app/services/cv_generator_primitives.py` (after the existing `from app.services.pdf_generator import PDF_Generator` on line 18):

```python
from reportlab.pdfbase.pdfmetrics import stringWidth
```

Add the function directly after `_rect` (after the function edited in Task 1):

```python
def _text_width(value: str, font: str, fs: float) -> float:
    """Rendered width of a label in points (falls back to a char estimate).

    Shared by every wrapping/column layout that needs real glyph extents —
    skill chip pills, Axis's timeline chip row, Axis's language columns —
    instead of a guess, so wraps land where the rendered PDF actually breaks.
    """
    try:
        draw_font, _, _ = PDF_Generator._resolve_font(font, False, False)
        return stringWidth(value, draw_font, fs)
    except Exception:
        return len(value) * fs * 0.55
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m unittest tests.test_cv_generator_primitives -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Remove the now-duplicate local copy in `axis.py`**

In `backend/app/services/cv_templates/templates/axis.py`, replace lines 19-52 (the `stringWidth` import through the end of the local `_text_width` function):

Old:
```python
from reportlab.pdfbase.pdfmetrics import stringWidth

from app.services.cv_generator_primitives import (
    Builder,
    SPACE_AFTER_HEADER_RULE,
    get_spacing,
    section_chrome_height,
    _block,
    _circle,
    _line,
    _text,
)
from app.services.cv_templates.shared.contact import _contact_channel_items
from app.services.cv_templates.shared.icons import _icon
from app.services.cv_templates.shared.records import (
    _education_bullets,
    _education_school,
)
from app.services.cv_data import skill_groups, skills_have_content
from app.services.cv_templates.shared.text import _bullets, _compact_text, _labels
from app.services.pdf_generator import PDF_Generator


def _text_width(value: str, font: str, fs: float) -> float:
    """Rendered width of a label in points (falls back to a char estimate).

    Used for the wrapping skill chips and language columns so their underlines
    and column breaks line up with the real glyph extent rather than a guess.
    """
    try:
        draw_font, _, _ = PDF_Generator._resolve_font(font, False, False)
        return stringWidth(value, draw_font, fs)
    except Exception:
        return len(value) * fs * 0.55
```

New:
```python
from app.services.cv_generator_primitives import (
    Builder,
    SPACE_AFTER_HEADER_RULE,
    get_spacing,
    section_chrome_height,
    _block,
    _circle,
    _line,
    _text,
    _text_width,
)
from app.services.cv_templates.shared.contact import _contact_channel_items
from app.services.cv_templates.shared.icons import _icon
from app.services.cv_templates.shared.records import (
    _education_bullets,
    _education_school,
)
from app.services.cv_data import skill_groups, skills_have_content
from app.services.cv_templates.shared.text import _bullets, _compact_text, _labels
```

`PDF_Generator` and `stringWidth` are no longer referenced anywhere else in `axis.py` — both imports are fully removed, not left dangling.

- [ ] **Step 6: Confirm Axis still generates correctly**

Run: `cd backend && python -m unittest tests.test_cv_template_layouts -v`
Expected: PASS (no test targets Axis specifically today, but this catches any import error immediately since `generate_resume` is exercised for other templates in the same module import path).

Then run a quick manual smoke check that `axis.py` still imports and generates cleanly:

```bash
cd backend && python -c "
from app.services.cv_generator import generate_resume
cv = {'name': 'Test', 'title': 'Analyst', 'email': 'a@example.com', 'phone': '+48 600 000 000', 'location': 'Warszawa', 'skills': ['AML', 'KYC', 'SQL', 'Python']}
els = generate_resume('axis', cv)
print(len([e for e in els if e['category'] == 'text']), 'text elements')
"
```
Expected: prints a positive count, no traceback.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/cv_generator_primitives.py backend/app/services/cv_templates/templates/axis.py backend/tests/test_cv_generator_primitives.py
git commit -m "refactor: promote _text_width to a shared cv_generator_primitives helper"
```

---

### Task 3: Chip wrapping layout (`_layout_skill_chips` + measure/place passes)

**Files:**
- Modify: `backend/app/services/cv_templates/shared/text.py:15` (import block), and insert new code after line 86 (after `_skill_group_body_content`, before `_measure_skill_group`)
- Test: Create `backend/tests/test_skill_chips.py`

**Interfaces:**
- Consumes: `_rect`, `_text`, `_text_width` from `app.services.cv_generator_primitives` (Tasks 1-2); `_clean_list_items` (already in `shared/text.py:22`).
- Produces:
  - `_layout_skill_chips(items, width: float, font: str, fs: float) -> tuple[list[tuple[str, float, float, float]], float]` — `(placements, total_height)`; each placement is `(skill: str, dx: float, dy: float, chip_width: float)` relative to the block's top-left corner.
  - `_measure_skill_chips_row(items, width: float, font: str, fs: float) -> float` — total height only. Used by Task 4's `_measure_skill_group`.
  - `_place_skill_chips_row(b: Builder, items, left: float, width: float, font: str, fs: float, chip_bg: str, chip_fg: str) -> float` — emits elements into `b.els`, advances and returns `b.y`. Used by Task 4's `_place_skills_section`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_skill_chips.py`:

```python
"""Skill chip pill wrapping: row layout, measure/place agreement, page breaks."""
from __future__ import annotations

import unittest

from app.services.cv_generator_primitives import Builder, CONTENT_BOTTOM, PAGE_TOP
from app.services.cv_templates.shared.text import (
    _layout_skill_chips,
    _measure_skill_chips_row,
    _place_skill_chips_row,
)


class LayoutSkillChipsTests(unittest.TestCase):
    def test_empty_items_produce_no_placements(self):
        placements, height = _layout_skill_chips([], 300, "Helvetica", 9.0)
        self.assertEqual(placements, [])
        self.assertEqual(height, 0.0)

    def test_wraps_to_a_new_row_when_width_exceeded(self):
        items = [
            "Analiza AML/KYC", "Transaction Monitoring", "Screening PEP", "SAR Reporting",
        ]
        placements, height = _layout_skill_chips(items, 160, "Helvetica", 9.0)
        rows = {round(dy, 3) for _skill, _dx, dy, _w in placements}
        self.assertGreater(len(rows), 1, "expected wrapping across multiple rows")
        self.assertEqual(len(placements), len(items))
        self.assertGreater(height, 0)

    def test_single_short_item_fits_on_one_row_at_the_origin(self):
        placements, height = _layout_skill_chips(["SQL"], 300, "Helvetica", 9.0)
        self.assertEqual(len(placements), 1)
        _skill, dx, dy, _w = placements[0]
        self.assertEqual((dx, dy), (0.0, 0.0))
        self.assertGreater(height, 0)


class MeasurePlaceAgreementTests(unittest.TestCase):
    def test_measured_height_matches_placed_cursor_advance(self):
        items = [
            "Analiza AML/KYC", "Transaction Monitoring", "CDD / EDD", "Screening PEP",
            "Sanctions", "Adverse Media", "SAR Reporting", "MS Office",
        ]
        width = 200.0
        measured = _measure_skill_chips_row(items, width, "Helvetica", 9.0)

        b = Builder(PAGE_TOP)
        start_y = b.y
        end_y = _place_skill_chips_row(b, items, 40, width, "Helvetica", 9.0, "#123456", "#FFFFFF")

        self.assertEqual(end_y - start_y, measured)
        self.assertEqual(end_y, b.y)


class PlaceSkillChipsRowRenderingTests(unittest.TestCase):
    def test_emits_filled_rounded_rectangle_and_centered_text_per_chip(self):
        b = Builder(PAGE_TOP)
        _place_skill_chips_row(b, ["SQL", "Python"], 40, 300, "Helvetica", 9.0, "#1B3357", "#FFFFFF")

        rects = [el for el in b.els if el["category"] == "rectangle"]
        texts = [el for el in b.els if el["category"] == "text"]
        self.assertEqual(len(rects), 2)
        self.assertEqual(len(texts), 2)
        for rect in rects:
            self.assertTrue(rect["filled"])
            self.assertGreater(rect["borderRadius"], 0)
            self.assertEqual(rect["backgroundColor"], "#1B3357")
        self.assertEqual({t["content"] for t in texts}, {"SQL", "Python"})
        for text in texts:
            self.assertEqual(text["color"], "#FFFFFF")


class KeepTogetherPageBreakTests(unittest.TestCase):
    def test_whole_wrapped_chip_block_moves_to_next_page_when_it_does_not_fit(self):
        items = [f"Skill {index}" for index in range(30)]
        width = 200.0
        height = _measure_skill_chips_row(items, width, "Helvetica", 9.0)

        # Leave less room on page 1 than the wrapped block needs.
        b = Builder(CONTENT_BOTTOM - height / 2)
        with b.keep_together(height):
            _place_skill_chips_row(b, items, 40, width, "Helvetica", 9.0, "#1B3357", "#FFFFFF")

        pages = {element["page"] for element in b.els}
        self.assertEqual(pages, {2})
        groups = {element.get("flowGroup") for element in b.els}
        self.assertEqual(len(groups), 1)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m unittest tests.test_skill_chips -v`
Expected: FAIL — `ImportError: cannot import name '_layout_skill_chips'`

- [ ] **Step 3: Update the import block in `shared/text.py`**

Replace line 15 of `backend/app/services/cv_templates/shared/text.py`:

Old:
```python
from app.services.cv_generator_primitives import get_spacing, section_chrome_height
```

New:
```python
from app.services.cv_generator_primitives import (
    _rect,
    _text,
    _text_width,
    get_spacing,
    section_chrome_height,
)
```

- [ ] **Step 4: Insert the chip layout functions**

Insert the following in `backend/app/services/cv_templates/shared/text.py` immediately after `_skill_group_body_content` (which ends at line 86, right before `def _measure_skill_group` on line 89):

```python
# Chip pill layout: horizontal padding/gap around each pill and vertical gap
# between wrapped rows, in px. Tuned to read as a distinct rounded badge next
# to the mid-dot/bullet body styles above without dominating the row.
CHIP_PAD_X = 10.0
CHIP_PAD_Y = 5.0
CHIP_GAP_X = 8.0
CHIP_GAP_Y = 8.0


def _layout_skill_chips(
    items: list | tuple | None,
    width: float,
    font: str,
    fs: float,
) -> tuple[list[tuple[str, float, float, float]], float]:
    """Compute wrapped chip positions and the total block height.

    Returns ``(placements, total_height)`` where each placement is
    ``(skill, dx, dy, chip_width)`` relative to the block's top-left corner.
    Both the measure pass (``_measure_skill_chips_row``) and the place pass
    (``_place_skill_chips_row``) call this same function, so the two can
    never disagree about how many rows a skill list wraps into. Axis's older,
    unshared ``_place_skill_chips`` only reserves height for the first row
    before wrapping, which can let a category with many skills paint past
    the footer; sharing one layout pass here rules that class of bug out.
    """
    cleaned = _clean_list_items(items)
    if not cleaned:
        return [], 0.0
    chip_h = fs + 2 * CHIP_PAD_Y
    row_step = chip_h + CHIP_GAP_Y
    placements: list[tuple[str, float, float, float]] = []
    cx = 0.0
    cy = 0.0
    row_started = False
    for skill in cleaned:
        chip_w = _text_width(skill, font, fs) + 2 * CHIP_PAD_X
        if row_started and cx + chip_w > width:
            cx = 0.0
            cy += row_step
            row_started = False
        placements.append((skill, cx, cy, chip_w))
        cx += chip_w + CHIP_GAP_X
        row_started = True
    return placements, cy + chip_h


def _measure_skill_chips_row(
    items: list | tuple | None, width: float, font: str, fs: float,
) -> float:
    """Total height of one category's wrapped chip pills."""
    _, total_height = _layout_skill_chips(items, width, font, fs)
    return total_height


def _place_skill_chips_row(
    b: Any,
    items: list | tuple | None,
    left: float,
    width: float,
    font: str,
    fs: float,
    chip_bg: str,
    chip_fg: str,
) -> float:
    """Emit one category's skills as wrapped, filled rounded-pill chips.

    Advances and returns ``b.y`` by the same amount
    ``_measure_skill_chips_row`` reports for identical inputs (both call
    ``_layout_skill_chips``), which is what lets ``_place_skills_section``
    reserve exact space via ``keep_together`` and never split a category
    mid-row.
    """
    placements, total_height = _layout_skill_chips(items, width, font, fs)
    if not placements:
        return b.y
    chip_h = fs + 2 * CHIP_PAD_Y
    radius = chip_h / 2
    top = b.y
    for skill, dx, dy, chip_w in placements:
        x = left + dx
        y = top + dy
        b.els.append(_rect(
            x, y, chip_w, chip_h, chip_bg, 0,
            filled=True, borderRadius=radius, zIndex=2, page=b.pg,
        ))
        b.els.append(_text(
            skill, fs, font, chip_fg, x + CHIP_PAD_X, y + CHIP_PAD_Y,
            zIndex=3, page=b.pg,
        ))
    b.y = top + total_height
    return b.y
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m unittest tests.test_skill_chips -v`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/cv_templates/shared/text.py backend/tests/test_skill_chips.py
git commit -m "feat: add wrapped chip-pill layout pass to shared skills text helpers"
```

---

### Task 4: Wire `mode="chips"` into `_place_skills_section` / `_measure_skill_group`

**Files:**
- Modify: `backend/app/services/cv_templates/shared/text.py:89-120` (`_measure_skill_group`), `:146-218` (`_place_skills_section`)
- Test: Modify `backend/tests/test_skill_chips.py` (append test class)

**Interfaces:**
- Consumes: `_measure_skill_chips_row`, `_place_skill_chips_row` (Task 3); `_clean_list_items` (existing).
- Produces: `_place_skills_section(..., mode="chips", chip_bg=str, chip_fg=str)` — raises `ValueError` if `mode="chips"` and either color is falsy. Every other `mode` value keeps today's exact behavior.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_skill_chips.py`. Add this import alongside the existing ones at the top of the file:

```python
from app.services.cv_templates.shared.text import _place_skills_section
```

Then append:

```python
class PlaceSkillsSectionChipsModeTests(unittest.TestCase):
    @staticmethod
    def _section_fn(calls):
        def _section(label):
            calls.append(label)
        return _section

    def test_chips_mode_requires_chip_colors(self):
        b = Builder(PAGE_TOP)
        cv = {"skills": ["SQL", "Python"]}
        with self.assertRaises(ValueError):
            _place_skills_section(
                b, cv, self._section_fn([]), 40, 260, "#000000", "Helvetica", 9.6, 13.0,
                mode="chips",
            )

    def test_flat_skill_list_renders_wrapped_pills(self):
        b = Builder(PAGE_TOP)
        cv = {"skills": ["Analiza AML/KYC", "Transaction Monitoring", "SQL", "Python"]}
        calls = []
        placed = _place_skills_section(
            b, cv, self._section_fn(calls), 40, 260, "#000000", "Helvetica", 9.6, 13.0,
            mode="chips", chip_bg="#1B3357", chip_fg="#FFFFFF",
        )
        self.assertTrue(placed)
        self.assertEqual(calls, ["UMIEJĘTNOŚCI"])
        rects = [el for el in b.els if el["category"] == "rectangle"]
        texts = [el for el in b.els if el["category"] == "text"]
        self.assertEqual(len(rects), 4)
        self.assertEqual(len(texts), 4)
        self.assertTrue(all(rect["filled"] for rect in rects))

    def test_grouped_skills_keep_category_and_its_pills_on_one_page(self):
        b = Builder(PAGE_TOP)
        cv = {
            "skills": [
                {"category": "Compliance", "items": [f"Skill {i}" for i in range(20)]},
            ],
        }
        placed = _place_skills_section(
            b, cv, self._section_fn([]), 40, 200, "#000000", "Helvetica", 9.6, 13.0,
            mode="chips", chip_bg="#1B3357", chip_fg="#FFFFFF",
        )
        self.assertTrue(placed)
        non_chrome_pages = {
            el["page"] for el in b.els
            if el.get("flowGroup")
        }
        self.assertEqual(len(non_chrome_pages), 1)

    def test_inline_mode_is_unchanged(self):
        b = Builder(PAGE_TOP)
        cv = {"skills": ["SQL", "Python", "AML"]}
        placed = _place_skills_section(
            b, cv, self._section_fn([]), 40, 300, "#000000", "Helvetica", 9.6, 13.0,
        )
        self.assertTrue(placed)
        textareas = [el for el in b.els if el["category"] == "textarea"]
        self.assertEqual(len(textareas), 1)
        self.assertIn("SQL", textareas[0]["content"])
        self.assertEqual([el for el in b.els if el["category"] == "rectangle"], [])
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd backend && python -m unittest tests.test_skill_chips -v`
Expected: FAIL — `test_chips_mode_requires_chip_colors` fails because no `ValueError` is raised (current code silently falls through to the `"bullets"`/`"inline"` content path); `test_flat_skill_list_renders_wrapped_pills` and `test_grouped_skills_keep_category_and_its_pills_on_one_page` fail because no `rectangle` elements are emitted.

- [ ] **Step 3: Update `_measure_skill_group`**

Replace lines 89-120 of `backend/app/services/cv_templates/shared/text.py`:

Old:
```python
def _measure_skill_group(
    b: Any,
    group: dict[str, Any],
    width: float,
    fs: float,
    lh: float,
    font: str,
    *,
    mode: str = "inline",
    category_fs: float | None = None,
) -> float:
    """Height of one category label + chip body (no trailing inter-group gap)."""
    cat_fs = float(category_fs if category_fs is not None else max(fs, 9.5))
    # Match the category font, not the body line-height — inflating to body ``lh``
    # leaves empty box space that spacing guides read as a ~10 px ink gap.
    cat_lh = cat_fs + 2.0
    category = str(group.get("category") or "").strip()
    items = group.get("items") or []
    height = 0.0
    if category:
        height += b.measure_block(
            category, width, cat_fs, cat_lh, font, bold=True, min_h=cat_lh,
        )
        if items:
            height += get_spacing().stack
    if items:
        content = _skill_group_body_content(items, mode=mode)
        if content:
            height += b.measure_block(
                content, width, fs, lh, font, bulletList=(mode == "bullets"),
            )
    return height
```

New:
```python
def _measure_skill_group(
    b: Any,
    group: dict[str, Any],
    width: float,
    fs: float,
    lh: float,
    font: str,
    *,
    mode: str = "inline",
    category_fs: float | None = None,
) -> float:
    """Height of one category label + chip body (no trailing inter-group gap)."""
    cat_fs = float(category_fs if category_fs is not None else max(fs, 9.5))
    # Match the category font, not the body line-height — inflating to body ``lh``
    # leaves empty box space that spacing guides read as a ~10 px ink gap.
    cat_lh = cat_fs + 2.0
    category = str(group.get("category") or "").strip()
    items = group.get("items") or []
    height = 0.0
    if category:
        height += b.measure_block(
            category, width, cat_fs, cat_lh, font, bold=True, min_h=cat_lh,
        )
        if items:
            height += get_spacing().stack
    if items:
        if mode == "chips":
            height += _measure_skill_chips_row(items, width, font, fs)
        else:
            content = _skill_group_body_content(items, mode=mode)
            if content:
                height += b.measure_block(
                    content, width, fs, lh, font, bulletList=(mode == "bullets"),
                )
    return height
```

- [ ] **Step 4: Update `_place_skills_section`**

Replace lines 146-218 of `backend/app/services/cv_templates/shared/text.py`:

Old:
```python
def _place_skills_section(
    b: Any,
    cv: dict,
    section_fn: Callable[[str], Any],
    L: float,
    W: float,
    body_color: str,
    font: str,
    fs: float,
    lh: float,
    *,
    mode: str = "inline",
    section_chrome_h: float | None = None,
    category_fs: float | None = None,
) -> bool:
    """
    Emit one UMIEJĘTNOŚCI heading plus optional named subsections.

    Flat skills → heading + mid-dot/bullet body (unchanged look).
    Grouped skills → heading, then bold category labels and chip bodies under
    each. Uses existing textarea bold + list blocks — no new canvas primitives.

    Each category + chip body is emitted inside ``keep_together`` so they share a
    ``flowGroup``. Canvas rhythm knobs treat that pair as stack (4 px), not
    record (10 px) — autoHeight textareas without a shared group fall through
    to record spacing in ``classifyIntraSectionGap``.
    """
    raw_skills = cv.get("skills")
    if not skills_have_content(raw_skills):
        return False

    groups = skill_groups(raw_skills)
    labels = _labels(cv)
    cat_fs = float(category_fs if category_fs is not None else max(fs, 9.5))
    cat_lh = cat_fs + 2.0
    chrome_h = (
        float(section_chrome_h)
        if section_chrome_h is not None
        else section_chrome_height(8.6)
    )
    stack = get_spacing().stack

    # Reserve chrome + first group so the heading does not orphan at the footer.
    first_h = _measure_skill_group(
        b, groups[0], W, fs, lh, font, mode=mode, category_fs=category_fs,
    )

    b.need_section(chrome_h, first_h or lh)
    section_fn(labels["skills"])

    for index, group in enumerate(groups):
        category = str(group.get("category") or "").strip()
        items = group.get("items") or []
        content = _skill_group_body_content(items, mode=mode) if items else ""
        group_h = _measure_skill_group(
            b, group, W, fs, lh, font, mode=mode, category_fs=category_fs,
        )
        with b.keep_together(group_h or lh):
            if category:
                b.block(
                    category, L, W, cat_fs, cat_lh, body_color, font,
                    bold=True, min_h=cat_lh,
                )
                if content:
                    b.gap(stack)
            if content:
                b.block(
                    content, L, W, fs, lh, body_color, font,
                    bulletList=(mode == "bullets"),
                )
        if index < len(groups) - 1:
            b.gap(get_spacing().record)
    return True
```

New:
```python
def _place_skills_section(
    b: Any,
    cv: dict,
    section_fn: Callable[[str], Any],
    L: float,
    W: float,
    body_color: str,
    font: str,
    fs: float,
    lh: float,
    *,
    mode: str = "inline",
    section_chrome_h: float | None = None,
    category_fs: float | None = None,
    chip_bg: str | None = None,
    chip_fg: str | None = None,
) -> bool:
    """
    Emit one UMIEJĘTNOŚCI heading plus optional named subsections.

    Flat skills → heading + mid-dot/bullet/chip body (unchanged look unless
    ``mode="chips"`` is requested).
    Grouped skills → heading, then bold category labels and chip bodies under
    each. ``inline``/``bullets`` reuse existing textarea bold + list blocks —
    no new canvas primitives. ``mode="chips"`` instead emits one filled,
    rounded ``rectangle`` + centered ``text`` pair per skill via
    ``_place_skill_chips_row``, wrapped across rows.

    ``mode="chips"`` requires ``chip_bg``/``chip_fg`` (pill background/text
    colors) — callers pass their own template palette so pills stay on-brand
    without a new persisted configuration field.

    Each category + body is emitted inside ``keep_together`` so they share a
    ``flowGroup`` — for chips this guarantees a category's label and every one
    of its wrapped pill rows land on the same page, never split mid-row.
    Canvas rhythm knobs treat that pair as stack (4 px), not record (10 px) —
    autoHeight textareas without a shared group fall through to record
    spacing in ``classifyIntraSectionGap``.
    """
    raw_skills = cv.get("skills")
    if not skills_have_content(raw_skills):
        return False
    if mode == "chips" and (not chip_bg or not chip_fg):
        raise ValueError("mode='chips' requires chip_bg and chip_fg")

    groups = skill_groups(raw_skills)
    labels = _labels(cv)
    cat_fs = float(category_fs if category_fs is not None else max(fs, 9.5))
    cat_lh = cat_fs + 2.0
    chrome_h = (
        float(section_chrome_h)
        if section_chrome_h is not None
        else section_chrome_height(8.6)
    )
    stack = get_spacing().stack

    # Reserve chrome + first group so the heading does not orphan at the footer.
    first_h = _measure_skill_group(
        b, groups[0], W, fs, lh, font, mode=mode, category_fs=category_fs,
    )

    b.need_section(chrome_h, first_h or lh)
    section_fn(labels["skills"])

    for index, group in enumerate(groups):
        category = str(group.get("category") or "").strip()
        items = group.get("items") or []
        if mode == "chips":
            content = ""
            has_body = bool(_clean_list_items(items))
        else:
            content = _skill_group_body_content(items, mode=mode) if items else ""
            has_body = bool(content)
        group_h = _measure_skill_group(
            b, group, W, fs, lh, font, mode=mode, category_fs=category_fs,
        )
        with b.keep_together(group_h or lh):
            if category:
                b.block(
                    category, L, W, cat_fs, cat_lh, body_color, font,
                    bold=True, min_h=cat_lh,
                )
                if has_body:
                    b.gap(stack)
            if mode == "chips":
                if has_body:
                    _place_skill_chips_row(b, items, L, W, font, fs, chip_bg, chip_fg)
            elif content:
                b.block(
                    content, L, W, fs, lh, body_color, font,
                    bulletList=(mode == "bullets"),
                )
        if index < len(groups) - 1:
            b.gap(get_spacing().record)
    return True
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m unittest tests.test_skill_chips -v`
Expected: PASS (10 tests)

- [ ] **Step 6: Run the full backend suite to confirm no regressions**

Run: `cd backend && python -m unittest discover -s tests`
Expected: PASS — all existing tests, including `test_cv_template_layouts.py` and `test_builder_keep_together.py`, still pass unchanged (no template currently passes `mode="chips"`, so every existing call site is unaffected).

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/cv_templates/shared/text.py backend/tests/test_skill_chips.py
git commit -m "feat: wire mode=chips into _place_skills_section with page-safe keep_together"
```

---

### Task 5: README documentation (EN + PL)

**Files:**
- Modify: `README.md` (two insertions — one in the English section, one in the Polish section)

**Interfaces:**
- Consumes: function/file names from Tasks 1-4 (`_rect`, `_text_width`, `_layout_skill_chips`, `_measure_skill_chips_row`, `_place_skill_chips_row`, `mode="chips"` on `_place_skills_section`).
- Produces: nothing consumed by later tasks — documentation only.

- [ ] **Step 1: Verify current section anchors before editing**

Run: `grep -n "Flat-section layout toggle\|Przełącznik układu sekcji płaskich\|Too-long CV assistant\|Zbyt długie CV" README.md`

Confirm the English "Flat-section layout toggle (inline row ↔ bullet list)" section and its Polish counterpart "Przełącznik układu sekcji płaskich (w linii ↔ lista punktowana)" still exist at roughly the locations used below, and note their current line numbers so the insertion lands right after each section (before the following `###` heading) rather than at a guessed offset.

- [ ] **Step 2: Insert the English subsection**

Insert a new `###` subsection in `README.md`'s English part, immediately after the "Flat-section layout toggle (inline row ↔ bullet list)" section's Tests bullet list and before the next `### Too-long CV assistant (compact spacing → AI shortening)` heading:

```markdown
### Skill chip pills (backend-only rendering capability)

`_place_skills_section` in `backend/app/services/cv_templates/shared/text.py` accepts a third body style, `mode="chips"`, alongside the existing `"inline"` (mid-dot row) and `"bullets"` (vertical bullet list) styles used by the toggle above. In `chips` mode, each skill in a category renders as its own solid, rounded-pill `rectangle` element with a centered `text` label on top, wrapping to additional rows when a row's pills would overflow the section width. Wrapping is computed once by `_layout_skill_chips`, shared between the measure pass (`_measure_skill_chips_row`) and the place pass (`_place_skill_chips_row`) so the two can never disagree about row count — the category label plus every pill row is measured up front, then emitted inside the same `Builder.keep_together` block already used by `inline`/`bullets` mode, so a category is never split across a page mid-row.

This is a generator-level capability, not yet enabled by any shipped template — no template currently passes `mode="chips"`, and there is no user-facing toggle for it (unlike the inline/bullets switch above, which is driven by `FlatSectionLayoutToggle` in the canvas editor). Enabling it for a specific template is a small, template-local change: passing `mode="chips"`, `chip_bg`, and `chip_fg` (the template's own palette colors) to that template's existing `_place_skills_section` call.

Implementation:

- `backend/app/services/cv_generator_primitives.py`, function `_rect` — gained `filled` / `borderRadius` keyword arguments (previously outline-only; `_circle`/`_ellipse` already supported `filled`)
- `backend/app/services/cv_generator_primitives.py`, function `_text_width` — shared glyph-width measurement (`reportlab` `stringWidth` via `PDF_Generator._resolve_font`, falling back to a character-count estimate when font resolution fails), promoted out of `cv_templates/templates/axis.py` so both Axis's existing timeline chip row and the new shared chip mode measure text the same way
- `backend/app/services/cv_templates/shared/text.py`, functions `_layout_skill_chips`, `_measure_skill_chips_row`, `_place_skill_chips_row`, and the `mode="chips"` branch inside `_place_skills_section` / `_measure_skill_group`

Tests:

- `backend/tests/test_cv_generator_primitives.py` — `_rect` backward compatibility, `_text_width` sanity and fallback
- `backend/tests/test_skill_chips.py` — row-wrapping correctness, measure/place height agreement, page-break `keep_together` behavior for a long chip category, and rendered `rectangle`/`text` element shape
```

- [ ] **Step 3: Insert the matching Polish subsection**

Insert the Polish counterpart in `README.md`'s Polish part, immediately after "Przełącznik układu sekcji płaskich (w linii ↔ lista punktowana)"'s Tests list and before the next `###` heading (its English sibling is `Too-long CV assistant`; find its Polish equivalent heading with the grep from Step 1 and insert directly before it):

```markdown
### Chipsy umiejętności — pigułki (możliwość dostępna tylko w backendzie)

`_place_skills_section` w `backend/app/services/cv_templates/shared/text.py` przyjmuje trzeci styl ciała sekcji, `mode="chips"`, obok istniejących stylów `"inline"` (wiersz z kropkami) i `"bullets"` (pionowa lista punktowana), które obsługuje przełącznik opisany wyżej. W trybie `chips` każdy skill w kategorii renderuje się jako osobny, w pełni wypełniony, zaokrąglony element `rectangle` z wyśrodkowaną etykietą `text` na wierzchu, zawijany do kolejnych wierszy, gdy pigułki w wierszu przekroczyłyby szerokość sekcji. Zawijanie liczy raz `_layout_skill_chips`, współdzielone między przebiegiem pomiarowym (`_measure_skill_chips_row`) a przebiegiem renderującym (`_place_skill_chips_row`), więc oba nigdy nie mogą się rozjechać co do liczby wierszy — etykieta kategorii wraz ze wszystkimi wierszami pigułek jest zmierzona z góry, a następnie wyemitowana wewnątrz tego samego bloku `Builder.keep_together`, którego już używa tryb `inline`/`bullets`, więc kategoria nigdy nie zostaje przecięta w połowie wiersza pigułek między stronami.

To możliwość na poziomie generatora, jeszcze nie włączona w żadnym wydanym szablonie — żaden szablon obecnie nie przekazuje `mode="chips"`, nie ma też dla niej przełącznika widocznego dla użytkownika (w odróżnieniu od przełącznika inline/bullets opisanego wyżej, sterowanego przez `FlatSectionLayoutToggle` w edytorze canvas). Włączenie jej dla konkretnego szablonu to niewielka, lokalna dla szablonu zmiana: przekazanie `mode="chips"`, `chip_bg` i `chip_fg` (kolorów z własnej palety szablonu) do istniejącego wywołania `_place_skills_section` w tym szablonie.

Implementacja:

- `backend/app/services/cv_generator_primitives.py`, funkcja `_rect` — zyskała argumenty nazwane `filled` / `borderRadius` (wcześniej tylko obrys; `_circle`/`_ellipse` już wspierały `filled`)
- `backend/app/services/cv_generator_primitives.py`, funkcja `_text_width` — współdzielony pomiar szerokości glifów (`reportlab` `stringWidth` przez `PDF_Generator._resolve_font`, z fallbackiem do szacowania po liczbie znaków, gdy rozwiązanie fontu się nie powiedzie), przeniesiona z `cv_templates/templates/axis.py`, żeby istniejący wiersz chipsów osi czasu w Axis i nowy współdzielony tryb chips mierzyły tekst tak samo
- `backend/app/services/cv_templates/shared/text.py`, funkcje `_layout_skill_chips`, `_measure_skill_chips_row`, `_place_skill_chips_row` oraz gałąź `mode="chips"` wewnątrz `_place_skills_section` / `_measure_skill_group`

Testy:

- `backend/tests/test_cv_generator_primitives.py` — wsteczna kompatybilność `_rect`, poprawność i fallback `_text_width`
- `backend/tests/test_skill_chips.py` — poprawność zawijania wierszy, zgodność wysokości między przebiegiem pomiarowym a renderującym, zachowanie `keep_together` przy podziale stron dla długiej kategorii chipsów, kształt wyrenderowanych elementów `rectangle`/`text`
```

- [ ] **Step 4: Verify Markdown structure**

Run: `grep -n "^### " README.md | grep -i "chip\|Chipsy"`
Expected: two matches, one under the English section, one under the Polish section, each correctly nested between their neighboring `###` headings.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document mode=chips skill-pill capability (EN + PL)"
```

## Self-Review Notes

- **Spec coverage:** decision #1 (backend-only) → no frontend files touched anywhere in this plan. Decision #2 (shared, opt-in mode) → Task 4's `mode` parameter defaults to `"inline"`; `test_inline_mode_is_unchanged` guards it. Decision #3 (palette-driven color) → `chip_bg`/`chip_fg` params, no new config field. Decision #4 (whole-block page break) → `test_whole_wrapped_chip_block_moves_to_next_page_when_it_does_not_fit` and `test_grouped_skills_keep_category_and_its_pills_on_one_page`. Spec section 5's `_rect` backward-compat requirement → Task 1. README requirement (`CLAUDE.md`) → Task 5.
- **Placeholder scan:** no TBD/TODO; every step has literal code or literal README prose, not descriptions of what to write.
- **Type consistency:** `_layout_skill_chips` → `_measure_skill_chips_row`/`_place_skill_chips_row` (Task 3) → `_measure_skill_group`/`_place_skills_section` (Task 4) all use the same parameter order `(items, width, font, fs)` / `(b, items, left, width, font, fs, chip_bg, chip_fg)` throughout; verified no drift between the Interfaces blocks and the actual code in later tasks.
