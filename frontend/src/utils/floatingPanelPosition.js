/**
 * Viewport placement for a floating inspector anchored to a selection bbox.
 *
 * Prefer above the selection; flip below when there is not enough room.
 * Horizontal: center on the selection, then clamp into the viewport.
 */

/**
 * @typedef {{ top: number, left: number, width: number, height: number }} DomRectLike
 * @typedef {{ top: number, left: number, placement: "above" | "below" }} FloatingPanelPosition
 */

/**
 * @param {DomRectLike} anchorRect - Selection bounding box in viewport coords.
 * @param {{ width: number, height: number }} panelSize - Measured panel size.
 * @param {{ width: number, height: number }} viewport - Viewport size.
 * @param {{ gap?: number, padding?: number }} [options]
 * @returns {FloatingPanelPosition}
 */
export function computeFloatingPanelPosition(
  anchorRect,
  panelSize,
  viewport,
  { gap = 8, padding = 8 } = {},
) {
  const panelWidth = Math.max(0, Number(panelSize?.width) || 0);
  const panelHeight = Math.max(0, Number(panelSize?.height) || 0);
  const viewWidth = Math.max(0, Number(viewport?.width) || 0);
  const viewHeight = Math.max(0, Number(viewport?.height) || 0);

  const anchorTop = Number(anchorRect?.top) || 0;
  const anchorLeft = Number(anchorRect?.left) || 0;
  const anchorWidth = Math.max(0, Number(anchorRect?.width) || 0);
  const anchorHeight = Math.max(0, Number(anchorRect?.height) || 0);
  const anchorBottom = anchorTop + anchorHeight;
  const anchorCenterX = anchorLeft + anchorWidth / 2;

  const spaceAbove = anchorTop - padding;
  const spaceBelow = viewHeight - padding - anchorBottom;
  const preferAbove = spaceAbove >= panelHeight + gap
    || spaceAbove >= spaceBelow;

  let top;
  let placement;
  if (preferAbove) {
    placement = "above";
    top = anchorTop - gap - panelHeight;
  } else {
    placement = "below";
    top = anchorBottom + gap;
  }

  let left = anchorCenterX - panelWidth / 2;

  const minLeft = padding;
  const maxLeft = Math.max(padding, viewWidth - padding - panelWidth);
  left = Math.min(maxLeft, Math.max(minLeft, left));

  const minTop = padding;
  const maxTop = Math.max(padding, viewHeight - padding - panelHeight);
  top = Math.min(maxTop, Math.max(minTop, top));

  return { top, left, placement };
}

/**
 * Union of several DOMRect-like boxes (multi-select anchor).
 * @param {DomRectLike[]} rects
 * @returns {DomRectLike|null}
 */
export function unionRects(rects) {
  const list = (rects || []).filter((rect) => rect && Number.isFinite(rect.left));
  if (list.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of list) {
    const width = Math.max(0, Number(rect.width) || 0);
    const height = Math.max(0, Number(rect.height) || 0);
    left = Math.min(left, Number(rect.left) || 0);
    top = Math.min(top, Number(rect.top) || 0);
    right = Math.max(right, (Number(rect.left) || 0) + width);
    bottom = Math.max(bottom, (Number(rect.top) || 0) + height);
  }
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}
