# Contact Channel Manager — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CV contact band editable like Enhancv — delete a channel (icon + label together), add an inactive channel, with the row re-centering/re-wrapping and the header rule + first section reflowing, on centered and wrapping masthead layouts.

**Architecture:** Backend tags each contact icon+label pair with a channel kind and a shared band id, and emits a persisted band **descriptor** (layout mode + geometry) on a zero-footprint anchor element. A pure client engine ports the backend centre/wrap math to recompute placements; a canvas controller applies add/remove and shifts downstream flow by the band's height delta using the existing pagination primitive. An inline hover overlay drives it. Deterministic positions keep the canvas the PDF authority.

**Tech Stack:** Python 3.11 / FastAPI / ReportLab / Pydantic (backend); React 19 / Vite / CSS Modules (frontend); `node:test` for pure JS units, `pytest` for backend.

**Spec:** `docs/superpowers/specs/2026-08-19-contact-channel-manager-design.md`

## Global Constraints

- Channel kinds (Phase 1), exact strings: `phone`, `email`, `linkedin`, `github`, `website`, `location`.
- Canonical channel order: `["phone","email","linkedin","github","website","location"]`.
- Layout modes (Phase 1): `centered`, `wrapping`. Any other mode → controller is a no-op (no regression).
- Geometry units are CSS px == PDF points (project convention). Fonts resolve Helvetica/Courier → Inter on canvas (`canvasFontFamily`).
- Follow DESIGN.md for any UI: white surface chip, 1px hairline grey border, subtle sharp shadow, 0px radius, no emojis (Lucide/Feather icons via `react-icons`).
- No backend re-render for correctness: the canvas element positions are authoritative for the PDF.
- Legacy documents (no descriptor) must behave exactly as today. No DB migration.
- README.md (EN + PL) must be updated in the same change that ships user-facing behavior.

---

### Task 1: Pure client reflow engine (`contactBandLayout.js`)

Ports the backend centre/wrap placement math so the canvas can recompute band positions with no network call. Pure and unit-tested.

**Files:**
- Create: `frontend/src/utils/contactBandLayout.js`
- Test: `frontend/src/utils/contactBandLayout.test.js`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `contactItemWidth(text, { iconGap, itemPad, charWidth }, measure)` → number (points).
  - `layoutContactBand(descriptor, items, measure)` → `{ placements, bottomY }` where
    `items` is an ordered array of `{ channel, label }`,
    `placements` is `[{ channel, iconLeft, iconTop, labelLeft, labelTop }]`,
    `measure(text, fontFamily, fontSizePt)` returns a number or `null` (fallback to `charWidth`).
    `descriptor` shape per the spec (`mode`, `anchor`, `text`, `icon`, `metrics`, `order`).

- [ ] **Step 1: Write the failing tests**

