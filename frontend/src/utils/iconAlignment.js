/**
 * Shared vertical-alignment math for text-aligned template icons.
 *
 * Iconic/Cardinal/Harbor templates store an icon's `top` as the companion
 * label's line top for easy authoring, then the canvas shifts the glyph up so
 * it centres on the label's optical middle. That shift must be applied in three
 * places that previously disagreed:
 *   - the rendered <img> (Image.jsx),
 *   - the selection outline (SelectionOverlay.jsx),
 *   - the resize handles (Resize.jsx).
 * Keeping the offset here guarantees the glyph and its selection chrome stay
 * locked together regardless of icon size.
 */

// Vertical offset (px) from the label's stored `top` to its optical middle on
// the CANVAS. The canvas renders single-line text with `line-height: 1`, whose
// glyph centre sits ~1 px below the stored top for the ~8–9 pt labels these
// icons accompany. This is deliberately independent of the icon size, so
// enlarging an icon grows it evenly around the same mid-line instead of pushing
// it lower. (The PDF renderer uses its own constant because ReportLab positions
// text differently; each medium centres the icon on its own text.)
export const CANVAS_TEXT_CAP_MID = 1.0;

/**
 * Whether an image element is a text-aligned icon (optical centring) rather than
 * a geometrically placed image (backgrounds, photos, Loom sidebar glyphs).
 */
export function isTextAlignedIcon(src, alignWithText) {
    // Explicit false opts out (e.g. Loom contact uses geometric centring).
    if (alignWithText === false) return false;
    if (alignWithText === true) return true;
    // Legacy Iconic docs saved without the flag still get optical alignment.
    return /\/template-assets\/iconic\//.test(String(src || ""));
}

/** CSS top that centres a square icon of `size` on the label at `lineTop`. */
export function iconicDrawTop(lineTop, size) {
    const h = Number(size) || 11;
    const textCapMid = (Number(lineTop) || 0) + CANVAS_TEXT_CAP_MID;
    return textCapMid - h / 2;
}

/**
 * The on-canvas top of an image element: text-aligned icons are shifted to the
 * optical mid-line; every other image keeps its stored top. Used for both the
 * rendered glyph and its selection chrome so they never drift apart.
 */
export function imageDisplayTop(element) {
    if (!element || element.category !== "image") return Number(element?.top) || 0;
    return isTextAlignedIcon(element.src, element.alignWithText)
        ? iconicDrawTop(element.top, element.height)
        : Number(element.top) || 0;
}
