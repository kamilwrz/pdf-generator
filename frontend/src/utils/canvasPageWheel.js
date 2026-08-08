/**
 * Map wheel gestures on the canvas scroll container to prev/next page steps.
 *
 * Native overflow scrolling wins while the container can still move in the
 * wheel direction. Only at the scroll edge (or when there is no overflow) does
 * a vertical wheel tick advance or retreat `currentPage`.
 */

/** Ignore residual scrollTop noise near edges (CSS pixels). */
export const PAGE_WHEEL_EDGE_EPS = 2;

/** Absorb rapid wheel ticks after a page change so one flick ≠ many pages.
 * Slightly longer than the ~320 ms page-stage transition so inertia cannot
 * skip pages mid-animation. */
export const PAGE_WHEEL_COOLDOWN_MS = 420;

/**
 * @param {WheelEvent} event
 * @param {HTMLElement} scrollEl
 * @param {{ currentPage: number, pageCount: number }} pages
 * @returns {-1|0|1} previous page, no-op, or next page
 */
export function resolvePageWheelDelta(event, scrollEl, pages) {
  if (!event || !scrollEl) return 0;
  // Browser zoom / trackpad pinch often sets ctrlKey; never steal those.
  if (event.ctrlKey || event.metaKey) return 0;

  const target = event.target;
  if (
    target
    && typeof target.closest === "function"
    && target.closest('textarea, input, [contenteditable="true"]')
  ) {
    return 0;
  }

  const dy = Number(event.deltaY) || 0;
  const dx = Number(event.deltaX) || 0;
  // Prefer horizontal pan when the gesture is clearly sideways (two-page spread).
  if (Math.abs(dy) < Math.abs(dx) || dy === 0) return 0;

  const currentPage = Math.max(1, Number(pages?.currentPage) || 1);
  const pageCount = Math.max(1, Number(pages?.pageCount) || 1);
  const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
  const canScroll = maxScroll > PAGE_WHEEL_EDGE_EPS;
  const atTop = scrollEl.scrollTop <= PAGE_WHEEL_EDGE_EPS;
  const atBottom = scrollEl.scrollTop >= maxScroll - PAGE_WHEEL_EDGE_EPS;

  if (dy > 0) {
    if (canScroll && !atBottom) return 0;
    return currentPage < pageCount ? 1 : 0;
  }
  if (canScroll && !atTop) return 0;
  return currentPage > 1 ? -1 : 0;
}