```javascript
// frontend/src/utils/contactBandLayout.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { contactItemWidth, layoutContactBand } from "./contactBandLayout.js";

// Deterministic measure: every glyph is 5 pt wide. Mirrors the charWidth path.
const measure = (text) => text.length * 5;

const baseMetrics = { iconGap: 16, itemPad: 14, lineStep: 16, charWidth: 5.2 };

const centered = {
  mode: "centered",
  anchor: { centerX: 300, startY: 100, maxWidth: 400 },
  text: { fontFamily: "Inter", fontSizePt: 8.4, colorHex: "#3A3A3A" },
  icon: { sizePt: 11, theme: "harbor" },
  metrics: baseMetrics,
  order: ["phone", "email", "linkedin", "github", "website", "location"],
};

test("contactItemWidth = iconGap + measured text + itemPad", () => {
  assert.equal(contactItemWidth("abc", baseMetrics, measure), 16 + 15 + 14);
});

test("contactItemWidth falls back to charWidth when measure returns null", () => {
  assert.equal(contactItemWidth("abcd", baseMetrics, () => null), 16 + 4 * 5.2 + 14);
});

test("centered: a single line is centered on its visible width", () => {
  const items = [{ channel: "phone", label: "111" }, { channel: "email", label: "aa" }];
  const { placements, bottomY } = layoutContactBand(centered, items, measure);
  // advances: phone 16+15+14=45, email 16+10+14=40. visible = 85-14 = 71.
  const firstIconLeft = 300 - 71 / 2; // 264.5
  assert.equal(placements[0].iconLeft, firstIconLeft);
  assert.equal(placements[0].iconTop, 100);
  assert.equal(placements[0].labelLeft, firstIconLeft + 16);
  assert.equal(placements[1].iconLeft, firstIconLeft + 45);
  assert.equal(bottomY, 100); // one row: top of last row == startY
});

test("centered: wraps to a second line past maxWidth and bottomY advances one lineStep", () => {
  // Two long items whose combined advance exceeds maxWidth=120.
  const narrow = { ...centered, anchor: { centerX: 300, startY: 100, maxWidth: 80 } };
  const items = [{ channel: "phone", label: "1234" }, { channel: "email", label: "5678" }];
  const { placements, bottomY } = layoutContactBand(narrow, items, measure);
  assert.equal(placements[0].iconTop, 100);
  assert.equal(placements[1].iconTop, 116); // second line
  assert.equal(bottomY, 116);
});

test("wrapping: left-anchored, wraps at rightLimit", () => {
  const wrapping = {
    ...centered,
    mode: "wrapping",
    anchor: { startX: 44, startY: 104, rightLimit: 120 },
  };
  const items = [{ channel: "phone", label: "1234" }, { channel: "email", label: "5678" }];
  const { placements, bottomY } = layoutContactBand(wrapping, items, measure);
  assert.equal(placements[0].iconLeft, 44);
  assert.equal(placements[0].iconTop, 104);
  assert.equal(placements[1].iconTop, 120); // wrapped: 104 + lineStep 16
  assert.equal(bottomY, 120);
});

test("removing the middle item closes the gap (no empty slot)", () => {
  const items = [{ channel: "phone", label: "111" }, { channel: "location", label: "xx" }];
  const { placements } = layoutContactBand(centered, items, measure);
  assert.equal(placements.length, 2);
  assert.equal(placements[1].iconLeft, placements[0].iconLeft + (16 + 15 + 14));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && node --test src/utils/contactBandLayout.test.js`
Expected: FAIL ("contactItemWidth is not a function" / module not found).

- [ ] **Step 3: Implement the engine**

