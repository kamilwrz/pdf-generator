const FLOWABLE_CATEGORIES = new Set(["text", "textarea", "line", "rectangle", "circle", "ellipse", "image"]);
const NEARBY_DECORATION_CATEGORIES = new Set(["line", "rectangle", "circle", "ellipse"]);
const DECORATION_LANE_TOLERANCE = 32;

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

/**
 * Applies a measured textarea height and flows only the elements that are
 * physically below it in the same horizontal lane. This preserves independent
 * columns, while lines/frames in the affected lane retain their relative gaps.
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
  const sourcePage = pageOf(target);
  const sourceBottom = absoluteTop(target, safePageHeight) + oldHeight;
  let targetPage = pageOf(target);
  let targetTop = number(target.top);
  if (
    nextHeight <= safePageHeight - pageTop - bottomMargin
    && targetTop + nextHeight > safePageHeight - bottomMargin
  ) {
    targetPage += 1;
    targetTop = pageTop;
  }
  const targetAbsolute = (targetPage - 1) * safePageHeight + targetTop;
  const flowDelta = targetAbsolute + nextHeight - sourceBottom;
  const affectedIds = new Set(
    elements
      .filter((element) => (
        element.element_id !== elementId
        && FLOWABLE_CATEGORIES.has(element.category)
        && !element.fixedToPage
        && !element.locked
        // A generated continuation page is an intentional layout boundary.
        // Shrinking content must not pull it back into the previous page.
        && (delta >= 0 || pageOf(element) === sourcePage)
        && absoluteTop(element, safePageHeight) >= sourceBottom
        && belongsToFlowLane(target, element)
      ))
      .map((element) => element.element_id),
  );

  let maxPage = targetPage;
  const reflowed = elements.map((element) => {
    if (element.element_id === elementId) {
      return { ...element, height: nextHeight, page: targetPage, top: targetTop };
    }

    if (!affectedIds.has(element.element_id)) {
      maxPage = Math.max(maxPage, pageOf(element));
      return element;
    }

    const { page, top } = toPagePosition(
      absoluteTop(element, safePageHeight) + flowDelta,
      elementHeight(element),
      safePageHeight,
      pageTop,
      bottomMargin,
    );
    maxPage = Math.max(maxPage, page);
    return { ...element, page, top };
  });

  return { elements: reflowed, pageCount: maxPage, changed: true };
}
