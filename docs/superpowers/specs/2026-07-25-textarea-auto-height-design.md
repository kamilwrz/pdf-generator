# Textarea height always matches content — design

## Problem

A `textarea` element's `height` is a plain stored number, set once at creation
(hardcoded `90`) and otherwise only changed by manually dragging a corner
resize handle. Nothing keeps it in sync with `content`: typing past the
current height doesn't grow the box, and nothing stops a user from
drag-shrinking a box below what its text needs. This isn't just a canvas
cosmetic issue — `pdf_generator.py`'s `renderTextarea` clips any wrapped line
whose top falls at or past the stored `height`, so an out-of-sync height
**silently drops text from the exported PDF**.

## Goal

A textarea's `height` always reflects its actual content at its current
width — growing/shrinking live as the user types, and recomputing whenever
width changes (since width affects how many lines the content wraps to).
Manual height dragging is removed; only width stays user-adjustable.

## Non-goals

- No change to already-saved documents. This only affects textareas as they
  are created or edited going forward — opening an old document doesn't
  retroactively touch its stored heights.
- No backend/PDF-generation change. `pdf_generator.py` already uses stored
  `height` as-is; once the frontend reliably keeps it in sync, the existing
  clip-on-overflow behavior simply stops triggering in practice. It remains
  as a defensive backstop, unchanged.
- Height is allowed to grow past the page boundary if content demands it —
  it is **not** clamped to fit the page. Silently clamping would recreate
  exactly the clipping bug this spec exists to fix; an overflowing box is a
  visible signal the user can act on (shrink font, widen the box, trim text).
- One accepted approximation: the bulleted hanging-indent view (shown only
  when *not* actively editing) can wrap slightly differently than the plain
  editing box, since indented continuation lines have less usable width.
  Live-typed height could rarely be a few px short for bulleted content
  specifically. Not solved here — the existing "no live hanging-indent while
  typing" limitation ([2026-07-09-textarea-bullet-list-design.md](2026-07-09-textarea-bullet-list-design.md))
  already established that the editing view and the display view aren't
  pixel-identical while typing.

## Design

**Live typing** (`Textarea.jsx`, the native `<textarea>` shown while
editing): on every `onChange`, use the standard auto-grow technique — reset
the DOM node's `style.height` to `"auto"`, read its `scrollHeight` (the
element has no padding/border, so this is a clean measurement of the
wrapped text), and commit both `content` and the new `height` in the same
`editElementValues` call. This is a real DOM measurement, not an
approximation, so it's pixel-accurate for the plain (non-bulleted-indent)
rendering.

**Width resize** (`useA4Elements.js`, `handleResizeElement`'s
`category === "textarea"` branch): the branch currently applies both
`e.movementX` (to width) and `e.movementY` (to height, and to `top` for the
"top-*" directions) from every corner handle. It changes to apply only
`e.movementX`; height and top are no longer touched by drag deltas.
Immediately after computing the new width, height is recomputed from a new
shared helper — `measureTextareaHeight(content, width, fontSize,
lineHeight)`, a JS port of the character-count formula
`cv_generator.py`'s `Builder.block` already uses for AI-generated CVs
(`cpl = width / (fontSize × 0.52)`, wrapped-line count via `ceil(len/cpl)`
per line, blank lines counting as 1, `× lineHeight + 6`). Reusing this
existing, already-validated heuristic (rather than a second DOM-measurement
path) keeps the less-frequent resize case simple — width-resize doesn't
require the box to be in edit mode, so there's no live `<textarea>` DOM
node available to measure directly.

**Creation** (`handleAddTextarea`): the hardcoded `height: 90` is replaced
with `measureTextareaHeight("", width, fontSize, lineHeight)` — a
new empty textarea starts one line tall instead of an arbitrary fixed size,
consistent with "height always matches content" from the moment it exists.

**Resize handles UI**: no change to `Resize.jsx` — the four corner handles
stay visually and interactionally the same; only what
`handleResizeElement` *does* with the vertical component of the drag
changes (nothing, for textareas). This keeps the familiar corner-drag
affordance for width while removing the ability to desync height.

## Testing

No JS test framework exists in this repo — verified manually in a running
browser: type content past the initial one-line height and confirm the box
visibly grows on each keystroke with no lag; delete content back down and
confirm it shrinks; drag a corner handle horizontally and confirm width
changes while height re-derives correctly (including for multi-line
content); drag the same handle vertically and confirm nothing happens to
height; create a brand-new textarea and confirm it starts one line tall
instead of the old fixed box; export to PDF a textarea whose content would
have overflowed the old fixed height and confirm the full text now renders
instead of being clipped.
