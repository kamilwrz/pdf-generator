/** Screen-pixel geometry only: these values never enter the document model. */
export const ELEMENT_SETTINGS_SIZE = 36;
export const ELEMENT_TOOLBAR_WIDTH = 344;
export const ELEMENT_TOOLBAR_MAX_HEIGHT = 480;

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Place settings to the left of the visible selection and keep its form inside
 * the canvas viewport. Prefer empty space on the left; otherwise use the space
 * below/above the selection. An edge-clamped trigger remains reachable for
 * partially clipped elements. Fully offscreen selections have no floating cog.
 * All inputs and outputs are viewport pixels, independent of document zoom.
 */
export function elementToolbarPosition(anchor, viewport) {
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
    top: Math.round(clamp(anchor.top + Math.min(anchor.height, size) / 2 - size / 2, top, bottom - size)),
  };
  const fitsLeft = trigger.left - gap - width >= left;
  const below = Math.max(trigger.top + size, anchorBottom) + gap;
  const above = Math.min(trigger.top, anchor.top) - gap - maxHeight;
  return {
    visible,
    trigger,
    panel: {
      left: Math.round(fitsLeft ? trigger.left - gap - width : clamp(anchor.left, left, right - width)),
      top: Math.round(fitsLeft ? clamp(trigger.top, top, bottom - maxHeight)
        : below + maxHeight <= bottom ? below
          : above >= top ? above : clamp(trigger.top + size + gap, top, bottom - maxHeight)),
      width,
      maxHeight,
    },
  };
}
