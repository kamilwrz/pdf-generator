/**
 * Identify interactions that are allowed to end the temporary text-edit zoom.
 *
 * Toolbar, sidebar, and browser-chrome clicks can blur a contentEditable node,
 * but they are not document-navigation actions. Only an A4 page interaction
 * should restore the user's pre-edit zoom.
 */
export function isCanvasInteractionTarget(target) {
  // Dragging across an active edit surface is text selection, not navigation
  // to another canvas element. The native selection gesture starts with a
  // pointerdown and ends later, so deciding from the eventual mouseup would
  // be too late to prevent the blur-driven zoom restore.
  if (target?.closest?.('[contenteditable="true"], textarea')) return false;
  // Section and record affordances are mounted over the A4 page, but they are
  // editor chrome. Clicking their icons must not end edit-zoom; only a click
  // on the document surface or another document element should do that.
  if (target?.closest?.("[data-editor-control]")) return false;
  return Boolean(target?.closest?.("[data-page-canvas]"));
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
