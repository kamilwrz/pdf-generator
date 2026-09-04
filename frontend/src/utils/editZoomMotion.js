export const EDIT_ZOOM_MOTION_MS = 200;

const INLINE_VISIBILITY_PADDING_PX = 16;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(progress) {
  return 1 - ((1 - progress) ** 3);
}

function rectCenter(rect) {
  return {
    x: rect.left + (rect.width / 2),
    y: rect.top + (rect.height / 2),
  };
}

function inlineTargetCenter(startX, finalElementWidth, viewportRect) {
  const viewportCenter = viewportRect.left + (viewportRect.width / 2);
  const availableWidth = Math.max(0, viewportRect.width - (INLINE_VISIBILITY_PADDING_PX * 2));

  // A field wider than the viewport cannot be fully revealed. Centre it so
  // both sides remain equally reachable instead of oscillating between edges.
  if (finalElementWidth >= availableWidth) return viewportCenter;

  const halfWidth = finalElementWidth / 2;
  return clamp(
    startX,
    viewportRect.left + INLINE_VISIBILITY_PADDING_PX + halfWidth,
    viewportRect.left + viewportRect.width - INLINE_VISIBILITY_PADDING_PX - halfWidth,
  );
}

/**
 * Keep the edited field on one continuous path while the A4 page changes scale.
 *
 * The browser updates transformed element geometry on every animation frame.
 * This tracker counter-scrolls that scale movement and simultaneously moves the
 * field towards the vertical centre of the canvas. Horizontal movement follows
 * `inline: nearest` semantics unless the field is wider than the viewport.
 * The function mutates only the canvas scroll offsets and returns a cancellation
 * callback; it never changes persisted document geometry.
 *
 * @param {object} options
 * @param {HTMLElement} options.container - Scrollable editor canvas.
 * @param {HTMLElement} options.element - Text field entering edit mode.
 * @param {number} options.zoomRatio - Target zoom divided by the current zoom.
 * @param {number} [options.duration] - Coordinated motion duration in milliseconds.
 * @param {Function} [options.requestFrame] - Injectable requestAnimationFrame.
 * @param {Function} [options.cancelFrame] - Injectable cancelAnimationFrame.
 * @returns {() => void} Cancels pending scroll tracking.
 */
export function coordinateEditZoomMotion({
  container,
  element,
  zoomRatio,
  duration = EDIT_ZOOM_MOTION_MS,
  requestFrame = window.requestAnimationFrame.bind(window),
  cancelFrame = window.cancelAnimationFrame.bind(window),
}) {
  if (!container || !element) return () => {};

  const initialElementRect = element.getBoundingClientRect();
  const initialCenter = rectCenter(initialElementRect);
  const finalElementWidth = initialElementRect.width * zoomRatio;
  let startedAt = null;
  let frameId = null;
  let cancelled = false;

  const move = (timestamp) => {
    if (cancelled || !element.isConnected || !container.isConnected) return;

    if (startedAt == null) startedAt = timestamp;
    const linearProgress = duration <= 0
      ? 1
      : Math.min(1, Math.max(0, (timestamp - startedAt) / duration));
    const progress = easeOutCubic(linearProgress);
    const viewportRect = container.getBoundingClientRect();
    const targetCenter = {
      x: inlineTargetCenter(initialCenter.x, finalElementWidth, viewportRect),
      y: viewportRect.top + (viewportRect.height / 2),
    };
    const desiredCenter = {
      x: initialCenter.x + ((targetCenter.x - initialCenter.x) * progress),
      y: initialCenter.y + ((targetCenter.y - initialCenter.y) * progress),
    };
    const currentCenter = rectCenter(element.getBoundingClientRect());

    // Direct offset updates are intentional: native smooth scrolling would add
    // a second easing timeline and recreate the delayed, two-stage interaction.
    container.scrollLeft += currentCenter.x - desiredCenter.x;
    container.scrollTop += currentCenter.y - desiredCenter.y;

    if (linearProgress < 1) frameId = requestFrame(move);
  };

  frameId = requestFrame(move);
  return () => {
    cancelled = true;
    if (frameId != null) cancelFrame(frameId);
  };
}

/**
 * Reveal an edited field immediately after a reduced-motion zoom commit.
 *
 * @param {HTMLElement} container - Scrollable editor canvas.
 * @param {HTMLElement} element - Text field entering edit mode.
 */
export function revealEditedElementImmediately(container, element) {
  if (!container || !element || !element.isConnected || !container.isConnected) return;

  const elementRect = element.getBoundingClientRect();
  const elementCenter = rectCenter(elementRect);
  const viewportRect = container.getBoundingClientRect();
  const targetX = inlineTargetCenter(elementCenter.x, elementRect.width, viewportRect);

  container.scrollLeft += elementCenter.x - targetX;
  container.scrollTop += elementCenter.y - (viewportRect.top + (viewportRect.height / 2));
}