```javascript
// frontend/src/utils/contactBandLayout.js
/**
 * Pure contact-band layout engine.
 *
 * Ports the backend placement math (cv_templates/shared/contact.py:
 * _place_centered_icon_contacts / _place_wrapping_icon_contacts) so the canvas
 * can recompute icon+label positions live when a channel is added or removed.
 * Geometry units are points == CSS px. `bottomY` is the TOP of the last row
 * (matching the backend contract) so callers can place a rule at bottomY + gap.
 */

/**
 * Horizontal footprint of one icon+label chip in points.
 * @param {string} text
 * @param {{iconGap:number,itemPad:number,charWidth:number}} metrics
 * @param {(text:string)=>number|null} measure
 * @returns {number}
 */
export function contactItemWidth(text, metrics, measure) {
  const measured = measure ? measure(text) : null;
  const width = typeof measured === "number" ? measured : text.length * metrics.charWidth;
  return metrics.iconGap + width + metrics.itemPad;
}

function layoutCentered(descriptor, items, measure) {
  const { iconGap, itemPad, lineStep } = descriptor.metrics;
  const { centerX, startY, maxWidth } = descriptor.anchor;
  // First pass: bucket items into lines using their measured advances.
  const lines = [[]];
  let lineWidth = 0;
  for (const item of items) {
    const advance = contactItemWidth(item.label, descriptor.metrics, (t) =>
      measure ? measure(t, descriptor.text.fontFamily, descriptor.text.fontSizePt) : null,
    );
    if (lines[lines.length - 1].length && lineWidth + advance > maxWidth) {
      lines.push([]);
      lineWidth = 0;
    }
    lines[lines.length - 1].push({ ...item, advance });
    lineWidth += advance;
  }
  const nonEmpty = lines.filter((line) => line.length);
  const placements = [];
  let cy = startY;
  for (const line of nonEmpty) {
    // Exclude the trailing item's itemPad: it is inter-item spacing, not drawn.
    const visibleWidth = line.reduce((sum, it) => sum + it.advance, 0) - itemPad;
    let cx = centerX - visibleWidth / 2;
    for (const it of line) {
      placements.push({
        channel: it.channel,
        iconLeft: cx,
        iconTop: cy,
        labelLeft: cx + iconGap,
        labelTop: cy,
      });
      cx += it.advance;
    }
    cy += lineStep;
  }
  return { placements, bottomY: nonEmpty.length ? cy - lineStep : startY };
}

function layoutWrapping(descriptor, items, measure) {
  const { iconGap, lineStep } = descriptor.metrics;
  const { startX, startY, rightLimit } = descriptor.anchor;
  const placements = [];
  let cx = startX;
  let cy = startY;
  for (const item of items) {
    const advance = contactItemWidth(item.label, descriptor.metrics, (t) =>
      measure ? measure(t, descriptor.text.fontFamily, descriptor.text.fontSizePt) : null,
    );
    if (cx > startX && cx + advance > rightLimit) {
      cx = startX;
      cy += lineStep;
    }
    placements.push({
      channel: item.channel,
      iconLeft: cx,
      iconTop: cy,
      labelLeft: cx + iconGap,
      labelTop: cy,
    });
    cx += advance;
  }
  return { placements, bottomY: cy };
}

/**
 * @param {object} descriptor - band descriptor (mode/anchor/text/icon/metrics/order).
 * @param {{channel:string,label:string}[]} items - active channels in order.
 * @param {(text:string,fontFamily:string,fontSizePt:number)=>number|null} measure
 * @returns {{placements:Array,bottomY:number}}
 */
export function layoutContactBand(descriptor, items, measure) {
  if (descriptor.mode === "wrapping") return layoutWrapping(descriptor, items, measure);
  return layoutCentered(descriptor, items, measure);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && node --test src/utils/contactBandLayout.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/contactBandLayout.js frontend/src/utils/contactBandLayout.test.js
git commit -m "feat(contact): pure client contact-band layout engine"
```

---

### Task 2: Backend schema fields + crud round-trip

Add the identity fields and the band descriptor to the API boundary and persist them via `extra_properties` (no migration).

**Files:**
- Modify: `backend/app/schemas/pdf_schema.py` (add fields to `PdfElement`)
- Modify: `backend/app/crud/pdfs.py` (unpack in `elements_from_rows`; pack in the create and update sites)
- Test: `backend/tests/test_contact_channel_roundtrip.py` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `PdfElement.contactChannel: str|None`, `PdfElement.contactBandId: str|None`, `PdfElement.contactBand: dict|None` — round-tripped through persistence.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_contact_channel_roundtrip.py
"""Contact-channel identity + band descriptor survive persist/reload."""
from app.schemas.pdf_schema import PdfElement
from app.crud.pdfs import elements_from_rows


class _Row:
    """Minimal stand-in for a PdfElements ORM row."""
    def __init__(self, **kw):
        self.__dict__.update(kw)


def test_contact_fields_unpack_from_extra_properties():
    row = _Row(
        element_id="e1", category="text", page=1, left=10, top=10,
        content="+48 111", fontFamily="Inter", fontSize=8.4, color="#3A3A3A",
        width=None, height=None, zIndex=3,
        extra_properties={
            "contactChannel": "phone",
            "contactBandId": "band-1",
            "flowRole": "masthead",
        },
    )
    [element] = elements_from_rows([row])
    assert element.contactChannel == "phone"
    assert element.contactBandId == "band-1"


def test_band_descriptor_unpacks_on_anchor():
    descriptor = {"id": "band-1", "mode": "centered", "order": ["phone", "email"]}
    row = _Row(
        element_id="anchor", category="text", page=1, left=0, top=0,
        content="", fontFamily="Inter", fontSize=1, color="#000000",
        width=0, height=0, zIndex=0,
        extra_properties={"flowRole": "masthead-anchor", "contactBand": descriptor,
                          "contactBandId": "band-1"},
    )
    [element] = elements_from_rows([row])
    assert element.contactBand == descriptor
    assert element.contactBandId == "band-1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_contact_channel_roundtrip.py -q`
