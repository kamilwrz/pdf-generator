/**
 * Pointer helpers for textarea/text edit vs drag disambiguation.
 *
 * A small movement threshold starts a drag. Template mode uses one click for
 * direct editing, while freeform mode keeps one click for resize selection and
 * a double click for inline editing.
 */
export function hasTextareaDragIntent(start, event, threshold = 3) {
    if (!start || (event.buttons & 1) !== 1) return false;
    const deltaX = event.clientX - start.clientX;
    const deltaY = event.clientY - start.clientY;
    return (deltaX * deltaX) + (deltaY * deltaY) >= threshold * threshold;
}

/**
 * Resolve a completed click without mutating selection or editor state.
 *
 * Drag and fixed-page guards win first. An already-editing surface keeps the
 * browser's native caret behavior, Ctrl/Cmd-click remains additive selection,
 * and only an ordinary template-mode click enters inline editing.
 *
 * @param {{
 *   didDrag?:boolean,
 *   additive?:boolean,
 *   isEditing?:boolean,
 *   fixedToPage?:boolean,
 *   templateMode?:boolean,
 * }} options
 * @returns {"ignore"|"focus"|"select-additive"|"edit"|"select"}
 */
export function resolveTextClickIntent({
    didDrag = false,
    additive = false,
    isEditing = false,
    fixedToPage = false,
    templateMode = false,
} = {}) {
    if (fixedToPage || didDrag) return "ignore";
    if (isEditing) return "focus";
    if (additive) return "select-additive";
    return templateMode ? "edit" : "select";
}
