/**
 * Strip control / invisible chars that become visible boxes in PDF viewers
 * (Acrobat often labels them as NBSP / missing glyphs).
 * Preserves newlines and tabs used by textareas.
 */
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const ODD_SPACE_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u2028\u2029\u2060\uFEFF\uFFFC\uFFFD]/g;

export function sanitizeTextContent(value) {
  if (value == null) return value;
  return String(value)
    .replace(CONTROL_RE, "")
    .replace(INVISIBLE_RE, "")
    .replace(ODD_SPACE_RE, " ");
}

/** Clean `content` on every text-bearing canvas element before export/save. */
export function sanitizeElementsContent(elements) {
  if (!Array.isArray(elements)) return elements;
  return elements.map((element) => {
    if (
      element == null
      || (element.category !== "text" && element.category !== "textarea")
      || element.content == null
    ) {
      return element;
    }
    const content = sanitizeTextContent(element.content);
    return content === element.content ? element : { ...element, content };
  });
}
