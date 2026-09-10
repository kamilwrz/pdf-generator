/**
 * Layout size for hover controls (add/remove/reorder) painted inside the
 * zoom-scaled A4 page.
 *
 * The page uses `transform: scale(zoom)`, so a layout pixel appears as
 * `layout * zoom` screen pixels. We target a compact on-screen size and divide
 * by zoom so inline controls retain one screen size. Structural body portals
 * use structuralToolbarScreenLayoutSize with the live page zoom instead.
 *
 * The controls use a shared white toolbar surface so they remain usable
 * without competing with the CV content.
 */

/** Flush placement prevents adjacent entries from stealing hover on the way to actions. */
export const STRUCTURAL_TOOLBAR_VERTICAL_GAP_SCREEN_PX = 0;

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
 * Page-local dimensions for the grouped section/record toolbar.
 *
 * Unlike small single-purpose canvas icons, structural actions need enough
 * room for reliable pointer targeting and a short text label. Every value is
 * divided by the A4 zoom because the parent page transform scales it back to
 * the intended on-screen dimensions. The marker tells the body portal to
 * resolve fresh screen metrics while the page animates, without scaling twice.
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
    ...Object.fromEntries(Object.entries(structuralToolbarScreenLayoutSize(safeZoom, safeOffset))
      .map(([key, value]) => [key, value / safeZoom])),
    scaleWithCanvas: true,
  };
}

/**
 * Resolve structural portal metrics in CSS screen pixels, without side effects.
 * Growth is deliberately gentler than document zoom: 36px buttons at 140%,
 * 48px at 280%. Labels, icons and menu rows grow together; text never falls
 * below 12px. Invalid zoom falls back to 100%. Borders and anchor gaps stay
 * screen-stable, keeping the toolbar flush with text and outside PDF layout.
 * @param {number} zoom - Live A4 transform scale, including animation frames.
 * @param {number} [offsetScreenPx=10] Non-negative gap from the text anchor.
 * @returns {object} Screen-space button, icon, label, menu and surface metrics.
 */
export function structuralToolbarScreenLayoutSize(zoom, offsetScreenPx = 10) {
  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0.05 ? Number(zoom) : 1;
  const scale = (2 + safeZoom / 1.4) / 3;
  return {
    buttonSize: 36 * scale,
    iconSize: 16 * scale,
    gap: 3 * scale,
    labelWidth: 76 * scale,
    fontSize: Math.max(12, 14 * scale),
    menuWidth: 176 * scale,
    offset: Number.isFinite(Number(offsetScreenPx)) && Number(offsetScreenPx) >= 0
      ? Number(offsetScreenPx) : 10,
    borderWidth: 1,
  };
}

/**
 * Return the compact geometry used by inline add controls.
 *
 * Inline controls keep their independent 24px target and 12px icon. They do
 * not inherit structural toolbar growth or change the size of open forms.
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
    buttonSize: 24 / safeZoom,
    iconSize: 12 / safeZoom,
    gap: 2.4 / safeZoom,
    labelWidth: 60.8 / safeZoom,
    fontSize: 12 / safeZoom,
    menuWidth: 140.8 / safeZoom,
    offset: 8 / safeZoom,
    borderWidth: 1 / safeZoom,
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