Expected: FAIL (`PdfElement` has no `contactChannel`; unpack does not read the keys).

- [ ] **Step 3: Add schema fields**

In `backend/app/schemas/pdf_schema.py`, inside `class PdfElement`, add near the other optional style fields:

```python
    # Contact-band identity (Phase 1 contact channel manager). Present on both
    # the icon and label of a channel so they move/delete as a unit.
    contactChannel: Optional[str] = None
    contactBandId: Optional[str] = None
    # Band layout descriptor — set only on the zero-footprint band-anchor element
    # (flowRole "masthead-anchor"). Drives client-side reflow on add/remove.
    contactBand: Optional[dict[str, Any]] = None
```

- [ ] **Step 4: Unpack + pack the fields in crud**

In `backend/app/crud/pdfs.py`:

In `elements_from_rows` (the `PdfElement(...)` kwargs around line 78–85) add:

```python
            contactChannel=extra.get("contactChannel"),
            contactBandId=extra.get("contactBandId"),
            contactBand=extra.get("contactBand"),
```

In every `extra_properties={ ... }` pack dict (the create site ~179, the update insert site ~315, and the update replace site ~368) add:

```python
                "contactChannel": getattr(element, "contactChannel", None),
                "contactBandId": getattr(element, "contactBandId", None),
                "contactBand": getattr(element, "contactBand", None),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_contact_channel_roundtrip.py -q`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the existing element tests to confirm no regression**

Run: `cd backend && python -m pytest tests/test_elements_from_rows.py tests/test_pdf_element_updates.py -q`
Expected: PASS.

- [ ] **Step 7: Regenerate the JSON Schema mirror**

Run: `cd backend && python -m app.schemas.export_pdf_element_schema`
Then stage `shared/pdf-element.schema.json`.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/pdf_schema.py backend/app/crud/pdfs.py backend/tests/test_contact_channel_roundtrip.py shared/pdf-element.schema.json
git commit -m "feat(contact): persist contact channel identity + band descriptor"
```

---

### Task 3: Backend — tag pairs + emit descriptor (centered + wrapping)

Stamp channel/band identity onto each emitted contact pair and return a descriptor; append the band-anchor at the Harbor (wrapping) call site as the reference integration. Drawn geometry is unchanged.

**Files:**
- Modify: `backend/app/services/cv_templates/shared/contact.py`
  (`_place_centered_icon_contacts`, `_place_wrapping_icon_contacts`)
- Modify: `backend/app/services/cv_templates/templates/harbor.py` (header block, lines ~65–104)
- Test: `backend/tests/test_contact_band_emit.py` (create)

**Interfaces:**
- Consumes: Task 2 fields on `PdfElement`.
- Produces:
  - Both placers now return `(elements, bottom_y, descriptor)` where `descriptor`
    is the dict from the spec (`id`, `mode`, `anchor`, `text`, `icon`, `metrics`, `order`);
    every icon and label carries `contactChannel` and `contactBandId`.
  - A helper `build_contact_band_anchor(descriptor, *, page=1)` → dict (the empty
    `text` element with `flowRole="masthead-anchor"`, `contactBand=descriptor`,
    `contactBandId=descriptor["id"]`, zero size, empty content).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_contact_band_emit.py
"""Contact placers tag pairs and return a reflow descriptor; geometry unchanged."""
from app.services.cv_templates.shared.contact import (
    _place_wrapping_icon_contacts,
    build_contact_band_anchor,
)


def test_wrapping_tags_pairs_and_returns_descriptor():
    items = [("phone", "+48 111 222 333"), ("email", "a@b.pl")]
    result = _place_wrapping_icon_contacts(
        theme="harbor", items=items, start_x=44, start_y=104, right_limit=551,
        text_fs=8.4, icon_size=11, text_color="#3A3A3A", font="Inter",
        band_id="band-1",
    )
    elements, bottom_y, descriptor = result
    # Every element carries the shared band id; each pair shares a channel.
    assert all(e.get("contactBandId") == "band-1" for e in elements)
    channels = [e.get("contactChannel") for e in elements if e.get("contactChannel")]
    assert channels.count("phone") == 2  # icon + label
    assert descriptor["mode"] == "wrapping"
    assert descriptor["order"][0] == "phone"
    assert descriptor["anchor"]["startX"] == 44


def test_band_anchor_is_empty_non_drawing_masthead_anchor():
    descriptor = {"id": "band-1", "mode": "wrapping"}
    anchor = build_contact_band_anchor(descriptor)
    assert anchor["category"] == "text"
    assert anchor["content"] == ""
    assert anchor["flowRole"] == "masthead-anchor"
    assert anchor["contactBand"] == descriptor
    assert anchor["contactBandId"] == "band-1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_contact_band_emit.py -q`
