/**
 * Reflow auto-height textareas and pack following content after height changes.
 *
 * Keeps section chrome with the next body block so page breaks never orphan
 * headings in the footer margin. Matches backend SPACE_RECORD packing gaps.
 */
const FLOWABLE_CATEGORIES = new Set(["text", "textarea", "line", "rectangle", "circle", "ellipse", "image"]);
const NEARBY_DECORATION_CATEGORIES = new Set(["line", "rectangle", "circle", "ellipse"]);
const DECORATION_LANE_TOLERANCE = 32;
// Ridge rail icons sit ~36px left of the main column; keep a little headroom.
const TEXT_ALIGNED_IMAGE_LANE_TOLERANCE = 40;
// Matches backend SPACE_RECORD: used when reclaiming a page-break gap so later
// blocks pack into freed space instead of keeping the empty page-bottom hole.
const DEFAULT_PACK_GAP = 14;
// Section labels / markers / rules are short. Keep them with following body
// so a page break never leaves "WYKSZTAŁCENIE" stranded above the footer.
const CHROME_MAX_HEIGHT = 40;
const KEEP_WITH_NEXT_PX = 64;
const CHROME_CLUSTER_Y_SPAN = 48;

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

function isTextAlignedImage(element) {
  if (element.category !== "image") return false;
  if (element.alignWithText) return true;
  // Backward compatibility for Iconic documents saved before alignWithText
  // became part of the image spec.
  return /\/template-assets\/iconic\//.test(String(element.src || ""));
}

function isChromeLike(element) {
  if (element.category === "text") return true;
  if (isTextAlignedImage(element)) return true;
  if (!NEARBY_DECORATION_CATEGORIES.has(element.category)) return false;
  return elementHeight(element) <= CHROME_MAX_HEIGHT;
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
  const isNearbyDecoration = NEARBY_DECORATION_CATEGORIES.has(element.category);
  const isNearbyTextIcon = isTextAlignedImage(element);
  if (!isNearbyDecoration && !isNearbyTextIcon) return false;

  const targetLeft = number(target.left);
  const targetRight = targetLeft + elementWidth(target);
  const elementLeft = number(element.left);
  const elementRight = elementLeft + elementWidth(element);
  const horizontalGap = Math.max(
    targetLeft - elementRight,
    elementLeft - targetRight,
    0,
  );

  // Iconic glyphs hang to the LEFT of their labels (Nova/Loom/Ridge rail).
  // Never let a narrow left column (Loom sidebar) drag main-column icons that
  // sit entirely to its right — that was the Loom heading/icon desync.
  if (isNearbyTextIcon) {
    if (elementLeft >= targetRight) return false;
    return horizontalGap <= TEXT_ALIGNED_IMAGE_LANE_TOLERANCE;
  }

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
 * If `current` is section chrome and the following body cannot share this page,
 * bump the chrome to the next page so headings are never orphaned above the footer.
 */
function avoidOrphanChrome(
  lane,
  index,
  current,
  top,
  page,
  pageHeight,
  pageTop,
  bottomMargin,
) {
  if (!isChromeLike(current)) return { page, top };

  const currentAbs = absoluteTop(current, pageHeight);
  let contentIndex = -1;
  for (let i = index + 1; i < lane.length; i += 1) {
    const candidate = lane[i];
    if (!isChromeLike(candidate)) {
      contentIndex = i;
      break;
    }
    // Stop if decorations belong to a later section far below.
    if (absoluteTop(candidate, pageHeight) - currentAbs > CHROME_CLUSTER_Y_SPAN) {
      break;
    }
  }
  if (contentIndex < 0) return { page, top };

  const content = lane[contentIndex];
  const contentHeight = elementHeight(content);
  const authoredSpan = Math.max(
    0,
    absoluteTop(content, pageHeight) - currentAbs,
  );
  const keep = Math.min(Math.max(contentHeight, 1), KEEP_WITH_NEXT_PX);
  const contentBottom = pageHeight - bottomMargin;
  if (top + authoredSpan + keep <= contentBottom) {
    return { page, top };
  }

  return { page: page + 1, top: pageTop };
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

    let { page, top } = toPagePosition(
      nextAbsolute,
      height,
      safePageHeight,
      pageTop,
      bottomMargin,
    );
    ({ page, top } = avoidOrphanChrome(
      lane,
      index,
      current,
      top,
      page,
      safePageHeight,
      pageTop,
      bottomMargin,
    ));
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
