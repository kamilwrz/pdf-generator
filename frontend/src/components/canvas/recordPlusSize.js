/**
 * Layout size for hover controls (add/remove/reorder) painted inside the
 * zoom-scaled A4 page.
 *
 * The page uses `transform: scale(zoom)`, so a layout pixel appears as
 * `layout * zoom` screen pixels. We target a compact on-screen size and divide
 * by zoom so controls retain one screen size. Body portals use zoom=1 because
 * they are already outside the transformed page; only their anchors scale.
 *
 * The controls use a shared white toolbar surface so they remain usable
 * without competing with the CV content.
 */

/** Visual scale requested for grouped section and record toolbars. */
export const STRUCTURAL_TOOLBAR_VISUAL_SCALE = 0.8;

function scaledStructuralValue(value, zoom) {
  return Number((value * STRUCTURAL_TOOLBAR_VISUAL_SCALE).toFixed(4)) / zoom;
}

/** Screen-space gap above the text anchor used by section and record toolbars. */
export const STRUCTURAL_TOOLBAR_VERTICAL_GAP_SCREEN_PX = 24;

/**
 * @param {number} [zoom=1]
 * @param {number} [fontSize=10] unused reserved for future per-line tuning
 * @returns {{ buttonSize: number, iconSize: number, gap: number, offset: number }}
 */
export function recordPlusLayoutSize(zoom = 1, fontSize = 10) {
  // No zoom-dependent floor: it made inline icons grow at high canvas zoom.
  const { buttonSize, iconSize, gap, offset } = compactInlineToolbarLayoutSize(zoom);
  void fontSize;
  return { buttonSize, iconSize, gap, offset };
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
    buttonSize: scaledStructuralValue(36, safeZoom),
    iconSize: scaledStructuralValue(15, safeZoom),
    gap: scaledStructuralValue(3, safeZoom),
    labelWidth: scaledStructuralValue(76, safeZoom),
    // Text keeps the accessible 12px minimum instead of shrinking with icons.
    fontSize: 12 / safeZoom,
    menuWidth: scaledStructuralValue(176, safeZoom),
    // The page transform scales this layout value back into an exact visual
    // gap, so structural toolbars keep their requested rhythm at every zoom.
    offset: safeOffset / safeZoom,
    borderWidth: 1 / safeZoom,
  };
}

/**
 * Return the compact geometry used by inline add controls.
 *
 * Inline controls use a 24px target with the same 12px icon, padding, and
 * hairline as section/record toolbars. The latter keep their 28.8px targets.
 * This narrow canvas exception keeps advice and document text unobstructed.
 *
 * @param {number} [zoom=1]
 * @returns {{buttonSize:number,iconSize:number,gap:number,labelWidth:number,fontSize:number,menuWidth:number,offset:number,borderWidth:number}}
 */
export function compactInlineToolbarLayoutSize(zoom = 1) {
  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0.05
    ? Number(zoom)
    : 1;
  return {
    ...structuralToolbarLayoutSize(safeZoom, 8),
    buttonSize: 24 / safeZoom,
  };
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
