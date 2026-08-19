# Contact Channel Manager — Phase 1 Design

Date: 2026-08-19
Status: Draft for review
Scope: **Phase 1 only** (foundation + the six existing contact channels on centered/wrapping masthead layouts). Later phases are listed under "Roadmap" but are out of scope here.

---

## 1. Problem

After a CV is generated, the contact band (phone, e-mail, LinkedIn, GitHub,
website, location) is rendered as a set of **independent, ungrouped** canvas
elements: for each channel an `image` icon
(`/template-assets/iconic/<theme>/<name>.png`) plus a `text` label, both tagged
`flowRole: "masthead"` and positioned by geometry the backend computed once
(see `cv_templates/shared/contact.py` and each template's header block, e.g.
`harbor.py` lines 65–104).

The user can already edit a label's **text** (single click — `Text.jsx`), but
cannot:

- delete a channel as a unit (icon **and** label together);
- add a channel that is currently absent (with the correct icon);
- have the row **reflow** afterwards — today a delete leaves a gap and nothing
  re-centres, re-wraps, or moves the header rule / first section.

The target UX is Enhancv-style: toggle channels on/off inline, and the contact
band re-lays itself out and stays well placed.

## 2. Goals (Phase 1)

- Treat the contact band as a first-class, reflowable group on the canvas.
- Inline hover affordances on each contact chip: **delete** (removes icon +
  label) and **add** (a `+` that lists inactive channels and inserts one with
  its icon), mirroring the existing `SectionRecordAdd` hover pattern.
- **Client-side reflow**: adding/removing a channel recomputes the whole band's
  positions (re-centre / re-wrap), updates the header rule, and pushes the
  first section down/up by the band's height delta — all live, no network call.
- Deterministic layout so the **canvas stays the PDF authority** (saved element
  positions render identically; see the existing canvas↔PDF parity model).