Expected: FAIL (`build_contact_band_anchor` missing; placer returns a 2-tuple).

- [ ] **Step 3: Implement descriptor emission + anchor helper**

In `backend/app/services/cv_templates/shared/contact.py`:

Add the helper:

```python
def build_contact_band_anchor(descriptor: dict[str, Any], *, page: int = 1) -> dict:
    """Zero-footprint anchor carrying the band's reflow descriptor.

    Empty content means the PDF/canvas draw nothing; ``flowRole`` keeps the
    structural section detector from ever treating it as a heading.
    """
    return {
        "category": "text", "content": "",
        "left": 0, "top": 0, "width": 0, "height": 0,
        "fontSize": 1, "fontFamily": "Inter", "color": "#000000",
        "zIndex": 0, "page": page,
        "flowRole": "masthead-anchor",
        "contactBand": descriptor,
        "contactBandId": descriptor["id"],
    }
```

Update `_place_wrapping_icon_contacts` to accept `band_id: str` and tag pairs + return a descriptor. Inside the loop, after building `elements.append(build_icon(...))` and the label, set on both:

```python
        icon_el = build_icon(key, cx, cy)
        icon_el["contactChannel"] = key
        icon_el["contactBandId"] = band_id
        elements.append(icon_el)
        label = _text(value, text_fs, font, text_color, cx + icon_gap, cy, zIndex=3)
        label["flowRole"] = "masthead"
        label["contactChannel"] = key
        label["contactBandId"] = band_id
        elements.append(label)
```

At the end, build and return the descriptor:

```python
    descriptor = {
        "id": band_id,
        "mode": "wrapping",
        "anchor": {"startX": float(start_x), "startY": float(start_y),
                   "rightLimit": float(right_limit)},
        "text": {"fontFamily": font, "fontSizePt": text_fs, "colorHex": text_color},
        "icon": {"sizePt": icon_size, "theme": theme},
        "metrics": {"iconGap": icon_gap, "itemPad": item_pad,
                    "lineStep": line_step, "charWidth": char_width},
        "order": [key for key, _ in items],
    }
    return elements, cy, descriptor
```

Apply the equivalent change to `_place_centered_icon_contacts` (tag both elements of each pair; return `mode="centered"`, `anchor={"centerX": center_x, "startY": start_y, "maxWidth": max_width}`, same `text`/`icon`/`metrics`/`order`, and the existing `bottom_y`).

- [ ] **Step 4: Wire the Harbor call site**

In `backend/app/services/cv_templates/templates/harbor.py`, replace the manual contact loop (lines ~65–81) with a call to `_place_wrapping_icon_contacts` (theme `"harbor"`, `start_x=MAIN_X`, `start_y=104`, `right_limit=551`, `text_fs=8.4`, `icon_size=11`, `text_color=C["body"]`, `font=SANS`, a generated `band_id`), extend `header` with its elements, then after the header rule is appended set `descriptor["downstream"] = {"ruleElementId": <rule element_id or None>, "sectionStartOffsetPt": section_start - bottom_y}` and `header.append(build_contact_band_anchor(descriptor))`. Keep `header_rule_y`/`section_start` derived from the returned `bottom_y` exactly as before so drawn geometry is unchanged.

Note: elements gain `element_id` downstream in the pipeline; if the rule's id is not known at emit time, leave `ruleElementId` `None` and let the client resolve the rule by `flowRole=="masthead"` + line category nearest below the band (documented in Task 5).

- [ ] **Step 5: Run tests + existing template/contact tests**

