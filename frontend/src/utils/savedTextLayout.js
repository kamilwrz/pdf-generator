import { persistedDocumentSignature } from "./persistedDocumentSnapshot.js";

// Symbols survive editor/history object spreads but never enter JSON or PDF
// payloads. Keep the measurement baseline attached to its own document element.
const SAVED_TEXT_LAYOUT = Symbol("savedTextLayout");

function layoutInputs(element) {
  return persistedDocumentSignature([
    element.content, element.width, element.fontFamily, element.fontSize,
    element.lineHeight, element.letterSpacing, !!element.bold, !!element.italic,
    element.runs ?? null, element.align ?? "left", !!element.bulletList,
    element.textTransform, !!element.autoHeight,
  ]);
}

/**
 * Preserve server-saved textarea geometry across mount, font loading, page
 * switching and selection. Actual text/format/width edits invalidate this
 * baseline and retain ordinary auto-height behavior. The input is not mutated.
 */
export function preserveSavedTextLayouts(elements, savedElements = elements) {
  const savedById = new Map(savedElements.map((element) => [element.element_id, element]));
  let changed = false;
  const result = elements.map((element) => {
    const saved = savedById.get(element.element_id);
    if (element.category !== "textarea" || !saved
      || layoutInputs(saved) !== layoutInputs(element)
      || hasUnchangedSavedTextLayout(element)) return element;
    changed = true;
    return { ...element, [SAVED_TEXT_LAYOUT]: layoutInputs(element) };
  });
  return changed ? result : elements;
}

/** Whether automatic measurement would only reinterpret an unchanged saved box. */
export function hasUnchangedSavedTextLayout(element) {
  return element[SAVED_TEXT_LAYOUT] === layoutInputs(element);
}
