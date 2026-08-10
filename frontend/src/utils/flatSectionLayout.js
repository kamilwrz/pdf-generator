/**
 * Parse / format helpers for flat-list section content (Skills, Languages,
 * flat custom sections): the two supported layouts are an inline row with
 * items separated by a mid-dot, or a vertical bullet list.
 *
 * Mirrors the backend's `_skills_inline_content` / `_bullet_list_content` /
 * `_clean_list_items` (`backend/app/services/cv_templates/shared/text.py`) so
 * a section generated either way round-trips through the canvas toggle
 * without changing its items.
 */

export const FLAT_SECTION_LAYOUT_INLINE = "inline";
export const FLAT_SECTION_LAYOUT_BULLET = "bullet";

const INLINE_SEPARATOR = "  ·  ";
// Matches the backend's `_LEADING_BULLET` marker set, so content authored by
// either side strips the same way.
const LEADING_BULLET_RE = /^[\s]*[•\-–*—∙·]\s*/;

function cleanListItems(items) {
  return (items || [])
    .map((item) => String(item ?? "").trim().replace(LEADING_BULLET_RE, "").trim())
    .filter(Boolean);
}

/**
 * Recovers the item list from a flat section's current textarea content.
 *
 * `bulletList` tells the parser which separator was authored: bullet content
 * is one item per line (with a leading marker to strip); inline content is
 * one line with items joined by a mid-dot. The mid-dot split tolerates
 * whitespace drift from manual edits (`\s*·\s*`) rather than requiring
 * the exact two-space-padded separator the generators author.
 */
export function parseFlatListItems(content, bulletList) {
  const text = String(content ?? "");
  if (!text.trim()) return [];
  if (bulletList) {
    return cleanListItems(text.split("\n"));
  }
  return cleanListItems(text.split(/\s*·\s*/));
}

/**
 * Builds the `{ content, bulletList }` pair for `style`, ready to pass to
 * `editElementValues`. Matches the exact separators the Python generators
 * author (`_skills_inline_content` / `_bullet_list_content`) so switching
 * layout in the editor renders identically to a freshly generated document.
 */
export function formatFlatListContent(items, style) {
  const cleaned = cleanListItems(items);
  if (style === FLAT_SECTION_LAYOUT_BULLET) {
    return {
      content: cleaned.map((item) => `• ${item}`).join("\n"),
      bulletList: true,
    };
  }
  return {
    content: cleaned.join(INLINE_SEPARATOR),
    bulletList: false,
  };
}

/** Convenience: reparse `content` under its current style, then reformat under `targetStyle`. */
export function convertFlatListContent(content, currentBulletList, targetStyle) {
  return formatFlatListContent(parseFlatListItems(content, currentBulletList), targetStyle);
}

/** Current layout style of a flat-section content element. */
export function flatSectionLayoutStyle(element) {
  return element?.bulletList ? FLAT_SECTION_LAYOUT_BULLET : FLAT_SECTION_LAYOUT_INLINE;
}
