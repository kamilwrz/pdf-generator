// Spacing guides shown while dragging.
// Orange: vertical gaps to nearest above/below neighbors.
// Green: horizontal gaps to nearest left/right neighbors, plus page-edge
// margins when the distance to the left/right page edge is < 100px.

export const SPACING_THRESHOLD = Infinity;
export const PAGE_EDGE_MIN_GAP = 100;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function overlapsHorizontally(first, second) {
  const overlap = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  return overlap > 0;
}

function overlapsVertically(first, second) {
  const overlap = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
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

function isBaseSpacingCandidate(candidate, movingId) {
  if (!candidate || candidate.element_id === movingId) return false;
  if (candidate.fixedToPage) return false;
  if (candidate.locked) return false;
  if (candidate.category === "connector") return false;
  return true;
}

function isVerticalSpacingCandidate(candidate, movingId) {
  if (!isBaseSpacingCandidate(candidate, movingId)) return false;
  // Section markers / rules sit beside headings. Measuring marker→marker
  // reports a whole section body as a "gap" (e.g. 116px) even when the real
  // text→text rhythm is SPACE_SECTION. Vertical rhythm is text-only.
  return candidate.category === "text" || candidate.category === "textarea";
}

function isHorizontalSpacingCandidate(candidate, movingId) {
  return isBaseSpacingCandidate(candidate, movingId);
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
    if (!isVerticalSpacingCandidate(candidate, movingElement.element_id)) continue;

    const other = resolveSpacingBox(candidate, boundsOf);
    if (other.width <= 0 || other.height <= 0) continue;
    if (!overlapsHorizontally(moving, other)) continue;

    if (other.bottom <= moving.top + 0.5) {
      const gap = moving.top - other.bottom;
      if (gap <= threshold && (above === null || gap < above.gap)) {
        above = {
          axis: "y",
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
          axis: "y",
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

/**
 * Returns the nearest left/right spacing gaps for a moving element.
 * Considers same-page candidates that share vertical overlap.
 */
export function findHorizontalSpacingGuides(
  movingElement,
  candidates,
  boundsOf,
  { threshold = SPACING_THRESHOLD } = {},
) {
  if (!movingElement || !Array.isArray(candidates) || typeof boundsOf !== "function") {
    return { left: null, right: null };
  }

  const moving = resolveSpacingBox(movingElement, boundsOf);
  if (moving.width <= 0 || moving.height <= 0) {
    return { left: null, right: null };
  }

  let left = null;
  let right = null;

  for (const candidate of candidates) {
    if (!isHorizontalSpacingCandidate(candidate, movingElement.element_id)) continue;

    const other = resolveSpacingBox(candidate, boundsOf);
    if (other.width <= 0 || other.height <= 0) continue;
    if (!overlapsVertically(moving, other)) continue;

    if (other.right <= moving.left + 0.5) {
      const gap = moving.left - other.right;
      if (gap <= threshold && (left === null || gap < left.gap)) {
        left = {
          axis: "x",
          gap,
          x1: other.right,
          x2: moving.left,
          y: (Math.max(moving.top, other.top) + Math.min(moving.bottom, other.bottom)) / 2,
          neighborId: other.id,
          direction: "left",
        };
      }
    } else if (other.left >= moving.right - 0.5) {
      const gap = other.left - moving.right;
      if (gap <= threshold && (right === null || gap < right.gap)) {
        right = {
          axis: "x",
          gap,
          x1: moving.right,
          x2: other.left,
          y: (Math.max(moving.top, other.top) + Math.min(moving.bottom, other.bottom)) / 2,
          neighborId: other.id,
          direction: "right",
        };
      }
    }
  }

  return { left, right };
}

/**
 * Page-edge margins for the moving element.
 * Shown only when the gap to that edge is < minGap (default 100px).
 * Reported distance is the full gap from the element to the page edge.
 */
export function findPageEdgeGuides(
  movingElement,
  pageWidth,
  boundsOf,
  { minGap = PAGE_EDGE_MIN_GAP } = {},
) {
  if (!movingElement || typeof boundsOf !== "function") {
    return { left: null, right: null };
  }

  const moving = resolveSpacingBox(movingElement, boundsOf);
  if (moving.width <= 0 || moving.height <= 0) {
    return { left: null, right: null };
  }

  const width = Math.max(0, number(pageWidth));
  const midY = moving.top + moving.height / 2;
  let left = null;
  let right = null;

  const leftGap = moving.left;
  if (leftGap >= 0 && leftGap < minGap) {
    left = {
      axis: "x",
      gap: leftGap,
      x1: 0,
      x2: moving.left,
      y: midY,
      neighborId: "page-left",
      direction: "page-left",
      kind: "page-edge",
    };
  }

  const rightGap = width - moving.right;
  if (rightGap >= 0 && rightGap < minGap) {
    right = {
      axis: "x",
      gap: rightGap,
      x1: moving.right,
      x2: width,
      y: midY,
      neighborId: "page-right",
      direction: "page-right",
      kind: "page-edge",
    };
  }

  return { left, right };
}

/**
 * Collect unique nearest-below gaps for every movable element on a page.
 * Used by Shift+Alt spacing inspect mode so each gap is drawn once.
 */
export function findAllVerticalSpacingGuides(elements, boundsOf, options) {
  if (!Array.isArray(elements) || typeof boundsOf !== "function") return [];

  const guides = [];
  const seen = new Set();

  for (const element of elements) {
    if (!element || element.fixedToPage) continue;
    if (element.category === "connector") continue;

    const others = elements.filter((candidate) => candidate?.element_id !== element.element_id);
    const { below } = findVerticalSpacingGuides(element, others, boundsOf, options);
    if (!below) continue;

    const key = `${element.element_id}:${below.neighborId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    guides.push(below);
  }

  return guides;
}

/**
 * Collect unique nearest-right gaps for every movable element on a page.
 */
export function findAllHorizontalSpacingGuides(elements, boundsOf, options) {
  if (!Array.isArray(elements) || typeof boundsOf !== "function") return [];

  const guides = [];
  const seen = new Set();

  for (const element of elements) {
    if (!element || element.fixedToPage) continue;
    if (element.category === "connector") continue;

    const others = elements.filter((candidate) => candidate?.element_id !== element.element_id);
    const { right } = findHorizontalSpacingGuides(element, others, boundsOf, options);
    if (!right) continue;

    const key = `${element.element_id}:${right.neighborId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    guides.push(right);
  }

  return guides;
}