- Cover the **centered** masthead layout (`_place_centered_icon_contacts`) and
  the **wrapping** masthead layout (`_place_wrapping_icon_contacts`, e.g.
  Harbor's inline header row).

## 3. Non-goals (Phase 1 — deferred to later phases)

- Sidebar / stacked contact layouts (Tessera, Slate, Nova stacked) — **Phase 2**.
- Title/role line toggle and name-uppercase toggle — **Phase 3**.
- Profile photo slot add/remove — **Phase 4**.
- New data fields (extra field, birth date, nationality) requiring `cv_data`,
  wizard, and extract changes — **Phase 5**.
- A settings-popover UI (we use inline hover per the agreed decision).

## 4. Architecture

Four cooperating pieces. Items 1–2 are the reusable foundation later phases
build on.

### 4.1 Channel identity + band descriptor (data model)

Each contact element gains two identity fields, and the band gains a persisted
**descriptor** carrying the geometry needed to re-run layout on the client.

New optional fields on `PdfElement` (`backend/app/schemas/pdf_schema.py`) and
their canvas mirror:

- `contactChannel: str | null` — channel kind: one of
  `phone | email | linkedin | github | website | location`. Present on both the
  icon element and its label element so they move/delete as a unit.
- `contactBandId: str | null` — shared id linking every element of one band
  (icon, label, and the band-anchor below). A document can contain more than
  one band (main masthead now; sidebar later), so the id scopes a band.

**Band descriptor.** A single, zero-footprint **band-anchor element** per band
carries the descriptor in `extra_properties`. Storing it on one anchor (rather
than duplicating on every channel element) keeps a single source of truth. The
anchor is a non-drawing element (a `text` element with empty content and
`fixedToPage: false`, `flowRole: "masthead-anchor"`, zero size) so it persists
through the existing `PdfElements` row model without a new category. Descriptor
contents:

```
contactBand: {
  id: string,
  mode: "centered" | "wrapping",     // Phase 1 modes
  anchor: {
    // centered: centerX; wrapping: startX + rightLimit
    centerX?: number, startX?: number, rightLimit?: number,
    startY: number, maxWidth?: number,
  },
  text: { fontFamily: string, fontSizePt: number, colorHex: string },
  icon: { sizePt: number, theme: string },   // theme drives the png path
  metrics: { iconGap: number, itemPad: number, lineStep: number, charWidth: number },
  order: ["phone","email","linkedin","github","website","location"],
  // Downstream coupling: elements to shift when the band height changes.
  downstream: { ruleElementId?: string, sectionStartOffsetPt: number },
}
```

Persistence: `backend/app/crud/pdfs.py` already packs unknown style flags into
`PdfElements.extra_properties`; extend the pack/unpack lists so `contactChannel`,
`contactBandId`, and the anchor's `contactBand` object round-trip. The JSON
Schema mirror (`shared/pdf-element.schema.json`) is regenerated.

### 4.2 Backend generator changes (tag + descriptor emission)

Only the two Phase-1 placers and their call sites change; drawn geometry is
unchanged, so existing PDFs render identically until the user edits.

- `cv_templates/shared/contact.py`:
  `_place_centered_icon_contacts` and `_place_wrapping_icon_contacts` stamp each
  emitted icon/label pair with `contactChannel = key` and a shared
  `contactBandId`, and return the descriptor (mode, anchor geometry, metrics,
  fonts, icon theme) alongside `(elements, bottom_y)`.
- Call sites (Phase 1: the centered-masthead templates and Harbor's wrapping
  header) append the band-anchor element carrying the descriptor, set
  `downstream.ruleElementId` to the header rule they already emit, and record
  `sectionStartOffsetPt = section_start - band_bottom_y`.

Templates not in Phase 1 keep emitting today's untagged elements; the canvas
manager simply does not activate for a band without a descriptor (graceful
no-op), so nothing regresses.

### 4.3 Client reflow engine — `frontend/src/utils/contactBandLayout.js`

A pure module porting the backend placement math so the canvas can re-lay the
band without a round-trip. One entry point:

```
layoutContactBand(descriptor, activeChannels, measureLabelWidth)
  -> { placements: [{ channel, iconLeft, iconTop, labelLeft, labelTop }], bottomY }
```

- `centered` mode ports `_place_centered_icon_contacts` (measure each item,
  bucket into lines at `maxWidth`, re-centre each line on its visible width).
- `wrapping` mode ports `_place_wrapping_icon_contacts` (left-anchored, wrap at
  `rightLimit`).
- `measureLabelWidth(text, font, sizePt)` uses a canvas 2D `measureText` (the
  same approach the editor uses elsewhere for label widths) so wraps match what
  the user sees; the descriptor's `charWidth` is the deterministic fallback,
  keeping parity with the backend estimate when metrics are unavailable.

This module is **pure and unit-tested** (node:test), mirroring how
`documentHistory.js` and the layout utils are tested — no React needed.

### 4.4 Canvas band controller + reflow

A hook/util (`frontend/src/hooks/useContactBand.js` or a helper in
`useA4Elements`) exposes two operations, both committed through the existing
`setA4_Elements` + history path so undo/redo and save work unchanged:

- `removeContactChannel(bandId, channel)`: drop the channel's icon+label,
  recompute placements via `layoutContactBand`, write new positions, then apply
  the **height delta** `Δ = newBottomY - oldBottomY` to the header rule and to
  all downstream flow content, and re-paginate via the existing
  `reconcileDocumentPages` / `finalizeDocumentPages` primitive (the same one
  record add/remove already uses). Δ propagation reuses the section flow engine
  rather than introducing a parallel one.
- `addContactChannel(bandId, channel)`: insert a new icon+label pair (icon src
  from `descriptor.icon.theme` + channel name; label seeded with the channel's
  `cv_data` value if still on the document, else a placeholder the user edits),
  then the same recompute + Δ reflow.

The set of **inactive** channels for the `+` menu = `descriptor.order` minus the
channels currently present in the band.

### 4.5 Inline hover UI — `ContactChannelControls`

A canvas overlay mirroring `SectionRecordAdd` timing/exclusivity
(`useHoverPlusExclusive`, zoom-aware sizing via `recordPlusLayoutSize`, the
shared `.cluster` surface chip added earlier for legibility):

- Hovering a contact chip shows a small **trash** (delete this channel) and,
  at the end of the band, a **`+`** that opens a tiny menu of inactive channels.
- Selecting an inactive channel calls `addContactChannel`; trash calls
  `removeContactChannel`.

## 5. Data flow

```
User hovers chip
  -> ContactChannelControls shows trash / +
User clicks trash (channel=email)
  -> removeContactChannel(bandId, "email")
       -> drop email icon+label from A4_Elements
       -> layoutContactBand(descriptor, remaining channels) -> placements, bottomY
       -> write placements; Δ = bottomY - oldBottomY
       -> shift header rule by Δ; shift downstream flow by Δ
       -> reconcileDocumentPages(...) re-paginates
       -> setA4_Elements(next)  (one history step; autosave/save unaffected)
User clicks + -> menu of inactive channels -> addContactChannel(...) (mirror)
```

Save persists the new element set and the updated anchor descriptor; PDF render
uses stored positions → identical output (canvas is authority).

## 6. Edge cases & error handling

- **Empty band** (all channels removed): keep the band-anchor + descriptor so
  the `+` can re-add channels; collapse the band height to 0 and reflow the rule
  up. The header rule stays (it is masthead chrome, not a contact element).
- **Add when no `cv_data` value exists** (e.g. reopened saved PDF with no
  retained profile): insert the icon + an editable placeholder label
  (`"linkedin.com/…"` style hint) so the user can type the value.
- **Legacy documents** (generated before this feature, no descriptor): the
  controller does not activate; existing per-element editing/deletion behaves as
  today. No migration required.
- **Wrapping vs centered mismatch**: the descriptor's `mode` is authoritative;
  the engine never guesses from element positions.
- **Zoom / font readiness**: label measurement uses the same font the canvas
  renders; if `document.fonts` is not ready, fall back to `charWidth` estimate
  (identical to backend), then the normal reflow settle corrects on font load.

## 7. Canvas ↔ PDF parity

Layout is deterministic and stored as element positions, so the existing
"canvas is the authority" fast path applies: no backend re-render is needed for
correctness, and Save/Download reproduce exactly what the editor shows. This
matches the project's parity model (unformatted/positioned elements render
byte-stably).

