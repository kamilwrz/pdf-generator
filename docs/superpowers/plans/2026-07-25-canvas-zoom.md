# Canvas zoom — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A −/+/% zoom control that scales the whole canvas (elements keep their relative positions/sizes) and still exports a pixel-accurate PDF at any zoom.

**Architecture:** Zoom is ephemeral view state in `useA4Elements.js` (default 100%, clamped 25%–300%, never persisted/exported/undoable). `#A4` gets a CSS `transform: scale(zoom)`; a sizing wrapper reserves the scaled layout space so the existing `overflow: auto` scroll still works. Element dragging and every DOM-measurement path (`handleMoveElement`, `getElementBounds`, `measureElements`) already divide screen measurements by a `rect.width / pageWidth` ratio that has always been 1 — it becomes the zoom factor for free once `#A4` is transformed. Only two paths read raw screen deltas and need a `/zoom` division added: `handleResizeElement` and `pickConnectorAt`. PDF export reads only stored `A4_Elements` numbers, never the DOM, so it's already zoom-safe.

**Tech Stack:** React (frontend only). No backend, schema, or `usePdfExport` change. No JS test framework in this repo — verification is manual in a running browser.

## Global Constraints

- Zoom is view-only: not saved to the document, not part of the autosave snapshot, not in undo/redo history, reset to 100% on load. It lives in its own `useState` outside `A4_Elements`, so exclusion is automatic.
- Clamp to [0.25, 3.0], step 0.1. Values rounded to 2 decimals to avoid float drift across steps.
- Do NOT modify `handleMoveElement`, `getElementBounds`, `measureElements`, or anything in `usePdfExport.js` — they are already correct under a transformed `#A4`.
- The `ref` on `#A4` must keep pointing at the *scaled* element (the one every `getBoundingClientRect()` call targets), not the new wrapper.

Reference: `docs/superpowers/specs/2026-07-25-canvas-zoom-design.md`

---

### Task 1: Zoom state, visual scaling, and the toolbar control

This task makes zoom visible and usable end-to-end. After it, the canvas scales and dragging elements still tracks the cursor (because `handleMoveElement` already absorbs the transform) — but resize and connector-creation will be inaccurate at non-100% zoom until Task 2. That's the intended task boundary.

**Files:**
- Modify: `frontend/src/hooks/useA4Elements.js` (zoom state + actions + return)
- Modify: `frontend/src/pages/PdfCanvas.jsx` (destructure, context value, pass `zoom` to `<A4>`)
- Modify: `frontend/src/components/canvas/A4/A4.jsx` (zoom prop + sizing wrapper)
- Modify: `frontend/src/components/canvas/A4/A4.module.css` (move centering to wrapper)
- Modify: `frontend/src/components/editor/Topbar/Topbar.jsx` (zoom control UI)
- Modify: `frontend/src/components/editor/Topbar/Topbar.module.css` (zoom control styling)

**Interfaces:**
- Produces (context): `zoom: number` (current factor, 1 = 100%), `zoomIn() -> void`, `zoomOut() -> void`. Both clamp to [0.25, 3.0].

- [ ] **Step 1: Add zoom constants and state to the hook**

In `frontend/src/hooks/useA4Elements.js`, add module-level constants right after the `PAGE_PRESETS` export (the block ending at line 15, before the `presetFromDims` export at line 17):

```js
// Canvas zoom is view-only (never persisted or exported). Clamp + round to
// 2 decimals so repeated ±0.1 steps don't drift (0.1+0.2 float noise).
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
```

Then, inside the hook, immediately after the `pageSize` state declaration (line 95):

```js
  const [pageSize, setPageSize] = useState({ preset: "a4-portrait", ...PAGE_PRESETS["a4-portrait"] });
```

add:

```js
  // View-only zoom (not persisted, not in undo/redo — lives outside A4_Elements).
  const [zoom, setZoomState] = useState(1);
  const zoomIn = useCallback(() => setZoomState(z => clampZoom(z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoomState(z => clampZoom(z - ZOOM_STEP)), []);
```

- [ ] **Step 2: Expose zoom from the hook's return**

In the same file, find the `// page geometry` block in the returned object (lines 1284-1287):

```js
    // page geometry
    pageSize,
    setPageSize,
    setPagePreset,
```

Add a zoom block immediately after it:

