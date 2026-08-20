# Masthead Identity Toggles — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two inline masthead-identity toggles — a reversible name-case toggle and a title/role-line show-hide with reflow — to the eight contact-band templates (Harbor, Atrium, Portico, Cardinal, Tessera, Slate, Nova, Volt).

**Architecture:** Extends the Phase-1/2 contact-band foundation. (1) A parity-safe `textTransform` element field, honored identically by the canvas (CSS) and the PDF renderer, so uppercasing is reversible and byte-stable. (2) Masthead identity tags (`mastheadRole`, `mastheadBandId`) plus a zero-footprint identity anchor carrying a descriptor, mirroring `build_contact_band_anchor`. (3) A pure client engine (`mastheadIdentityOps.js`) that flips the case flag and, for the title, removes/re-adds the element and shifts downstream flow by the title's block height via the existing `reconcileDocumentPages` primitive. (4) An inline hover overlay reusing the Phase-1/2 hover helpers.

**Tech Stack:** Python 3.11 / FastAPI / ReportLab / Pydantic (backend); React 19 / Vite / CSS Modules (frontend); `node:test` for pure JS units, `pytest` for backend.

**Spec:** `docs/superpowers/specs/2026-08-20-masthead-identity-toggles-design.md`

## Global Constraints

- Masthead roles, exact strings: `name`, `title`. Identity band id: `"masthead-main"`. Contact band id (existing): `"contact-main"`.
- `textTransform` values, exact strings: `"uppercase"`, `"none"` (or absent/`null` = no transform).
- Geometry units are CSS px == PDF points. Fonts resolve Helvetica/Courier → Inter on canvas (`canvasFontFamily`).
- No backend re-render for correctness: canvas element positions + the `textTransform` flag are authoritative for the PDF. The renderer must uppercase the identical string so existing PDFs stay byte-stable.
- Legacy documents (no identity anchor) must behave exactly as today. No DB migration. Old baked-in uppercase names keep their caps and simply have no toggle.
- Follow DESIGN.md for any UI: white surface chip, 1px hairline grey border, subtle sharp shadow, 0px radius, no emojis (Feather icons via `react-icons/fi`).
- `blockPt` (title reflow delta) = `contact_band_start_y - title_top`, computed by each template from geometry it already owns. The client never guesses it from positions.
- README.md (EN + PL) must be updated in the same change that ships user-facing behaviour (project CLAUDE.md rule).

## File Structure

Backend:
- `backend/app/schemas/pdf_schema.py` (modify) — add `textTransform`, `mastheadRole`, `mastheadBandId`, `mastheadIdentity` to `PdfElement`.
- `backend/app/services/pdf_generator.py` (modify) — `renderText` honors `textTransform`; call site passes it.
- `backend/app/services/cv_templates/shared/masthead.py` (create) — `tag_masthead_identity`, `build_masthead_identity_anchor`.
- `backend/app/services/cv_templates/templates/{harbor,atrium,portico,cardinal,tessera,slate,nova,volt}.py` (modify) — drop inline `.upper()`, call the helper, append the anchor.
- `backend/app/crud/pdfs.py` (modify) — round-trip the four new fields (1 unpack site ~lines 53–106; 3 pack sites ~182, ~321, ~377).

Frontend:
- `frontend/src/components/canvas/Text/Text.jsx` + `Text.module.css` (modify) — apply `text-transform` from `element.textTransform` (display-only).
- `frontend/src/components/canvas/CanvasElements/CanvasElements.jsx` (modify) — pass `textTransform` to `Text`; render `MastheadIdentityControls`.
- `frontend/src/utils/mastheadIdentityOps.js` (create) + `.test.js` — pure case/title ops.
- `frontend/src/utils/mastheadBands.js` (create) + `.test.js` — enumerate identity blocks for the UI (mirrors `contactBands.js`).
- `frontend/src/hooks/useA4Elements.js` (modify) — `toggleNameCase`, `toggleTitle` ops via `setA4_Elements`.
- `frontend/src/components/canvas/MastheadIdentityControls/` (create) — inline hover UI.
- `frontend/src/store/pdfgenerator-context.jsx` (modify) — default no-op stubs.
- `frontend/src/pages/PdfCanvas.jsx` (modify) — destructure + expose the two ops in the provider value.

Docs:
- `README.md` (EN + PL), `shared/pdf-element.schema.json` (regenerate).

---

### Task 1: Parity-safe `textTransform` field (schema + renderer + round-trip)

The foundation: an element field the canvas and PDF both honor, so uppercasing is reversible and existing PDFs stay byte-stable. This task is backend-only and independently testable via the renderer.

**Files:**
- Modify: `backend/app/schemas/pdf_schema.py`
- Modify: `backend/app/services/pdf_generator.py`
- Modify: `backend/app/crud/pdfs.py`
- Test: `backend/tests/test_text_transform.py` (create)

**Interfaces:**
- Produces: `PdfElement.textTransform: Optional[str]`; `PDF_Generator.renderText(..., textTransform=None)` uppercases `content` when `textTransform == "uppercase"`.

- [ ] **Step 1: Write the failing renderer test**

```python
# backend/tests/test_text_transform.py
"""renderText applies the textTransform flag so canvas-uppercased names render
uppercase in the PDF while the stored content keeps its original case."""
from app.services.pdf_generator import PDF_Generator


def _capturing_generator():
    gen = PDF_Generator(page_width=595, page_height=842)
    drawn = []
    # _draw_text_line is the single choke point every text draw funnels through.
    gen._draw_text_line = lambda x, y, text, *a, **k: drawn.append(text)  # type: ignore
    return gen, drawn


def test_render_text_uppercases_when_flagged():
    gen, drawn = _capturing_generator()
    gen.renderText(10, 10, "Inter", 12, "#000000", "Jan Kowalski", textTransform="uppercase")
    assert drawn == ["JAN KOWALSKI"]


def test_render_text_leaves_content_untouched_without_flag():
    gen, drawn = _capturing_generator()
    gen.renderText(10, 10, "Inter", 12, "#000000", "Jan Kowalski")
    assert drawn == ["Jan Kowalski"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_text_transform.py -q`
Expected: FAIL (`renderText` has no `textTransform` parameter).

- [ ] **Step 3: Add `textTransform` to `renderText`**

In `pdf_generator.py`, change the `renderText` signature (line ~544) to accept the flag and uppercase before drawing:

```python
    def renderText(self, left, top, fontFamily, fontSize, color, content, bold=False, italic=False, underline=False, runs=None, textTransform=None):
        # Display-and-render casing (Phase 3 masthead identity). Uppercasing here
        # keeps the STORED content original-case so the toggle is reversible, while
        # the drawn glyphs match the canvas. Uppercase preserves character count, so
        # any `runs` style ranges (index-based) stay aligned with the transformed
        # string.
        if textTransform == "uppercase" and content:
            content = content.upper()
        corrected_y = self.page_h - top - fontSize * 0.34
```

