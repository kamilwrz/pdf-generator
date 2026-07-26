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
 * Resolve a usable box for spacing guides. Text often has no stored width;
 * fall back to a content-length estimate so guides work without relying only
 * on textarea dimensions.
 */
export function resolveSpacingBox(element, sizeOf) {
  const left = number(element.left);
  const top = number(element.top);
  const measured = typeof sizeOf === "function" ? sizeOf(element) : null;
  let width = Math.max(0, number(measured?.width, number(element.width)));
  let height = Math.max(0, number(measured?.height, number(element.height)));

  if (element.category === "text") {
    const fontSize = Math.max(1, number(element.fontSize, 12));
    if (width <= 0) {
      width = Math.max(fontSize, String(element.content || "").length * fontSize * 0.56);
    }
    if (height <= 0) {
      height = fontSize * 1.35;
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
  sizeOf,
  { threshold = SPACING_THRESHOLD } = {},
) {
  if (!movingElement || !Array.isArray(candidates) || typeof sizeOf !== "function") {
    return { above: null, below: null };
  }

  const moving = resolveSpacingBox(movingElement, sizeOf);
  if (moving.width <= 0 || moving.height <= 0) {
    return { above: null, below: null };
  }

  let above = null;
  let below = null;

  for (const candidate of candidates) {
    if (!candidate || candidate.element_id === movingElement.element_id) continue;
    if (candidate.fixedToPage) continue;
    if (candidate.category === "connector") continue;

    const other = resolveSpacingBox(candidate, sizeOf);
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
