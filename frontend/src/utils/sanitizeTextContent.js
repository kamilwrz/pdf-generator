/**
 * Strip control chars / odd Unicode spaces that become visible boxes in PDF
 * viewers (Acrobat labels them as NBSP / missing glyphs).
 * Preserves newlines and tabs used by textareas.
 */
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ODD_SPACE_RE = /[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g;

export function sanitizeTextContent(value) {
  if (value == null) return value;
  return String(value).replace(CONTROL_RE, "").replace(ODD_SPACE_RE, " ");
}
