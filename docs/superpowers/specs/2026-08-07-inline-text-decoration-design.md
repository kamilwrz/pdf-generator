# Inline text decoration for `text` and `textarea` — design

**Date:** 2026-08-07
**Status:** Approved for planning
**Scope decision:** additive `runs` layer over the existing plain-text model, preserving the byte-for-byte Canvas↔PDF fast path for every element that carries no formatting.

---

## 1. Problem and goal

Today a canvas text element (`text` single-line and `textarea` multi-line) has **one uniform style**: `bold`, `italic`, `underline`, `color`, `fontFamily`, `fontSize` apply to the whole element. The user wants **inline decoration** — styling a *selection inside* the content (e.g. bolding "KYC" in the middle of a summary paragraph), the way the reference editor in the screenshot does.

**Hard constraint from the user:** do not change or regress any existing functionality or UX. This is a pure extension. Every existing document, template, and generator output must render exactly as it does today.

**The delicate part:** the 1:1 Canvas→PDF guarantee exists because both sides wrap *plain* text and draw each line with a *single* font. Inline decoration breaks the "one font per element" assumption — real bold/italic variants have different glyph metrics, so a styled span shifts wrap points and forces multiple fonts on one line.

---

## 2. Scope (confirmed)

| Dimension | Decision |
|---|---|
| Elements | Both `textarea` (multi-line) **and** `text` (single-line) |
| Marks | **bold, italic, underline, color** (per selection) |
| Justify + inline | **Out of scope for v1.** When an element has runs and `align === "justify"`, degrade justify to left for that element (both canvas and PDF), so parity holds. Plain elements keep justify unchanged. |
| Links / hyperlinks | Out of scope |
| Textarea edit widget | **Uniform `contentEditable`.** All textareas edit in a contentEditable div; the native `<textarea>` edit path is replaced. Parity (box, wrap, caret, auto-grow) guarded by a checklist; IME/undo/paste edge cases verified. |

---

## 3. Data model (additive, no DB migration)

Add one **optional** field to the element shape on both sides:

```
runs: Array<{
  start: number,   // inclusive char offset into `content`
  end: number,     // exclusive char offset into `content`
  bold?: boolean,
  italic?: boolean,
  underline?: boolean,
  color?: string,  // hex; overrides element base color for the span
}>
```

### Invariants
- **`content` stays a plain string** — the single source of truth for wrapping, sanitization, reflow, AI, and backward compatibility. `runs` is a *style overlay* addressed by character offset.
- Offsets index the **sanitized** `content` (post `sanitizeTextContent`).
- Runs are **non-overlapping, sorted, clamped** to `[0, content.length]`. Adjacent runs with identical marks are merged; empty runs dropped. Normalization runs on every serialize/save.
- Element-level `bold/italic/underline/color` remain the **base style**. A run overrides only the marks it declares. A run `{start,end,bold:true}` = bold *on top of* the base; `color` in a run replaces the base color for that span only.
- **Fast path:** `runs` null or empty ⇒ every code path is literally today's code. No new branch is entered.

### Persistence
`runs` is a style attribute without a dedicated DB column, so it rides in the existing `extra_properties` JSON blob — the same mechanism already used for `bold`, `align`, `flowGroup`, etc. **No Alembic migration.**

Touch points:
- `backend/app/schemas/pdf_schema.py` — add `runs: Optional[list[TextRun]]` to `PdfElement` (+ a `TextRun` BaseModel). Regenerate `shared/pdf-element.schema.json` via `python -m app.schemas.export_pdf_element_schema`.
- `backend/app/crud/pdfs.py` — add `"runs": element.runs` to the three `extra_properties` dicts (create ~L93, update insert ~L202, update existing ~L244).
- Frontend DB→element hydration (wherever `extra_properties` is unpacked when reopening a document via `show_pdf`) — read `runs` back onto the element.

---

## 4. Frontend — display rendering

New helper, e.g. `frontend/src/utils/renderStyledText.js`:
`renderStyledText(content, runs) → ReactNode` splits `content` at run boundaries and emits `<span>`s with `fontWeight` / `fontStyle` / `textDecoration` / `color`. Spans are **inline**, so the browser wraps naturally across span boundaries — matching the run-aware PDF wrap.

- **`Text.jsx`** display: currently paints `node.textContent = sanitizeTextContent(content)` in a layout effect (to avoid React fighting contentEditable). When `runs` present and not editing, paint styled spans instead (set innerHTML from the serialized spans, or render React children in the non-editing branch). No runs ⇒ unchanged `textContent` path.
- **`Textarea.jsx`** display (`block` div and `fixedToPage` div): replace the raw `cleanContent` child with `renderStyledText(cleanContent, runs)`. Bullet path (`renderBulletLines`, L30) must compose: split content by `\n` as today, and for each line slice `runs` to that line's offset window before styling. No runs ⇒ current `renderBulletLines` / raw text.

**UX invariant:** a reader/viewer with no formatting sees identical output; a document author who never selects-and-formats sees no change.

---

## 5. Frontend — edit mode + toolbar

### Text (already `contentEditable`)
- On enter-edit, populate the node with styled spans (from `runs`) instead of plain text.
- On `input`/`blur`, serialize DOM → `{content, runs}` and store both via `editElementValues`.

