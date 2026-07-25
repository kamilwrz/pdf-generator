# Textarea height always matches content — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A textarea's `height` always reflects its content at its current width — live while typing, and recomputed whenever width changes — so the exported PDF stops silently clipping text whose stored height had drifted out of sync.

**Architecture:** A new shared helper, `measureTextareaHeight(content, width, fontSize, lineHeight)`, ports the character-count wrap formula `backend/app/services/cv_generator.py`'s `Builder.block` already uses. Live typing (`Textarea.jsx`) uses a real DOM `scrollHeight` measurement of the editing `<textarea>` itself — more accurate, and available since the box is actively mounted. Width-resize (`useA4Elements.js`) uses the ported helper instead, since resizing doesn't require the box to be in edit mode, so there's no live textarea DOM node to measure. Creation (`handleAddTextarea`) uses the same helper for its initial height instead of a hardcoded `90`.

**Tech Stack:** React (frontend only — no backend or PDF-generation changes). No JS test framework exists in this repo; verification is manual in a running browser.

## Global Constraints

- Height is never clamped to fit the page — an overflowing box is a visible signal, not silently lost content. Only the page-bounds check for `width`/`left` remains (unchanged).
- Existing saved documents are untouched. This only takes effect as a textarea is created or actively edited (content typed, or width resized) going forward.
- Manual height dragging is removed. The four corner resize handles keep their existing visual/interaction footprint (`Resize.jsx` is unchanged) — only their effect changes: vertical drag movement no longer does anything for a textarea.
- No backend change. `backend/app/services/pdf_generator.py` keeps using stored `height` as-is; this plan is what makes that value trustworthy.

Reference: `docs/superpowers/specs/2026-07-25-textarea-auto-height-design.md`

---

### Task 1: Shared height helper, wired into creation and resize

