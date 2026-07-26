const FLOWABLE_CATEGORIES = new Set(["text", "textarea", "line", "rectangle", "circle", "ellipse", "image"]);
const NEARBY_DECORATION_CATEGORIES = new Set(["line", "rectangle", "circle", "ellipse"]);
const DECORATION_LANE_TOLERANCE = 32;
// Matches backend SPACE_RECORD: used when reclaiming a page-break gap so later
// blocks pack into freed space instead of keeping the empty page-bottom hole.
const DEFAULT_PACK_GAP = 14;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pageOf(element) {
  return Math.max(1, Math.trunc(number(element.page, 1)));
}

function absoluteTop(element, pageHeight) {
  return (pageOf(element) - 1) * pageHeight + number(element.top);
}

function elementWidth(element) {
  const explicitWidth = Math.max(0, number(element.width));
  if (explicitWidth > 0) return explicitWidth;
  if (element.category === "text") {
    const fontSize = Math.max(1, number(element.fontSize, 12));
    return Math.max(fontSize, String(element.content || "").length * fontSize * 0.56);
  }
  return 0;
}

function elementHeight(element) {
  return Math.max(
    0,
    number(
      element.height,
      element.category === "text" ? number(element.fontSize, 12) * 1.35 : 0,
    ),
  );
}

function overlapsHorizontally(first, second) {
  const overlap = Math.min(
    number(first.left) + elementWidth(first),
    number(second.left) + elementWidth(second),
  ) - Math.max(number(first.left), number(second.left));

  return overlap > 0;
}

function belongsToFlowLane(target, element) {
  if (overlapsHorizontally(target, element)) return true;
  if (!NEARBY_DECORATION_CATEGORIES.has(element.category)) return false;

  const targetLeft = number(target.left);
  const targetRight = targetLeft + elementWidth(target);
  const elementLeft = number(element.left);
  const elementRight = elementLeft + elementWidth(element);
  const horizontalGap = Math.max(
    targetLeft - elementRight,
    elementLeft - targetRight,
    0,
  );
  return horizontalGap <= DECORATION_LANE_TOLERANCE;
}

function toPagePosition(absolute, height, pageHeight, pageTop, bottomMargin) {
  const safeAbsolute = Math.max(0, absolute);
  let page = Math.floor(safeAbsolute / pageHeight) + 1;
  let top = safeAbsolute - (page - 1) * pageHeight;

  // Keep a moved element wholly inside a page when it can fit. A textarea
  // taller than one page is left at the page top, because splitting its
  // content requires the backend's text-layout pipeline.
  if (height <= pageHeight - pageTop - bottomMargin && top + height > pageHeight - bottomMargin) {
    page += 1;
    top = pageTop;
  }

  return { page, top };
}

function packGapAfterPageBreak(current, pageTop) {
  const continuationInset = Math.max(0, number(current.top) - pageTop);
  return Math.min(DEFAULT_PACK_GAP, continuationInset || DEFAULT_PACK_GAP);
}

/**
 * Applies a measured textarea height and flows later elements in its lane.
 * Same-page items keep their top-to-top rhythm (so tall rails/markers stay
 * aligned). Page-break dead space is reclaimed so shrinks can pull later
 * blocks into freed room on the previous page.
 */
export function reflowTextareaHeight(
  elements,
  elementId,
  measuredHeight,
  pageHeight,
  { pageTop = 0, bottomMargin = 0 } = {},
) {
  const target = elements.find((element) => element.element_id === elementId);
  const nextHeight = Math.max(0, Math.round(number(measuredHeight)));
  if (!target || !target.autoHeight || nextHeight === 0) {
    return { elements, pageCount: Math.max(1, ...elements.map(pageOf)), changed: false };
  }

  const oldHeight = elementHeight(target);
  const delta = nextHeight - oldHeight;
  if (Math.abs(delta) < 0.5) {
    return { elements, pageCount: Math.max(1, ...elements.map(pageOf)), changed: false };
  }

  const safePageHeight = Math.max(1, number(pageHeight, 842));
  const oldTargetTop = absoluteTop(target, safePageHeight);
  const oldTargetBottom = oldTargetTop + oldHeight;

  let targetPage = pageOf(target);
  let targetTop = number(target.top);
  if (
    nextHeight <= safePageHeight - pageTop - bottomMargin
    && targetTop + nextHeight > safePageHeight - bottomMargin
  ) {
    targetPage += 1;
    targetTop = pageTop;
  }

  const newTargetTop = (targetPage - 1) * safePageHeight + targetTop;
  const newTargetBottom = newTargetTop + nextHeight;

  const lane = elements
    .filter((element) => (
      FLOWABLE_CATEGORIES.has(element.category)
      && !element.fixedToPage
      && !element.locked
      && (
        element.element_id === elementId
        || (
          absoluteTop(element, safePageHeight) >= oldTargetBottom - 0.01
          && belongsToFlowLane(target, element)
        )
      )
    ))
    .sort((left, right) => {
      const topDelta = absoluteTop(left, safePageHeight) - absoluteTop(right, safePageHeight);
      if (Math.abs(topDelta) > 0.01) return topDelta;
      return String(left.element_id).localeCompare(String(right.element_id));
    });

  const targetIndex = lane.findIndex((element) => element.element_id === elementId);
  if (targetIndex < 0) {
    return { elements, pageCount: Math.max(1, ...elements.map(pageOf)), changed: false };
  }

  const placed = new Map();
  placed.set(elementId, {
    ...target,
    height: nextHeight,
    page: targetPage,
    top: targetTop,
  });

  let previousOriginal = target;
  let previousPlacedTop = newTargetTop;
  let previousPlacedBottom = newTargetBottom;
  let maxPage = targetPage;

  for (let index = targetIndex + 1; index < lane.length; index += 1) {
    const current = lane[index];
    const height = elementHeight(current);
    const currentOriginalTop = absoluteTop(current, safePageHeight);
    const crossedPage = pageOf(current) > pageOf(previousOriginal);

    let nextAbsolute;
    if (crossedPage) {
      nextAbsolute = previousPlacedBottom + packGapAfterPageBreak(current, pageTop);
    } else if (previousOriginal.element_id === elementId) {
      nextAbsolute = newTargetBottom + Math.max(0, currentOriginalTop - oldTargetBottom);
    } else {
      nextAbsolute = previousPlacedTop + (
        currentOriginalTop - absoluteTop(previousOriginal, safePageHeight)
      );
    }

    const { page, top } = toPagePosition(
      nextAbsolute,
      height,
      safePageHeight,
      pageTop,
      bottomMargin,
    );
    const nextElement = { ...current, page, top };
    placed.set(current.element_id, nextElement);

    previousOriginal = current;
    previousPlacedTop = (page - 1) * safePageHeight + top;
    previousPlacedBottom = previousPlacedTop + height;
    maxPage = Math.max(maxPage, page);
  }

  const reflowed = elements.map((element) => {
    if (placed.has(element.element_id)) {
      return placed.get(element.element_id);
    }
    maxPage = Math.max(maxPage, pageOf(element));
    return element;
  });

  return { elements: reflowed, pageCount: maxPage, changed: true };
}