(The rest of the method body is unchanged.)

- [ ] **Step 4: Pass the flag from the render loop**

At the `category == "text"` call site (line ~1134), add the flag argument:

```python
                if category == "text":
                    self.renderText(
                        element.left, element.top, element.fontFamily, element.fontSize, element.color, element.content,
                        getattr(element, "bold", False), getattr(element, "italic", False), getattr(element, "underline", False),
                        getattr(element, "runs", None),
                        getattr(element, "textTransform", None),
                    )
```

- [ ] **Step 5: Add the schema field**

In `pdf_schema.py`, after the `contactBand` field (line ~165) add:

```python
    # Display-and-render casing transform (Phase 3 masthead identity). "uppercase"
    # makes the canvas (CSS) and the PDF renderer uppercase the drawn glyphs while
    # `content` keeps its original case, so the name-case toggle is reversible.
    textTransform: Optional[str] = None
    # Masthead identity (Phase 3). `mastheadRole` marks the name/title elements;
    # `mastheadBandId` links them + the identity anchor; `mastheadIdentity` is the
    # reflow descriptor carried only on that anchor (flowRole "masthead-anchor").
    mastheadRole: Optional[str] = None
    mastheadBandId: Optional[str] = None
    mastheadIdentity: Optional[dict[str, Any]] = None
```

- [ ] **Step 6: Round-trip the fields through `extra_properties`**

In `pdfs.py`, add the four keys to the **unpack** block (near the `contactBand=extra.get("contactBand"),` line ~106):

```python
            textTransform=extra.get("textTransform"),
            mastheadRole=extra.get("mastheadRole"),
            mastheadBandId=extra.get("mastheadBandId"),
            mastheadIdentity=extra.get("mastheadIdentity"),
```

Then add the same four keys to **each of the three pack blocks** (after `"contactBand": getattr(element, "contactBand", None),` at ~188, ~327, ~383):

```python
                "textTransform": getattr(element, "textTransform", None),
                "mastheadRole": getattr(element, "mastheadRole", None),
                "mastheadBandId": getattr(element, "mastheadBandId", None),
                "mastheadIdentity": getattr(element, "mastheadIdentity", None),
```

