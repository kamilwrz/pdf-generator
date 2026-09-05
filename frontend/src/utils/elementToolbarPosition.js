/** Screen-pixel geometry only: these values never enter the document model. */
export const ELEMENT_SETTINGS_SIZE = 36;
export const ELEMENT_TOOLBAR_WIDTH = 344;
export const ELEMENT_TOOLBAR_MAX_HEIGHT = 480;

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

const overlaps = (a, b, gap = 0) => a.left < b.left + b.width + gap
  && a.left + a.width + gap > b.left && a.top < b.top + b.height + gap
  && a.top + a.height + gap > b.top;

/**
 * Place settings to the left of the visible selection and keep its form inside
 * the canvas viewport without intersecting the selection. Existing canvas
 * buttons are obstacles for the cog; its retained vertical offset prevents
 * jumping back underneath the pointer when a transient toolbar disappears.
 * Panel candidates are built INSIDE free side/above/below regions, never
 * clamped across the selection. Their height may shrink and scroll internally.
 * When the selection fills the viewport, a bounded sheet requests view-only
 * reveal instead. All inputs/outputs are screen pixels, never PDF coordinates.
 */
export function elementToolbarPosition(anchor, viewport, { obstacles = [], triggerOffsetY = 0 } = {}) {
  const gap = 8;
  const left = viewport.left + gap;
  const top = viewport.top + gap;
  const right = viewport.right - gap;
  const bottom = viewport.bottom - gap;
  const size = ELEMENT_SETTINGS_SIZE;
  const width = Math.max(0, Math.min(ELEMENT_TOOLBAR_WIDTH, right - left));
  const maxHeight = Math.max(0, Math.min(ELEMENT_TOOLBAR_MAX_HEIGHT, bottom - top));
  const anchorRight = anchor.left + anchor.width;
  const anchorBottom = anchor.top + anchor.height;
  const visible = anchorRight > left && anchor.left < right && anchorBottom > top && anchor.top < bottom;
  const trigger = {
    left: Math.round(clamp(anchor.left - gap - size, left, right - size)),
    top: Math.round(clamp(anchor.top + Math.min(anchor.height, size) / 2 - size / 2 + triggerOffsetY, top, bottom - size)),
  };
  const normalTop = anchor.top + Math.min(anchor.height, size) / 2 - size / 2;
  const initialTop = trigger.top;
  const nearby = obstacles.filter((rect) => rect.width > 0 && rect.height > 0
    && rect.left < trigger.left + size + gap && rect.left + rect.width + gap > trigger.left);
  const candidates = [trigger.top, ...nearby.flatMap((rect) => [
    rect.top + rect.height + gap, rect.top - gap - size,
  ])].map((y) => Math.round(clamp(y, top, bottom - size)));
  const safeTop = candidates.sort((a, b) => Math.abs(a - trigger.top) - Math.abs(b - trigger.top))
    .find((y) => !nearby.some((rect) => overlaps({ ...trigger, top: y, width: size, height: size }, rect, gap)));
  if (safeTop !== undefined) trigger.top = safeTop;

  // Prefer a full-width side panel, then a usable above/below panel, then a
  // narrower side panel. Every region excludes the entire edited element.
  const regions = [
    { left, top, right: Math.min(anchor.left, trigger.left) - gap, bottom },
    { left: Math.max(anchorRight, trigger.left + size) + gap, top, right, bottom },
    { left, top: Math.max(anchorBottom, trigger.top + size) + gap, right, bottom },
    { left, top, right, bottom: Math.min(anchor.top, trigger.top) - gap },
  ];
  const panels = regions.map((region, index) => {
    const w = Math.max(0, Math.min(width, region.right - region.left));
    const h = Math.max(0, Math.min(maxHeight, region.bottom - region.top));
    return {
      left: Math.floor(clamp(index === 0 ? region.right - w : anchor.left, region.left, region.right - w)),
      top: Math.floor(clamp(trigger.top, region.top, region.bottom - h)),
      width: Math.floor(w), maxHeight: Math.floor(h),
      rank: index < 2 && w >= width ? index : w >= width ? 2 : 3,
    };
  }).filter((panel) => panel.width >= Math.min(240, width) && panel.maxHeight >= Math.min(200, maxHeight));
  panels.sort((a, b) => a.rank - b.rank || b.maxHeight - a.maxHeight);
  const chosen = panels[0];
  const needsReveal = !chosen;
  const panel = chosen
    ? { left: chosen.left, top: chosen.top, width: chosen.width, maxHeight: chosen.maxHeight }
    : { left, top: bottom - Math.min(maxHeight, (bottom - top) * 0.4), width,
      maxHeight: Math.min(maxHeight, (bottom - top) * 0.4) };
  return {
    visible,
    trigger,
    triggerOffsetY: safeTop !== undefined && safeTop !== initialTop
      ? trigger.top - normalTop : triggerOffsetY,
    needsReveal,
    panel,
  };
}
