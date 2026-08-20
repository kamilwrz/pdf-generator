# Masthead Identity Toggles — Phase 3 Design

Date: 2026-08-20
Status: Draft for review
Scope: **Phase 3 only** — the two masthead-identity toggles from the Contact
Channel Manager roadmap: a **name-case toggle** and a **title/role line
show-hide**, on the eight templates that already carry a contact band (Harbor,
Atrium, Portico, Cardinal, Tessera, Slate, Nova, Volt). Profile-photo slot
(Phase 4) and new `cv_data` fields (Phase 5) remain out of scope.

This design is the Phase-3 continuation of
`docs/superpowers/specs/2026-08-19-contact-channel-manager-design.md` and reuses
its foundation: per-element identity tags, a zero-footprint **anchor element**
carrying a client-reflow **descriptor**, and the **delta-reflow** primitive that
shifts downstream flow when the masthead height changes.

---

## 1. Problem

After a CV is generated, the masthead identity block — the **name** line and the
**title/role** line — is rendered as plain, ungrouped canvas elements. The user
can edit each line's text (single click, `Text.jsx`), but cannot:

- toggle the name between its designed default case and the alternative
  (e.g. turn Harbor's all-caps `JAN KOWALSKI` back into `Jan Kowalski`, or
  uppercase a template that renders mixed case);
- hide the title/role line as a unit and have the masthead **reflow** (today
  deleting it leaves a gap and nothing re-closes it), then re-add it later.

The target UX matches the contact-channel manager shipped in Phases 1–2:
inline hover affordances that toggle identity options, with the masthead
re-laying itself out deterministically so the **canvas stays the PDF authority**.

### 1.1 Why the naive approaches fail

- **CSS-only uppercase breaks parity.** The PDF renderer draws the stored
  `content` string literally (`renderText`, `pdf_generator.py:544`). Uppercasing
  the name with CSS `text-transform` would show `NAME` on the canvas but render
  `Name` in the PDF.
- **Rewriting the stored string is irreversible.** Overwriting `content` with the
  uppercased value loses the original casing, so the toggle cannot be turned off.

Both are resolved by a single display-plus-render flag (Section 4.1).

## 2. Goals (Phase 3)

- Treat the masthead name + title as a first-class, reflowable identity group,
  scoped by a shared id (a document has one masthead identity block).
- **Name-case toggle**: flip a reversible, lossless `textTransform` flag honored
  identically by the canvas and the PDF renderer.
