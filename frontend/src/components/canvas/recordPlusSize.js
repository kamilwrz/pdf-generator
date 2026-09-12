/**
 * Layout size for hover controls (add/remove/reorder) painted inside the
 * zoom-scaled A4 page.
 *
 * The page uses `transform: scale(zoom)`, so a layout pixel appears as
 * `layout * zoom` screen pixels. We target a compact on-screen size and divide
 * by the live zoom to avoid applying the page scale twice. All controls grow
 * at the same gentle rate; body portals use the screen-space helpers directly.
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
  const { buttonSize, iconSize, gap, offset } = compactInlineToolbarLayoutSize(zoom);
  void fontSize;
  return { buttonSize, iconSize, gap, offset };
}

/**
 * Page-local dimensions for the grouped section/record toolbar.
 *
 * Structural actions share icon dimensions and reserve label room for reliable
 * pointer targeting and a short text label. Every value is
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
  const scale = Math.max(1, canvasControlScale(zoom));
  return {
    buttonSize: 36 * scale,
    iconSize: 16 * scale,
    gap: 3 * scale,
    labelWidth: 76 * scale,
    fontSize: Math.max(12, 14 * scale),
    menuWidth: 176 * scale,
    offset: Number.isFinite(Number(offsetScreenPx)) && Number(offsetScreenPx) >= 0
      ? Number(offsetScreenPx) : 10,
    borderWidth: 0,
  };
}

/**
 * Return the compact geometry used by inline add controls.
 *
 * Divide the growing screen metrics by the current animated page scale.
 * Callers inside A4 must use its live zoom context, not the target zoom;
 * otherwise the inverse scale takes effect before the page finishes growing.
 *
 * @param {number} [zoom=1]
 * @returns {{buttonSize:number,iconSize:number,gap:number,labelWidth:number,fontSize:number,menuWidth:number,offset:number,borderWidth:number}}
 */
export function compactInlineToolbarLayoutSize(zoom = 1) {
  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0.05
    ? Number(zoom)
    : 1;
  return Object.fromEntries(Object.entries(compactInlineToolbarScreenLayoutSize(safeZoom))
    .map(([key, value]) => [key, value / safeZoom]));
}

/** Shared growth relative to 140% zoom; invalid input falls back to 100%. */
export function canvasControlScale(zoom = 1) {
  const safeZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0.05 ? Number(zoom) : 1;
  return (2 + safeZoom / 1.4) / 3;
}

/**
 * Inline action dimensions match the settings cog: 36px at 140%, 48px at 280%.
 * Icons grow at the structural toolbar's rate. Zero surface padding keeps a
 * single action the same full circle as the cog. Text stays legible;
 * borders and anchor gaps remain fixed. Open forms own their separate sizing.
 * @param {number} [zoom=1] Live A4 transform scale.
 * @returns {object} Screen-space metrics, without changing document geometry.
 */
export function compactInlineToolbarScreenLayoutSize(zoom = 1) {
  // Zooming out must not reduce compact controls below their 36px hit target.
  const scale = Math.max(1, canvasControlScale(zoom));
  return {
    buttonSize: 36 * scale,
    iconSize: 16 * scale,
    gap: 0,
    labelWidth: 60.8 * scale,
    fontSize: Math.max(12, 12 * scale),
    menuWidth: 140.8 * scale,
    offset: 8,
    borderWidth: 0,
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
