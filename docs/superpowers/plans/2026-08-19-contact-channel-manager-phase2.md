# Contact Channel Manager — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the contact-channel manager fully usable — you can type into a freshly added channel, the row re-spaces horizontally live as you type (constant inter-item gap), and the manager works on Atrium, Portico, Cardinal, Tessera, Slate (existing modes), Nova (new `stacked` mode), and Volt (new `chip` mode) — not only Harbor.

**Architecture:** Three layers extend the Phase-1 design. (1) Frontend edit fixes: the added label opens in edit mode with a placeholder, and empty editable contact labels get a minimum hit width so the caret has somewhere to land. (2) A live-reflow path: when a band label's content changes, the pure engine re-lays the band and shifts downstream flow by the height delta, on every keystroke. (3) Template enablement: centered/wrapping templates just pass a `band_id` and append the band anchor; Nova gains a `stacked` descriptor + client mode; Volt gains a `chip` descriptor + client mode (three elements per channel: rect + icon + label). The canvas stays the PDF authority via the deterministic engine.

**Tech Stack:** Python 3.11 / FastAPI / ReportLab / Pydantic (backend); React 19 / Vite / CSS Modules (frontend); `node:test` for pure JS units, `pytest` for backend.

**Spec:** `docs/superpowers/specs/2026-08-19-contact-channel-manager-design.md` (Phase-1 design; this plan is its Phase-2 continuation — the deferred `stacked`/`chip` modes and the live-edit reflow).

## Global Constraints

- Channel kinds, exact strings: `phone`, `email`, `linkedin`, `github`, `website`, `location`.
- Canonical channel order: `["phone","email","linkedin","github","website","location"]`.
- Layout modes: `centered`, `wrapping` (Phase 1), plus `stacked` and `chip` (this plan). Any other mode → controller is a no-op (no regression).
- Geometry units are CSS px == PDF points. Fonts resolve Helvetica/Courier → Inter on canvas (`canvasFontFamily`).
- Follow DESIGN.md for any UI: white surface chip, 1px hairline grey border, subtle sharp shadow, 0px radius, no emojis (Feather icons via `react-icons/fi`).
- No backend re-render for correctness: canvas element positions are authoritative for the PDF. The client engine must reproduce the backend geometry exactly (same formulas, same constants).
- Legacy documents (no descriptor) must behave exactly as today. No DB migration.
- README.md (EN + PL) must be updated in the same change that ships user-facing behaviour (project CLAUDE.md rule).
- Descriptor `order` stays "channels present at generation" (the `+` menu re-adds removed channels). Widening to the full canonical list is out of scope here.

## File Structure

- `frontend/src/utils/contactChannelNames.js` (create) — single source of Polish channel display names, shared by the add-menu UI, the placeholder seed, and any future consumer. Removes the duplicated `CHANNEL_NAMES` map.
- `frontend/src/components/canvas/Text/Text.jsx` + `Text.module.css` (modify) — placeholder + min-width for empty editable contact labels.
- `frontend/src/utils/contactBandOps.js` (modify) — auto-edit + placeholder on add; a new `applyChannelRelayout` used by live typing; mode-aware element creation/repositioning (rect for `chip`).
- `frontend/src/utils/contactBandLayout.js` (modify) — `stacked` and `chip` layout functions.
- `frontend/src/hooks/useA4Elements.js` (modify) — trigger `applyChannelRelayout` from `handleEditElementValues` for band labels; auto-edit the added label.
- `backend/app/services/cv_templates/shared/contact.py` (modify) — `_place_stacked_icon_contacts` gains descriptor + tagging; new `_place_chip_icon_contacts` for Volt.
- `backend/app/services/cv_templates/templates/{atrium,portico,cardinal,tessera,slate,nova,volt}.py` (modify) — pass `band_id`, append `build_contact_band_anchor`.
- Tests alongside each unit.

---

### Task 1: Shared channel-name constant

Extract the duplicated channel display-name map so the add-menu, placeholder seed, and future code agree.

**Files:**
- Create: `frontend/src/utils/contactChannelNames.js`
- Test: `frontend/src/utils/contactChannelNames.test.js`
- Modify: `frontend/src/components/canvas/ContactChannelControls/ContactChannelControls.jsx`

**Interfaces:**
- Produces: `CHANNEL_NAMES: Record<string,string>` and `channelName(channel): string` (falls back to the raw key).

- [ ] **Step 1: Write the failing test**

```javascript
// frontend/src/utils/contactChannelNames.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { CHANNEL_NAMES, channelName } from "./contactChannelNames.js";

test("known channels map to Polish display names", () => {
  assert.equal(CHANNEL_NAMES.phone, "Telefon");
  assert.equal(channelName("email"), "E-mail");
});

test("channelName falls back to the raw key for unknown channels", () => {
  assert.equal(channelName("fax"), "fax");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/utils/contactChannelNames.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the constant**

```javascript
// frontend/src/utils/contactChannelNames.js
/**
 * Human-readable Polish names for contact channels.
 *
 * Single source shared by the add-channel menu, the placeholder shown in a
 * freshly added (empty) contact label, and any future contact UI, so the
 * wording never drifts between call sites.
 */
export const CHANNEL_NAMES = {
  phone: "Telefon",
  email: "E-mail",
  linkedin: "LinkedIn",
  github: "GitHub",
  website: "Strona WWW",
  location: "Lokalizacja",
};

/** Display name for a channel, falling back to the raw key when unknown. */
export function channelName(channel) {
  return CHANNEL_NAMES[channel] || channel;
}
```

- [ ] **Step 4: Point the UI at the shared constant**

In `ContactChannelControls.jsx`: delete the local `CHANNEL_NAMES` object (lines 22–30) and its doc comment; add `import { CHANNEL_NAMES } from "../../../utils/contactChannelNames";` near the other util imports. No other change (the component already reads `CHANNEL_NAMES[...]`).

- [ ] **Step 5: Run tests + lint the touched file**

Run: `cd frontend && node --test src/utils/contactChannelNames.test.js && npx eslint src/components/canvas/ContactChannelControls/ContactChannelControls.jsx`
Expected: PASS; no new lint errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/contactChannelNames.js frontend/src/utils/contactChannelNames.test.js frontend/src/components/canvas/ContactChannelControls/ContactChannelControls.jsx
git commit -m "refactor(contact): extract shared channel-name constant"
```