```js
    // page geometry
    pageSize,
    setPageSize,
    setPagePreset,
    // zoom (view-only; not persisted)
    zoom,
    zoomIn,
    zoomOut,
```

- [ ] **Step 3: Thread zoom through PdfCanvas**

In `frontend/src/pages/PdfCanvas.jsx`, add to the `useA4Elements` destructure. Find (lines 114-121):

```js
    pageSize,
    setPageSize,
    setPagePreset,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory
  } = useA4Elements(titleRef)
```

Change to:

```js
    pageSize,
    setPageSize,
    setPagePreset,
    zoom,
    zoomIn,
    zoomOut,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory
  } = useA4Elements(titleRef)
```

Then add them to `ctxValue`. Find the `//page geometry` block (lines 429-432):

```js
    //page geometry
    pageSize: pageSize,
    setPageSize: setPageSize,
    setPagePreset: setPagePreset,
```

Change to:

```js
    //page geometry
    pageSize: pageSize,
    setPageSize: setPageSize,
    setPagePreset: setPagePreset,
    //zoom (view-only)
    zoom: zoom,
    zoomIn: zoomIn,
    zoomOut: zoomOut,
```

Then add them to the `useMemo` dependency array. Find (line 486):

```js
    handleShowDeckPanel, handleShowArticlePanel, pageSize, setPageSize, setPagePreset,
```

Change to:

```js
    handleShowDeckPanel, handleShowArticlePanel, pageSize, setPageSize, setPagePreset,
    zoom, zoomIn, zoomOut,
```

Finally, pass `zoom` to the `<A4>` element. Find (line 533):

```js
            <A4 width={`${pageSize.width}px`} height={`${pageSize.height}px`} ref={A4ref}>
```

Change to:

```js
            <A4 width={`${pageSize.width}px`} height={`${pageSize.height}px`} zoom={zoom} ref={A4ref}>
```

- [ ] **Step 4: Apply the visual scale in A4.jsx**

Replace the entire body of `frontend/src/components/canvas/A4/A4.jsx`:

```jsx
import classes from "./A4.module.css";
import { forwardRef } from "react";


export default forwardRef(function A4({ width, height, zoom = 1, children }, ref) {

    // The wrapper reserves the SCALED layout box (CSS transforms don't affect
    // layout size), so .canvas-area's overflow:auto scrolls correctly. #A4
    // itself keeps its unscaled size and is visually scaled from its top-left.
    // ref stays on #A4 so every getBoundingClientRect() call sees the scaled rect.
    return (
        <div
            className={classes.zoomWrapper}
            style={{ width: `calc(${width} * ${zoom})`, height: `calc(${height} * ${zoom})` }}
        >
            <div
                ref={ref}
                id="A4"
                className={classes.A4}
                style={{ width, height, transform: `scale(${zoom})`, transformOrigin: "top left" }}
            >
                {children}
            </div>
        </div>
    )
})
```

- [ ] **Step 5: Move centering to the wrapper in A4.module.css**

Replace the entire contents of `frontend/src/components/canvas/A4/A4.module.css`:

```css
/* The wrapper is sized to the scaled canvas and centers it (margin auto)
   when it fits, or left-aligns + scrolls when wider than .canvas-area —
   mirroring what .A4's own margin:auto did before zoom existed. */
.zoomWrapper {
    margin: 0 auto;
}

.A4 {
    position: relative;
    background-color: white;
    border-radius: 4px;
    box-shadow: 0 20px 50px -18px rgba(30, 48, 78, .32);
}
```

- [ ] **Step 6: Add the zoom control to the topbar**

In `frontend/src/components/editor/Topbar/Topbar.jsx`, extend the `react-icons/fi` import (line 7):

```js
import { FiRefreshCw, FiTrash2 } from "react-icons/fi";
```

to:

```js
import { FiRefreshCw, FiTrash2, FiZoomIn, FiZoomOut } from "react-icons/fi";
```

Add `zoom`, `zoomIn`, `zoomOut` to the context destructure. Find (lines 23-24):

```js
        pageSize,
        setPagePreset,
```

Change to:

```js
        pageSize,
        setPagePreset,
        zoom,
        zoomIn,
        zoomOut,
```

Then render the control inside the `.center` block, immediately after the closing `</select>` (line 95) and before the closing `</div>` of `.center`:

