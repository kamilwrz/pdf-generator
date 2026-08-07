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

// Single-character (non-global) forms of the classes above, built from the same
// sources so they can never drift. A non-global copy is required because a
// shared /g regex carries lastIndex state across .test() calls.
const CONTROL_RE_CHAR = new RegExp(CONTROL_RE.source);
const ODD_SPACE_RE_CHAR = new RegExp(ODD_SPACE_RE.source);
const INVISIBLE_RE_CHAR = new RegExp(INVISIBLE_RE.source);

/**
 * Sanitize a single character the same way {@link sanitizeTextContent} treats
 * the whole string: control/invisible characters return "" (dropped), exotic
 * spaces fold to a regular space, everything else is returned unchanged. This
 * lets a caller sanitize text while keeping a parallel per-character array
 * (e.g. inline-run styles) aligned — every dropped character drops its entry.
 */
export function sanitizeChar(ch) {
  if (CONTROL_RE_CHAR.test(ch) || INVISIBLE_RE_CHAR.test(ch)) return "";
  if (ODD_SPACE_RE_CHAR.test(ch)) return " ";
  return ch;
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