(Match each block's existing indentation.)

- [ ] **Step 7: Add the round-trip test**

```python
# append to backend/tests/test_text_transform.py
from app.crud.pdfs import _element_from_row  # adjust to the actual unpack fn name


class _Row:
    """Minimal stand-in for a PdfElements ORM row."""
    def __init__(self, extra):
        self.category = "text"; self.content = "Jan"; self.left = 0; self.top = 0
        self.width = 0; self.height = 0; self.fontSize = 12; self.fontFamily = "Inter"
        self.color = "#000"; self.page = 1; self.element_id = "n1"
        self.extra_properties = extra


def test_masthead_fields_round_trip_through_extra_properties():
    row = _Row({"textTransform": "uppercase", "mastheadRole": "name",
                "mastheadBandId": "masthead-main",
                "mastheadIdentity": {"id": "masthead-main"}})
    el = _element_from_row(row)
    assert el.textTransform == "uppercase"
    assert el.mastheadRole == "name"
    assert el.mastheadBandId == "masthead-main"
    assert el.mastheadIdentity == {"id": "masthead-main"}
```

> **Note for the implementer:** confirm the unpack function's real name and call shape by reading `pdfs.py` around line 44–106 (the docstring names it as the row→flat unpacker). Adjust the import and instantiation to match; the existing `tests/test_elements_from_rows.py` shows the correct call shape.

- [ ] **Step 8: Run the full task test + regression**

Run: `cd backend && python -m pytest tests/test_text_transform.py tests/test_elements_from_rows.py tests/test_pdf_element_updates.py -q`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/pdf_schema.py backend/app/services/pdf_generator.py backend/app/crud/pdfs.py backend/tests/test_text_transform.py
git commit -m "feat(masthead): parity-safe textTransform field + round-trip"
```

---

### Task 2: Backend masthead identity helper (`shared/masthead.py`)

A shared helper that tags the name/title elements, seeds the reversible case default, captures the title spec for re-add, and returns the zero-footprint identity anchor.

**Files:**
- Create: `backend/app/services/cv_templates/shared/masthead.py`
- Test: `backend/tests/test_masthead_identity.py` (create)

**Interfaces:**
- Produces:
  - `build_masthead_identity_anchor(descriptor: dict, *, page: int = 1) -> dict`
  - `tag_masthead_identity(name_el: dict, title_el: dict | None, *, band_id: str, name_default_uppercase: bool, band_top: float, title_default_uppercase: bool = False, contact_band_id: str | None = None) -> dict` — mutates `name_el`/`title_el` in place (stamps roles, sets `textTransform` on defaults) and returns the identity anchor.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_masthead_identity.py
"""The masthead identity helper tags name/title, seeds reversible uppercase
defaults, records the title spec + reflow blockPt, and returns the anchor."""
from app.services.cv_generator_primitives import _text
from app.services.cv_templates.shared.masthead import (
    build_masthead_identity_anchor,
    tag_masthead_identity,
)


def test_tag_masthead_identity_tags_and_builds_descriptor():
    name_el = _text("Jan Kowalski", 23, "Inter", "#2B2B2B", 44, 44, zIndex=3, bold=True)
    title_el = _text("AML Analyst", 11, "Inter", "#17A2B8", 44, 80, zIndex=3)
    anchor = tag_masthead_identity(
        name_el, title_el, band_id="masthead-main",
        name_default_uppercase=True, band_top=104.0,
        contact_band_id="contact-main",
    )
    # Name is tagged and defaults to uppercase (reversible: content untouched).
    assert name_el["mastheadRole"] == "name"
    assert name_el["mastheadBandId"] == "masthead-main"
    assert name_el["textTransform"] == "uppercase"
    assert name_el["content"] == "Jan Kowalski"
    # Title is tagged; the descriptor captures its spec + reflow delta.
    assert title_el["mastheadRole"] == "title"
    desc = anchor["mastheadIdentity"]
    assert anchor["flowRole"] == "masthead-anchor"
    assert anchor["mastheadBandId"] == "masthead-main"
    assert desc["title"]["present"] is True
    assert desc["title"]["blockPt"] == 24.0  # 104 - 80
    assert desc["title"]["spec"]["content"] == "AML Analyst"
    assert desc["title"]["spec"]["top"] == 80.0
    assert desc["contactBandId"] == "contact-main"


def test_tag_masthead_identity_without_title():
    name_el = _text("Jan Kowalski", 23, "Inter", "#2B2B2B", 44, 44, zIndex=3)
    anchor = tag_masthead_identity(
        name_el, None, band_id="masthead-main",
        name_default_uppercase=False, band_top=100.0,
    )
    desc = anchor["mastheadIdentity"]
    assert "textTransform" not in name_el  # no default → no flag
    assert desc["title"]["present"] is False
    assert desc["title"]["spec"] is None
    assert desc["name"]["defaultUppercase"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_masthead_identity.py -q`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `shared/masthead.py`**

```python
"""Masthead identity helpers for CV template generators (Phase 3).

Tags the name/title elements so the client masthead-identity manager can toggle
the name's case and hide/show the title, and emits a zero-footprint anchor
carrying the reflow descriptor. Mirrors `shared/contact.py`'s band-anchor model.
"""
from __future__ import annotations

from typing import Any


def build_masthead_identity_anchor(descriptor: dict[str, Any], *, page: int = 1) -> dict:
    """Zero-footprint anchor carrying a masthead identity descriptor.

    Empty ``content`` draws nothing; ``flowRole`` "masthead-anchor" keeps the
    structural section detector from treating it as a heading. The client reads
    ``mastheadIdentity`` off this element to toggle name case / title visibility.
    """
    return {
        "category": "text", "content": "",
        "left": 0, "top": 0, "width": 0, "height": 0,
        "fontSize": 1, "fontFamily": "Inter", "color": "#000000",
        "zIndex": 0, "page": page,
        "flowRole": "masthead-anchor",
        "mastheadIdentity": descriptor,
        "mastheadBandId": descriptor["id"],
    }


def tag_masthead_identity(
    name_el: dict,
    title_el: dict | None,
    *,
    band_id: str,
    name_default_uppercase: bool,
    band_top: float,
    title_default_uppercase: bool = False,
    contact_band_id: str | None = None,
) -> dict:
    """Stamp identity onto the name/title elements (in place) and build the anchor.

    ``name_default_uppercase`` / ``title_default_uppercase`` seed the reversible
    ``textTransform`` flag for templates whose design uppercases these lines, so
    the stored ``content`` stays original-case. ``band_top`` is the contact
    band's start Y; ``blockPt`` (the amount downstream flow shifts when the title
    is hidden) is ``band_top - title_top``.
    """
    name_el["mastheadRole"] = "name"
    name_el["mastheadBandId"] = band_id
    if name_default_uppercase:
        name_el["textTransform"] = "uppercase"

    title_spec: dict | None = None
    block_pt = 0.0
    if title_el is not None:
        title_el["mastheadRole"] = "title"
        title_el["mastheadBandId"] = band_id
        if title_default_uppercase:
            title_el["textTransform"] = "uppercase"
        title_top = float(title_el.get("top", 0.0))
        block_pt = float(band_top) - title_top
        title_spec = {
            "content": title_el.get("content", ""),
            "left": title_el.get("left"),
            "top": title_top,
            "fontSizePt": title_el.get("fontSize"),
            "fontFamily": title_el.get("fontFamily"),
            "colorHex": title_el.get("color"),
            "letterSpacing": title_el.get("letterSpacing"),
            "textTransform": title_el.get("textTransform", "none"),
            "bold": bool(title_el.get("bold", False)),
        }

    descriptor = {
        "id": band_id,
        "name": {"defaultUppercase": bool(name_default_uppercase)},
        "title": {"spec": title_spec, "blockPt": block_pt,
                  "present": title_el is not None},
        "contactBandId": contact_band_id,
    }
    return build_masthead_identity_anchor(descriptor)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_masthead_identity.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/cv_templates/shared/masthead.py backend/tests/test_masthead_identity.py
git commit -m "feat(masthead): identity tagging helper + anchor builder"
```

---

### Task 3: Wire the eight templates (drop baked `.upper()`, append anchor)

Each template builds name/title as today but stops baking `.upper()`, tags them via the helper, and appends the identity anchor. Uppercasing moves to the reversible `textTransform` flag, so drawn PDFs stay byte-identical.

**Files:**
- Modify: `backend/app/services/cv_templates/templates/{harbor,atrium,portico,cardinal,tessera,slate,nova,volt}.py`
- Test: `backend/tests/test_masthead_templates.py` (create)

**Interfaces:**
- Consumes: `tag_masthead_identity` (Task 2), each template's existing contact band `start_y`.
- Produces: every one of the eight templates emits a `flowRole="masthead-anchor"` element whose `mastheadIdentity.id == "masthead-main"`, with the name element tagged `mastheadRole="name"` and (when the CV has a title) a `mastheadRole="title"` element.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_masthead_templates.py
"""Every contact-band template emits a masthead identity anchor + tagged name,
and templates that used to bake `.upper()` now carry the reversible flag with
original-case content."""
import pytest
from app.services.cv_templates.registry import get_template  # adjust to real accessor

_CV = {
    "name": "Jan Kowalski", "title": "AML Analyst",
    "phone": "+48 111 222 333", "email": "jan@example.com",
    "linkedin": "linkedin.com/in/jan", "location": "Warszawa",
    "summary": "x", "experience": [], "education": [], "skills": ["A"],
}

_UPPERCASE_NAME = {"harbor", "tessera", "slate"}


def _by_role(elements, role):
    return next((e for e in elements if e.get("mastheadRole") == role), None)


@pytest.mark.parametrize("template_id", [
    "harbor", "atrium", "portico", "cardinal", "tessera", "slate", "nova", "volt",
])
def test_template_emits_masthead_identity(template_id):
    elements = get_template(template_id)(_CV)
    anchor = next((e for e in elements if e.get("flowRole") == "masthead-anchor"
                   and e.get("mastheadIdentity")), None)
    assert anchor is not None, f"{template_id} has no masthead identity anchor"
    assert anchor["mastheadIdentity"]["id"] == "masthead-main"

    name_el = _by_role(elements, "name")
    assert name_el is not None
    # Content keeps original case regardless of the drawn default.
    assert name_el["content"] == "Jan Kowalski"
    if template_id in _UPPERCASE_NAME:
        assert name_el.get("textTransform") == "uppercase"
    else:
        assert name_el.get("textTransform") in (None, "none")
```

> **Note for the implementer:** confirm the real generator accessor (`get_template(...)(cv)`) against `tests/test_cv_template_layouts.py` before running, exactly as Phase-2's `test_contact_band_templates.py` did.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_masthead_templates.py -q`
Expected: FAIL (no anchor; and uppercase templates still bake `.upper()`).

- [ ] **Step 3: Wire Harbor (reference implementation)**

In `harbor.py`: change line 59 from `.upper()` to plain:

```python
    name = _compact_text(cv.get("name"), 32)
```

Change the `header` construction (lines 61–64) to keep references to the name/title dicts:

```python
    name_el = {**_text(name, 23, SANS, C["ink"], MAIN_X, 44, zIndex=3, bold=True), "letterSpacing": 0.3}
    title_el = _text(title, 11, SANS, C["accent"], MAIN_X, 80, zIndex=3)
    header = [name_el, title_el]
```

Add `tag_masthead_identity` to the shared import and, after the contact band anchor is appended (line ~117), append the identity anchor (Harbor's contact `start_y` is `104.0`, so `band_top=104.0`; name was uppercased by design):

```python
    from app.services.cv_templates.shared.masthead import tag_masthead_identity
    header.append(tag_masthead_identity(
        name_el, title_el if title else None,
        band_id="masthead-main", name_default_uppercase=True,
        band_top=104.0, contact_band_id="contact-main",
    ))
```

- [ ] **Step 4: Wire the remaining seven templates**

Apply the same three changes (drop `.upper()`, capture `name_el`/`title_el`, append `tag_masthead_identity(...)`) in each file. Use each template's own contact-band `start_y` for `band_top`, and set the `*_default_uppercase` flags to match the `.upper()` calls you are removing (from the grep in the spec). Read each file's header block first; the name/title `_text(...)` calls and the contact `start_y` are at these lines:

| Template | name/title lines | `name_default_uppercase` | `title_default_uppercase` | `band_top` = contact `start_y` |
|---|---|---|---|---|
| atrium | 69–70 | False | False | its `_place_centered_icon_contacts` `start_y` |
| portico | 52–53 | False | False | its centered `start_y` |
| cardinal | 30–31 | False | False | its `_place_wrapping_icon_contacts` `start_y` |
| tessera | 206–207 | True | True | its wrapping `start_y` |
| slate | 214–215 | True | True | its wrapping `start_y` |
| nova | 72–73 | False | False | its `_place_stacked_icon_contacts` `start_y` |
| volt | 20–21 | False | False | its `_place_chip_icon_contacts` `start_y` |

For each: remove `.upper()` from the `name`/`title` assignment lines listed, bind the `_text(...)` results to `name_el` / `title_el`, put them in the header/element list in place of the inline dicts, and append `tag_masthead_identity(name_el, title_el if title else None, band_id="masthead-main", name_default_uppercase=<col>, title_default_uppercase=<col>, band_top=<start_y>, contact_band_id="contact-main")` after the contact anchor append. Import `tag_masthead_identity` in each file.

- [ ] **Step 5: Run the identity test**

Run: `cd backend && python -m pytest tests/test_masthead_templates.py -q`
Expected: PASS for all eight rows.

- [ ] **Step 6: Regression — drawn geometry + text unchanged**

Run: `cd backend && python -m pytest tests/test_cv_template_layouts.py tests/test_contact_band_templates.py tests/test_contact_links.py -q`
Expected: PASS. The `.upper()` → flag move must not change drawn output; if a layout golden references the name/title string case, confirm the renderer (Task 1) uppercases it to the identical glyphs before adjusting anything.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/cv_templates/templates/ backend/tests/test_masthead_templates.py
git commit -m "feat(masthead): tag name/title + emit identity anchor on all 8 templates"
```

---

### Task 4: Canvas renders `textTransform` (display-only)

The canvas mirror of Task 1: a name/title element with `textTransform:"uppercase"` renders uppercase via CSS without altering the serialized `content`.

**Files:**
- Modify: `frontend/src/components/canvas/Text/Text.jsx`
- Modify: `frontend/src/components/canvas/Text/Text.module.css`
- Modify: `frontend/src/components/canvas/CanvasElements/CanvasElements.jsx`

**Interfaces:**
- Consumes: `element.textTransform` (set by the backend / Task 5 ops).
- Produces: a `Text` whose `style.textTransform` follows the prop; `serializeEditable`/`onInput` are unchanged, so the transform never enters `content`.

- [ ] **Step 1: Add the `textTransform` prop in `Text.jsx`**

Add `textTransform` to the destructured props (next to `placeholder`), and add it to the `style` object (after `textDecoration`):

```javascript
        // Display-only casing (Phase 3). CSS transforms the rendered glyphs while
        // the contentEditable value stays original-case, so the name-case toggle
        // is reversible and serialization is unchanged.
        textTransform: textTransform || "none",
```

- [ ] **Step 2: Pass the prop from `CanvasElements.jsx`**

In the `element.category === "text"` branch (where `placeholder={element.placeholder}` was added in Phase 2), add:

```javascript
              textTransform={element.textTransform}
```

- [ ] **Step 3: Guard the placeholder against the transform (CSS)**

The `::before` placeholder must not be uppercased by an inherited transform. In `Text.module.css`, extend the existing placeholder rule so the hint keeps its intended case:

```css
.textElement[data-placeholder]:empty::before {
    content: attr(data-placeholder);
    color: #808080;
    text-transform: none;
}
```

- [ ] **Step 4: Build to verify compilation**

Run: `cd frontend && npx vite build`
Expected: build succeeds. (Behaviour is verified end-to-end in Task 8 QA.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/canvas/Text/Text.jsx frontend/src/components/canvas/Text/Text.module.css frontend/src/components/canvas/CanvasElements/CanvasElements.jsx
git commit -m "feat(masthead): render textTransform on canvas (display-only)"
```

---

### Task 5: Pure client engine — `mastheadIdentityOps.js`

The reversible case flip and the title hide/show reflow, as a pure, unit-tested module mirroring `contactBandOps.js`.

**Files:**
- Create: `frontend/src/utils/mastheadIdentityOps.js`
- Test: `frontend/src/utils/mastheadIdentityOps.test.js`

**Interfaces:**
- Consumes: `reconcileDocumentPages` from `./structureOperation.js`.
- Produces:
  - `applyNameCaseToggle(elements, bandId) -> { elements }` — flips the name element's `textTransform` between `"uppercase"` and `"none"`; positions untouched.
  - `applyTitleToggle(elements, bandId, createId) -> { elements, pageCount }` — hides (removes title, shifts non-fixed elements at/below the title up by `blockPt`, decrements the coupled contact band `startY`, marks `title.present=false`) or shows (reconstructs the title from `spec`, reverses the shift, marks `present=true`).

- [ ] **Step 1: Write the failing tests**

```javascript
// frontend/src/utils/mastheadIdentityOps.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { applyNameCaseToggle, applyTitleToggle } from "./mastheadIdentityOps.js";

// Minimal masthead: identity anchor + name + title, a contact band anchor whose
// startY is coupled to the title, one contact chip, a header rule, one section,
// and a fixedToPage footer that must never move.
function doc() {
  return [
    { element_id: "mid", category: "text", content: "", flowRole: "masthead-anchor",
      mastheadBandId: "masthead-main", top: 0, page: 1,
      mastheadIdentity: {
        id: "masthead-main", name: { defaultUppercase: true },
        title: { present: true, blockPt: 24,
          spec: { content: "AML Analyst", left: 44, top: 80, fontSizePt: 11,
                  fontFamily: "Inter", colorHex: "#17A2B8", textTransform: "none", bold: false } },
        contactBandId: "contact-main" } },
    { element_id: "name", category: "text", content: "Jan Kowalski", mastheadRole: "name",
      mastheadBandId: "masthead-main", textTransform: "uppercase", left: 44, top: 44, page: 1 },
    { element_id: "title", category: "text", content: "AML Analyst", mastheadRole: "title",
      mastheadBandId: "masthead-main", left: 44, top: 80, page: 1 },
    { element_id: "cba", category: "text", content: "", flowRole: "masthead-anchor",
      contactBandId: "contact-main", top: 0, page: 1,
      contactBand: { id: "contact-main", mode: "wrapping", anchor: { startX: 44, startY: 104, rightLimit: 551 } } },
    { element_id: "chip", category: "text", content: "+48", contactBandId: "contact-main",
      contactChannel: "phone", left: 44, top: 104, page: 1 },
    { element_id: "rule", category: "line", flowRole: "masthead", left: 44, top: 126, page: 1 },
    { element_id: "sec", category: "text", content: "SUMMARY", left: 44, top: 146, page: 1 },
    { element_id: "foot", category: "text", content: "01", fixedToPage: true, left: 535, top: 812, page: 1 },
  ];
}

test("name case toggle flips the flag reversibly and touches nothing else", () => {
  const off = applyNameCaseToggle(doc(), "masthead-main").elements;
  assert.equal(off.find((e) => e.element_id === "name").textTransform, "none");
  const on = applyNameCaseToggle(off, "masthead-main").elements;
  assert.equal(on.find((e) => e.element_id === "name").textTransform, "uppercase");
  // Positions unchanged.
  assert.equal(on.find((e) => e.element_id === "name").top, 44);
});

test("title hide removes it, shifts below up by blockPt, updates band startY, keeps footer", () => {
  const { elements } = applyTitleToggle(doc(), "masthead-main", () => "id");
  assert.equal(elements.find((e) => e.element_id === "title"), undefined);
  assert.equal(elements.find((e) => e.element_id === "chip").top, 104 - 24);
  assert.equal(elements.find((e) => e.element_id === "rule").top, 126 - 24);
  assert.equal(elements.find((e) => e.element_id === "sec").top, 146 - 24);
  assert.equal(elements.find((e) => e.element_id === "foot").top, 812); // fixedToPage untouched
  assert.equal(elements.find((e) => e.element_id === "cba").contactBand.anchor.startY, 104 - 24);
  assert.equal(elements.find((e) => e.element_id === "mid").mastheadIdentity.title.present, false);
});

test("title show reconstructs the title from spec and reverses the shift", () => {
  const hidden = applyTitleToggle(doc(), "masthead-main", () => "id").elements;
  const { elements } = applyTitleToggle(hidden, "masthead-main", () => "new");
  const title = elements.find((e) => e.mastheadRole === "title");
  assert.ok(title, "title re-added");
  assert.equal(title.content, "AML Analyst");
  assert.equal(title.top, 80);
  assert.equal(elements.find((e) => e.element_id === "chip").top, 104);
  assert.equal(elements.find((e) => e.element_id === "cba").contactBand.anchor.startY, 104);
  assert.equal(elements.find((e) => e.element_id === "mid").mastheadIdentity.title.present, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && node --test src/utils/mastheadIdentityOps.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `mastheadIdentityOps.js`**

```javascript
/**
 * Masthead identity transforms (pure) — Phase 3.
 *
 * Two ops on the name/title identity block, both committed through the same
 * `setA4_Elements` + history path as the contact-band ops:
 *
 *   - applyNameCaseToggle: flip the name element's `textTransform` between
 *     "uppercase" and "none". Reversible and position-preserving (uppercasing
 *     grows glyphs in place; the stored box is not width-constrained).
 *   - applyTitleToggle: hide the title (remove it, shift everything at/below its
 *     top up by `blockPt`, nudge the coupled contact band's startY, mark absent)
 *     or show it (reconstruct from the stored spec, reverse the shift, mark
 *     present). `blockPt = contactBandStartY - titleTop`, fixed at generation.
 *
 * The identity anchor (flowRole "masthead-anchor", carrying `mastheadIdentity`)
 * and any fixedToPage chrome (page background, footer) are never shifted.
 */
import { reconcileDocumentPages } from "./structureOperation.js";

function identityAnchor(elements, bandId) {
  return elements.find(
    (el) => el.mastheadBandId === bandId && el.flowRole === "masthead-anchor" && el.mastheadIdentity,
  ) ?? null;
}

function identityDescriptor(elements, bandId) {
  return identityAnchor(elements, bandId)?.mastheadIdentity ?? null;
}

/** Flip the name element's case flag; positions untouched. No reflow. */
export function applyNameCaseToggle(elements, bandId) {
  if (!identityDescriptor(elements, bandId)) return { elements };
  let changed = false;
  const next = elements.map((el) => {
    if (el.mastheadBandId === bandId && el.mastheadRole === "name") {
      changed = true;
      return { ...el, textTransform: el.textTransform === "uppercase" ? "none" : "uppercase" };
    }
    return el;
  });
  return changed ? { elements: next } : { elements };
}

// Shift one element by `delta` when it sits at/below `boundaryTop` and is not
// page-fixed chrome. The coupled contact band anchor is special-cased: its
// descriptor `startY` moves with the band so later channel reflows use the new
// origin. The identity anchor (top 0) and the name (above the title) are never
// caught by the boundary test.
function shiftBelow(el, boundaryTop, delta, contactBandId) {
  if (el.flowRole === "masthead-anchor" && el.contactBand && el.contactBandId === contactBandId) {
    const anchor = { ...el.contactBand.anchor };
    if (typeof anchor.startY === "number") anchor.startY += delta;
    return { ...el, contactBand: { ...el.contactBand, anchor } };
  }
  if (el.fixedToPage) return el;
  if (typeof el.top === "number" && el.top >= boundaryTop) {
    return { ...el, top: el.top + delta };
  }
  return el;
}

function setTitlePresence(elements, bandId, present) {
  return elements.map((el) => {
    if (el.mastheadBandId === bandId && el.flowRole === "masthead-anchor" && el.mastheadIdentity) {
      const identity = el.mastheadIdentity;
      return { ...el, mastheadIdentity: { ...identity, title: { ...identity.title, present } } };
    }
    return el;
  });
}

function namePage(elements, bandId) {
  const name = elements.find((el) => el.mastheadBandId === bandId && el.mastheadRole === "name");
  return name?.page ?? 1;
}

function hideTitle(elements, bandId, descriptor, blockPt, createId) {
  const title = elements.find(
    (el) => el.mastheadBandId === bandId && el.mastheadRole === "title",
  );
  if (!title) return { elements };
  const boundaryTop = Number(title.top) || 0;
  const contactBandId = descriptor.contactBandId;
  const withoutTitle = elements.filter((el) => el !== title);
  const shifted = withoutTitle.map((el) => shiftBelow(el, boundaryTop, -blockPt, contactBandId));
  const marked = setTitlePresence(shifted, bandId, false);
  const reconciled = reconcileDocumentPages(marked, createId, { collapseEmpty: true });
  return { elements: reconciled.elements, pageCount: reconciled.pageCount };
}

function buildTitleElement(spec, bandId, createId, page) {
  const el = {
    element_id: createId("title"),
    category: "text",
    content: spec.content ?? "",
    left: spec.left, top: spec.top,
    fontSize: spec.fontSizePt, fontFamily: spec.fontFamily, color: spec.colorHex,
    zIndex: 3, page, flowRole: "masthead",
    mastheadRole: "title", mastheadBandId: bandId,
  };
  if (typeof spec.letterSpacing === "number") el.letterSpacing = spec.letterSpacing;
  if (spec.bold) el.bold = true;
  if (spec.textTransform && spec.textTransform !== "none") el.textTransform = spec.textTransform;
  // If the title was empty at generation, give the re-added element a hint + hit
  // area so the user can click it and type (same mechanism as added contacts).
  if (!spec.content) el.placeholder = "Stanowisko";
  return el;
}

function showTitle(elements, bandId, descriptor, blockPt, createId) {
  const spec = descriptor.title?.spec;
  if (!spec) return { elements };
  const boundaryTop = Number(spec.top) || 0;
  const contactBandId = descriptor.contactBandId;
  // Shift existing at/below-title content DOWN first (the band currently sits at
  // the title's top because the title was hidden), then insert the title.
  const shifted = elements.map((el) => shiftBelow(el, boundaryTop, +blockPt, contactBandId));
  const titleEl = buildTitleElement(spec, bandId, createId, namePage(elements, bandId));
  const withTitle = [...shifted, titleEl];
  const marked = setTitlePresence(withTitle, bandId, true);
  const reconciled = reconcileDocumentPages(marked, createId, { collapseEmpty: true });
  return { elements: reconciled.elements, pageCount: reconciled.pageCount };
}

/** Hide the title (when present) or show it (when hidden), reflowing downstream. */
export function applyTitleToggle(elements, bandId, createId) {
  const descriptor = identityDescriptor(elements, bandId);
  if (!descriptor) return { elements };
  const blockPt = Number(descriptor.title?.blockPt) || 0;
  const present = elements.some(
    (el) => el.mastheadBandId === bandId && el.mastheadRole === "title",
  );
  return present
    ? hideTitle(elements, bandId, descriptor, blockPt, createId)
    : showTitle(elements, bandId, descriptor, blockPt, createId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && node --test src/utils/mastheadIdentityOps.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/mastheadIdentityOps.js frontend/src/utils/mastheadIdentityOps.test.js
git commit -m "feat(masthead): pure name-case + title toggle engine"
```

---

### Task 6: Identity block enumerator — `mastheadBands.js`

Group the tagged identity elements into blocks the hover UI can render, mirroring `contactBands.js`.

**Files:**
- Create: `frontend/src/utils/mastheadBands.js`
- Test: `frontend/src/utils/mastheadBands.test.js`

**Interfaces:**
- Produces: `listMastheadBands(elements) -> Array<{ bandId, descriptor, name:{elementId,left,top,fontSize,uppercase}, title:{elementId,left,top,fontSize}|null, titlePresent:boolean }>`. Only blocks with both a descriptor anchor and a name element are returned (legacy/unmanaged → skipped).

- [ ] **Step 1: Write the failing test**

```javascript
// frontend/src/utils/mastheadBands.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { listMastheadBands } from "./mastheadBands.js";

function doc(withTitle = true) {
  const els = [
    { element_id: "mid", flowRole: "masthead-anchor", mastheadBandId: "masthead-main",
      mastheadIdentity: { id: "masthead-main", title: { present: withTitle } } },
    { element_id: "name", mastheadRole: "name", mastheadBandId: "masthead-main",
      left: 44, top: 44, fontSize: 23, textTransform: "uppercase" },
  ];
  if (withTitle) {
    els.push({ element_id: "title", mastheadRole: "title", mastheadBandId: "masthead-main",
      left: 44, top: 80, fontSize: 11 });
  }
  return els;
}

test("groups a managed identity block with name + title", () => {
  const [band] = listMastheadBands(doc());
  assert.equal(band.bandId, "masthead-main");
  assert.equal(band.name.uppercase, true);
  assert.equal(band.title.elementId, "title");
  assert.equal(band.titlePresent, true);
});

test("reports titlePresent=false when the title is hidden", () => {
  const [band] = listMastheadBands(doc(false));
  assert.equal(band.title, null);
  assert.equal(band.titlePresent, false);
});

test("skips a block with no descriptor anchor (legacy)", () => {
  const legacy = [{ element_id: "n", mastheadRole: "name", mastheadBandId: "x", left: 0, top: 0 }];
  assert.equal(listMastheadBands(legacy).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/utils/mastheadBands.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `mastheadBands.js`**

```javascript
/**
 * Group tagged masthead identity elements into blocks for the hover UI.
 *
 * A block is discoverable only when its zero-footprint anchor (flowRole
 * "masthead-anchor" carrying `mastheadIdentity`) and a `name` element are both
 * present, so legacy documents (no anchor) yield no controls and behave as today.
 */

/**
 * @param {object[]} elements - Canvas elements (typically page-filtered).
 * @returns {Array<{bandId:string, descriptor:object, name:object, title:object|null, titlePresent:boolean}>}
 */
export function listMastheadBands(elements) {
  const byBand = new Map();
  for (const el of elements) {
    if (!el.mastheadBandId) continue;
    if (!byBand.has(el.mastheadBandId)) {
      byBand.set(el.mastheadBandId, { bandId: el.mastheadBandId, descriptor: null, name: null, title: null });
    }
    const band = byBand.get(el.mastheadBandId);
    if (el.flowRole === "masthead-anchor" && el.mastheadIdentity) {
      band.descriptor = el.mastheadIdentity;
      continue;
    }
    if (el.mastheadRole === "name") {
      band.name = {
        elementId: el.element_id,
        left: Number(el.left) || 0, top: Number(el.top) || 0,
        fontSize: Number(el.fontSize) || 18,
        uppercase: el.textTransform === "uppercase",
      };
    } else if (el.mastheadRole === "title") {
      band.title = {
        elementId: el.element_id,
        left: Number(el.left) || 0, top: Number(el.top) || 0,
        fontSize: Number(el.fontSize) || 10,
      };
    }
  }

  const bands = [];
  for (const band of byBand.values()) {
    if (!band.descriptor || !band.name) continue; // unmanaged / legacy → no controls
    band.titlePresent = band.title != null;
    bands.push(band);
  }
  return bands;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/utils/mastheadBands.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/mastheadBands.js frontend/src/utils/mastheadBands.test.js
git commit -m "feat(masthead): identity block enumerator for the hover UI"
```

---

### Task 7: Inline hover UI + wiring

The canvas overlay (`MastheadIdentityControls`) and the context/hook plumbing, mirroring `ContactChannelControls` and its wiring.

**Files:**
- Create: `frontend/src/components/canvas/MastheadIdentityControls/MastheadIdentityControls.jsx`
- Create: `frontend/src/components/canvas/MastheadIdentityControls/MastheadIdentityControls.module.css`
- Modify: `frontend/src/hooks/useA4Elements.js`
- Modify: `frontend/src/store/pdfgenerator-context.jsx`
- Modify: `frontend/src/pages/PdfCanvas.jsx`
- Modify: `frontend/src/components/canvas/CanvasElements/CanvasElements.jsx`

**Interfaces:**
- Consumes: `applyNameCaseToggle`, `applyTitleToggle` (Task 5); `listMastheadBands` (Task 6); `recordPlusLayoutSize`; the `.cluster` chip styles from `SectionRecordAdd.module.css`.
- Produces: context ops `toggleNameCase(bandId)` and `toggleTitle(bandId)`; a `MastheadIdentityControls` overlay rendered once per identity block.

- [ ] **Step 1: Add the hook ops in `useA4Elements.js`**

Extend the existing contact-ops import (line 58) to add the masthead ops:

```javascript
import { applyNameCaseToggle, applyTitleToggle } from '../utils/mastheadIdentityOps';
```

Next to `removeContactChannel`/`addContactChannel` (line ~2059), add the two ops (committed through the same history path):

```javascript
  // Masthead identity toggles (Phase 3). Committed via setA4_Elements so
  // undo/redo and save apply unchanged; case toggle needs no reflow, title
  // toggle re-paginates through applyTitleToggle.
  const toggleNameCase = useCallback((bandId) => {
    setA4_Elements((prev) => applyNameCaseToggle(prev, bandId).elements);
  }, []);
  const toggleTitle = useCallback((bandId) => {
    setA4_Elements((prev) => applyTitleToggle(prev, bandId, () => nanoid()).elements);
  }, []);
```

Add `toggleNameCase` and `toggleTitle` to the hook's returned object (next to `removeContactChannel, addContactChannel` at line ~2120).

- [ ] **Step 2: Expose the ops on the context**

In `pdfgenerator-context.jsx`, next to the `removeContactChannel`/`addContactChannel` no-op stubs (lines ~82–83), add:

```javascript
    toggleNameCase: () => {},
    toggleTitle: () => {},
```

In `PdfCanvas.jsx`: add `toggleNameCase, toggleTitle` to the `useA4Elements(...)` destructuring (next to `removeContactChannel, addContactChannel` at line ~354), and to the provider value object (next to line ~1425) plus its dependency array (line ~1495).

- [ ] **Step 2b: Verify the wiring compiles**

Run: `cd frontend && npx vite build`
Expected: build succeeds (ops are exposed even though nothing renders them yet).

- [ ] **Step 3: Implement `MastheadIdentityControls.jsx`**

```jsx
/**
 * Inline hover controls for the masthead identity block (Phase 3).
 *
 * Hovering the name reveals a case toggle chip ("Aa" when uppercase — click to
 * lowercase; "AA" when not — click to uppercase). Hovering the title reveals a
 * hide button. When the title is hidden a "+" appears next to the name to add it
 * back. All three actions commit through the `toggleNameCase` / `toggleTitle`
 * context ops. Mirrors `ContactChannelControls` timing/exclusivity + the shared
 * `.cluster` surface chip; only managed blocks (with a descriptor) reach here.
 */
import { use, useCallback, useEffect, useRef, useState } from "react";
import { FiPlus, FiEyeOff } from "react-icons/fi";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { recordPlusLayoutSize } from "../recordPlusSize";
import cluster from "../SectionRecordAdd/SectionRecordAdd.module.css";
import classes from "./MastheadIdentityControls.module.css";

const HIDE_AFTER_LEAVE_MS = 600;

export default function MastheadIdentityControls({ band }) {
  const { toggleNameCase, toggleTitle, zoom = 1 } = use(PdfContext);
  const [hover, setHover] = useState(null); // "name" | "title" | null
  const hideTimerRef = useRef(null);

  const clearHide = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);
  const scheduleHide = useCallback(() => {
    clearHide();
    hideTimerRef.current = window.setTimeout(() => setHover(null), HIDE_AFTER_LEAVE_MS);
  }, [clearHide]);

  // Bind hover to the name node and (when present) the title node by element id,
  // the same way ContactChannelControls binds to chip label nodes.
  useEffect(() => {
    const cleanups = [];
    const bind = (elementId, key) => {
      const node = document.getElementById(elementId);
      if (!node) return;
      const onEnter = () => { clearHide(); setHover(key); };
      const onLeave = () => scheduleHide();
      node.addEventListener("pointerenter", onEnter);
      node.addEventListener("pointerleave", onLeave);
      cleanups.push(() => {
        node.removeEventListener("pointerenter", onEnter);
        node.removeEventListener("pointerleave", onLeave);
      });
    };
    bind(band.name.elementId, "name");
    if (band.title) bind(band.title.elementId, "title");
    return () => { clearHide(); cleanups.forEach((fn) => fn()); };
  }, [band, clearHide, scheduleHide]);

  useEffect(() => () => clearHide(), [clearHide]);

  const { buttonSize, iconSize, gap } = recordPlusLayoutSize(zoom, band.name.fontSize);
  const buttonStyle = { width: buttonSize, height: buttonSize };
  const iconStyle = { width: iconSize, height: iconSize };
  const stop = (event) => { event.stopPropagation(); event.preventDefault(); };

  return (
    <>
      {/* Name case toggle: sits just left of the name line. */}
      {hover === "name" ? (
        <div className={cluster.anchor}
             style={{ left: band.name.left - buttonSize - gap, top: band.name.top - 1 }}>
          <div className={cluster.cluster} style={{ gap }}
               onPointerEnter={() => { clearHide(); setHover("name"); }}
               onPointerLeave={scheduleHide}>
            <button type="button" className={classes.caseToggle} style={buttonStyle}
                    aria-label={band.name.uppercase ? "Wyłącz wielkie litery" : "Włącz wielkie litery"}
                    title={band.name.uppercase ? "Zwykłe litery" : "WIELKIE LITERY"}
                    onPointerDown={stop}
                    onClick={(e) => { stop(e); toggleNameCase(band.bandId); }}>
              {band.name.uppercase ? "Aa" : "AA"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Title hide: sits just left of the title line. */}
      {hover === "title" && band.title ? (
        <div className={cluster.anchor}
             style={{ left: band.title.left - buttonSize - gap, top: band.title.top - 1 }}>
          <div className={cluster.cluster} style={{ gap }}
               onPointerEnter={() => { clearHide(); setHover("title"); }}
               onPointerLeave={scheduleHide}>
            <button type="button" className={cluster.trash} style={buttonStyle}
                    aria-label="Ukryj stanowisko" title="Ukryj stanowisko"
                    onPointerDown={stop}
                    onClick={(e) => { stop(e); toggleTitle(band.bandId); setHover(null); }}>
              <FiEyeOff style={iconStyle} />
            </button>
          </div>
        </div>
      ) : null}

      {/* Add-title "+": shown when the title is hidden, next to the name. */}
      {!band.titlePresent ? (
        <div className={cluster.anchor} style={{ left: band.name.left + 44, top: band.name.top - 1 }}>
          <div className={cluster.cluster} style={{ gap }}>
            <button type="button" className={cluster.plus} style={buttonStyle}
                    aria-label="Dodaj stanowisko" title="Dodaj stanowisko"
                    onPointerDown={stop}
                    onClick={(e) => { stop(e); toggleTitle(band.bandId); }}>
              <FiPlus style={iconStyle} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Implement `MastheadIdentityControls.module.css`**

```css
/* Case toggle chip. Reuses the shared surface-chip look (white, 1px hairline,
   sharp 0px corners per DESIGN.md); the label is a compact monospace pair so
   "Aa"/"AA" read as a case switch rather than text. */
.caseToggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: "JetBrains Mono", monospace;
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1;
    color: #2b2b2b;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
}
```

- [ ] **Step 5: Render the overlay in `CanvasElements.jsx`**

Add the imports (next to the contact-band imports at lines 37–38):

```javascript
import MastheadIdentityControls from '../MastheadIdentityControls/MastheadIdentityControls';
import { listMastheadBands } from '../../../utils/mastheadBands';
```

Add the memo (next to `contactBands`, line ~154):

```javascript
  const mastheadBands = useMemo(
    () => (editorMode === EDITOR_MODE_TEMPLATE ? listMastheadBands(elements) : []),
    [editorMode, elements],
  );
```

Render them after the contact controls (inside the fragment at line ~407):

```javascript
      {mastheadBands.map((band) => (
        <MastheadIdentityControls key={band.bandId} band={band} />
      ))}
```

- [ ] **Step 6: Build + full frontend suite**

Run: `cd frontend && npx vite build && node ./scripts/run-tests.mjs`
Expected: build succeeds; the masthead unit tests pass (the pre-existing `sectionRecord.test.js` failures are unrelated and out of scope).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/canvas/MastheadIdentityControls/ frontend/src/hooks/useA4Elements.js frontend/src/store/pdfgenerator-context.jsx frontend/src/pages/PdfCanvas.jsx frontend/src/components/canvas/CanvasElements/CanvasElements.jsx
git commit -m "feat(masthead): inline hover controls for name-case + title toggle"
```

---

### Task 8: Schema mirror, docs (EN + PL), manual QA

**Files:**
- Regenerate: `shared/pdf-element.schema.json`
- Modify: `README.md` (EN + PL)

- [ ] **Step 1: Regenerate the schema mirror**

Run: `cd backend && python -m app.schemas.export_pdf_element_schema && git status --short shared/pdf-element.schema.json`
Expected: a diff adding `textTransform`, `mastheadRole`, `mastheadBandId`, `mastheadIdentity`. Stage it.

> **Note for the implementer:** confirm the exporter module path — Phase-1/2 regenerated this file; search `backend` for the export entry point (`grep -rl pdf-element.schema backend`) if the module name differs.

- [ ] **Step 2: Update README (EN + PL)**

Add a "Masthead identity" Features entry describing: (a) a name-case toggle (Aa/AA) that flips a reversible `textTransform` flag honored by canvas + PDF; (b) a title/role-line show-hide that reflows the masthead up/down by `blockPt` and re-adds an editable title; (c) coverage on all eight contact-band templates (Harbor, Atrium, Portico, Cardinal, Tessera, Slate, Nova, Volt); (d) key files: `shared/masthead.py` (`tag_masthead_identity`), `pdf_generator.py` `renderText` (`textTransform`), `mastheadIdentityOps.js` (`applyNameCaseToggle`, `applyTitleToggle`), `mastheadBands.js`, `MastheadIdentityControls`. Mirror the same content in the Polish section. Verify any line references against the final files.

- [ ] **Step 3: Manual QA on the running app**

For each of the eight templates: load a CV, toggle the name case (canvas shows the change; Download → PDF matches); hide the title (band + rule + first section move up; footer stays put); add the title back via the `+` (restored at its original spot with reflow down; editable); undo/redo one step each; Save → Download match the canvas. Record results per template. Confirm a legacy document (no identity anchor) shows no masthead controls and behaves as before.

- [ ] **Step 4: Commit**

```bash
git add README.md shared/pdf-element.schema.json
git commit -m "docs(masthead): document Phase 3 masthead identity toggles (EN + PL)"
```

---

## Self-Review

**Spec coverage:**
- `textTransform` parity field (spec §4.1) → Task 1 (schema + renderer + round-trip) and Task 4 (canvas render).
- Masthead identity tags + descriptor (spec §4.2) → Task 2 (helper) + Task 1 (schema/round-trip).
- Backend generator changes, all 8 templates (spec §4.3) → Task 3, with the reversible-uppercase byte-stability check in Step 6.
- Client identity engine `mastheadIdentityOps.js` (spec §4.4) → Task 5 (name toggle, title hide/show, band `startY` coupling, fixedToPage exclusion).
- Inline hover UI `MastheadIdentityControls` (spec §4.5) → Task 7, with the enumerator in Task 6.
- Data flow (spec §5) → Tasks 5+7 (ops through the history path).
- Edge cases (spec §6): empty title → Task 5 `buildTitleElement` placeholder + Task 6 `titlePresent`; legacy docs → Task 6 skip + Task 3 no-anchor; contact-band coupling → Task 5 `shiftBelow` startY update.
- Parity (spec §7) → Task 1 renderer + Task 4 CSS applying the same rule; byte-stability regression in Task 3 Step 6.
- Testing (spec §8) → renderer + round-trip (Task 1), helper (Task 2), templates (Task 3), engine (Task 5), enumerator (Task 6), manual QA (Task 8).
- Files touched (spec §9) → covered across Tasks 1–8.

**Placeholder scan:** No TBD/TODO. Three "confirm before running" notes point at real reference tests/files (the unpack fn name in Task 1 Step 7; the generator accessor in Task 3 Step 1; the schema exporter path in Task 8 Step 1) — each names the Phase-1/2 precedent to copy, not vague hand-waving.

**Type consistency:** `applyNameCaseToggle(elements, bandId) → {elements}` and `applyTitleToggle(elements, bandId, createId) → {elements, pageCount}` are used identically in Task 5 (define/test) and Task 7 (wire). `listMastheadBands(elements) → [{bandId, descriptor, name, title, titlePresent}]` matches Task 6's shape and Task 7's `band.name.elementId` / `band.title` / `band.titlePresent` reads. `tag_masthead_identity(name_el, title_el, *, band_id, name_default_uppercase, band_top, title_default_uppercase=False, contact_band_id=None) → anchor` matches Task 3's call sites. `renderText(..., textTransform=None)` matches Task 1's call site. Masthead role/band-id/transform strings match Global Constraints throughout.