---

### Task 2: Placeholder + min hit width for empty editable contact labels

Root cause of "can't type into an added contact": the added label has `content: ""`, and `.textElement { width: max-content }` gives an empty `<p>` zero width, so a click never reaches the edit handler. Fix: a labelled empty text element renders a faint placeholder and reserves a minimum width, purely for display (never part of the serialized content or the PDF).

**Files:**
- Modify: `frontend/src/components/canvas/Text/Text.jsx`
- Modify: `frontend/src/components/canvas/Text/Text.module.css`
- Modify: `frontend/src/components/canvas/CanvasElements/CanvasElements.jsx` (pass `placeholder`)

**Interfaces:**
- Consumes: `element.placeholder` (optional string) set by Task 3.
- Produces: a `Text` that shows `placeholder` via CSS `::before` while empty and gives itself a hit area. `serializeEditable`/`onInput` are unchanged, so the placeholder never enters `content`.

- [ ] **Step 1: Add the `placeholder` prop and data attribute in `Text.jsx`**

Add `placeholder` to the destructured props. On the `<p>`, add `data-placeholder={placeholder || undefined}` so the attribute is absent when there is no placeholder (keeps every other text element byte-identical).

- [ ] **Step 2: Render the placeholder + min width in `Text.module.css`**

```css
/* A labelled empty contact label (e.g. a just-added channel) needs a hit area
   and a hint. Both are display-only: the ::before content is CSS-generated so it
   never enters the contentEditable value, and the min-width only applies while
   the node is empty, so a filled label keeps hugging its glyphs exactly. */
.textElement[data-placeholder]:empty {
    min-width: 4ch;
}

.textElement[data-placeholder]:empty::before {
    content: attr(data-placeholder);
    color: #808080;
}
```

- [ ] **Step 3: Pass `placeholder` from `CanvasElements.jsx`**

In the `element.category === "text"` branch, add `placeholder={element.placeholder}` to the `<Text ... />` props.

- [ ] **Step 4: Manual sanity check (no unit harness for DOM CSS)**

