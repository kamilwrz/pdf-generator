/**
 * Identify interactions that are allowed to end the temporary text-edit zoom.
 *
 * Toolbar, sidebar, and browser-chrome clicks can blur a contentEditable node,
 * but they are not document-navigation actions. Only an A4 page interaction
 * should restore the user's pre-edit zoom.
 */
export function isCanvasInteractionTarget(target) {
  // Section and record affordances are mounted over the A4 page, but they are
  // editor chrome. Clicking their icons must not end edit-zoom; only a click
  // on the document surface or another document element should do that.
  if (target?.closest?.("[data-editor-control]")) return false;
  return Boolean(target?.closest?.("[data-page-canvas]"));
}
