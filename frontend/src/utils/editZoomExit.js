/**
 * Identify interactions that are allowed to end the temporary text-edit zoom.
 *
 * Toolbar, sidebar, browser-chrome, and element clicks can blur a
 * contentEditable node, but they are not requests to leave the focused canvas
 * view. Only the bare A4 paper surface should restore the user's pre-edit
 * zoom; workspace gutters and scrollbars are navigation, not exit actions.
 */
/**
 * Detect a pointer event inside the browser-owned scrollbar gutter.
 *
 * Chromium can report the A4 page below a custom scrollbar as `event.target`.
 * The pointer coordinates are therefore compared with the scroll container's
 * client box before the DOM target is classified. The client box excludes
 * classic scrollbar gutters while `getBoundingClientRect()` includes them.
 *
 * @param {PointerEvent|MouseEvent|object|null|undefined} event
 * @param {HTMLElement|object|null|undefined} scrollContainer
 * @returns {boolean}
 */
export function isScrollbarInteraction(event, scrollContainer) {
  if (
    !event
    || !scrollContainer
    || typeof scrollContainer.getBoundingClientRect !== "function"
    || !Number.isFinite(event.clientX)
    || !Number.isFinite(event.clientY)
  ) return false;

  const bounds = scrollContainer.getBoundingClientRect();
  const clientLeft = Number(scrollContainer.clientLeft) || 0;
  const clientTop = Number(scrollContainer.clientTop) || 0;
  const clientRight = bounds.left + clientLeft + (Number(scrollContainer.clientWidth) || 0);
  const clientBottom = bounds.top + clientTop + (Number(scrollContainer.clientHeight) || 0);
  const insideBounds = event.clientX >= bounds.left
    && event.clientX <= bounds.right
    && event.clientY >= bounds.top
    && event.clientY <= bounds.bottom;

  return insideBounds && (
    event.clientX >= clientRight
    || event.clientY >= clientBottom
  );
}

/**
 * Decide whether a pointer interaction explicitly requests leaving edit zoom.
 *
 * @param {EventTarget|object|null|undefined} target
 * @param {PointerEvent|MouseEvent|object|null|undefined} event
 * @param {HTMLElement|object|null|undefined} canvasArea
 * @returns {boolean}
 */
export function isCanvasInteractionTarget(target, event = null, canvasArea = null) {
  // Native scrollbar hit-testing is browser-owned. Check geometry before the
  // DOM target because Chromium may expose the page below the painted thumb.
  if (isScrollbarInteraction(event, canvasArea)) return false;
  // Dragging across an active edit surface is text selection, not navigation
  // to another canvas element. The native selection gesture starts with a
  // pointerdown and ends later, so deciding from the eventual mouseup would
  // be too late to prevent the blur-driven zoom restore.
  if (target?.closest?.('[contenteditable="true"], textarea')) return false;
  // Section and record affordances are mounted over the A4 page, but they are
  // editor chrome. Clicking their icons must not end edit-zoom.
  if (target?.closest?.("[data-editor-control]")) return false;

  // A rendered element is always a descendant of the page node. Comparing the
  // nearest page by identity distinguishes that element click from a genuine
  // click on the page's own blank surface without requiring every element type
  // to stop propagation or opt into a special marker.
  const page = target?.closest?.("[data-page-canvas]");
  if (page) return page === target;

  // Workspace padding, zoom wrappers, scrollbars, sidebars, and floating tools
  // deliberately do not opt into exit. This strict fallback also prevents a
  // later blur (for example when the AI assistant takes focus) from consuming
  // a stale exit request created by ordinary canvas navigation.
  return false;
}

/**
 * Check whether the document already contains an active text edit.
 *
 * A canvas click can finish one edit and schedule another on the next frame.
 * The zoom-restoration effect must not restore the two-page spread between
 * those two state updates, or the newly selected element can be unmounted.
 *
 * @param {object[]|null|undefined} elements
 * @returns {boolean}
 */
export function hasActiveTextEdit(elements) {
  return (elements || []).some((element) => (
    element?.isEditing
    && (element.category === "text" || element.category === "textarea")
  ));
}

/**
 * Decide whether spread restoration must yield to a replacement edit.
 *
 * @param {object[]|null|undefined} elements
 * @param {string|null|undefined} pendingTextEditId
 * @returns {boolean}
 */
export function shouldDeferEditZoomRestore(elements, pendingTextEditId = null) {
  return pendingTextEditId != null || hasActiveTextEdit(elements);
}
