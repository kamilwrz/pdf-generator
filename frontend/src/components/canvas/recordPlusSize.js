/**
 * Layout size for hover controls (add/remove/reorder) painted inside the
 * zoom-scaled A4 page.
 *
 * The page uses `transform: scale(zoom)`, so a layout pixel appears as
 * `layout * zoom` screen pixels. We target a compact on-screen size and divide
 * by zoom so the control stays proportional to the canvas view percentage
 * without looking oversized at 100%.
 *
 * These are bare icons with no surrounding chip (no background/border/shadow
 * box) — the button's hit target is the icon's own rendered box, so
 * `buttonSize` and `iconSize` are the same value.
 */

/** Desired on-screen icon edge length in CSS pixels at any zoom. */
const TARGET_ICON_SCREEN_PX = 19;

/** Desired on-screen gap between clustered controls in CSS pixels. */
const TARGET_GAP_SCREEN_PX = 10;

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
  const iconSize = Math.max(12, TARGET_ICON_SCREEN_PX / safeZoom);
  const gap = Math.max(5, TARGET_GAP_SCREEN_PX / safeZoom);
  void fontSize;
  return { buttonSize: iconSize, iconSize, gap };
}
