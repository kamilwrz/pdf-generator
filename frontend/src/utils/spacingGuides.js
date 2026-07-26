// Vertical spacing guides shown while dragging. When the moving element is
// within SPACING_THRESHOLD of a horizontally-overlapping neighbor above or
// below, report the gap so the canvas can draw a labeled distance line.

export const SPACING_THRESHOLD = 80;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function overlapsHorizontally(first, second) {
  const overlap = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  return overlap > 0;
}

function toBox(element, sizeOf) {
  const left = number(element.left);
  const top = number(element.top);
  const { width, height } = sizeOf(element);
  return {
    id: element.element_id,
    left,
    top,
    right: left + Math.max(0, width),
    bottom: top + Math.max(0, height),
    fixedToPage: Boolean(element.fixedToPage),
    category: element.category,
  };
}

/**
 * Returns the nearest above/below spacing gaps for a moving element.
 * Only considers same-page candidates that share horizontal overlap and are
 * within SPACING_THRESHOLD pixels.
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

  const moving = toBox(movingElement, sizeOf);
  if (moving.right <= moving.left || moving.bottom <= moving.top) {
    return { above: null, below: null };
  }

  let above = null;
  let below = null;

  for (const candidate of candidates) {
    if (!candidate || candidate.element_id === movingElement.element_id) continue;
    if (candidate.fixedToPage) continue;
    if (candidate.category === "connector") continue;

    const other = toBox(candidate, sizeOf);
    if (other.right <= other.left || other.bottom <= other.top) continue;
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
