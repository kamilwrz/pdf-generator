/**
 * Identify interactions that are allowed to end the temporary text-edit zoom.
 *
 * Toolbar, sidebar, browser-chrome, and element clicks can blur a
 * contentEditable node, but they are not requests to leave the focused canvas
 * view. Only the bare A4 surface or the surrounding canvas area should restore
 * the user's pre-edit zoom.
 */
export function isCanvasInteractionTarget(target) {
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

  // The scroll container's padding and gutters are also intentional canvas
  // background. Descendants outside an A4 page (for example a zoom wrapper's
  // unused area) follow the same exit behaviour as the bare page surface.
  return Boolean(target?.closest?.(".canvas-area"));
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