Run: `cd backend && python -m pytest tests/test_contact_band_emit.py tests/test_contact_links.py tests/test_cv_template_layouts.py -q`
Expected: PASS (new tags present; existing geometry assertions unchanged).

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/cv_templates/shared/contact.py backend/app/services/cv_templates/templates/harbor.py backend/tests/test_contact_band_emit.py
git commit -m "feat(contact): tag contact pairs and emit reflow descriptor"
```

---

### Task 4: SPIKE — end-to-end delete + Δ reflow (throwaway)

De-risk the single hardest integration before building UI: confirm that removing a channel, recomputing with the engine, shifting downstream flow by Δ, and calling `reconcileDocumentPages` moves the header rule and first section correctly.

**Files:**
- Create (throwaway): `frontend/src/utils/__contactSpike.test.js` (deleted at task end)

**Interfaces:**
- Consumes: `layoutContactBand` (Task 1), `reconcileDocumentPages` from `utils/structureOperation.js`.
- Produces: a documented decision recorded at the top of Task 5 (how downstream elements are selected and shifted).

- [ ] **Step 1: Write a throwaway node:test that models a document**

Build an in-memory element array: a band-anchor (with descriptor), 2 channels (icon+label each), a header rule `line` at `bottomY + 22`, and one section heading `text` at `section_start`. Remove one channel, run `layoutContactBand` on the remaining items, compute `Δ = newBottomY - oldBottomY`, shift every element whose `top >= oldSectionStart` (rule + heading) by Δ, then call `reconcileDocumentPages(next, () => "id", { collapseEmpty: true })`.

```javascript
// frontend/src/utils/__contactSpike.test.js  (THROWAWAY)
import test from "node:test";
import assert from "node:assert/strict";
import { layoutContactBand } from "./contactBandLayout.js";
import { reconcileDocumentPages } from "./structureOperation.js";
// ... build elements, remove a channel, apply Δ, reconcile ...
// assert the rule.top and heading.top decreased by exactly Δ and page count stayed 1.
```

- [ ] **Step 2: Run it and record findings**

Run: `cd frontend && node --test src/utils/__contactSpike.test.js`
Confirm: rule + heading shift by Δ; `reconcileDocumentPages` returns a sane `{elements, pageCount}`. Note in Task 5's header comment the exact downstream-selection rule that worked (`top >= band bottom` vs an explicit `ruleElementId`).

- [ ] **Step 3: Delete the throwaway; do not commit it**

```bash
rm frontend/src/utils/__contactSpike.test.js
```

- [ ] **Step 4: Commit the recorded decision only if it changed the plan**

No code commit expected; the spike output is knowledge. If the plan text below needs adjusting, edit Task 5 and commit the doc.

---

### Task 5: Frontend controller — add/remove channel + Δ reflow

The operations that mutate the document, committed through the existing element/history path.

**Files:**
- Create: `frontend/src/utils/contactBandOps.js` (pure transforms) + `contactBandOps.test.js`
- Modify: `frontend/src/hooks/useA4Elements.js` (expose `removeContactChannel` / `addContactChannel`)
- Modify: `frontend/src/store/pdfgenerator-context.jsx` (defaults)

**Interfaces:**
- Consumes: `layoutContactBand` (Task 1), `reconcileDocumentPages` (structureOperation), spike decision (Task 4), `nanoid`.
- Produces:
  - `applyChannelRemoval(elements, bandId, channel, measure, createId)` → `{ elements }`
  - `applyChannelAddition(elements, bandId, channel, label, measure, createId)` → `{ elements }`
  - Hook methods `removeContactChannel(bandId, channel)` and
    `addContactChannel(bandId, channel, label?)` that call the pure transforms and `setA4_Elements`.

- [ ] **Step 1: Write failing tests for the pure transforms**

```javascript
// frontend/src/utils/contactBandOps.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { activeChannels, applyChannelRemoval, applyChannelAddition } from "./contactBandOps.js";

const measure = (t) => t.length * 5;
const descriptor = {
  id: "b1", mode: "wrapping",
  anchor: { startX: 44, startY: 104, rightLimit: 551 },
  text: { fontFamily: "Inter", fontSizePt: 8.4, colorHex: "#3A3A3A" },
  icon: { sizePt: 11, theme: "harbor" },
  metrics: { iconGap: 16, itemPad: 14, lineStep: 16, charWidth: 5.2 },
  order: ["phone", "email", "location"],
  downstream: { sectionStartOffsetPt: 22 },
};

