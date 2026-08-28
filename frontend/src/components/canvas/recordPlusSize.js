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
 * Larger, screen-stable dimensions for the grouped section/record toolbar.
 *
 * Unlike small single-purpose canvas icons, structural actions need enough
 * room for reliable pointer targeting and a short text label. Every value is
 * divided by the A4 zoom because the parent page transform scales it back to
 * the intended on-screen dimensions.
 *
 * @param {number} [zoom=1]
 * @returns {{buttonSize:number,iconSize:number,gap:number,labelWidth:number,fontSize:number,menuWidth:number,offset:number,borderWidth:number}}
 */
export function structuralToolbarLayoutSize(zoom = 1) {
  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0.05
    ? Number(zoom)
    : 1;
  return {
    buttonSize: 40 / safeZoom,
    iconSize: 17 / safeZoom,
    gap: 4 / safeZoom,
    labelWidth: 82 / safeZoom,
    fontSize: 11 / safeZoom,
    menuWidth: 184 / safeZoom,
    offset: 12 / safeZoom,
    borderWidth: 1 / safeZoom,
  };
}
