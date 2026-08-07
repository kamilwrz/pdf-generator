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

/**
 * Whether the floating inspector should expose X/Y / page-align controls.
 * Hidden when those values cannot move the element (layout-owned or locked).
 *
 * @param {object|null|undefined} element
 * @param {"template"|"freeform"|null|undefined} editorMode
 * @returns {boolean}
 */
export function canEditElementPosition(element, editorMode) {
  return canFreePositionElement(element, editorMode);
}

/**
 * Whether the lock toggle is meaningful for this element.
 * Template layout ownership is not cleared by unlocking, so the control is
 * hidden for layout-owned content/chrome. Fixed-to-page chrome never toggles.
 *
 * @param {object|null|undefined} element
 * @param {"template"|"freeform"|null|undefined} editorMode
 * @returns {boolean}
 */
export function canToggleElementLock(element, editorMode) {
  if (!element || element.fixedToPage) return false;
  // Evaluate layout ownership as if unlocked — if still blocked, lock UI is a no-op.
  if (!canFreePositionElement({ ...element, locked: false }, editorMode)) {
    return false;
  }
  return true;
}

/**
 * Whether the floating inspector may offer clone / delete for canvas elements.
 * Structural (template) mode deletes via section/record affordances instead;
 * freeform keeps the panel actions.
 *
 * @param {"template"|"freeform"|null|undefined} editorMode
 * @returns {boolean}
 */
export function canCloneOrDeleteElements(editorMode) {
  return normalizeEditorMode(editorMode) !== EDITOR_MODE_TEMPLATE;
}

/**
 * Whether a geometry size field should appear in the inspector.
 * Auto-height and read-only proportional fields have no editable effect.
 *
 * @param {object|null|undefined} element
 * @param {"width"|"height"} dimension
 * @returns {boolean}
 */
export function canEditElementSizeField(element, dimension) {
  if (!element) return false;
  if (dimension === "height" && element.autoHeight) return false;
  // Image height is derived from width — the panel field is display-only.
  if (dimension === "height" && element.category === "image") return false;
  return true;
}
