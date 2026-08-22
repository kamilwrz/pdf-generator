/**
 * Identify interactions that are allowed to end the temporary text-edit zoom.
 *
 * Toolbar, sidebar, and browser-chrome clicks can blur a contentEditable node,
 * but they are not document-navigation actions. Only an A4 page interaction
 * should restore the user's pre-edit zoom.
 */
export function isCanvasInteractionTarget(target) {
  return Boolean(target?.closest?.("[data-page-canvas]"));
}