```js
                </select>
                <div className={classes.zoomCluster}>
                    <button
                        type="button"
                        className={classes.zoomBtn}
                        onClick={zoomOut}
                        disabled={zoom <= 0.25}
                        aria-label="Pomniejsz"
                        title="Pomniejsz"
                    >
                        <FiZoomOut />
                    </button>
                    <span className={classes.zoomValue}>{Math.round(zoom * 100)}%</span>
                    <button
                        type="button"
                        className={classes.zoomBtn}
                        onClick={zoomIn}
                        disabled={zoom >= 3}
                        aria-label="Powiększ"
                        title="Powiększ"
                    >
                        <FiZoomIn />
                    </button>
                </div>
```

- [ ] **Step 7: Style the zoom control**

Append to `frontend/src/components/editor/Topbar/Topbar.module.css`:

```css
/* ---- zoom control ---- */
.zoomCluster {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 8px;
    flex-shrink: 0;
}

.zoomBtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--secondary-bg);
    color: var(--ink-2);
    font-size: 15px;
    cursor: pointer;
    transition: background .15s, border-color .15s, color .15s, opacity .15s;
}

.zoomBtn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
}

.zoomBtn:disabled {
    opacity: .4;
    cursor: not-allowed;
}

.zoomValue {
    min-width: 44px;
    text-align: center;
    font: 700 12px var(--font-body);
    color: var(--muted-font);
    user-select: none;
}
```

- [ ] **Step 8: Build check**

Run from `frontend/`:
```
npm run build
```
Expected: build succeeds with no errors (this catches import/JSX mistakes across the six edited files; there is no unit-test layer to run).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/hooks/useA4Elements.js frontend/src/pages/PdfCanvas.jsx frontend/src/components/canvas/A4/A4.jsx frontend/src/components/canvas/A4/A4.module.css frontend/src/components/editor/Topbar/Topbar.jsx frontend/src/components/editor/Topbar/Topbar.module.css
git commit -m "feat: add canvas zoom control and visual scaling"
```

---

### Task 2: Make resize and connector hit-testing zoom-accurate

`handleResizeElement` reads `e.movementX` as a raw 1:1 screen-pixel delta, and `pickConnectorAt` compares raw screen offsets against canvas-unit geometry. Both must divide by the live zoom factor (derived from the `#A4` rect, matching how `handleMoveElement` already does it) so they stay accurate once the canvas is scaled.

**Files:**
- Modify: `frontend/src/hooks/useA4Elements.js` (`handleResizeElement`, `pickConnectorAt`)

**Interfaces:** none new — internal behavior fix only.

- [ ] **Step 1: Divide resize deltas by the zoom factor**

In `frontend/src/hooks/useA4Elements.js`, `handleResizeElement`. Find the top of the function body where it measures the canvas and reads page size (lines 960-964):

```js
    const A4_COORDS = A4ref.current.getBoundingClientRect();

    const { width: A4_WIDTH, height: A4_HEIGHT } = pageSizeRef.current;
    const MIN_WIDTH = 10;
    const MIN_HEIGHT = 10;
```

Change to (derive the zoom factor from the already-measured rect — this is the same `rect.width / pageWidth` ratio `handleMoveElement` uses, and it equals the CSS scale on `#A4`; capture the corrected delta once, before the state updater):

```js
    const A4_COORDS = A4ref.current.getBoundingClientRect();

    const { width: A4_WIDTH, height: A4_HEIGHT } = pageSizeRef.current;
    const MIN_WIDTH = 10;
    const MIN_HEIGHT = 10;

    // Under canvas zoom, a screen-pixel drag covers fewer canvas units. The
    // rect is the SCALED #A4, so rect.width / pageWidth is exactly the zoom
    // factor. Every resize branch below is driven by the horizontal delta.
    const zoom = A4_COORDS.width / A4_WIDTH || 1;
    const moveX = e.movementX / zoom;
```

Then, in every resize branch, replace each occurrence of `e.movementX` with `moveX`. There are exactly these occurrences to change (all within `handleResizeElement`), and no branch uses `e.movementY`:

