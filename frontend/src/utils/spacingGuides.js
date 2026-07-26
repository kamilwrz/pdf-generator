// Vertical spacing guides shown while dragging. Report the gap to the nearest
// horizontally-overlapping neighbor above and below so the canvas can draw
// labeled orange distance lines for every movable element type.

export const SPACING_THRESHOLD = Infinity;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function overlapsHorizontally(first, second) {
  const overlap = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  return overlap > 0;
}

/**
 * Resolve a usable box for spacing guides.
 * Prefer visual/glyph bounds from boundsOf (left/top/width/height) so text
 * distance is measured between peak edges, not line-height boxes.
 */
export function resolveSpacingBox(element, boundsOf) {
  const measured = typeof boundsOf === "function" ? boundsOf(element) : null;
  const fontSize = Math.max(1, number(element.fontSize, 12));

  let left = number(measured?.left, number(element.left));
  let top = number(measured?.top, number(element.top));
  let width = Math.max(0, number(measured?.width, number(element.width)));
  let height = Math.max(0, number(measured?.height, number(element.height)));

  if (element.category === "text") {
    if (width <= 0) {
      width = Math.max(fontSize, String(element.content || "").length * fontSize * 0.56);
    }
    // Cap-height-ish fallback — tighter than full line box (fontSize * 1.35).
    if (height <= 0) {
      height = fontSize * 0.8;
    }
  }

  return {
    id: element.element_id,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    fixedToPage: Boolean(element.fixedToPage),
    category: element.category,
  };
}

/**
 * Returns the nearest above/below spacing gaps for a moving element.
 * Considers same-page candidates that share horizontal overlap.
 */
export function findVerticalSpacingGuides(
  movingElement,
  candidates,
  boundsOf,
  { threshold = SPACING_THRESHOLD } = {},
) {
  if (!movingElement || !Array.isArray(candidates) || typeof boundsOf !== "function") {
    return { above: null, below: null };
  }

  const moving = resolveSpacingBox(movingElement, boundsOf);
  if (moving.width <= 0 || moving.height <= 0) {
    return { above: null, below: null };
  }

  let above = null;
  let below = null;

  for (const candidate of candidates) {
    if (!candidate || candidate.element_id === movingElement.element_id) continue;
    if (candidate.fixedToPage) continue;
    if (candidate.category === "connector") continue;

    const other = resolveSpacingBox(candidate, boundsOf);
    if (other.width <= 0 || other.height <= 0) continue;
    if (!overlapsHorizontally(moving, other)) continue;

    if (other.bottom <= moving.top + 0.5) {
      const gap = moving.top - other.bottom;
      if (gap <= threshold && (above === null || gap < above.gap)) {
        above = {
          gap,
          y1: other.bottom,
          y2: moving.top,
          x: (Math.max(moving.left, other.left) + Math.min(moving.right, other.right)) / 2,
          neighborId: other.id,
          direction: "above",
        };
      }
    } else if (other.top >= moving.bottom - 0.5) {
      const gap = other.top - moving.bottom;
      if (gap <= threshold && (below === null || gap < below.gap)) {
        below = {
          gap,
          y1: moving.bottom,
          y2: other.top,
          x: (Math.max(moving.left, other.left) + Math.min(moving.right, other.right)) / 2,
          neighborId: other.id,
          direction: "below",
        };
      }
    }
  }

  return { above, below };
}
