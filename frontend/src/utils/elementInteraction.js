/**
 * Template chrome: backgrounds, frames, sidebars, page numbers, etc.
 * Marked with fixedToPage in templates and cloned onto every page.
 * These must not be selectable, movable, resizable, or deletable.
 */
export function isDecorativeChrome(element) {
  return Boolean(element?.fixedToPage);
}

export {
  canFreePositionElement,
  EDITOR_MODE_FREEFORM,
  EDITOR_MODE_TEMPLATE,
  inferEditorMode,
  normalizeEditorMode,
} from "./editorMode.js";