- textarea branch: `w += e.movementX` → `w += moveX`; `w -= e.movementX; l += e.movementX` → `w -= moveX; l += moveX`
- `top-left`: `element.width - e.movementX` → `element.width - moveX`; both `(heightFactor - e.movementX)` → `(heightFactor - moveX)`; `element.left + e.movementX` → `element.left + moveX`
- `bottom-right`: `element.width + e.movementX` → `element.width + moveX`; `(heightFactor + e.movementX)` → `(heightFactor + moveX)`
- `bottom-left`: `element.width - e.movementX` → `element.width - moveX`; `(heightFactor - e.movementX)` → `(heightFactor - moveX)`; `element.left + e.movementX` → `element.left + moveX`
- `top-right`: `element.width + e.movementX` → `element.width + moveX`; both `(heightFactor + e.movementX)` → `(heightFactor + moveX)`
- `center-right`: `element.width + e.movementX` → `element.width + moveX`
- `center-left`: `element.left + e.movementX` → `element.left + moveX`

After this step, `e.movementX` must not appear anywhere in `handleResizeElement` — grep to confirm: `grep -n "e.movementX\|e.movementY" frontend/src/hooks/useA4Elements.js` should return no lines inside this function (only, if anywhere, unrelated matches — there should be none in the file at all after this change).

- [ ] **Step 2: Divide connector click offsets by the zoom factor**

In the same file, `pickConnectorAt`. Find (lines 230-232):

```js
    const rect = A4ref.current?.getBoundingClientRect();
    if (!rect) return;
    const hit = elementAtPoint(clientX - rect.left, clientY - rect.top);
```

Change to:

```js
    const rect = A4ref.current?.getBoundingClientRect();
    if (!rect) return;
    // rect is the SCALED #A4; convert the screen-space click offset back to
    // canvas units so it matches stored element left/top/width/height.
    const zoom = rect.width / pageSizeRef.current.width || 1;
    const hit = elementAtPoint((clientX - rect.left) / zoom, (clientY - rect.top) / zoom);
```

- [ ] **Step 3: Build check**

Run from `frontend/`:
```
npm run build
```
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useA4Elements.js
git commit -m "fix: keep resize and connector hit-testing accurate under canvas zoom"
```

---

### Task 3: Manual browser verification

**Files:** none (verification only).

This is the real correctness gate — the ratio math is only provable by driving the actual scaled DOM. Verify against a **local** backend (never production — `frontend/src/services/api.js` hardcodes the production URL and the backend needs an API key to start).

- [ ] **Step 1: Start a local backend against an isolated SQLite DB**

From `backend/` (PowerShell), load the key and override the DB so nothing touches production data:
```powershell
Get-Content backend/.env | ForEach-Object {
    if ($_ -match '^([^=#][^=]*)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim("'").Trim('"'))
    }
}
$env:DATABASE_URL = "sqlite:///./zoom_verify.db"
./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
```

- [ ] **Step 2: Point the frontend at the local backend and run it**

Temporarily edit `frontend/src/services/api.js`'s `API_BASE_URL` to `http://127.0.0.1:8000` (throwaway — reverted in Step 6). Run `npm run dev` from `frontend/`. Register a fresh throwaway account.

- [ ] **Step 3: Verify visual scaling and the readout**

Add a few elements (a text box, a rectangle, an image or textarea). Click + and − : confirm the readout steps by 10% each click, the whole canvas scales with all elements keeping their relative positions and sizes, − disables at 25%, + disables at 300%.

- [ ] **Step 4: Verify interactions at ~150% zoom**

Set zoom to ~150%. Then:
- **Drag** a text element — it tracks the cursor with no drift (proves `handleMoveElement` absorbs the transform, unchanged).
- **Resize** a rectangle or image by a corner handle — the edge follows the cursor accurately, not at half/double speed (proves Task 2's resize fix). Repeat at ~50% zoom to confirm it's correct below 100% too.
- **Create a connector** (connect mode, click two connectable elements) — clicking lands on the intended elements, not offset ones (proves Task 2's connector fix).

- [ ] **Step 5: Verify PDF export is zoom-independent**

With content on the canvas, generate a PDF at 100% and note the layout. Set zoom to 150% or 200% and generate again. Confirm the two PDFs are identical — same element positions and sizes — proving export reads stored state, not the zoomed DOM. Also confirm no text is clipped or shifted.

- [ ] **Step 6: Clean up**

Revert the `frontend/src/services/api.js` edit and confirm `git status`/`git diff` show it unchanged. Stop the local backend/frontend. Delete `backend/zoom_verify.db`.

No commit for this task — verification only. If verification surfaces a bug (e.g. left-edge clipping at extreme zoom when the canvas is wider than the viewport — a known risk of `margin: 0 auto` on an overflowing block), fix it in the relevant file and commit with a message describing the fix.
