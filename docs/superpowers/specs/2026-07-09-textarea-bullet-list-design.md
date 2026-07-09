# Textarea bullet-list hanging indent — design

## Problem

Bullet points in textarea content are today just literal `• ` characters
typed at the start of a line (this is how every CV template and the AI CV
generator produce them). There is no way to add this from a blank textarea
created on the canvas, and even where `• ` is present, a wrapped bullet line
has no hanging indent — the second line of a long bullet wraps flush left
under the bullet character instead of lining up under the text.

## Goals

- Let a user creating a textarea from scratch insert a `• ` bullet at the
  current line without hand-typing the character.
- Let a user toggle proper hanging-indent wrapping on/off for any line that
  starts with `•`, on-canvas and in the generated PDF, matching pixel-for-pixel
  (this app already treats canvas px and PDF pt as the same numeric units).
- Upgrade the existing static templates and the AI CV generator to use the
  same hanging-indent flag, so every bullet list in the app (old and new)
  wraps correctly.

## Non-goals

- Rich/mixed text runs, numbered lists, nested lists, or bullet styles other
  than `•`.
- Live hanging-indent while actively typing in the native `<textarea>` (native
  textareas can't do per-line indent). The plain textarea shows raw text while
  editing; the hanging indent appears in the read-only preview block and the
  PDF the moment you click away.
- Any change to how bold/italic/underline/align work.

## Data model

One new boolean field on a textarea element, default `false`:

- Backend: `PdfElement.bulletList: Optional[bool] = False` (`pdf_schema.py`).
- Frontend: `bulletList: false` added to the default object created in
  `useA4Elements.js`'s `handleAddTextarea`, and threaded through
  `CanvasElements.jsx` → `Textarea.jsx` the same way `bold`/`italic`/`align`
  already are.

This flag is pure presentation. It never mutates the stored `content` string
— it only tells the renderer whether to apply hanging indent to lines that
already start with `•`.

## Editing UI (`Editor.jsx`, textarea section only)

Two new controls, added next to the existing "Edit text" / style / align
controls, only rendered when `selectedElement.category === "textarea"`:

1. **"Insert bullet" button** — rendered only while the box is actively being
   edited (`selectedElement.isEditing`). On click:
   - Reads the live `<textarea>` DOM node via `document.getElementById(elementId)`
     (same pattern already used by `handleAlignElements`), gets `selectionStart`.
   - Finds the start of the current line: `content.lastIndexOf("\n", start - 1) + 1`.
   - No-ops if that line, trimmed of leading whitespace, already starts with `•`.
   - Otherwise splices `• ` in at the line start, calls `editElementValues({ content })`.
   - Uses `onMouseDown={e => e.preventDefault()}` on the button so clicking it
     never blurs the textarea (which would flip `isEditing` false via the
     existing `onBlur` handler) — the textarea keeps focus throughout.
   - After the content updates, restores focus and moves the cursor to just
     after the inserted `• ` (original `start + 2`).
2. **Hanging-indent toggle** — one icon button, visually consistent with the
   existing Bold/Italic/Underline row, wired through the existing generic
   `toggleStyle("bulletList")` helper already used for those flags. Turning it
   off never deletes `•` characters from the content — it only reverts to
   today's plain wrap.

## Rendering rule (shared by canvas preview and PDF)

Applied identically on both sides so they stay pixel-matched:

- `indent = fontSize * 1.1` (same numeric formula both places — this avoids
  needing two different font-metrics implementations, canvas `measureText`
  vs. ReportLab `stringWidth`, to agree to the pixel).
- Content is split into paragraphs on `\n` (already how both renderers work).
- A paragraph is a "bullet paragraph" iff `bulletList` is on **and** the
  paragraph, with leading whitespace stripped, starts with `•`.
- Non-bullet paragraphs wrap exactly as they do today — untouched.
- Bullet paragraphs wrap their text against `boxWidth - indent` instead of the
  full box width. The first wrapped line draws at the box's left edge; every
  continuation line of that same paragraph draws shifted right by `indent`.
  Alignment (`left`/`center`/`right`/`justify`) is computed within the
  line's own effective left/width (i.e. `left + indent`, `width - indent`
  for continuation lines), so existing alignment logic generalizes with no
  special-casing — non-bullet lines just have `indent = 0`.

### Frontend (`Textarea.jsx`)

- When `bulletList` is false (the common/unchanged case): keep the current
  single `<p>{content}</p>` fast path — no behavior change, no risk to
  existing textareas.
- When `bulletList` is true and not editing: render one `<div>` per line
  instead of a single text node, each carrying the shared wrap/box CSS
  (`white-space: pre-wrap`, etc. — same classes as today) plus, for lines
  detected as bullet lines, inline `paddingLeft: indent` / `textIndent: -indent`.
- While editing (`isEditing`), always render the plain `<textarea>` exactly as
  today, regardless of `bulletList` — no live indent preview.

### Backend (`pdf_generator.py`)

- `_wrap_textarea` gains a `bullet_list: bool` parameter and starts returning
  a third element per line, `indent_px`, alongside the existing
  `(line, is_last_of_paragraph)` tuple.
- `renderTextarea` gains a `bulletList` parameter, passes it through to
  `_wrap_textarea`, and uses each line's `indent_px` to offset the x position
  / effective width before the existing alignment math.
- `render_elements` reads `getattr(element, "bulletList", False)` and passes
  it into `renderTextarea`, the same way `bold`/`italic`/`underline`/`align`
  are already read.

## Existing templates and AI CV generator

- `frontend/src/templates/helpers.js` gains one new exported wrapper,
  matching the existing local `bold`/`ital` wrapper idiom already used in
  each template file:
  ```js
  export const bulleted = (el) => ({ ...el, bulletList: true });
  ```
- Every `block(...)` call across the 9 template files
  (`ampersand.js`, `aria.js`, `blueprint.js`, `education.js`, `finance.js`,
  `it.js`, `monolith.js`, `nocturne.js`, `prism.js`) whose content contains
  `•` lines gets wrapped: `bulleted(block(...))`.
- `backend/app/services/cv_generator.py`: `_block()` and `Builder.block()`
  gain a `bulletList: bool = False` kwarg (following the same pattern as
  their existing `bold`/`italic`/`align` kwargs). The call sites that build
  bulleted content — `_bullets(job)` blocks in every `_gen_*` function, and
  the block inside `_extra_sections` — pass `bulletList=True`.
- No template text, color, or layout changes otherwise. This is purely
  turning on the new indent flag for content that already contains `•`.

## Testing / verification

- Manual: create a blank textarea, use "Insert bullet" to build a short
  multi-line list with at least one line long enough to wrap, toggle hanging
  indent on/off, confirm the on-canvas preview and a generated PDF agree.
- Manual: open each of the 9 templates and the AI-fill flow, confirm existing
  bullet content now wraps with hanging indent and nothing else visibly
  changed (text, color, position).
- No automated test suite currently exists for rendering output in this repo
  (verified by inspecting `backend/` and `frontend/` — no test runner
  configured); this feature follows that existing convention and is verified
  manually as above.
