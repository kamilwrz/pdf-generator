/**
 * Read an element's A4 transform as it is currently painted, including CSS
 * animation frames. Ancestor transforms and browser zoom are excluded so all
 * canvas actions use the same scale. Detached elements use the supplied fallback.
 */
export function readCanvasZoom(element, fallback = 1) {
  const page = element?.closest?.("[data-page-canvas]");
  if (!page) return fallback;
  const transform = new DOMMatrixReadOnly(getComputedStyle(page).transform);
  const zoom = Math.hypot(transform.a, transform.b);
  return Number.isFinite(zoom) && zoom > 0.05 ? zoom : fallback;
}