Run: `cd frontend && npx vite build`
Expected: build succeeds. (Behaviour is verified end-to-end in Task 4 / Task 10 QA.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/canvas/Text/Text.jsx frontend/src/components/canvas/Text/Text.module.css frontend/src/components/canvas/CanvasElements/CanvasElements.jsx
git commit -m "feat(contact): placeholder + hit area for empty editable labels"
```

---

### Task 3: Auto-edit the added channel + seed its placeholder

Make `applyChannelAddition` open the new label in edit mode and give it a placeholder, so adding a channel drops the caret straight into a typable field.

**Files:**
- Modify: `frontend/src/utils/contactBandOps.js`
- Modify: `frontend/src/utils/contactBandOps.test.js`

**Interfaces:**
- Consumes: `channelName` (Task 1).
- Produces: `applyChannelAddition(...)` now returns `{ elements }` where the added label carries `isEditing: true`, `isSelected: true`, and `placeholder: channelName(channel)`; every other text/textarea element has `isEditing: false` and `isSelected: false` (same "sole active element" semantics as `handleSetTextareaEditing`).

- [ ] **Step 1: Write the failing test**

```javascript
// append to frontend/src/utils/contactBandOps.test.js
import { channelName } from "./contactChannelNames.js";

test("addition opens the new label in edit mode with a placeholder", () => {
  const removed = applyChannelRemoval(doc(), "b1", "email", measure, () => "id").elements;
  const { elements } = applyChannelAddition(removed, "b1", "email", "", measure, (n) => `new-${n}`);
  const label = elements.find((e) => e.contactChannel === "email" && e.category === "text");
  assert.equal(label.isEditing, true);
  assert.equal(label.isSelected, true);
  assert.equal(label.placeholder, channelName("email"));
  // The edited label is the sole active element.
  assert.equal(elements.filter((e) => e.isEditing).length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/utils/contactBandOps.test.js`
Expected: FAIL (label has no `isEditing`/`placeholder`; other elements not cleared).

- [ ] **Step 3: Implement in `contactBandOps.js`**

Add the import: `import { channelName } from "./contactChannelNames.js";`

In `applyChannelAddition`, set the new label fields and clear others. Change the `labelEl` object to include:

```javascript
    isEditing: true, isSelected: true,
    placeholder: channelName(channel),
```

Then, before returning, clear the active flag on every pre-existing text/textarea element so the new label is the sole active one — do this inside `relayoutAndReconcile`'s output for the addition path. Simplest: after `relayoutAndReconcile`, map once:

```javascript
  const result = relayoutAndReconcile(
    withNew, bandId, descriptor,
    itemsFor(oldChannels, labels), itemsFor(nextChannels, nextLabels),
    measure, createId,
  );
  const newLabelId = labelEl.element_id;
  const elementsOut = result.elements.map((el) => {
    if (el.element_id === newLabelId) return el;
    if (el.category === "text" || el.category === "textarea") {
      return el.isEditing || el.isSelected ? { ...el, isEditing: false, isSelected: false } : el;
    }
    return el;
  });
  return { elements: elementsOut, pageCount: result.pageCount };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/utils/contactBandOps.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/contactBandOps.js frontend/src/utils/contactBandOps.test.js
git commit -m "feat(contact): open added channel in edit mode with placeholder"
```

---

### Task 4: Live horizontal reflow while typing

When a band label's content changes, re-lay the band with the new text and shift downstream flow by the height delta — on every keystroke — so the inter-item gap stays constant and following chips never overlap.

**Files:**
- Modify: `frontend/src/utils/contactBandOps.js`
- Modify: `frontend/src/utils/contactBandOps.test.js`
- Modify: `frontend/src/hooks/useA4Elements.js`

**Interfaces:**
- Consumes: `layoutContactBand`, `reconcileDocumentPages`.
- Produces: `applyChannelRelayout(elements, bandId, measure, createId) → { elements, pageCount }` — recomputes placements from the *current* label contents, repositions band chips, and shifts every non-band element below the band by the delta vs the band's current bottom row.

- [ ] **Step 1: Write the failing test**

```javascript
// append to frontend/src/utils/contactBandOps.test.js
import { applyChannelRelayout } from "./contactBandOps.js";

test("relayout re-spaces following chips after the edited label grows", () => {
  const base = doc();
  // Simulate a live edit: phone label is now much longer than at layout time.
  const edited = base.map((e) =>
    e.element_id === "ph-l" ? { ...e, content: "+48 111 222 333 444" } : e,
  );
  const { elements } = applyChannelRelayout(edited, "b1", measure, () => "id");
  const phoneLabel = elements.find((e) => e.element_id === "ph-l");
  const emailIcon = elements.find((e) => e.element_id === "em-i");
  // The email chip now starts one full phone-advance to the right of the phone
  // icon: iconGap(16) + measured("+48 111 222 333 444")*? ... just assert it
  // moved right of where it was (130) and keeps the constant gap contract.
  const phoneAdvance = 16 + measure("+48 111 222 333 444") + 14;
  assert.equal(emailIcon.left, phoneLabel.left - 16 + phoneAdvance);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/utils/contactBandOps.test.js`
Expected: FAIL (`applyChannelRelayout` not exported).

- [ ] **Step 3: Implement `applyChannelRelayout`**

In `contactBandOps.js`, add a helper that computes the band's current bottom from live positions, then reuses the existing repositioning:

```javascript
// Current bottom row of the band, read from live chip positions. Used as the
// "before" baseline for a live edit, where we do not have the prior layout.
function currentBandBottom(elements, bandId) {
  let bottom = null;
  for (const el of elements) {
    if (el.contactBandId === bandId && el.contactChannel && typeof el.top === "number") {
      bottom = bottom == null ? el.top : Math.max(bottom, el.top);
    }
  }
  return bottom;
}

/**
 * Re-lay a band from its current label contents (called live while a label is
 * edited) and shift downstream flow by the height delta. Positions only — never
 * touches content, runs, or edit state, so the caret is undisturbed.
 */
export function applyChannelRelayout(elements, bandId, measure, createId) {
  const descriptor = bandDescriptor(elements, bandId);
  if (!descriptor) return { elements };
  const channels = activeChannels(elements, bandId);
  if (!channels.length) return { elements };
  const labels = channelLabels(elements, bandId);
  const items = itemsFor(channels, labels);
  const oldBottom = currentBandBottom(elements, bandId);
  const newBand = layoutContactBand(descriptor, items, measure);
  const delta = oldBottom == null ? 0 : newBand.bottomY - oldBottom;
  const placementByChannel = new Map(newBand.placements.map((p) => [p.channel, p]));
  const next = elements.map((el) =>
    reposition(el, bandId, placementByChannel, oldBottom ?? 0, delta),
  );
  const reconciled = reconcileDocumentPages(next, createId, { collapseEmpty: true });
  return { elements: reconciled.elements, pageCount: reconciled.pageCount };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/utils/contactBandOps.test.js`
Expected: PASS.

- [ ] **Step 5: Trigger relayout from the edit path**

In `useA4Elements.js`, move the `measureContactLabel` `useCallback` (currently ~line 2038) to *above* `handleEditElementValues` (~line 1243) so it can be referenced there (it only depends on `contactMeasureCtxRef`, a ref, so the move is safe). Add the import if missing: `import { applyChannelRelayout } from '../utils/contactBandOps';` (extend the existing import line that already pulls `applyChannelRemoval, applyChannelAddition`).

In `handleEditElementValues`, after building `newState` and before the `page` branch, detect a band-label content edit and relayout:

```javascript
      // A live edit of a contact label changes its width, so the band must
      // re-space (constant inter-item gap) and downstream flow shift by Δ. Do
      // this only for label content edits; position-only edits skip it.
      if ("content" in dataObject) {
        const edited = newState.find((el) => el.element_id === id);
        if (edited?.contactBandId && edited?.contactChannel && edited.category === "text") {
          return applyChannelRelayout(
            newState, edited.contactBandId, measureContactLabel, () => nanoid(),
          ).elements;
        }
      }
```

(Place this block before `if ("page" in dataObject)`.)

- [ ] **Step 6: Run the frontend suite + build**

Run: `cd frontend && node ./scripts/run-tests.mjs && npx vite build`
Expected: pass count up by the new tests; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/contactBandOps.js frontend/src/utils/contactBandOps.test.js frontend/src/hooks/useA4Elements.js
git commit -m "feat(contact): live horizontal reflow while editing a channel label"
```

---

### Task 5: Enable centered templates — Atrium + Portico

Both already produce a `centered` descriptor from `_place_centered_icon_contacts`; they only need to pass a `band_id` and append the band anchor.

**Files:**
- Modify: `backend/app/services/cv_templates/templates/atrium.py`
- Modify: `backend/app/services/cv_templates/templates/portico.py`
- Test: `backend/tests/test_contact_band_templates.py` (create)

**Interfaces:**
- Consumes: `_place_centered_icon_contacts(..., band_id=...)`, `build_contact_band_anchor` (both exist in `shared/contact.py`).
- Produces: each template's element list contains one `flowRole="masthead-anchor"` element with a `centered` `contactBand` descriptor, and every contact pair carries `contactChannel` + `contactBandId`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_contact_band_templates.py
"""Templates emit a contact-band anchor + tagged pairs so the client manager
can add/remove channels. Drawn geometry is asserted elsewhere; here we only
check the identity/descriptor plumbing."""
import pytest
from app.services.cv_templates.registry import get_template  # adjust if the accessor differs

_CV = {
    "name": "Jan Kowalski", "title": "AML Analyst",
    "phone": "+48 111 222 333", "email": "jan@example.com",
    "linkedin": "linkedin.com/in/jan", "location": "Warszawa",
    "summary": "x", "experience": [], "education": [], "skills": ["A"],
}


def _anchor(elements):
    return next((e for e in elements if e.get("flowRole") == "masthead-anchor"), None)


@pytest.mark.parametrize("template_id,mode", [
    ("atrium", "centered"), ("portico", "centered"),
])
def test_template_emits_contact_band(template_id, mode):
    elements = get_template(template_id)(_CV)  # returns list[dict]
    anchor = _anchor(elements)
    assert anchor is not None, f"{template_id} has no band anchor"
    assert anchor["contactBand"]["mode"] == mode
    band_id = anchor["contactBandId"]
    pairs = [e for e in elements if e.get("contactBandId") == band_id and e.get("contactChannel")]
    assert any(e.get("contactChannel") == "phone" for e in pairs)
```

> **Note for the implementer:** confirm the real generator accessor before running — search `backend/app/services/cv_templates/` for how templates are invoked (e.g. a `registry`, a `TEMPLATES` dict, or a per-module `build`/`generate` function) and adjust `get_template(...)(_CV)` to match. The existing `tests/test_cv_template_layouts.py` shows the correct call shape.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_contact_band_templates.py -q`
Expected: FAIL (no anchor emitted by atrium/portico).

- [ ] **Step 3: Wire Atrium**

In `atrium.py`, at the contact call site (line ~89), add `band_id="contact-main"` to the `_place_centered_icon_contacts(...)` call, capture the descriptor (rename `_contact_descriptor` → `contact_descriptor`), and after the elements are added to the header/section list, append the anchor. Mirror `harbor.py:117`:

```python
    contact_els, contact_bottom, contact_descriptor = _place_centered_icon_contacts(
        ...,
        band_id="contact-main",
    )
    ...
    header.append(build_contact_band_anchor(contact_descriptor))
```

Add `build_contact_band_anchor` to the existing `from ...shared.contact import (...)` block. (Use whatever the header/element accumulator variable is named in that file — read it first.)

- [ ] **Step 4: Wire Portico**

Apply the identical change in `portico.py` at line ~109.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_contact_band_templates.py -q`
Expected: PASS for atrium + portico rows.

- [ ] **Step 6: Regression — existing layout/contact tests**

Run: `cd backend && python -m pytest tests/test_cv_template_layouts.py tests/test_contact_links.py -q`
Expected: PASS (drawn geometry unchanged — `band_id` only adds tags + a zero-size anchor).

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/cv_templates/templates/atrium.py backend/app/services/cv_templates/templates/portico.py backend/tests/test_contact_band_templates.py
git commit -m "feat(contact): enable channel manager on Atrium + Portico"
```

---

### Task 6: Enable wrapping templates — Cardinal + Tessera + Slate

Same low-effort wiring as Task 5, for the three templates using `_place_wrapping_icon_contacts`.

**Files:**
- Modify: `backend/app/services/cv_templates/templates/cardinal.py`
- Modify: `backend/app/services/cv_templates/templates/tessera.py`
- Modify: `backend/app/services/cv_templates/templates/slate.py`
- Modify: `backend/tests/test_contact_band_templates.py`

**Interfaces:**
- Consumes: `_place_wrapping_icon_contacts(..., band_id=...)`, `build_contact_band_anchor`.
- Produces: a `wrapping` band anchor + tagged pairs in each template.

- [ ] **Step 1: Extend the parametrized test**

Add rows to the `@pytest.mark.parametrize` in `test_contact_band_templates.py`:

```python
    ("cardinal", "wrapping"), ("tessera", "wrapping"), ("slate", "wrapping"),
```

- [ ] **Step 2: Run to verify the new rows fail**

Run: `cd backend && python -m pytest tests/test_contact_band_templates.py -q`
Expected: FAIL for cardinal/tessera/slate.

- [ ] **Step 3: Wire each template**

In `cardinal.py` (~35), `tessera.py` (~208), `slate.py` (~219): add `band_id="contact-main"` to the `_place_wrapping_icon_contacts(...)` call, rename `_contact_descriptor` → `contact_descriptor`, import `build_contact_band_anchor`, and append `build_contact_band_anchor(contact_descriptor)` to that template's element accumulator after the contact/header elements are added.

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_contact_band_templates.py -q`
Expected: PASS (all five rows so far).

- [ ] **Step 5: Regression**

Run: `cd backend && python -m pytest tests/test_cv_template_layouts.py tests/test_contact_links.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/cv_templates/templates/cardinal.py backend/app/services/cv_templates/templates/tessera.py backend/app/services/cv_templates/templates/slate.py backend/tests/test_contact_band_templates.py
git commit -m "feat(contact): enable channel manager on Cardinal, Tessera, Slate"
```

---

### Task 7: Client `stacked` layout mode

Nova stacks contacts one channel per row. Add the pure client layout for that mode so add/remove/edit reflow works.

**Files:**
- Modify: `frontend/src/utils/contactBandLayout.js`
- Modify: `frontend/src/utils/contactBandLayout.test.js`

**Interfaces:**
- Consumes: descriptor with `mode:"stacked"`, `anchor:{startX,startY}`, `metrics:{iconGap,lineStep,charWidth}`.
- Produces: `layoutContactBand` handles `stacked`: `placements[i] = {channel, iconLeft:startX, iconTop:startY+i*lineStep, labelLeft:startX+iconGap, labelTop:startY+i*lineStep}`, `bottomY = startY + (n-1)*lineStep`.

- [ ] **Step 1: Write the failing test**

```javascript
// append to frontend/src/utils/contactBandLayout.test.js
test("stacked: one channel per row, bottomY at the last row", () => {
  const stacked = {
    mode: "stacked",
    anchor: { startX: 44, startY: 100 },
    text: { fontFamily: "Inter", fontSizePt: 8.4, colorHex: "#3A3A3A" },
    icon: { sizePt: 11, theme: "nova" },
    metrics: { iconGap: 16, itemPad: 14, lineStep: 18, charWidth: 5.2 },
    order: ["phone", "email", "location"],
  };
  const items = [
    { channel: "phone", label: "111" },
    { channel: "email", label: "aa" },
    { channel: "location", label: "Wwa" },
  ];
  const { placements, bottomY } = layoutContactBand(stacked, items, () => 10);
  assert.equal(placements[0].iconLeft, 44);
  assert.equal(placements[0].iconTop, 100);
  assert.equal(placements[1].iconTop, 118);
  assert.equal(placements[2].labelLeft, 60);
  assert.equal(placements[2].labelTop, 136);
  assert.equal(bottomY, 136);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && node --test src/utils/contactBandLayout.test.js`
Expected: FAIL (stacked falls through to centered → wrong positions).

- [ ] **Step 3: Implement `layoutStacked`**

```javascript
// in contactBandLayout.js
function layoutStacked(descriptor, items) {
  const { iconGap, lineStep } = descriptor.metrics;
  const { startX, startY } = descriptor.anchor;
  const placements = items.map((item, i) => ({
    channel: item.channel,
    iconLeft: startX,
    iconTop: startY + i * lineStep,
    labelLeft: startX + iconGap,
    labelTop: startY + i * lineStep,
  }));
  const bottomY = items.length ? startY + (items.length - 1) * lineStep : startY;
  return { placements, bottomY };
}
```

Add to `layoutContactBand`:

```javascript
  if (descriptor.mode === "stacked") return layoutStacked(descriptor, items);
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && node --test src/utils/contactBandLayout.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/contactBandLayout.js frontend/src/utils/contactBandLayout.test.js
git commit -m "feat(contact): client stacked layout mode"
```

---

### Task 8: Backend `stacked` descriptor + wire Nova

Give `_place_stacked_icon_contacts` the same identity/descriptor contract as the other placers and wire Nova.

**Files:**
- Modify: `backend/app/services/cv_templates/shared/contact.py`
- Modify: `backend/app/services/cv_templates/templates/nova.py`
- Modify: `backend/tests/test_contact_band_emit.py`
- Modify: `backend/tests/test_contact_band_templates.py`

**Interfaces:**
- Consumes: `_tag_contact_pair`, `_build_band_descriptor` (exist).
- Produces: `_place_stacked_icon_contacts(..., band_id=None) → (elements, bottom_y, descriptor)` with `mode="stacked"`, `anchor={"startX","startY"}`, `metrics={"iconGap","lineStep","charWidth"}` (include `itemPad` for shape parity even though stacked ignores it).

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_contact_band_emit.py
from app.services.cv_templates.shared.contact import _place_stacked_icon_contacts


def test_stacked_tags_pairs_and_returns_descriptor():
    items = [("phone", "+48 111"), ("email", "a@b.pl")]
    elements, bottom_y, descriptor = _place_stacked_icon_contacts(
        theme="nova", items=items, start_x=48, start_y=120,
        text_fs=8.4, icon_size=11, text_color="#3A3A3A", font="Inter",
        band_id="contact-main",
    )
    assert all(e.get("contactBandId") == "contact-main" for e in elements)
    assert descriptor["mode"] == "stacked"
    assert descriptor["anchor"]["startX"] == 48
    assert descriptor["anchor"]["startY"] == 120
    assert descriptor["metrics"]["lineStep"] == 18.0
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_contact_band_emit.py::test_stacked_tags_pairs_and_returns_descriptor -q`
Expected: FAIL (returns a 2-tuple; no `band_id` kwarg).

- [ ] **Step 3: Update `_place_stacked_icon_contacts`**

Add `band_id: str | None = None` to the signature and change the return type to `tuple[list[dict], float, dict]`. Inside the loop, after building `icon` and `label`, tag them when `band_id` is set:

```python
        if band_id is not None:
            _tag_contact_pair(icon, label, key, band_id)
```

Before returning, build the descriptor (do this in both the `placed == 0` and normal return paths so the shape is always present):

```python
    descriptor = _build_band_descriptor(
        band_id=band_id, mode="stacked",
        anchor={"startX": float(start_x), "startY": float(start_y)},
        items=items, text_fs=text_fs, text_color=text_color, font=font,
        icon_size=icon_size, theme=theme,
        char_width=5.2, icon_gap=icon_gap, item_pad=14.0, line_step=line_step,
    )
    if placed == 0:
        return elements, float(start_y), descriptor
    return elements, cy - line_step, descriptor
```

- [ ] **Step 4: Wire Nova**

In `nova.py` (~91) change the unpack to the 3-tuple, pass `band_id="contact-main"`, import `build_contact_band_anchor`, and append it to Nova's element accumulator after the contact elements:

```python
    contact_els, contact_bottom, contact_descriptor = _place_stacked_icon_contacts(
        ..., band_id="contact-main",
    )
    ...
    header.append(build_contact_band_anchor(contact_descriptor))
```

Add the `("nova", "stacked")` row to `test_contact_band_templates.py`'s parametrize list.

- [ ] **Step 5: Run tests**

Run: `cd backend && python -m pytest tests/test_contact_band_emit.py tests/test_contact_band_templates.py tests/test_cv_template_layouts.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/cv_templates/shared/contact.py backend/app/services/cv_templates/templates/nova.py backend/tests/test_contact_band_emit.py backend/tests/test_contact_band_templates.py
git commit -m "feat(contact): stacked descriptor + enable Nova"
```

---

### Task 9: Client `chip` layout mode + three-element repositioning

Volt renders each contact as a pill: a `rectangle` background plus icon + label. Add a `chip` layout mode and make the add/reposition transforms handle the third (rect) element, including its width.

**Files:**
- Modify: `frontend/src/utils/contactBandLayout.js`
- Modify: `frontend/src/utils/contactBandLayout.test.js`
- Modify: `frontend/src/utils/contactBandOps.js`
- Modify: `frontend/src/utils/contactBandOps.test.js`

**Interfaces:**
- Consumes: descriptor with `mode:"chip"`, `anchor:{startX,startY,rightLimit}`, `metrics:{chipH,iconSize,padLeft,labelOffset,widthBase,widthPerChar,minWidth,maxWidth,chipGap,lineStep,charWidth}`, `text.fontSizePt`.
- Produces:
  - `layoutContactBand` handles `chip`: each placement carries `rectLeft,rectTop,rectWidth,iconLeft,iconTop,labelLeft,labelTop`.
  - `reposition` moves/resizes the `rectangle` element of a chip channel (in addition to image/text).
  - `applyChannelAddition` creates a `rectangle` + icon + label triple when `descriptor.mode==="chip"`.

- [ ] **Step 1: Write the failing layout test**

```javascript
// append to frontend/src/utils/contactBandLayout.test.js
const chipDesc = {
  mode: "chip",
  anchor: { startX: 48, startY: 108, rightLimit: 547 },
  text: { fontFamily: "JetBrains Mono", fontSizePt: 7.8, colorHex: "#333" },
  icon: { sizePt: 15, theme: "volt" },
  metrics: {
    chipH: 20, iconSize: 15, padLeft: 6, labelOffset: 27,
    widthBase: 28, widthPerChar: 5.2, minWidth: 120, maxWidth: 168,
    chipGap: 8, lineStep: 28, charWidth: 5.2,
  },
};

test("chip: rect + icon + label geometry and clamped width", () => {
  const items = [{ channel: "phone", label: "+48 111 222 333" }];
  const { placements } = layoutContactBand(chipDesc, items, () => 999);
  const p = placements[0];
  const expectedWidth = Math.max(120, Math.min(168, 28 + "+48 111 222 333".length * 5.2));
  assert.equal(p.rectLeft, 48);
  assert.equal(p.rectTop, 108);
  assert.equal(p.rectWidth, expectedWidth);
  assert.equal(p.iconLeft, 54); // 48 + padLeft 6
  assert.equal(p.labelLeft, 75); // 48 + labelOffset 27
  const textTop = 108 + (20 - 7.8) / 2;
  assert.equal(p.iconTop, textTop);
  assert.equal(p.labelTop, textTop);
});

test("chip: wraps to the next band when the row exceeds rightLimit", () => {
  const long = { channel: "email", label: "someverylongemail@example.com" };
  const items = [long, long, long, long, long];
  const { placements } = layoutContactBand(chipDesc, items, () => 10);
  assert.ok(placements.some((p) => p.rectTop > 108), "expected a wrapped row");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && node --test src/utils/contactBandLayout.test.js`
Expected: FAIL (chip unhandled).

- [ ] **Step 3: Implement `layoutChip`**

Chip width uses the char-count formula (parity with the backend, which does not measure), so `measure` is ignored for width here:

```javascript
// in contactBandLayout.js
function chipWidth(text, m) {
  const raw = m.widthBase + String(text).length * m.widthPerChar;
  return Math.max(m.minWidth, Math.min(m.maxWidth, raw));
}

function layoutChip(descriptor, items) {
  const m = descriptor.metrics;
  const { startX, startY, rightLimit } = descriptor.anchor;
  const fontSize = descriptor.text.fontSizePt;
  const placements = [];
  let cx = startX;
  let cy = startY;
  for (const item of items) {
    const width = chipWidth(item.label, m);
    if (cx > startX && cx + width > rightLimit) {
      cx = startX;
      cy += m.lineStep;
    }
    const textTop = cy + (m.chipH - fontSize) / 2;
    placements.push({
      channel: item.channel,
      rectLeft: cx, rectTop: cy, rectWidth: width,
      iconLeft: cx + m.padLeft, iconTop: textTop,
      labelLeft: cx + m.labelOffset, labelTop: textTop,
    });
    cx += width + m.chipGap;
  }
  return { placements, bottomY: cy };
}
```

Add to `layoutContactBand`: `if (descriptor.mode === "chip") return layoutChip(descriptor, items);`

- [ ] **Step 4: Run to verify layout pass**

Run: `cd frontend && node --test src/utils/contactBandLayout.test.js`
Expected: PASS.

- [ ] **Step 5: Make `reposition` chip-aware (failing test first)**

```javascript
// append to frontend/src/utils/contactBandOps.test.js — chip repositioning
const chipDescriptor = {
  id: "vb", mode: "chip",
  anchor: { startX: 48, startY: 108, rightLimit: 547 },
  text: { fontFamily: "JetBrains Mono", fontSizePt: 7.8, colorHex: "#333" },
  icon: { sizePt: 15, theme: "volt" },
  metrics: { chipH: 20, iconSize: 15, padLeft: 6, labelOffset: 27,
    widthBase: 28, widthPerChar: 5.2, minWidth: 120, maxWidth: 168,
    chipGap: 8, lineStep: 28, charWidth: 5.2 },
  order: ["phone", "email"],
};

function chipDoc() {
  return [
    { element_id: "a", category: "text", content: "", flowRole: "masthead-anchor",
      contactBandId: "vb", contactBand: chipDescriptor, top: 0, page: 1 },
    { element_id: "ph-r", category: "rectangle", contactBandId: "vb", contactChannel: "phone",
      left: 48, top: 108, width: 120, height: 20, page: 1 },
    { element_id: "ph-i", category: "image", contactBandId: "vb", contactChannel: "phone",
      left: 54, top: 114, width: 15, height: 15, page: 1, src: "x/phone.png" },
    { element_id: "ph-l", category: "text", contactBandId: "vb", contactChannel: "phone",
      content: "+48 111", left: 75, top: 114, page: 1 },
    { element_id: "head", category: "text", content: "H", top: 200, left: 48, page: 1 },
  ];
}

test("chip relayout moves + resizes the rect with its icon/label", () => {
  const edited = chipDoc().map((e) =>
    e.element_id === "ph-l" ? { ...e, content: "+48 111 222 333 444 555" } : e,
  );
  const { elements } = applyChannelRelayout(edited, "vb", (t) => t.length * 5, () => "id");
  const rect = elements.find((e) => e.element_id === "ph-r");
  const expected = Math.max(120, Math.min(168, 28 + "+48 111 222 333 444 555".length * 5.2));
  assert.equal(rect.width, expected);
  assert.equal(rect.left, 48);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd frontend && node --test src/utils/contactBandOps.test.js`
Expected: FAIL (rect not repositioned/resized).

- [ ] **Step 7: Extend `reposition` in `contactBandOps.js`**

Replace the band-chip branch so it handles all three categories from a full placement:

```javascript
  if (el.contactBandId === bandId && el.contactChannel) {
    const placement = placementByChannel.get(el.contactChannel);
    if (!placement) return el;
    if (el.category === "image") {
      return { ...el, left: placement.iconLeft, top: placement.iconTop };
    }
    if (el.category === "rectangle") {
      // Chip background: move and resize to the recomputed pill width.
      return {
        ...el,
        left: placement.rectLeft, top: placement.rectTop,
        width: placement.rectWidth,
      };
    }
    // text label
    return { ...el, left: placement.labelLeft, top: placement.labelTop };
  }
```

(For non-chip placements `rectLeft`/`rectWidth` are `undefined`, but no `rectangle` band elements exist in those modes, so the branch is never hit — safe.)

- [ ] **Step 8: Make `applyChannelAddition` create the rect for chip mode**

After the `iconEl`/`labelEl` are built, when `descriptor.mode === "chip"` prepend a rectangle element and include it in `withNew`:

```javascript
  const extras = [];
  if (descriptor.mode === "chip" && placement) {
    extras.push({
      element_id: createId("chip"),
      category: "rectangle",
      left: placement.rectLeft, top: placement.rectTop,
      width: placement.rectWidth, height: descriptor.metrics.chipH,
      backgroundColor: descriptor.chipColor ?? "#EEEEEE",
      filled: true, borderWidth: 1, zIndex: 1, page,
      flowRole: "masthead",
      contactChannel: channel, contactBandId: bandId,
    });
  }
  const withNew = [...elements, ...extras, iconEl, labelEl];
```

(`descriptor.chipColor` is added by the backend in Task 10; the `?? "#EEEEEE"` keeps the transform robust if absent.)

- [ ] **Step 9: Run to verify pass + full suite**

Run: `cd frontend && node --test src/utils/contactBandOps.test.js && node ./scripts/run-tests.mjs`
Expected: PASS; no new failures.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/utils/contactBandLayout.js frontend/src/utils/contactBandLayout.test.js frontend/src/utils/contactBandOps.js frontend/src/utils/contactBandOps.test.js
git commit -m "feat(contact): client chip layout mode + rect-aware reflow"
```

---

### Task 10: Backend `chip` placer + wire Volt

Move Volt's inline chip loop into a shared `_place_chip_icon_contacts` that tags the rect/icon/label triple and emits a `chip` descriptor whose metrics match the drawn geometry exactly.

**Files:**
- Modify: `backend/app/services/cv_templates/shared/contact.py`
- Modify: `backend/app/services/cv_templates/templates/volt.py`
- Modify: `backend/tests/test_contact_band_emit.py`
- Modify: `backend/tests/test_contact_band_templates.py`

**Interfaces:**
- Produces: `_place_chip_icon_contacts(*, theme, items, start_x, start_y, right_limit, chip_h, icon_size, text_fs, text_color, chip_color, font, icon_builder=None, band_id=None) → (elements, bottom_y, descriptor)`; descriptor `mode="chip"`, `anchor={"startX","startY","rightLimit"}`, `metrics={chipH,iconSize,padLeft,labelOffset,widthBase,widthPerChar,minWidth,maxWidth,chipGap,lineStep,charWidth}`, plus `chipColor` at the descriptor top level. Every rect/icon/label is tagged with `contactChannel`+`contactBandId`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_contact_band_emit.py
from app.services.cv_templates.shared.contact import _place_chip_icon_contacts


def test_chip_tags_triples_and_returns_descriptor():
    items = [("phone", "+48 111 222 333"), ("email", "a@b.pl")]
    elements, bottom_y, descriptor = _place_chip_icon_contacts(
        theme="volt", items=items, start_x=48, start_y=108, right_limit=547,
        chip_h=20, icon_size=15, text_fs=7.8, text_color="#333",
        chip_color="#EEE", font="JetBrains Mono", band_id="contact-main",
    )
    # Three elements per channel (rect + icon + label), all tagged.
    assert all(e.get("contactBandId") == "contact-main" for e in elements)
    kinds = [e["category"] for e in elements if e.get("contactChannel") == "phone"]
    assert sorted(kinds) == ["image", "rectangle", "text"]
    assert descriptor["mode"] == "chip"
    assert descriptor["chipColor"] == "#EEE"
    assert descriptor["metrics"]["labelOffset"] == 27
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_contact_band_emit.py::test_chip_tags_triples_and_returns_descriptor -q`
Expected: FAIL (`_place_chip_icon_contacts` missing).

- [ ] **Step 3: Implement `_place_chip_icon_contacts`**

Port Volt's loop (`volt.py:26-40`) verbatim for geometry, adding tagging + descriptor. Requires `_rect`/`_icon` builders — pass them in via `icon_builder` and a `rect_builder`, or import Volt's `_rect`/`_icon` helpers if they are shared. Read `volt.py` imports first; if `_rect`/`_icon` are local to Volt, accept them as parameters `rect_builder` and `icon_builder` (both required for `chip`). The width formula and offsets must match Volt exactly:

```python
def _place_chip_icon_contacts(
    *, theme, items, start_x, start_y, right_limit,
    chip_h, icon_size, text_fs, text_color, chip_color, font,
    rect_builder, icon_builder,
    pad_left=6.0, icon_text_gap=6.0, chip_gap=8.0,
    width_base=28.0, width_per_char=5.2, min_width=120.0, max_width=168.0,
    band_id=None,
):
    line_step = chip_h + 8.0
    label_offset = pad_left + icon_size + icon_text_gap  # 27 for Volt defaults
    elements: list[dict] = []
    x = float(start_x)
    chip_top = float(start_y)
    for key, value in items:
        if not value:
            continue
        width = max(min_width, min(max_width, width_base + len(value) * width_per_char))
        if x > start_x and x + width > right_limit:
            x = float(start_x)
            chip_top += line_step
        text_top = chip_top + (chip_h - text_fs) / 2.0
        rect = rect_builder(x, chip_top, width, chip_h, chip_color)
        icon = icon_builder(key, x + pad_left, text_top, icon_size)
        label = _text(value, text_fs, font, text_color, x + label_offset, text_top, zIndex=3)
        for el in (rect, icon, label):
            el["flowRole"] = "masthead"
        if band_id is not None:
            for el in (rect, icon, label):
                el["contactChannel"] = key
                el["contactBandId"] = band_id
        elements.extend([rect, icon, label])
        x += width + chip_gap
    descriptor = {
        "id": band_id, "mode": "chip",
        "anchor": {"startX": float(start_x), "startY": float(start_y),
                   "rightLimit": float(right_limit)},
        "text": {"fontFamily": font, "fontSizePt": text_fs, "colorHex": text_color},
        "icon": {"sizePt": icon_size, "theme": theme},
        "chipColor": chip_color,
        "metrics": {"chipH": chip_h, "iconSize": icon_size, "padLeft": pad_left,
                    "labelOffset": label_offset, "widthBase": width_base,
                    "widthPerChar": width_per_char, "minWidth": min_width,
                    "maxWidth": max_width, "chipGap": chip_gap,
                    "lineStep": line_step, "charWidth": width_per_char},
        "order": [key for key, value in items if value],
    }
    return elements, chip_top, descriptor
```

- [ ] **Step 4: Wire Volt**

In `volt.py`, replace the inline contact loop (lines 26–40) with a call to `_place_chip_icon_contacts`, passing `rect_builder=lambda x, y, w, h, c: _rect(x, y, w, h, c, 1, zIndex=1)` and `icon_builder=lambda key, left, top, size: _icon(ICON, key, left, top, size)`, `band_id="contact-main"`. Extend `header` with the returned elements, keep `start_y = contact_bottom + chip_h + SPACE_AFTER_MASTHEAD` (derive from `contact_bottom` exactly as the old `chip_top` was used), then append `build_contact_band_anchor(contact_descriptor)`. Import `_place_chip_icon_contacts` and `build_contact_band_anchor`.

Add the `("volt", "chip")` row to `test_contact_band_templates.py`.

- [ ] **Step 5: Run tests + regression**

Run: `cd backend && python -m pytest tests/test_contact_band_emit.py tests/test_contact_band_templates.py tests/test_cv_template_layouts.py -q`
Expected: PASS. If a Volt geometry assertion in `test_cv_template_layouts.py` shifts, confirm the numbers are byte-identical to the pre-refactor loop before adjusting — the geometry must not change.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/cv_templates/shared/contact.py backend/app/services/cv_templates/templates/volt.py backend/tests/test_contact_band_emit.py backend/tests/test_contact_band_templates.py
git commit -m "feat(contact): chip placer + enable Volt"
```

---

### Task 11: Regenerate schema mirror, docs (EN + PL), manual QA

**Files:**
- Modify: `README.md` (EN + PL)
- Regenerate: `shared/pdf-element.schema.json` (only if any `PdfElement` field changed — this plan adds none, so likely a no-op; run the exporter to confirm)

- [ ] **Step 1: Confirm the schema mirror is current**

Run: `cd backend && python -m app.schemas.export_pdf_element_schema && git status --short shared/pdf-element.schema.json`
Expected: no diff (no new schema fields). If a diff appears, stage it.

- [ ] **Step 2: Update README (EN + PL)**

In the Phase-1 "Contact channels" Features entry, add: (a) freshly added channels open in edit mode with a placeholder and are immediately typable; (b) the row re-spaces horizontally live while typing (constant inter-item gap); (c) the manager now covers Harbor, Atrium, Portico, Cardinal, Tessera, Slate (centered/wrapping), Nova (`stacked`), and Volt (`chip`); (d) key files: `contactBandLayout.js` (centered/wrapping/stacked/chip), `contactBandOps.js` (`applyChannelRelayout`), `Text.jsx` placeholder path, `shared/contact.py` (`_place_stacked_icon_contacts`, `_place_chip_icon_contacts`). Mirror the same content in the Polish section. Verify line references you cite against the final files.

- [ ] **Step 3: Manual QA on the running app**

For each template (Harbor, Atrium, Portico, Cardinal, Tessera, Slate, Nova, Volt): load a CV, remove a channel (row/rule/first section reflow up), add it back (opens in edit mode with placeholder → type → following chips re-space live with a constant gap), Save → Download → PDF matches the canvas. Record results per template.

- [ ] **Step 4: Commit**

```bash
git add README.md shared/pdf-element.schema.json
git commit -m "docs(contact): document Phase 2 contact channel manager (EN + PL)"
```

---

## Self-Review

**Spec coverage:**
- Bug "can't type after add" → Task 2 (placeholder + hit area) + Task 3 (auto-edit).
- "Horizontal reflow while typing, constant gap" → Task 4 (`applyChannelRelayout` wired into the edit path).
- Atrium, Portico → Task 5. Cardinal, Tessera, Slate → Task 6. Nova (`stacked`) → Tasks 7 (client) + 8 (backend). Volt (`chip`) → Tasks 9 (client) + 10 (backend). Docs/QA → Task 11.
- Canvas↔PDF parity: chip width uses the identical char-count formula both sides (Tasks 9/10); stacked/centered/wrapping reuse the ported engine.

**Placeholder scan:** No TBD/TODO. Two flagged uncertainties are handled explicitly, not left vague: (a) the template generator accessor in Task 5 Step 1 has a "confirm before running" note pointing at `test_cv_template_layouts.py`; (b) Volt's `_rect`/`_icon` builders are passed in as parameters in Task 10 so the shared placer does not assume they are importable.

**Type consistency:** `layoutContactBand(descriptor, items, measure) → {placements, bottomY}` is unchanged; `stacked`/`chip` are added as new `mode` branches only. `applyChannelRelayout(elements, bandId, measure, createId) → {elements, pageCount}` is used identically in Task 4 (wire) and Task 9 (chip test). `reposition` gains a `rectangle` case without changing its signature. Channel strings/order match Global Constraints. Backend placers all return `(elements, bottom_y, descriptor)` after this plan.