**Files:**
- Create: `frontend/src/utils/textareaHeight.js`
- Modify: `frontend/src/hooks/useA4Elements.js` (`handleAddTextarea`, `handleResizeElement`'s `category === "textarea"` branch)

**Interfaces:**
- Produces: `measureTextareaHeight(content: string, width: number, fontSize: number, lineHeight: number) -> number` — pure function, no DOM access. Verbatim port of `cv_generator.py`'s `Builder.block` wrap-height formula (lines 79-95 of that file): `cpl = max(10, floor(width / (fontSize × 0.52)))`, one line per `\n`-split segment (`ceil(len(seg)/cpl)` if non-blank, else `1`), `total × lineHeight + 6`.

- [ ] **Step 1: Create the helper**

Create `frontend/src/utils/textareaHeight.js`:

```js
// Ports the backend's character-count wrap heuristic (cv_generator.py's
// Builder.block) so the frontend can keep a textarea's height in sync with
// its content without needing a mounted, editable DOM node to measure —
// e.g. during a width-resize drag, when the box isn't in edit mode.
export function measureTextareaHeight(content, width, fontSize, lineHeight) {
  const cpl = Math.max(10, Math.floor(width / (fontSize * 0.52)));
  let renderedLines = 0;
  for (const seg of (content || "").split("\n")) {
    renderedLines += seg.trim() ? Math.max(1, Math.ceil(seg.length / cpl)) : 1;
  }
  return renderedLines * lineHeight + 6;
}
```

- [ ] **Step 2: Wire it into `handleAddTextarea`**

In `frontend/src/hooks/useA4Elements.js`, add the import alongside the existing one from the same folder:

```js
import { getElementBounds } from '../utils/elementBounds';
```
→
```js
import { getElementBounds } from '../utils/elementBounds';
import { measureTextareaHeight } from '../utils/textareaHeight';
```

Then replace `handleAddTextarea`'s body:

```js
  const handleAddTextarea = useCallback(() => {
    const fontSize = 14;
    const textarea = {
      element_id: nanoid(),
      content: "",
      fontSize,
      fontFamily: "Inter",
      color: "#000000",
      lineHeight: Math.round(fontSize * 1.4),
      letterSpacing: 0,
      left: 20,
      top: 20,
      width: 260,
      height: 90,
      isSelected: true,
      isMove: false,
      isEditing: true,
      bold: false,
      italic: false,
      underline: false,
      align: "left",
      bulletList: false,
      category: "textarea",
      zIndex: 4,
      page: currentPageRef.current,
    };
```

with:

```js
  const handleAddTextarea = useCallback(() => {
    const fontSize = 14;
    const lineHeight = Math.round(fontSize * 1.4);
    const width = 260;
    const textarea = {
      element_id: nanoid(),
      content: "",
      fontSize,
      fontFamily: "Inter",
      color: "#000000",
      lineHeight,
      letterSpacing: 0,
      left: 20,
      top: 20,
      width,
      height: measureTextareaHeight("", width, fontSize, lineHeight),
      isSelected: true,
      isMove: false,
      isEditing: true,
      bold: false,
      italic: false,
      underline: false,
      align: "left",
      bulletList: false,
      category: "textarea",
      zIndex: 4,
      page: currentPageRef.current,
    };
```

(The rest of `handleAddTextarea` — the `setA4_Elements` call — is unchanged.)

- [ ] **Step 3: Wire it into `handleResizeElement`'s textarea branch**

In the same file, find the `category === "textarea"` branch inside `handleResizeElement`:

```js
        // Text boxes resize freely: width follows horizontal drag, height
        // follows vertical drag (unlike lines, where height tracks movementX).
        if (category === "textarea") {
          if (element.element_id !== elementId) {
            return { ...element, isSelected: false };
          }
          let w = element.width;
          let h = element.height;
          let l = element.left;
          let t = element.top;
          const MIN_W = 40;
          const MIN_H = 24;
          if (direction === "bottom-right") { w += e.movementX; h += e.movementY; }
          else if (direction === "bottom-left") { w -= e.movementX; l += e.movementX; h += e.movementY; }
          else if (direction === "top-right") { w += e.movementX; h -= e.movementY; t += e.movementY; }
          else if (direction === "top-left") { w -= e.movementX; l += e.movementX; h -= e.movementY; t += e.movementY; }
          if (l < 0) { w += l; l = 0; }
          if (t < 0) { h += t; t = 0; }
          w = Math.max(MIN_W, Math.min(A4_WIDTH - l, w));
          h = Math.max(MIN_H, Math.min(A4_HEIGHT - t, h));
          return { ...element, width: w, height: h, left: l, top: t };
        }
```

Replace it with:

```js
        // Text boxes: only width follows the drag (horizontal component).
        // Height always derives from content at the current width, never
        // from the drag itself — see measureTextareaHeight.
        if (category === "textarea") {
          if (element.element_id !== elementId) {
            return { ...element, isSelected: false };
          }
          let w = element.width;
          let l = element.left;
          const MIN_W = 40;
          if (direction === "bottom-right" || direction === "top-right") { w += e.movementX; }
          else if (direction === "bottom-left" || direction === "top-left") { w -= e.movementX; l += e.movementX; }
          if (l < 0) { w += l; l = 0; }
          w = Math.max(MIN_W, Math.min(A4_WIDTH - l, w));
          const h = measureTextareaHeight(element.content, w, element.fontSize, element.lineHeight);
          return { ...element, width: w, height: h, left: l };
        }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/textareaHeight.js frontend/src/hooks/useA4Elements.js
git commit -m "feat: derive textarea height from content on creation and width-resize"
```

---

### Task 2: Live auto-grow while typing

**Files:**
- Modify: `frontend/src/components/canvas/Textarea/Textarea.jsx`

**Interfaces:** None new — this only changes the `onChange` handler's body.

- [ ] **Step 1: Implement**

In `frontend/src/components/canvas/Textarea/Textarea.jsx`, find:

```jsx
                onChange={(e) => editElementValues({ content: e.target.value }, elementId)}
```

Replace it with:

```jsx
                onChange={(e) => {
                    const node = e.target;
                    node.style.height = "auto";
                    const measuredHeight = node.scrollHeight;
                    node.style.height = `${measuredHeight}px`;
                    editElementValues({ content: node.value, height: measuredHeight }, elementId);
                }}
```

(`.editing`'s CSS already has `padding: 0; border: none; box-sizing: border-box;` — confirmed in `Textarea.module.css` — so `scrollHeight` is a clean measurement of the wrapped text with no padding/border to account for.)

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/canvas/Textarea/Textarea.jsx
git commit -m "feat: grow/shrink textarea height live while typing"
```

---

### Task 3: Manual verification in a running browser

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run from `frontend/`:
```
npm run dev
```

- [ ] **Step 2: Verify live typing**

Create a new textarea (it should appear one line tall, not the old fixed box). Type several sentences — confirm the box visibly grows with each line added, live, with no lag. Delete content back down — confirm it shrinks back down, never going below roughly one line tall.

- [ ] **Step 3: Verify width-resize**

Type a paragraph of multi-line wrapped text. Drag a corner handle horizontally (left or right) — confirm width changes and height re-derives correctly for the new wrap (more lines if narrower, fewer if wider). Drag the same handle purely vertically — confirm height does **not** change from that alone.

- [ ] **Step 4: Verify PDF export**

Create a textarea, type enough content that it would have overflowed the old fixed 90px height, and export to PDF. Confirm the full text renders in the PDF instead of being clipped partway through.

- [ ] **Step 5: Sanity-check existing documents are untouched**

Open a previously-saved CV/document with existing textareas. Confirm their heights are unchanged on load (no visible layout shift) — the feature should only engage once you actually type into or resize one of them.

No commit for this task — verification only.