- **Title show-hide**: remove the title element and reflow the masthead (contact
  band, header rule, first section move up by the title's block height); re-add
  reconstructs the exact title element and reflows back down.
- Deterministic layout stored as element positions, so the existing "canvas is
  the authority" fast path applies — no backend re-render for correctness, and
  Save/Download reproduce exactly what the editor shows.
- Cover all eight contact-band templates uniformly.

## 3. Non-goals (Phase 3)

- Profile-photo slot add/remove — **Phase 4**.
- New `cv_data` fields (extra field, birth date, nationality) — **Phase 5**.
- A settings-popover UI — inline hover per the agreed decision (Phase 1).
- Per-word or per-run case control, small-caps, or title-case — only a binary
  `uppercase | none` transform on the whole element.
- Templates without a contact band (Sterling, Axis, Blueprint, Monument,
  Cinder, Nimbus): the controller does not activate (graceful no-op), so nothing
  regresses. Enabling them is a later, additive follow-up.

## 4. Architecture

Four cooperating pieces. Items 4.1–4.2 are the reusable data foundation; 4.3–4.5
are the client engine, controller, and UI.

### 4.1 `textTransform` element field (parity-safe casing)

A new **optional** field on `PdfElement` (`backend/app/schemas/pdf_schema.py`)
and its canvas mirror:

- `textTransform: "uppercase" | "none" | null` — a display-and-render transform.
  When `"uppercase"`, the canvas renders the element via CSS `text-transform:
  uppercase` and the PDF renderer uppercases the `content` string at draw time.
  The stored `content` keeps its **original case**, so the toggle is reversible.
  Absent / `null` / `"none"` behaves exactly as today.

**Why this preserves byte-stability.** Templates that currently bake `.upper()`
into the stored content (Harbor & Tessera & Slate on the name; Tessera & Slate on
the title) change to emit the *original-case* content plus
`textTransform:"uppercase"`. The renderer uppercases the identical string with the
identical font and `letterSpacing`, so the drawn glyphs are unchanged for existing
CVs. Truncation (`_compact_text`) still runs on the original before the flag is
applied, matching today's order.

### 4.2 Masthead identity tags + descriptor (data model)

Mirrors the contact-band identity model (`contactChannel` / `contactBandId` /
`contactBand`):

- `mastheadRole: "name" | "title" | null` — marks the name and title elements so
  the controller can find and operate on them as a unit.
- `mastheadBandId: str | null` — shared id linking the name, title, and the
  identity anchor. One block per document in Phase 3; the id keeps future blocks
  additive.

A single zero-footprint **masthead-identity anchor** per block carries the
descriptor in `extra_properties`, using the same non-drawing `text` element trick
as `build_contact_band_anchor` (empty `content` → nothing drawn;
`flowRole: "masthead-anchor"` keeps the structural section detector from ever
treating it as a heading). Descriptor contents:

```
mastheadIdentity: {
  id: string,                       // == mastheadBandId
  name: {
    defaultUppercase: boolean,      // the template's designed default
  },
  title: {
    // Full spec to reconstruct the title element after it was hidden.
    spec: {
      content: string, left: number, top: number,
      fontSizePt: number, fontFamily: string, colorHex: string,
      letterSpacing?: number, textTransform?: "uppercase" | "none",
      bold?: boolean,
    },
    blockPt: number,                // vertical amount to shift when hidden/shown
    present: boolean,               // whether the title is currently on the canvas
  },
  // The contact band this masthead sits above, so a title toggle can also nudge
  // the band descriptor's startY and keep later channel reflows correct.
  contactBandId?: string,
}
```

`blockPt` is the distance the elements below the title collapse by when the title
is hidden — the vertical span from the title's top to the top of the next
masthead row (contact band). Each template computes it at generation time from
the geometry it already lays out, so the client never guesses it from positions.

Persistence: `backend/app/crud/pdfs.py` already packs unknown style flags into
`PdfElements.extra_properties`; extend the pack/unpack lists so `textTransform`,
`mastheadRole`, `mastheadBandId`, and the anchor's `mastheadIdentity` object
round-trip. The JSON Schema mirror (`shared/pdf-element.schema.json`) is
regenerated.

### 4.3 Backend generator changes (tag + descriptor emission)

- A shared helper `tag_masthead_identity(name_el, title_el, *, band_id,
  name_default_uppercase, title_block_pt, contact_band_id=None) -> dict` in
  `app/services/cv_templates/shared/masthead.py` (new module). It stamps
  `mastheadRole` on the name and title elements, sets `textTransform` on the name
  to `"uppercase"` when `name_default_uppercase`, captures the title `spec`, and
  returns the identity anchor (via a `build_masthead_identity_anchor`).
- Each of the eight templates: build name/title as today **but drop the inline
  `.upper()`**, pass `name_default_uppercase=True` where that template used to
  uppercase, compute `title_block_pt` from its own header geometry, call the
  helper, and append the returned anchor to its element list. `contact_band_id`
  is the template's existing `"contact-main"`.
- The PDF renderer's `renderText` (`pdf_generator.py:544`) and its call site
  (`pdf_generator.py:1134`) read `textTransform` and uppercase `content` before
  drawing when it is `"uppercase"`. (Single-line `text` only — name and title are
  both `text` elements; `renderTextarea` is unchanged in this phase.)

Templates not in Phase 3 emit no identity anchor; the controller stays inert.

### 4.4 Client identity engine — `frontend/src/utils/mastheadIdentityOps.js`

A pure module (node:test, no React), mirroring `contactBandOps.js`. It exposes
two operations, both committed through the existing `setA4_Elements` + history
path so undo/redo and save work unchanged:

- `applyNameCaseToggle(elements, bandId) -> { elements }`: find the
  `mastheadRole:"name"` element for the band and flip its `textTransform` between
  `"uppercase"` and `"none"`. Positions are untouched (uppercase does not change
  the element's stored box; the canvas and renderer both grow the glyphs in place
  within the existing left origin, matching today's behaviour where the name box
  is not width-constrained). No reflow.
- `applyTitleToggle(elements, bandId, createId) -> { elements, pageCount }`:
  - **Hide**: drop the `mastheadRole:"title"` element; shift every element whose
    `top >= titleTop` (excluding the name above it and the anchor) **up** by
    `blockPt`; decrement the contact band descriptor's `anchor.startY` by
    `blockPt`; set the identity descriptor's `title.present = false`; re-paginate
    via `reconcileDocumentPages`.
  - **Show**: reconstruct the title element from `title.spec` (re-using the
    stored geometry and `textTransform`), shift the same downstream set **down**
    by `blockPt`, restore the band `startY`, set `title.present = true`,
    re-paginate.

The shift set and Δ propagation reuse the Phase-2 section-flow primitives rather
than introducing a parallel engine.

### 4.5 Inline hover UI — `MastheadIdentityControls`

A canvas overlay mirroring `ContactChannelControls` timing/exclusivity
(`useHoverPlusExclusive`, zoom-aware sizing via `recordPlusLayoutSize`, the shared
`.cluster` surface chip):

- Hovering the **name** shows a small case toggle chip (`Aa` when currently
  uppercase — click to lowercase; `AA` when currently none — click to uppercase),
  calling `applyNameCaseToggle`.
- Hovering the **title** shows a **hide** affordance (trash/eye), calling
  `applyTitleToggle` (hide).
- When the title is hidden, a **`+`** appears next to the name (the title's old
  slot is collapsed and un-hoverable), calling `applyTitleToggle` (show).

## 5. Data flow

```
User hovers the name
  -> MastheadIdentityControls shows the case toggle (Aa/AA)
User clicks it
  -> applyNameCaseToggle(elements, bandId)
       -> flip textTransform on the name element (uppercase <-> none)
       -> setA4_Elements(next)   (one history step; canvas + PDF both transform)

User hovers the title
  -> MastheadIdentityControls shows hide
User clicks hide
  -> applyTitleToggle(elements, bandId, createId)  // hide
       -> remove the title element
       -> shift elements below titleTop up by blockPt
       -> contact band descriptor startY -= blockPt
       -> reconcileDocumentPages(...) re-paginates
       -> setA4_Elements(next)
User clicks + near the name -> applyTitleToggle(...) // show (mirror)
```

Save persists the new element set and the updated anchor descriptor; PDF render
uses stored positions and the `textTransform` flag → identical output (canvas is
authority).

## 6. Edge cases & error handling

- **CV with no title** (`cv.title` empty at generation): the template emits no
  title element but still emits the identity anchor with `title.present = false`
  and a `title.spec` seeded with an editable placeholder, so the `+` can add one.
  If no sensible spec geometry exists (no title was ever laid out), the template
  supplies a deterministic default slot (name's left, name-bottom + template gap,
  the template's title font) so add is well defined.
- **Name-case toggle on a template that defaults to mixed case**: symmetric —
  the flag simply moves `none -> uppercase`. `defaultUppercase` only seeds the
  initial state.
- **Legacy documents** (generated before this feature, no identity anchor): the
  controller does not activate; existing per-element editing behaves as today. No
  migration required. Old uppercase names keep their baked-in caps (no flag), so
  they render exactly as before; the toggle is simply unavailable for them.
- **Title hide when it is the only thing above the band**: `blockPt` still closes
  the exact gap; the band and rule move up; the name stays put.
- **Interaction with contact-band reflow**: the title toggle updates the band
  descriptor's `startY`; a subsequent add/remove channel then lays the band out
  from the corrected origin. The two engines share the band id but never run
  simultaneously.

## 7. Canvas ↔ PDF parity

`textTransform` is applied by the same rule on both sides (canvas CSS; renderer
`.upper()` at draw). Title toggling only moves/removes/re-adds elements at
deterministic positions. So the existing parity model holds: no backend
re-render is needed for correctness, and Save/Download reproduce the editor.
Existing PDFs are byte-stable because the previously-baked uppercase becomes
"original content + flag" that the renderer uppercases to the identical glyphs.

## 8. Testing strategy

- **Pure engine** (`mastheadIdentityOps.test.js`, node:test): case toggle flips
  `textTransform` reversibly and touches nothing else; title-hide removes the
  title, shifts downstream by `blockPt`, decrements band `startY`, and reconciles
  pages; title-show reconstructs the title from `spec` and reverses the shift; a
  deterministic golden for a fixed masthead.
- **Renderer** (pytest): `renderText` with `textTransform:"uppercase"` draws the
  uppercased string; without it, the literal string. A regression test asserts a
  template's name output is byte-identical before/after moving from baked
  `.upper()` to flag+original.
- **Templates** (pytest): each of the eight emits a masthead-identity anchor whose
  descriptor round-trips through `extra_properties`, tags the name/title with
  `mastheadRole`, and sets `textTransform:"uppercase"` on the name where it used
  to bake caps. Existing layout/geometry goldens stay green.
- **Manual QA** (running app): on each of the eight templates — toggle name case
  (canvas + Download match); hide the title (band/rule/first section move up),
  add it back (restored with correct case and reflow down); undo/redo one step
  each; Save + Download match the canvas.

## 9. Files touched (Phase 3)

Backend:
- `app/schemas/pdf_schema.py` — `textTransform`, `mastheadRole`, `mastheadBandId`,
  anchor `mastheadIdentity` descriptor; regenerate `shared/pdf-element.schema.json`.
- `app/services/cv_templates/shared/masthead.py` (new) — `tag_masthead_identity`,
  `build_masthead_identity_anchor`.
- `app/services/cv_templates/templates/{harbor,atrium,portico,cardinal,tessera,
  slate,nova,volt}.py` — drop inline `.upper()`, call the helper, append anchor.
- `app/services/pdf_generator.py` — `renderText` honors `textTransform`.
- `app/crud/pdfs.py` — pack/unpack the new fields in `extra_properties`.

Frontend:
- `src/components/canvas/Text/Text.jsx` (+ `Text.module.css`) — apply
  `text-transform` from `element.textTransform` (display-only).
- `src/utils/mastheadIdentityOps.js` (+ `.test.js`) — pure case/title ops.
- `src/hooks/useA4Elements.js` — expose the two ops via the existing history path.
- `src/components/canvas/MastheadIdentityControls/` — inline hover UI (reuses
  `useHoverPlusExclusive`, `recordPlusLayoutSize`, shared `.cluster` chip).
- Wire the overlay into the canvas render (`CanvasElements.jsx` / `PdfCanvas`).
- `store/pdfgenerator-context.jsx` — expose the two ops.

Docs:
- `README.md` (EN + PL) — new "Masthead identity" feature entry.

## 10. Risks / open questions

- **`blockPt` correctness per template**: each template positions its title
  differently (fixed Y in Harbor/Nova/Volt; computed elsewhere). The plan should
  spike one template's title hide end-to-end before wiring the other seven, to
  confirm `blockPt` closes the gap exactly and the band `startY` update keeps a
  subsequent channel reflow correct.
- **Renderer transform placement**: uppercasing must happen after `content`
  resolution but before width/letter-spacing drawing so `letterSpacing` still
  applies per drawn glyph; confirm against the byte-stability golden.
- **Multiple identity blocks**: only one exists in Phase 3; the `mastheadBandId`
  scoping is designed so a future second block (e.g. a sidebar identity) is
  additive.

## 11. Roadmap (later phases — not designed here)

- **Phase 4**: profile photo slot add/remove (reuse `photoSlot`).
- **Phase 5**: new `cv_data` fields (extra field, birth date, nationality) with
  wizard/extract/generator plumbing, then exposed in the manager.
