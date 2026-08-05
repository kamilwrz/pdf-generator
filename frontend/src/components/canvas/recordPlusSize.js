/**
 * Layout size for hover-"+" controls painted inside the zoom-scaled A4 page.
 *
 * The page uses `transform: scale(zoom)`, so a layout pixel appears as
 * `layout * zoom` screen pixels. We target a compact on-screen size and divide
 * by zoom so the control stays proportional to the canvas view percentage
 * without looking oversized at 100%.
 */

/** Desired on-screen button edge length in CSS pixels at any zoom. */
const TARGET_SCREEN_PX = 13;

/** Desired on-screen icon edge length in CSS pixels. */
const TARGET_ICON_SCREEN_PX = 9;

/**
 * @param {number} [zoom=1]
 * @param {number} [fontSize=10] unused reserved for future per-line tuning
 * @returns {{ buttonSize: number, iconSize: number, gap: number, radius: number }}
 */
export function recordPlusLayoutSize(zoom = 1, fontSize = 10) {
  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0.05
    ? Number(zoom)
    : 1;
  // Keep a small floor so the hit target stays usable at very high zoom.
  const buttonSize = Math.max(8, TARGET_SCREEN_PX / safeZoom);
  const iconSize = Math.max(6, TARGET_ICON_SCREEN_PX / safeZoom);
  const gap = Math.max(3, 4 / safeZoom);
  const radius = Math.max(3, 4 / safeZoom);
  void fontSize;
  return { buttonSize, iconSize, gap, radius };
}
