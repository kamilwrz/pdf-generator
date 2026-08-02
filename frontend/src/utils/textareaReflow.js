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
// Keep in sync with backend SPACE_RECORD (cv_generator_primitives.py).
const DEFAULT_PACK_GAP = 10;
// Section labels / markers / rules are short. Keep them with following body
// so a page break never leaves "WYKSZTAŁCENIE" stranded above the footer.
const CHROME_MAX_HEIGHT = 40;
// How far above a body block to look for its section icon/heading/rule cluster.
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
  // New generators can classify flow elements explicitly. This prevents
  // ordinary `text` nodes (job titles, company lines) from being mistaken for
  // section chrome and reordered by keep-with-next logic. Unclassified legacy
  // templates retain the previous category-based fallback.
  if (element?.flowRole) {
    return element.flowRole === "section-chrome";
  }
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
 * Gap between two lane elements if they had stayed on the same page, computed
 * from their raw authored `top` values only (ignoring `page`). A genuine
 * cross-page pair (one near a page bottom, one near the next page's top) has
 * page-relative `top` values that make this come out negative or far larger
 * than any real intra-record gap; a same-record pair that merely picked up
 * mismatched `page` numbers from an earlier, independent reflow pass (e.g. a
 * title and its meta line, ~4px apart) still has a small, sane result here.
 */
function rawSamePageGap(current, previousOriginal) {
  return number(current.top) - (number(previousOriginal.top) + elementHeight(previousOriginal));
}

/**
 * If `current` is section chrome and the following body cannot share this page,
 * bump the chrome to the next page so headings are never orphaned above the footer.
 *
 * The full first body height is reserved (not a short keep-with-next sliver).
 * Capping that height previously left headings on page N while the body alone
 * overflowed to page N+1 — the common "UMIEJĘTNOŚCI" orphan.
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
  const contentHeight = Math.max(elementHeight(content), 1);
  const authoredSpan = Math.max(
    0,
    absoluteTop(content, pageHeight) - currentAbs,
  );
  const contentBottom = pageHeight - bottomMargin;
  if (top + authoredSpan + contentHeight <= contentBottom) {
    return { page, top };
  }

  return { page: page + 1, top: pageTop };
}

/**
 * Section chrome (icon / heading / rule) sitting just above a body textarea.
 * Used when the body itself jumps to the next page so the heading is not left
 * alone in the footer.
 */
function precedingChromeCluster(elements, target, pageHeight) {
  const targetAbs = absoluteTop(target, pageHeight);
  return elements
    .filter((element) => (
      FLOWABLE_CATEGORIES.has(element.category)
      && !element.fixedToPage
      && !element.locked
      && element.element_id !== target.element_id
      && isChromeLike(element)
      && belongsToFlowLane(target, element)
      && absoluteTop(element, pageHeight) < targetAbs - 0.01
      && targetAbs - absoluteTop(element, pageHeight) <= CHROME_CLUSTER_Y_SPAN
    ))
    .sort((left, right) => {
      const topDelta = absoluteTop(left, pageHeight) - absoluteTop(right, pageHeight);
      if (Math.abs(topDelta) > 0.01) return topDelta;
      return String(left.element_id).localeCompare(String(right.element_id));
    });
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
  const originalTargetPage = pageOf(target);

  let targetPage = originalTargetPage;
  let targetTop = number(target.top);
  if (
    nextHeight <= safePageHeight - pageTop - bottomMargin
    && targetTop + nextHeight > safePageHeight - bottomMargin
  ) {
    targetPage += 1;
    targetTop = pageTop;
  }

  // When the measured body jumps to the next page, pull its preceding section
  // chrome (icon/heading/rule) with it. Otherwise the heading stays orphaned
  // in the previous page's footer while the skills/body list starts alone.
  const chromeCluster = targetPage > originalTargetPage
    ? precedingChromeCluster(elements, target, safePageHeight)
    : [];
  const chromeAnchor = chromeCluster[0] || null;
  const chromeAnchorOffset = chromeAnchor
    ? oldTargetTop - absoluteTop(chromeAnchor, safePageHeight)
    : 0;

  if (chromeAnchor) {
    targetTop = pageTop + chromeAnchorOffset;
    // If chrome + body still overflow the continuation page, pin the body
    // under the chrome cluster instead of leaving a negative gap.
    const maxBodyTop = safePageHeight - bottomMargin - nextHeight;
    if (targetTop > maxBodyTop && maxBodyTop >= pageTop) {
      targetTop = Math.max(pageTop, maxBodyTop);
    }
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
        || chromeCluster.some((chrome) => chrome.element_id === element.element_id)
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
  for (const chrome of chromeCluster) {
    const chromeOffset = oldTargetTop - absoluteTop(chrome, safePageHeight);
    placed.set(chrome.element_id, {
      ...chrome,
      page: targetPage,
      top: targetTop - chromeOffset,
    });
  }
  placed.set(elementId, {
    ...target,
    height: nextHeight,
    page: targetPage,
    top: targetTop,
  });

  // Forward packing resumes after the body; chrome above was already moved.
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
      // `page` fields can go briefly out of sync across independent reflow
      // passes (each auto-height textarea measures and settles on its own).
      // Before treating this as a genuine page-break seam, check whether the
      // pair was actually authored close together on one page — if so, honor
      // that real gap instead of the generic page-break pack gap so a tightly
      // coupled record (e.g. a title and its meta line) never gets pried
      // apart by SPACE_RECORD-sized whitespace it never had.
      const samePageGap = rawSamePageGap(current, previousOriginal);
      nextAbsolute = previousPlacedBottom + (
        samePageGap >= 0 && samePageGap <= CHROME_CLUSTER_Y_SPAN
          ? samePageGap
          : packGapAfterPageBreak(current, pageTop)
      );
    } else if (previousOriginal.element_id === elementId) {
      nextAbsolute = newTargetBottom + Math.max(0, currentOriginalTop - oldTargetBottom);
    } else {
      // Once the directly following element has moved by the target's height
      // delta, keep every later element's authored top-to-top rhythm. Mixing
      // bottom gaps with independently measured text boxes compounds height
      // deltas and distorts Onyx section chrome and page breaks.
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