function doc() {
  return [
    { element_id: "anchor", category: "text", content: "", flowRole: "masthead-anchor",
      contactBandId: "b1", contactBand: descriptor, top: 0, page: 1 },
    { element_id: "ph-i", category: "image", contactBandId: "b1", contactChannel: "phone",
      left: 44, top: 104, page: 1, src: "x/phone.png", width: 11, height: 11 },
    { element_id: "ph-l", category: "text", contactBandId: "b1", contactChannel: "phone",
      content: "+48 111", left: 60, top: 104, page: 1 },
    { element_id: "em-i", category: "image", contactBandId: "b1", contactChannel: "email",
      left: 130, top: 104, page: 1, src: "x/email.png", width: 11, height: 11 },
    { element_id: "em-l", category: "text", contactBandId: "b1", contactChannel: "email",
      content: "a@b.pl", left: 146, top: 104, page: 1 },
    { element_id: "rule", category: "line", flowRole: "masthead", top: 126, left: 44, page: 1 },
    { element_id: "head", category: "text", content: "DOŚWIADCZENIE", top: 146, left: 44, page: 1 },
  ];
}

test("activeChannels reads channels present in band order", () => {
  assert.deepEqual(activeChannels(doc(), "b1"), ["phone", "email"]);
});

test("removal drops both elements of the channel", () => {
  const { elements } = applyChannelRemoval(doc(), "b1", "phone", measure, () => "id");
  assert.equal(elements.some((e) => e.contactChannel === "phone"), false);
  assert.equal(elements.some((e) => e.contactChannel === "email"), true);
});

