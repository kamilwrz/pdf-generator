# Canvas zoom — design

## Problem

The editor canvas (`#A4`) renders at a fixed 1 page-unit = 1 CSS pixel. There
is no way to zoom in to place elements precisely or zoom out to see a whole
tall document. The user wants a zoom control that scales the whole canvas
(all elements keep their relative positions and sizes) and still exports a
PDF that is pixel-accurate regardless of the current zoom level.

## Goal

- A simple zoom control (− / + buttons and a percentage readout) that scales
  the canvas visually, clamped 25%–300%, stepping 10% per click.
- All on-canvas interactions stay accurate at any zoom: dragging elements,
  resizing them, and creating connectors all land where the cursor is.
- PDF export is byte-for-byte identical at any zoom — zoom is a pure view
  concern and never touches the exported geometry.

## Why this is mostly free

Three interaction paths already divide screen measurements by a
`rect.width / pageWidth` ratio that has always equalled exactly 1 (because
`#A4` has never been transformed): `handleMoveElement`
(`useA4Elements.js:371-378`), `getElementBounds`, and `measureElements`
(`elementBounds.js`). The moment `#A4` carries a real CSS `transform:
scale(Z)`, that ratio becomes `Z` on its own, so element dragging and every
DOM-measurement path (AI position ops, textarea auto-height) stay correct
with **zero changes**.

PDF export is already zoom-safe: `usePdfExport.js` builds its payload purely
from stored `A4_Elements` numbers (`left/top/width/height`) and `pageSize` —
it never reads a DOM rect — so it is unaffected by any visual transform by
construction. No backend or schema change of any kind.

## Design

**Zoom state** lives in `useA4Elements.js` as ephemeral view state
(`useState`, default `1.0`): not persisted to the document, not part of the
autosave snapshot, not in undo/redo history (it lives outside `A4_Elements`
entirely, so it's naturally excluded), and reset to 100% on load. A saved CV
does not remember a zoom level. Exposed through context as `zoom`, plus
`zoomIn`/`zoomOut`/`setZoom` actions (each clamps to [0.25, 3.0]).

**Visual scaling** (`A4.jsx` + `A4.module.css`): `A4` takes a `zoom` prop and
wraps `#A4` in a sizing div. The wrapper's width/height are the *scaled*
dimensions (`calc(<pageWidth>px * <zoom>)`), so `.canvas-area`'s existing
`overflow: auto` reserves correct layout space and shows correct scrollbars —
CSS transforms don't affect layout size, so without this wrapper a zoomed-in
canvas would overflow without scrollbars. `#A4` itself keeps its unscaled
layout size and gets `transform: scale(zoom)` with `transform-origin: top
left`. The `margin: 0 auto` centering moves from `#A4` to the wrapper (centers
the canvas when it's narrower than the viewport; left-aligns and scrolls when
wider). The `ref` still points at the scaled `#A4`, so every existing
`getBoundingClientRect()` call on it returns the scaled rect the ratio math
depends on.

**Resize math** (`handleResizeElement`, `useA4Elements.js:952-1114`): every
branch reads `e.movementX`/`e.movementY` as raw screen-pixel deltas. The
function already computes an otherwise-unused
`A4_COORDS = A4ref.current.getBoundingClientRect()` at its top. Derive the
zoom factor from it — `A4_COORDS.width / A4_WIDTH` (the same ratio
`handleMoveElement` uses) — and capture `moveX = e.movementX / zoom`,
`moveY = e.movementY / zoom` once before `setA4_Elements`, then use
`moveX`/`moveY` in place of `e.movementX`/`e.movementY` in every branch.
Capturing before the state updater also removes a latent reliance on reading
the synthetic event inside the async updater.

**Connector hit-testing** (`pickConnectorAt`, `useA4Elements.js:229-255`):
it converts a click to canvas space with `clientX - rect.left` /
`clientY - rect.top` and compares against stored `left`/`top`/`width`/`height`
(canvas units). Divide the offsets by the same `rect.width / pageWidth` ratio
before calling `elementAtPoint`, so a click at zoom Z resolves to the correct
canvas-space point.

**UI** (`Topbar.jsx`): a small − / percentage / + cluster added to the
topbar, wired to `zoomOut` / `zoom` / `zoomIn`. − disabled at 25%, + disabled
at 300%.

## Non-goals

- No zoom presets, "fit to window", or keyboard/scroll-wheel shortcuts — just
  − / + / readout.
- Zoom is not persisted or exported. No backend, schema, or `usePdfExport`
  change.
- No change to `handleMoveElement`, `getElementBounds`, or `measureElements`
  — they already absorb the transform through their existing ratio math.

## Testing

Frontend-only, no JS test framework in this repo — verified manually in a
running browser against a local backend: zoom in/out changes the readout and
visibly scales the canvas with element ratios preserved; at ~150% zoom,
dragging an element tracks the cursor accurately, resizing tracks the cursor
accurately, and creating a connector picks the correct elements; generating a
PDF at 150% produces output identical to generating at 100% (same element
positions/sizes); − disables at 25% and + at 300%.