## 8. Testing strategy

- **Pure engine** (`contactBandLayout.test.js`, node:test): centred single line
  re-centres on visible width; wrapping breaks at `rightLimit`; removing a
  middle channel closes the gap; `bottomY` decreases by one `lineStep` when a
  wrapped line collapses; deterministic `charWidth` fallback matches a fixed
  golden.
- **Backend** (pytest): the two placers emit `contactChannel` + `contactBandId`
  on every pair and a band-anchor whose descriptor round-trips through
  `extra_properties` (extend `test_pdf_element_updates.py` /
  `test_elements_from_rows.py`). Drawn geometry unchanged (existing
  `test_contact_links.py` / layout tests stay green).
- **Manual QA** (running app): on a centered-masthead CV and on Harbor, delete a
  channel → row re-centres/re-wraps, rule + first section move up; add it back →
  restored with icon; undo/redo one step each; Save + Download match the canvas.

## 9. Files touched (Phase 1)

Backend:
- `app/schemas/pdf_schema.py` — `contactChannel`, `contactBandId`, anchor
  `contactBand` descriptor; regenerate `shared/pdf-element.schema.json`.
- `app/services/cv_templates/shared/contact.py` — tag pairs + return descriptor
  from the two Phase-1 placers.
- Phase-1 call sites (centered-masthead templates + `harbor.py` header) — append
  band-anchor, set `downstream`.
- `app/crud/pdfs.py` — pack/unpack the new fields in `extra_properties`.

Frontend:
- `src/utils/contactBandLayout.js` (+ `.test.js`) — pure reflow engine.
- `src/hooks/useContactBand.js` (or additions to `useA4Elements.js`) —
  add/remove channel ops + Δ reflow via existing pagination primitives.
- `src/components/canvas/ContactChannelControls/` — inline hover UI (reuses
  `useHoverPlusExclusive`, `recordPlusLayoutSize`, shared `.cluster` chip).
- Wire the overlay into the canvas render (`CanvasElements.jsx` / `PdfCanvas`).
- `store/pdfgenerator-context.jsx` — expose the two ops.

Docs:
- `README.md` (EN + PL) — new "Contact channels" feature entry.

## 10. Risks / open questions

- **Δ-reflow reuse**: the cleanest reuse of the section flow engine for a
  masthead-height change is the main implementation risk; the plan should spike
  this first (drive one delete end-to-end) before building the UI.
- **Band-anchor as an empty `text` element**: acceptable, but the plan should
  confirm it never renders a stray glyph in the PDF (empty content → no draw)
  and is excluded from structural section detection (`flowRole` guard).
- **Multiple bands**: only one band exists in Phase 1 (main masthead); the
  `contactBandId` scoping is designed so Phase 2's sidebar band is additive.

## 11. Roadmap (later phases — not designed here)

- **Phase 2**: sidebar / stacked layouts (add `stacked` + `sidebar` modes to the
  engine and descriptor).
- **Phase 3**: title/role line + name-uppercase toggles (masthead identity).
- **Phase 4**: profile photo slot add/remove (reuse `photoSlot`).
- **Phase 5**: new `cv_data` fields (extra field, birth date, nationality) with
  wizard/extract/generator plumbing, then exposed in the manager.