test("addition inserts an icon+label pair for the channel with the band theme icon", () => {
  const removed = applyChannelRemoval(doc(), "b1", "email", measure, () => "id").elements;
  const { elements } = applyChannelAddition(removed, "b1", "email", "a@b.pl", measure, (n) => `new-${n}`);
  const added = elements.filter((e) => e.contactChannel === "email");
  assert.equal(added.length, 2);
  assert.ok(added.some((e) => e.category === "image" && String(e.src).includes("email")));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && node --test src/utils/contactBandOps.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the pure transforms**

Create `frontend/src/utils/contactBandOps.js`. It: reads the anchor's descriptor; computes `activeChannels`; on removal filters out the channel's elements, recomputes placements for the remaining active channels via `layoutContactBand`, writes back icon/label positions, computes `Δ` against the previous band bottom, shifts every element with `top >= previousSectionStart` (per the Task-4 spike decision) by Δ, and returns the reconciled list (`reconcileDocumentPages`). Addition inserts a new pair (icon src `${theme}` path + channel name, label = provided value or channel placeholder), placed into `descriptor.order` position, then the same recompute+Δ. Use the exact backend icon path shape `/template-assets/iconic/<theme>/<channel>.png` (see `icons.py`).

Include a module docstring recording the spike's downstream-selection rule.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && node --test src/utils/contactBandOps.test.js`
Expected: PASS.

- [ ] **Step 5: Expose hook methods + context defaults**

In `useA4Elements.js`, add `removeContactChannel`/`addContactChannel` that call the transforms with a canvas `measure` (a `measureText` helper over a 2D context using `canvasFontFamily`) and `nanoid`, then `setA4_Elements(next.elements)` and `setPageCount`/`reconcile` as the record-add path does. Return them from the hook. Add no-op defaults in `pdfgenerator-context.jsx` and include them in the `canvasValue` memo + deps in `PdfCanvas.jsx`.

- [ ] **Step 6: Run frontend suite**

Run: `cd frontend && node ./scripts/run-tests.mjs`
Expected: pass count increases by the new tests; no new failures.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/contactBandOps.js frontend/src/utils/contactBandOps.test.js frontend/src/hooks/useA4Elements.js frontend/src/store/pdfgenerator-context.jsx frontend/src/pages/PdfCanvas.jsx
git commit -m "feat(contact): add/remove channel controller with delta reflow"
```

---

### Task 6: Inline hover UI — `ContactChannelControls`

Per-chip trash + a `+` menu of inactive channels, mirroring `SectionRecordAdd`.

**Files:**
- Create: `frontend/src/components/canvas/ContactChannelControls/ContactChannelControls.jsx`
- Reuse: `frontend/src/components/canvas/SectionRecordAdd/SectionRecordAdd.module.css` (shared `.cluster` chip)
- Modify: `frontend/src/components/canvas/CanvasElements/CanvasElements.jsx` (render the overlay for bands present on the page)

**Interfaces:**
- Consumes: `removeContactChannel` / `addContactChannel` from context; `activeChannels` (Task 5); `useHoverPlusExclusive`; `recordPlusLayoutSize`.
- Produces: the on-canvas overlay (no new exported API).

- [ ] **Step 1: Implement the overlay component**

Render, for each contact chip (label element with `contactChannel`) in a band: a hover **trash** at the chip's left calling `removeContactChannel(bandId, channel)`; and at the band end a **`+`** that toggles a small menu listing `descriptor.order` minus `activeChannels`, each item calling `addContactChannel(bandId, channel)`. Reuse the timing/exclusivity and `.cluster` chip exactly as `SectionRecordAdd`. Follow DESIGN.md (icons via `react-icons/fi`: `FiTrash2`, `FiPlus`).

- [ ] **Step 2: Wire into the canvas**

In `CanvasElements.jsx`, for each visible page, find distinct `contactBandId`s among rendered elements and render one `ContactChannelControls` per band with its anchor descriptor + active channels.

- [ ] **Step 3: Build + lint**

Run: `cd frontend && npx vite build && npx eslint src/components/canvas/ContactChannelControls/ContactChannelControls.jsx src/components/canvas/CanvasElements/CanvasElements.jsx`
Expected: build succeeds; no new lint errors (pre-existing warnings acceptable).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/canvas/ContactChannelControls/ frontend/src/components/canvas/CanvasElements/CanvasElements.jsx
git commit -m "feat(contact): inline hover add/remove UI for contact channels"
```

---

### Task 7: Docs + manual QA

**Files:**
- Modify: `README.md` (EN + PL)

- [ ] **Step 1: Document the feature (EN + PL)**

Add a "Contact channels (Phase 1)" entry under Features in both language sections: what it does (hover a contact chip → trash to remove a channel with its icon; `+` to add an inactive channel; the row re-centers/re-wraps and the header rule + first section reflow), the layouts covered (centered + wrapping masthead), the key files (`contactBandLayout.js`, `contactBandOps.js`, `ContactChannelControls`, `shared/contact.py`), and that it is client-side reflow with canvas-authority PDF parity. Note the deferred phases (sidebar/stacked, title/photo/new fields).

- [ ] **Step 2: Manual QA on the running app**

On a centered-masthead CV and on Harbor: delete a channel → row re-centers/re-wraps, rule + first section move up; add it back → restored with its icon; content still editable via click; undo/redo one step each; Save then Download → PDF matches the canvas. Record results.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(contact): document Phase 1 contact channel manager"
```

---

## Self-Review

**Spec coverage:**
- §4.1 data model → Task 2. §4.2 generator emission → Task 3. §4.3 engine → Task 1. §4.4 controller + Δ reflow → Tasks 4–5. §4.5 hover UI → Task 6. §7 parity → deterministic engine (Task 1) + Save/Download (existing). §8 testing → per-task tests + Task 7 QA. Non-goals (sidebar/title/photo/new fields) explicitly excluded.
- Gap noted: `ruleElementId` may be unknown at backend emit time; handled by the client resolving downstream elements by position (Task 3 Step 4 note + Task 4 spike + Task 5 docstring).

**Placeholder scan:** No TBD/TODO; each code step has real code; the one investigation task (Task 4) is an explicit spike with concrete steps and is deleted, not shipped.

**Type consistency:** `layoutContactBand(descriptor, items, measure) → {placements, bottomY}` used identically in Tasks 1, 4, 5. `activeChannels(elements, bandId)`, `applyChannelRemoval/Addition(elements, bandId, channel, [label,] measure, createId)` consistent between Task 5 test and implementation. Channel strings and order match the Global Constraints everywhere.
