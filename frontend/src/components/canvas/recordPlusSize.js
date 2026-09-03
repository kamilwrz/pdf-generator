/**
 * Layout size for hover controls (add/remove/reorder) painted inside the
 * zoom-scaled A4 page.
 *
 * The page uses `transform: scale(zoom)`, so a layout pixel appears as
 * `layout * zoom` screen pixels. We target a compact on-screen size and divide
 * by zoom so the control stays proportional to the canvas view percentage
 * without looking oversized at 100%.
 *
 * The controls use a small, low-contrast surface chip so they remain usable
 * without competing with the CV content.
 */

/** Desired on-screen icon edge length in CSS pixels at any zoom. */
const TARGET_ICON_SCREEN_PX = 14;

/** Desired on-screen gap between clustered controls in CSS pixels. */
const TARGET_GAP_SCREEN_PX = 6;

/** Screen-space gap between a section toolbar and its heading anchor. */
export const SECTION_TOOLBAR_OFFSET_SCREEN_PX = 34;

/** Screen-space gap between a record toolbar and its first-element anchor. */
export const RECORD_TOOLBAR_OFFSET_SCREEN_PX = 16;

/**
 * @param {number} [zoom=1]
 * @param {number} [fontSize=10] unused reserved for future per-line tuning
 * @returns {{ buttonSize: number, iconSize: number, gap: number }}
 */
export function recordPlusLayoutSize(zoom = 1, fontSize = 10) {
  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0.05
    ? Number(zoom)
    : 1;
  // Keep a small floor so the hit target stays usable at very high zoom.
  const iconSize = Math.max(10, TARGET_ICON_SCREEN_PX / safeZoom);
  const gap = Math.max(4, TARGET_GAP_SCREEN_PX / safeZoom);
  void fontSize;
  return { buttonSize: iconSize, iconSize, gap };
}

/**
 * Screen-stable dimensions for the grouped section/record toolbar.
 *
 * Unlike small single-purpose canvas icons, structural actions need enough
 * room for reliable pointer targeting and a short text label. Every value is
 * divided by the A4 zoom because the parent page transform scales it back to
 * the intended on-screen dimensions.
 *
 * @param {number} [zoom=1]
 * @param {number} [offsetScreenPx=10] desired anchor gap in screen pixels
 * @returns {{buttonSize:number,iconSize:number,gap:number,labelWidth:number,fontSize:number,menuWidth:number,offset:number,borderWidth:number}}
 */
export function structuralToolbarLayoutSize(zoom = 1, offsetScreenPx = 10) {
  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0.05
    ? Number(zoom)
    : 1;
  const safeOffset = Number.isFinite(Number(offsetScreenPx)) && Number(offsetScreenPx) >= 0
    ? Number(offsetScreenPx)
    : 10;
  return {
    buttonSize: 36 / safeZoom,
    iconSize: 15 / safeZoom,
    gap: 3 / safeZoom,
    labelWidth: 76 / safeZoom,
    fontSize: 10.5 / safeZoom,
    menuWidth: 176 / safeZoom,
    // The page transform scales this layout value back into an exact visual
    // gap, so section and record toolbars keep their own rhythm at every zoom.
    offset: safeOffset / safeZoom,
    borderWidth: 1 / safeZoom,
  };
}

/**
 * Return the compact geometry used by inline add controls.
 *
 * Languages established this 80% treatment for controls placed directly
 * under short document content. Skills uses the same helper so the two plus
 * actions cannot drift in size when the shared structural toolbar changes.
 *
 * @param {number} [zoom=1]
 * @returns {{buttonSize:number,iconSize:number,gap:number,labelWidth:number,fontSize:number,menuWidth:number,offset:number,borderWidth:number}}
 */
export function compactInlineToolbarLayoutSize(zoom = 1) {
  return Object.fromEntries(
    Object.entries(structuralToolbarLayoutSize(zoom)).map(([key, value]) => [key, value * 0.8]),
  );
}

/**
 * Resolve the page-edge gutter used by a structural toolbar.
 *
 * A single page follows the template lane: sidebar controls use the left
 * gutter and main-column controls use the right. In a two-page spread the
 * 18 px centre gap cannot contain the grouped toolbar, so each page must use
 * its outside edge. This prevents the first page's toolbar from rendering
 * underneath (or, with a higher z-index, on top of) the second A4 page.
 *
 * @param {"left"|"right"} preferredSide - Lane-derived gutter on one page.
 * @param {"left"|"right"|null|undefined} spreadSide - Physical side in a spread.
 * @returns {"left"|"right"}
 */
export function resolveStructuralToolbarSide(preferredSide, spreadSide) {
  if (spreadSide === "left" || spreadSide === "right") return spreadSide;
  return preferredSide === "left" ? "left" : "right";
}
