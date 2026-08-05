/**
 * Document editor modes: constrained template layout vs freeform project.
 *
 * Template mode keeps auto-layout / reflow in charge of positions.
 * Freeform mode lets the user place every unlocked element freely.
 */

export const EDITOR_MODE_TEMPLATE = "template";
export const EDITOR_MODE_FREEFORM = "freeform";

/**
 * Normalize an API/session value to a known editor mode.
 * @param {unknown} value
 * @returns {"template"|"freeform"}
 */
export function normalizeEditorMode(value) {
  return value === EDITOR_MODE_TEMPLATE ? EDITOR_MODE_TEMPLATE : EDITOR_MODE_FREEFORM;
}

/**
 * Infer mode for legacy documents that predate `editor_mode`.
 * Template-generated canvases almost always carry flowRole / preserveInitialLayout.
 *
 * @param {object[]} elements
 * @param {string|null|undefined} templateId
 * @returns {"template"|"freeform"}
 */
export function inferEditorMode(elements, templateId = null) {
  if (templateId) return EDITOR_MODE_TEMPLATE;
  const list = Array.isArray(elements) ? elements : [];
  if (list.length === 0) return EDITOR_MODE_FREEFORM;
  const interactive = list.filter((element) => !element?.fixedToPage);
  if (interactive.length === 0) return EDITOR_MODE_FREEFORM;
  const templateSignals = interactive.filter((element) => (
    Boolean(element?.flowRole)
    || Boolean(element?.preserveInitialLayout)
    || Boolean(element?.flowGroup)
  )).length;
  return templateSignals / interactive.length >= 0.35
    ? EDITOR_MODE_TEMPLATE
    : EDITOR_MODE_FREEFORM;
}

/**
 * Whether free X/Y drag / resize is allowed for this element in the current mode.
 * Decorative chrome is never free-positioned; template content stays layout-owned.
 *
 * @param {object|null|undefined} element
 * @param {"template"|"freeform"|null|undefined} editorMode
 * @returns {boolean}
 */
export function canFreePositionElement(element, editorMode) {
  if (!element) return false;
  if (element.fixedToPage || element.locked) return false;
  if (normalizeEditorMode(editorMode) !== EDITOR_MODE_TEMPLATE) return true;
  // Template mode: layout owns masthead, section chrome, and flow content.
  if (
    element.flowRole === "section-chrome"
    || element.flowRole === "content"
    || element.flowRole === "masthead"
  ) {
    return false;
  }
  if (element.autoHeight || element.preserveInitialLayout || element.flowGroup) {
    return false;
  }
  // Untagged text/textarea that came from a generator still must not drift.
  if (element.category === "text" || element.category === "textarea") {
    return false;
  }
  // Images/shapes added by the user (no flow tags) may still be placed.
  return true;
}
