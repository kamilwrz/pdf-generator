# Add Section — Structural Editor (Design Spec)

Date: 2026-08-05
Status: Approved (design), pending implementation plan
Scope: EDITOR-STRUCTURE.md item 1 ("DODAWANIE SEKCJI"), layouts **aa** and **cc** only. Layout **bb** (columns) is deferred.

## 1. Goal

Let a user add a new section to a template-mode document from the structural editor. A
"Dodaj sekcję" button in the Sections panel opens a modal that asks for:

1. the section name (becomes the heading label), and
2. the section layout.

On confirm, the section is appended to the **end of the document flow**, styled to match
the existing template and placed in the document's governing vertical rhythm
(`flowSpacing`).

### Layouts

- **aa — Heading + decorative chrome + single Textarea.** One auto-height content textarea.
- **cc — Heading + decorative chrome + record layout (like education/experience).** One record
  whose stacked lines carry field-naming placeholder text, per the source note
  ("Treść tekstu to nazwa kategorii elementu/tekstu").
- **bb — Heading + decorative chrome + 2/3 columns.** DEFERRED. Both the structural packer
  (`sectionStructure.js`) and the runtime reflow (`textareaReflow.js`) are single-column
  vertical-flow packers with no horizontal/row concept. Columns require teaching the packer
  about horizontal rows (a `flowRow` concept) so they survive reorder / rhythm changes. That is
  a separate spec.

## 2. Background — how sections work today

Relevant existing code:

- `frontend/src/utils/sectionStructure.js` — structural section model. A section is detected by
  `isSectionHeading` (a short text tagged `flowRole: "section-chrome"`, or an untagged short label
  sitting just above a rule). `listDocumentSections` returns headings in reading order.
  `sectionElementIds` collects a section's chrome + body. `packDocumentSections` packs sections in
  a given order from the flow start, paginating with `placeAtFlowCursor`. `reorderSection` and
  `applyFlowSpacing` repack the whole document.
- `frontend/src/utils/flowSpacing.js` — the per-document rhythm `{ stack, record, section, after_rule }`
  (`DEFAULT_FLOW_SPACING`, `normalizeFlowSpacing`). Persisted as `Pdf.spacing_px`.
- `frontend/src/utils/a4ElementFactories.js` — pure constructors for new canvas elements
  (`createTextareaElement`, `createTextElement`, `createLineElement`, …). Callers pass a fresh
  `element_id` (nanoid) and `page`.
- `frontend/src/hooks/useA4Elements.js` — add-handlers (`handleAddText`, `handleAddTextarea`, …)
  stamp id + page, call `markElementsEnter`, append to `A4_Elements`. Handlers are exposed through
  `PdfContext` in `frontend/src/pages/PdfCanvas.jsx` (e.g. `addTextarea: handleAddTextarea`).
- `frontend/src/components/editor/SectionsPanel/SectionsPanel.jsx` — the template-mode flyout that
  today reorders sections and edits `flowSpacing`. Reads `A4_Elements`, `setA4_Elements`,
  `pageSize`, `flowSpacing` from `PdfContext`. This is the home for the new button.
- `frontend/src/components/common/DialogShell/DialogShell.jsx` — shared centered-modal shell
  (backdrop, header, Escape-to-close). Used by `UnlockFreeformModal` as the pattern to follow.

A generated section (see `backend/.../templates/regent.py::section`) is: an optional marker
(`flowRole: "section-chrome"`), a heading label (`flowRole: "section-chrome"`), a rule line
(`flowRole: "section-chrome"`), then body content (`flowRole: "content"`). An education/experience
record (see `backend/.../shared/records.py`) is a stack of title (bold) → subtitle → meta (muted) →
bullet description, spaced by `SPACE_STACK`.

## 3. Architecture

Pure builder/placement layer (no React, unit-tested) + thin UI/wiring, mirroring the existing
`a4ElementFactories` + `useA4Elements` split.

| Layer | Location | Responsibility |
|---|---|---|
| Style sampling | `sectionStructure.js` → new export `deriveSectionStyle(elements, pageHeight)` | Read an existing section's chrome + body into a **style profile**. Falls back to template-neutral defaults when the document has no sections. |
| Section construction | new `frontend/src/utils/sectionBuilder.js` → `buildSectionElements({ name, layout, style, spacing, idFactory })` | Pure. Returns the new section's elements (chrome + body) with correct `flowRole` / `flowGroup` and relative geometry. |
| Placement | `sectionStructure.js` → new export `appendSectionAtEnd(elements, newElements, pageHeight, spacing)` | Place the new strip below the current flow bottom + `spacing.section`, reusing `compactSectionStrip` + `placeAtFlowCursor` via an extracted internal `packStripFromCursor`. Existing sections are NOT repacked. |
| Handler | `useA4Elements.js` → new `handleAddSection(config)` | Sample style, build, append, `markElementsEnter`, select/enter the first editable body. |
| Context | `PdfCanvas.jsx` | Expose `addSection: handleAddSection`. |
| UI | new `frontend/src/components/editor/AddSectionModal/` + button in `SectionsPanel.jsx` | Modal via `DialogShell`: name input + layout choice (aa/cc). |

### Style profile (shape)

`deriveSectionStyle` samples the **last** section (nearest to where the new one is appended) and
returns:

```
{
  left,               // heading/body left edge
  recordWidth,        // body/record width (from body element or rule width)
  heading: { fontSize, fontFamily, color, letterSpacing, bold },
  rule:    { width, height, backgroundColor } | null,
  marker:  { category, width, height, backgroundColor, relLeft, relTop } | null,
  body:    { fontSize, fontFamily, lineHeight, color },
  mutedColor,         // best-effort: sampled from a meta line, else body.color
}
```

When no section exists, defaults are template-neutral (Inter; heading ~8.5px accent-less ink;
rule width = content width from page margins; left/width derived from page size).

## 4. Data model of a new section

**Chrome** — every piece tagged `flowRole: "section-chrome"` so `isSectionHeading` detects the
heading immediately (no reliance on the rule-below heuristic) and reorder / rhythm operations keep
working:

- optional marker (rect/circle) — only when the sampled profile has one
- heading text — the section name, styled from `style.heading`
- rule line — styled from `style.rule`

**Body** — `flowRole: "content"`:

- **aa**: one auto-height textarea, `width = style.recordWidth`, placeholder content (e.g.
  `"Treść sekcji…"`). Created selected + in edit mode (same UX as `handleAddTextarea`).
  Auto-height ensures `isSectionHeading` never mis-detects it (it rejects `autoHeight`).
- **cc**: one record — four stacked auto-height blocks sharing one `flowGroup`
  (`section-<headingId>-rec1`) so the runtime reflow keeps the record together on one page. Gaps
  between lines = `spacing.stack`. Field-naming placeholder text:
  - `Nazwa dyplomu / stanowisko` — bold, `style.body.color`
  - `Uczelnia / firma` — `style.body.color`
  - `Miasto · okres` — `style.mutedColor`
  - `Opis…` — bullet list (`bulletList: true`)

A cc section starts with exactly one record. Adding further records is EDITOR-STRUCTURE item 2
("DODAWANIE REKORDU") and is out of scope here.

## 5. Placement algorithm

```
flowBottom = max absoluteBottom over elements that are NOT fixedToPage and NOT flowRole "masthead"
cursor     = flowBottom + spacing.section
strip      = compactSectionStrip(newElements, pageHeight, spacing, forceTargets = true)
place strip from `cursor` using placeAtFlowCursor pagination, reserving the leading chrome band
  + first body together so a thin rule never orphans in the footer margin
```

`packStripFromCursor(strip, cursorAbs, pageHeight, pageTop, bottomMargin)` is extracted from the
per-strip loop inside `packDocumentSections` and reused by both `packDocumentSections` and
`appendSectionAtEnd`, so pagination stays identical and existing behavior is unchanged.

Only the new elements are repositioned; existing sections keep their exact positions (surgical
append, no drift risk on carefully-tuned documents).

## 6. UI / wiring

- `SectionsPanel.jsx`: a "Dodaj sekcję" button (near the panel header). Local state
  `addModalOpen`. Renders `AddSectionModal`. On confirm, calls `addSection({ name, layout })` from
  `PdfContext`, then closes the modal.
- `AddSectionModal`: built on `DialogShell`. Fields:
  - name text input (required; sensible default such as `"Nowa sekcja"`)
  - layout choice: `aa` = "Nagłówek + treść (Textarea)", `cc` = "Nagłówek + rekordy (jak edukacja/doświadczenie)"
  - footer: "Anuluj" / "Dodaj sekcję"
  - bb is omitted from the choices (deferred).
- `useA4Elements.handleAddSection({ name, layout })`: derive style → build elements (ids from
  nanoid) → `appendSectionAtEnd` → `markElementsEnter` → select/enter first editable body →
  `setA4_Elements`.
- `PdfCanvas.jsx`: add `addSection: handleAddSection` to the context value.

## 7. Edge cases

- **No existing sections** (empty or freeform-like document): `deriveSectionStyle` returns defaults;
  the section is still detectable by `listDocumentSections` and is placed from the flow start.
- **Near page bottom**: leading chrome + first body are reserved together and move to the next page
  as a unit (existing `packDocumentSections` reservation logic, reused).
- **Muted color** for the cc meta line is best-effort: sampled from an existing meta line if one can
  be identified, otherwise falls back to `style.body.color`. Known limitation.
- **Template mode only**: the Sections panel renders only in template mode, so the entry point is
  naturally gated.

## 8. Testing

Node test runner, alongside `sectionStructure.test.js` and a new `sectionBuilder.test.js`:

- aa append: `appendSectionAtEnd` places heading (`section-chrome`) + rule + content textarea below
  the last section with a `section` gap; `listDocumentSections` finds the new heading;
  `sectionElementIds` returns the whole body.
- cc append: record blocks share one `flowGroup`; heading detected; `sectionElementIds` returns all
  four record lines.
- style sampling: `deriveSectionStyle` matches the last section's heading font / left / width and
  rule geometry.
- empty-document defaults: builder + append produce a detectable, well-placed section with no
  source section present.
- page-break reservation: a section appended near the footer moves chrome + first body together to
  the next page.

## 9. Documentation

Per project rules, update `README.md` (English + Polish) and its Features section with accurate file
and line references for the new modules and handler.

## 10. Out of scope (future specs)

- **bb columns** — needs horizontal-row (`flowRow`) awareness in `sectionStructure.js` and
  `textareaReflow.js`.
- **Adding a record** to an existing cc section (EDITOR-STRUCTURE item 2).
- **Cloning** sections / records (EDITOR-STRUCTURE items 3–4).
