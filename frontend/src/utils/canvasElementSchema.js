/**
 * Lightweight mirror of the backend PdfElement identity rules.
 *
 * Full JSON Schema lives in `shared/pdf-element.schema.json` (exported from
 * Pydantic). This helper only enforces the hard API boundary used on save:
 * every row must have a non-empty `element_id` and a known `category`.
 */

export const ELEMENT_CATEGORIES = Object.freeze([
  "text",
  "textarea",
  "line",
  "rectangle",
  "circle",
  "ellipse",
  "connector",
  "image",
]);

const CATEGORY_SET = new Set(ELEMENT_CATEGORIES);

/**
 * @param {unknown} root
 * @throws {Error} Polish message when the payload would fail API validation.
 */
export function assertCanvasElementRoot(root) {
  if (!Array.isArray(root)) {
    throw new Error("Lista elementów CV jest nieprawidłowa.");
  }
  for (let i = 0; i < root.length; i += 1) {
    const element = root[i];
    if (!element || typeof element !== "object") {
      throw new Error(`Element #${i + 1} ma nieprawidłowy kształt.`);
    }
    if (typeof element.element_id !== "string" || !element.element_id.trim()) {
      throw new Error(`Element #${i + 1} nie ma identyfikatora.`);
    }
    if (!CATEGORY_SET.has(element.category)) {
      throw new Error(
        `Element #${i + 1} ma nieobsługiwaną kategorię „${element.category ?? ""}”.`,
      );
    }
  }
}