### Textarea (native `<textarea>` → `contentEditable` div)
- Replace the edit-mode `<textarea>` (Textarea.jsx L248–280) with a `contentEditable` div using the **same** `boxStyle` + `textStyle` as display, so wrap is identical to display and PDF.
- Preserve current behaviors explicitly:
  - **Auto-height:** measure the editing div's `scrollHeight` (same signal `measureNaturalScrollHeight` uses) on input; keep `fitTextareaToContent` / non-autoHeight height write.
  - **Placeholder:** "Wpisz swój tekst…" via CSS `:empty::before` (contentEditable has no native placeholder).
  - **Escape = blur** to commit; **Enter** inserts a newline.
  - **Newline normalization:** browsers insert `<div>`/`<br>` on Enter; the serializer converts block boundaries back to `\n` so `content` stays plain.

### Serialization: `serializeEditable(node) → {content, runs}`
Walk text nodes in document order, track cumulative char offset, read the effective marks from ancestor formatting spans (authored as explicit `data-b` / `data-i` / `data-u` / `data-color` wrappers, **not** `execCommand`, for deterministic parsing), emit runs. Then `sanitizeTextContent(content)` and clamp/normalize runs. Because editing rederives runs from the DOM, we never hand-patch offsets on keystrokes — the DOM is authoritative during editing.

### Inline format toolbar (new component `InlineFormatToolbar`)
- Appears **only** on a non-collapsed selection inside an editing text/textarea. Selecting text does nothing today, so this is **purely additive UX** — nothing existing changes.
- Buttons: **B / I / U** and a **color** swatch. Toggling wraps/unwraps the current `Range` with a `data-*` span (splitting existing spans at the selection edges), then re-serializes.
- Positioned above the selection rect (`Range.getBoundingClientRect`).
- The element-level B/I/U controls in the properties panel stay exactly as they are (whole-element base style).

---

## 6. Backend — run-aware PDF rendering (Python, `pdf_generator.py`)

**Fast path first:** every function checks for runs; absent ⇒ call today's exact code.

- **`_wrap_textarea`** — unchanged for the no-runs case. Add `_wrap_textarea_runs` for the runs case: each character carries its active run's resolved style; a candidate line's width is the **sum of its sub-run widths**, each measured with its own font via `_resolve_font(family, bold, italic)`. Returns lines as **lists of styled pieces** rather than a single string.
- **`renderTextarea` / `renderText`** — for the runs case, draw each piece in order with `_draw_text_line` at an accumulating `x` (`x += piece_width`); underline drawn per piece; alignment offset computed from the **total** line width (sum of pieces). `align == "justify"` with runs ⇒ draw left (v1 degradation). No-runs case draws exactly as today.
- **`measure_textarea_height`** — line count from the run-aware wrapper when runs are present; unchanged otherwise.
- **Color / faux styling** — `_resolve_font` already returns real vs faux bold/italic, and color is already per-draw; per-run just calls the existing machinery per piece.
- The renderer receives `PdfElement` straight from the request payload (`PDFCreateRequest.root`), so `runs` reaches render with no extra plumbing beyond the schema field.

---

## 7. Parity — the one thing to validate empirically

Core risk: the browser's native wrapping of inline spans (real bold/italic webfonts) vs Python summing per-run metrics from the **same** font files.

Why it should hold: for a single font the two sides already agree (the existing guarantee). Summing widths per run preserves agreement because (a) the fonts are the same files the canvas `@font-face`s, and (b) `WRAP_WIDTH_TOLERANCE_PX` already absorbs sub-pixel drift at span boundaries. Browsers do not apply cross-span kerning in a way that matters at CV body sizes.

**Validation:** a golden test that renders a fixture CV whose summary contains a mid-paragraph bold+color run, and asserts (i) the styled element wraps identically canvas vs PDF at the chosen widths, and (ii) **plain elements are byte-identical to the pre-change output** (proof the fast path is untouched).

---

## 8. Testing

- **Python unit:** a run that declares no style change produces wrapping identical to plain; a bold run changes wrap predictably; per-piece draw x-offsets and underline geometry.
- **Frontend unit:** `serializeEditable` round-trip (DOM ↔ `{content, runs}`), run normalization (merge/clamp/drop-empty), bullet-line run slicing, newline normalization.
- **Regression guard:** the full existing suite must stay green; golden fast-path byte-identity check (§7).

---

## 9. Backward compatibility summary

| Concern | Guarantee |
|---|---|
| Existing documents / templates / generator output | No `runs` ⇒ identical to today on canvas, in edit, and in PDF |
| DB | No migration; `runs` in `extra_properties` |
| API contract | Additive optional field; old clients unaffected |
| Whole-element B/I/U/color controls | Unchanged |
| Reflow / auto-height / pagination | Driven by `content` + measured height as today; unaffected when no runs |
| The only behavioral change for everyone | Textarea edit widget becomes contentEditable — invisible when done to the parity checklist; verified for IME/undo/paste |

---

## 10. Out of scope (v1)

- Justify combined with inline runs (degrades to left when runs present).
- Hyperlinks / clickable links.
- Per-run font-family or font-size changes (only B/I/U/color).
- Any change to whole-element styling controls or the properties panel layout.
