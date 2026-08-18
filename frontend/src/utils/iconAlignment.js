/**
 * Shared vertical-alignment math for text-aligned template icons.
 *
 * Iconic/Cardinal/Harbor templates store an icon's `top` as the companion
 * label's line top for easy authoring, then the canvas shifts the glyph so
 * it centres on the label's optical middle. That shift must be applied in three
 * places that previously disagreed:
 *   - the rendered <img> (Image.jsx),
 *   - the selection outline (SelectionOverlay.jsx),
 *   - the resize handles (Resize.jsx).
 * Keeping the offset here guarantees the glyph and its selection chrome stay
 * locked together regardless of icon size.
 *
 * PDF export (`PDF_Generator.renderImage`) MUST use the same
 * `CANVAS_TEXT_CAP_MID` value so canvas and PDF stay 1:1.
 */

// Vertical offset (px) from the label's stored `top` to the established Iconic
// optical cap midpoint. Harbor uses explicit geometric placement for its
// mixed textarea/text rows; changing this shared value shifts icons in every
// other Iconic template — and must be mirrored in pdf_generator.renderImage.
export const CANVAS_TEXT_CAP_MID = 1.0;

// Background "chip" behind section-heading icons (WYKSZTAŁCENIE, UMIEJĘTNOŚCI,
// …) so the glyph stays legible over any page background/theme, per DESIGN.md
// (sharp 0px corners, muted Swiss palette — no per-template accent tinting,
// since the same neutral chip must read on every template's page color). The
// chip is centred on the icon's own optical mid-line (`imageDisplayTop`), so
// padding reads as even on every side — this is what actually fixes the
// "icon sits low" perception, since a bare glyph has no reference frame to
// judge its vertical position against.
export const SECTION_ICON_CHIP_PAD = 3;
export const SECTION_ICON_CHIP_FILL = "#F5F1E8"; // DESIGN.md Beige
export const SECTION_ICON_CHIP_BORDER = "#B3B3B3"; // DESIGN.md Grey, lightened for a visible hairline on both light and dark surfaces

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

/**
 * Whether an image element is a section-heading glyph (the icon beside
 * "WYKSZTAŁCENIE", "UMIEJĘTNOŚCI", …) rather than a masthead/contact icon.
 * Only these get the visibility background chip — contact-row glyphs weren't
 * part of this request and stay bare to avoid cluttering the header row.
 */
export function isSectionHeadingIcon(element) {
    return Boolean(
        element
        && element.category === "image"
        && element.flowRole === "section-chrome"
        && isTextAlignedIcon(element.src, element.alignWithText),
    );
}

/**
 * Geometry (canvas px) of the background chip behind a section-heading icon,
 * centred on the same optical mid-line as the glyph itself so chip and icon
 * never drift apart. Returns `null` for anything that isn't a section-heading
 * icon — callers render nothing in that case.
 */
export function sectionIconChipRect(element) {
    if (!isSectionHeadingIcon(element)) return null;
    const size = Math.max(Number(element.width) || 0, Number(element.height) || 0) || 14;
    const chipSize = size + SECTION_ICON_CHIP_PAD * 2;
    const iconTop = imageDisplayTop(element);
    const iconLeft = Number(element.left) || 0;
    return {
        left: iconLeft - SECTION_ICON_CHIP_PAD,
        top: iconTop - SECTION_ICON_CHIP_PAD,
        width: chipSize,
        height: chipSize,
    };
}
