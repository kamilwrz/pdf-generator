/**
 * Reflow auto-height textareas and pack following content after height changes.
 *
 * Keeps section chrome with the next body block so page breaks never orphan
 * headings in the footer margin. Multi-element records tagged with `flowGroup`
 * (from Builder.keep_together) stay on one page when reclaim-packing pulls
 * content upward after earlier boxes shrink. Cross-page packing uses
 * SPACE_RECORD for ordinary blocks and SPACE_SECTION for section chrome
 * (keep in sync with `cv_generator_primitives.py` / `flowSpacing.js`).
 */
import { DEFAULT_FLOW_SPACING, normalizeFlowSpacing } from "./flowSpacing.js";

const FLOWABLE_CATEGORIES = new Set(["text", "textarea", "line", "rectangle", "circle", "ellipse", "image"]);
const NEARBY_DECORATION_CATEGORIES = new Set(["line", "rectangle", "circle", "ellipse"]);
const DECORATION_LANE_TOLERANCE = 32;
// Text-aligned section icons may hang a few dozen px left of the text column.
const TEXT_ALIGNED_IMAGE_LANE_TOLERANCE = 40;
// Section labels / markers / rules are short. Keep them with following body
// so a page break never leaves "WYKSZTAŁCENIE" stranded above the footer.
const CHROME_MAX_HEIGHT = 40;
// How far above a body block to look for its section icon/heading/rule cluster.
const CHROME_CLUSTER_Y_SPAN = 48;
// Matches backend SPACE_STACK (4) with slack for browser vs ReportLab metrics.
// Untagged legacy records use this to stay whole during reclaim packing.
// Detection threshold — not the editable SPACE_STACK rhythm value.
const RECORD_STACK_GAP = 8;

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

function flowGroupOf(element) {
  const group = element?.flowGroup;
  return typeof group === "string" && group.length > 0 ? group : null;
}

function isRecordOverlay(element, elements = [], pageHeight = 842) {
  if (element?.flowRole === "record-overlay") return true;
  if (!["image", "text"].includes(element?.category)) return false;
  const group = flowGroupOf(element);
  if (!group) return false;

  // Backward compatibility for Harbor documents saved before record-overlay
  // metadata existed. Horizontal meta labels/icons shared a flowGroup and exact
  // Y coordinate with their owning textarea; that geometry uniquely separates
  // them from genuinely stacked text rows.
  return elements.some((candidate) => (
    candidate.category === "textarea"
    && flowGroupOf(candidate) === group
    && pageOf(candidate) === pageOf(element)
    && Math.abs(absoluteTop(candidate, pageHeight) - absoluteTop(element, pageHeight)) < 0.5
  ));
}

/**
 * Find the textarea that owns a horizontal record overlay.
 *
 * Harbor dates, cities and line icons share a Y coordinate with the company
 * or sidebar text they annotate. They intentionally share the record's
 * flowGroup for page moves, but must not be counted as vertical stack rows.
 */
function recordOverlayAnchor(elements, overlay, pageHeight) {
  const group = flowGroupOf(overlay);
  if (!group) return null;
  const overlayTop = absoluteTop(overlay, pageHeight);
  // New overlays may carry a small authored baseline correction (Harbor uses
  // 1.5–2px). Legacy inferred overlays had the exact textarea top.
  const maxTopOffset = overlay.flowRole === "record-overlay" ? 3 : 0.5;

  return elements.find((candidate) => (
    candidate.element_id !== overlay.element_id
    && !isRecordOverlay(candidate, elements, pageHeight)
    && candidate.category === "textarea"
    && flowGroupOf(candidate) === group
    && pageOf(candidate) === pageOf(overlay)
    && Math.abs(absoluteTop(candidate, pageHeight) - overlayTop) <= maxTopOffset
  )) || null;
}

function heightFor(element, targetId, nextHeight) {
  if (element.element_id === targetId) return nextHeight;
  return elementHeight(element);
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

/**
 * Whether reflow must leave this element's position untouched.
 *
 * IT templates mark section markers/rules `locked` so users cannot drag them
 * and spacing guides ignore them — but those chrome pieces must still travel
 * with their heading when a textarea shrinks and reclaim packs the section
 * onto the previous page. Without this exception the heading moves and the
 * decorative rule stays on page N+1 (missing underline under WYKSZTAŁCENIE).
 * Only `flowRole: "section-chrome"` unlocks packing; other locked elements
 * (page artwork, pinned user chrome) stay fixed.
 */
function isPositionLockedForReflow(element) {
  if (!element?.locked) return false;
  return element.flowRole !== "section-chrome";
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

  // Section glyphs and markers may hang to the LEFT of their text lane.
  // Decorations entirely to the RIGHT belong to the adjacent column, even
  // when a narrow gutter is smaller than the generic proximity tolerance.
  // Harbor's 28px gutter exposed this: right-sidebar rules were classified as
  // main-lane content and blocked reclaim of experience records from page 2.
  if (elementLeft >= targetRight) return false;

  if (isNearbyTextIcon) {
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

function packGapAfterPageBreak(current, pageTop, sectionPackGap, defaultPackGap) {
  // Section chrome that lived alone near the top of page N+1 carries a tiny
  // `top - pageTop` inset (Kernel education often starts at y=72 with pageTop
  // 66 → 6 px). Using that inset as the pack gap crushed headings under the
  // previous section. Always restore SPACE_SECTION for chrome.
  if (isChromeLike(current)) {
    return sectionPackGap;
  }
  const continuationInset = Math.max(0, number(current.top) - pageTop);
  return Math.min(defaultPackGap, continuationInset || defaultPackGap);
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
 * Height of the keep-together record starting at `lane[index]`, including
 * internal gaps. Prefers explicit `flowGroup`; falls back to tightly stacked
 * non-chrome content for legacy layouts without tags.
 *
 * Decorative chrome that overlaps a record's Y band (Nimbus section chips sit
 * on the degree line) is skipped — breaking here used to reserve only the
 * first textarea and leave school/description on the next page.
 */
function remainingRecordHeight(lane, index, pageHeight, targetId, nextHeight) {
  const start = lane[index];
  if (!start || isChromeLike(start)) {
    return Math.max(elementHeight(start), 1);
  }

  const group = flowGroupOf(start);
  let total = heightFor(start, targetId, nextHeight);
  let previous = start;

  for (let i = index + 1; i < lane.length; i += 1) {
    const candidate = lane[i];
    if (isChromeLike(candidate)) {
      // Tagged records may have section markers interleaved by Y-sort; keep
      // scanning for the rest of the same flowGroup.
      if (group) continue;
      break;
    }

    if (group) {
      if (flowGroupOf(candidate) !== group) break;
    } else {
      if (flowGroupOf(candidate)) break;
      const authoredGap = absoluteTop(candidate, pageHeight)
        - (absoluteTop(previous, pageHeight) + elementHeight(previous));
      if (authoredGap < -0.5 || authoredGap > RECORD_STACK_GAP) break;
    }

    const gap = Math.max(
      0,
      absoluteTop(candidate, pageHeight)
        - (absoluteTop(previous, pageHeight) + elementHeight(previous)),
    );
    total += gap + heightFor(candidate, targetId, nextHeight);
    previous = candidate;
  }

  return Math.max(total, 1);
}

/**
 * If `current` is section chrome and the following record cannot share this page,
 * bump the chrome to the next page so headings are never orphaned above the footer.
 *
 * Reserves the full first keep-together record (degree + meta + description),
 * not only the first textarea. Capping to the first body previously left
 * "WYKSZTAŁCENIE" + Bachelor on page N while the description stayed on N+1.
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
  targetId = null,
  nextHeight = 0,
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
  const contentHeight = remainingRecordHeight(
    lane,
    contentIndex,
    pageHeight,
    targetId,
    nextHeight,
  );
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
      && !isPositionLockedForReflow(element)
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
 * Absolute bottom of the last flowable lane element on ``page`` that is not
 * part of ``excludeGroup`` (and is not the target itself). Used to pull a
 * keep-together record back onto the previous page after shrinks free room.
 */
function previousLaneContentBottom(
  elements,
  target,
  pageHeight,
  page,
  excludeGroup,
) {
  let bottom = null;
  for (const element of elements) {
    if (!FLOWABLE_CATEGORIES.has(element.category)) continue;
    if (isRecordOverlay(element, elements, pageHeight)) continue;
    if (element.fixedToPage || isPositionLockedForReflow(element)) continue;
    if (element.element_id === target.element_id) continue;
    if (pageOf(element) !== page) continue;
    if (!belongsToFlowLane(target, element)) continue;
    if (excludeGroup && flowGroupOf(element) === excludeGroup) continue;
    const candidateBottom = absoluteTop(element, pageHeight) + elementHeight(element);
    if (bottom == null || candidateBottom > bottom) bottom = candidateBottom;
  }
  return bottom;
}

/**
 * True when another lane block sits between ``fromAbs`` and ``toAbs``.
 * Reclaim must not jump a later section (e.g. skills) back onto page N while
 * education still occupies the band under the previous page's last job.
 */
function hasInterveningLaneContent(
  elements,
  target,
  pageHeight,
  fromAbs,
  toAbs,
  excludeIds,
) {
  const excluded = excludeIds instanceof Set ? excludeIds : new Set(excludeIds);
  for (const element of elements) {
    if (!FLOWABLE_CATEGORIES.has(element.category)) continue;
    if (isRecordOverlay(element, elements, pageHeight)) continue;
    if (element.fixedToPage || isPositionLockedForReflow(element)) continue;
    if (excluded.has(element.element_id)) continue;
    if (!belongsToFlowLane(target, element)) continue;
    const abs = absoluteTop(element, pageHeight);
    if (abs > fromAbs + 0.01 && abs < toAbs - 0.01) return true;
  }
  return false;
}

/**
 * Document order index — generators emit category labels before chip bodies, so
 * when a page-break pack collapses both onto the same Y we still know which
 * mate is the title.
 */
function elementDocIndex(elements, element) {
  const index = elements.findIndex((entry) => entry.element_id === element.element_id);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * Reading-order compare for keep-together mates. Same-top siblings (collapsed
 * page-break packs) keep generator / document order so category labels stay
 * above their chip bodies.
 */
function compareRecordMateOrder(left, right, pageHeight, elements) {
  const topDelta = absoluteTop(left, pageHeight) - absoluteTop(right, pageHeight);
  if (Math.abs(topDelta) > 0.01) return topDelta;
  return elementDocIndex(elements, left) - elementDocIndex(elements, right);
}

/**
 * Content siblings in the target's keep-together record on one side of it.
 * `direction` is -1 for mates above the target, +1 for mates below.
 *
 * Same-`top` mates in a shared ``flowGroup`` count as neighbours: a page-break
 * pack can park a skill category and its chips on the same Y, and the strict
 * abs inequality used to hide them from each other so reflow could never
 * un-crush the pair.
 */
function recordMatesBeside(elements, target, pageHeight, direction) {
  const group = flowGroupOf(target);
  const targetAbs = absoluteTop(target, pageHeight);
  const targetIndex = elementDocIndex(elements, target);
  const laneMates = elements.filter((element) => {
    if (!FLOWABLE_CATEGORIES.has(element.category)) return false;
    if (isRecordOverlay(element, elements, pageHeight)) return false;
    if (element.fixedToPage || isPositionLockedForReflow(element)) return false;
    if (element.element_id === target.element_id) return false;
    if (isChromeLike(element)) return false;
    if (!belongsToFlowLane(target, element)) return false;
    const abs = absoluteTop(element, pageHeight);
    if (direction < 0) {
      if (abs < targetAbs - 0.01) return true;
      // Overlapping / equal tops: earlier document order counts as "above".
      return (
        Boolean(group)
        && flowGroupOf(element) === group
        && Math.abs(abs - targetAbs) <= 0.01
        && elementDocIndex(elements, element) < targetIndex
      );
    }
    if (abs > targetAbs + 0.01) return true;
    return (
      Boolean(group)
      && flowGroupOf(element) === group
      && Math.abs(abs - targetAbs) <= 0.01
      && elementDocIndex(elements, element) > targetIndex
    );
  });

  if (group) {
    return laneMates
      .filter((element) => flowGroupOf(element) === group)
      .sort((left, right) => compareRecordMateOrder(left, right, pageHeight, elements));
  }

  if (direction > 0) {
    // Legacy forward walk: keep stacking while authored gaps stay record-tight.
    const sorted = [...laneMates].sort((left, right) => {
      const topDelta = absoluteTop(left, pageHeight) - absoluteTop(right, pageHeight);
      if (Math.abs(topDelta) > 0.01) return topDelta;
      return String(left.element_id).localeCompare(String(right.element_id));
    });
    const mates = [];
    let cursorAbs = targetAbs;
    let cursorHeight = elementHeight(target);
    for (const candidate of sorted) {
      const gap = absoluteTop(candidate, pageHeight) - (cursorAbs + cursorHeight);
      if (gap < -0.5 || gap > RECORD_STACK_GAP) break;
      if (flowGroupOf(candidate)) break;
      mates.push(candidate);
      cursorAbs = absoluteTop(candidate, pageHeight);
      cursorHeight = elementHeight(candidate);
    }
    return mates;
  }

  // Legacy: walk upward while authored gaps stay inside one record stack.
  const sorted = [...laneMates].sort((left, right) => {
    const topDelta = absoluteTop(right, pageHeight) - absoluteTop(left, pageHeight);
    if (Math.abs(topDelta) > 0.01) return topDelta;
    return String(left.element_id).localeCompare(String(right.element_id));
  });
  const mates = [];
  let cursorAbs = targetAbs;
  for (const candidate of sorted) {
    const candidateBottom = absoluteTop(candidate, pageHeight) + elementHeight(candidate);
    const gap = cursorAbs - candidateBottom;
    if (gap < -0.5 || gap > RECORD_STACK_GAP) break;
    if (flowGroupOf(candidate)) break;
    mates.unshift(candidate);
    cursorAbs = absoluteTop(candidate, pageHeight);
  }
  return mates;
}

/**
 * Title/meta siblings that share the target's keep-together record and sit
 * above it. When the measured body jumps pages, these must move with it.
 */
function precedingRecordMates(elements, target, pageHeight) {
  return recordMatesBeside(elements, target, pageHeight, -1);
}

/**
 * School/meta/body siblings below the target in the same keep-together record.
 * Reclaim / page-jump decisions must reserve their height too — measuring only
 * the target (e.g. a grown degree line) used to pull one field back to page N
 * while the rest of the education record stayed crushed on page N+1.
 */
function followingRecordMates(elements, target, pageHeight) {
  return recordMatesBeside(elements, target, pageHeight, 1);
}

/**
 * Place a keep-together record on ``targetPage`` starting at ``recordTop``.
 * Uses authored intra-record gaps but advances by each mate's post-measure
 * height so a grown degree/school cannot overlap the next line.
 */
function placeRecordCluster(
  placed,
  cluster,
  targetPage,
  recordTop,
  targetId,
  nextHeight,
  pageHeight,
  spaceStack = DEFAULT_FLOW_SPACING.stack,
) {
  let pageY = recordTop;
  for (let index = 0; index < cluster.length; index += 1) {
    const mate = cluster[index];
    if (index > 0) {
      const previous = cluster[index - 1];
      const authoredGap = absoluteTop(mate, pageHeight)
        - (absoluteTop(previous, pageHeight) + elementHeight(previous));
      const gap = (authoredGap >= -0.5 && authoredGap <= RECORD_STACK_GAP)
        ? Math.max(0, authoredGap)
        : spaceStack;
      pageY += heightFor(previous, targetId, nextHeight) + gap;
    }
    placed.set(mate.element_id, {
      ...mate,
      ...(mate.element_id === targetId ? { height: nextHeight } : {}),
      page: targetPage,
      top: pageY,
    });
  }
}

/**
 * Applies a measured textarea height and flows later elements in its lane.
 * Same-page items keep their top-to-top rhythm (so tall rails/markers stay
 * aligned). Page-break dead space is reclaimed so shrinks can pull later
 * blocks into freed room on the previous page — but only when a whole
 * keep-together record still fits.
 */
export function reflowTextareaHeight(
  elements,
  elementId,
  measuredHeight,
  pageHeight,
  { pageTop = 0, bottomMargin = 0, allowReclaim = true, spacing } = {},
) {
  const target = elements.find((element) => element.element_id === elementId);
  const nextHeight = Math.max(0, Math.round(number(measuredHeight)));
  if (!target || !target.autoHeight || nextHeight === 0) {
    return { elements, pageCount: Math.max(1, ...elements.map(pageOf)), changed: false };
  }

  const oldHeight = elementHeight(target);
  const delta = nextHeight - oldHeight;
  const heightIsUnchanged = Math.abs(delta) < 0.5;
  // A saved template may already contain a browser-measured height but retain
  // a stale page break produced before lane classification was corrected.
  // Permit one reclaim-only pass for page 2+; page-one and freeform elements
  // still short-circuit so equal measurements cannot cause render loops.
  if (heightIsUnchanged && (!allowReclaim || pageOf(target) === 1)) {
    return { elements, pageCount: Math.max(1, ...elements.map(pageOf)), changed: false };
  }

  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const sectionPackGap = rhythm.section;
  const defaultPackGap = rhythm.record;
  const spaceStack = rhythm.stack;

  const safePageHeight = Math.max(1, number(pageHeight, 842));
  const contentBottom = safePageHeight - bottomMargin;
  const pageCapacity = Math.max(0, contentBottom - pageTop);
  const oldTargetTop = absoluteTop(target, safePageHeight);
  const oldTargetBottom = oldTargetTop + oldHeight;
  const originalTargetPage = pageOf(target);

  const precedingMates = precedingRecordMates(elements, target, safePageHeight);
  const followingMates = followingRecordMates(elements, target, safePageHeight);
  const recordAnchor = precedingMates[0] || target;
  const oldRecordTop = absoluteTop(recordAnchor, safePageHeight);
  const originalAnchorPage = pageOf(recordAnchor);
  // Full keep-together record. Reclaim must reserve school/meta/body under a
  // grown degree — measuring only the target used to orphan those fields on
  // page N+1 (Kernel education crush on continuation pages).
  const fullRecordCluster = [...precedingMates, target, ...followingMates];
  const recordHeight = remainingRecordHeight(
    fullRecordCluster,
    0,
    safePageHeight,
    elementId,
    nextHeight,
  );

  let targetPage = originalTargetPage;
  let recordTop = number(recordAnchor.top);
  if (
    recordHeight <= pageCapacity
    && recordTop + recordHeight > contentBottom
  ) {
    targetPage = originalAnchorPage + 1;
    recordTop = pageTop;
  }

  // Pull a keep-together record back onto the previous page when shrinks (this
  // box or earlier ones already packed above) free enough room. ReportLab often
  // overshoots browser line wraps, so generators park the next experience
  // record on page N+1; without this step the canvas keeps a large empty band
  // under the last page-N job even though the whole record now fits.
  //
  // Only reclaim across an empty page-break hole. If education (or any other
  // lane content) already sits between the previous page's last job and this
  // record, pulling skills/meta back would skip that band and crush page 2.
  //
  // When the record carries preceding section chrome (heading/rule/icon), the
  // fit check must reserve that span and pack from SPACE_SECTION — body-only
  // + SPACE_RECORD let a grown "Nowa sekcja" snap back into the page-1 footer
  // even though heading+rule+body no longer fit.
  const recordGroup = flowGroupOf(target);
  const chromeBesideRecord = precedingChromeCluster(
    elements,
    recordAnchor,
    safePageHeight,
  );
  const chromeSpan = chromeBesideRecord.length > 0
    ? Math.max(0, oldRecordTop - absoluteTop(chromeBesideRecord[0], safePageHeight))
    : 0;
  // Freeform projects own page placement; reclaim would "repair" a hand-tuned
  // layout by pulling later blocks into earlier-page holes.
  if (
    allowReclaim
    && recordHeight <= pageCapacity
    && originalAnchorPage > 1
  ) {
    const prevPage = originalAnchorPage - 1;
    const prevBottomAbs = previousLaneContentBottom(
      elements,
      target,
      safePageHeight,
      prevPage,
      recordGroup,
    );
    if (prevBottomAbs != null) {
      // Section chrome after a prior content block uses SPACE_SECTION; bare
      // record-to-record reclaim keeps SPACE_RECORD.
      const packGap = chromeSpan > 0 ? sectionPackGap : defaultPackGap;
      const packFrom = prevBottomAbs + packGap;
      const prevPageStart = (prevPage - 1) * safePageHeight;
      const proposedChromeTop = packFrom - prevPageStart;
      const proposedRecordTop = proposedChromeTop + chromeSpan;
      const reclaimExcludeIds = new Set([
        ...fullRecordCluster.map((mate) => mate.element_id),
        ...chromeBesideRecord.map((chrome) => chrome.element_id),
      ]);
      const blockedByIntervening = hasInterveningLaneContent(
        elements,
        target,
        safePageHeight,
        prevBottomAbs,
        oldRecordTop,
        reclaimExcludeIds,
      );
      if (
        !blockedByIntervening
        && proposedChromeTop >= pageTop
        && proposedRecordTop + recordHeight <= contentBottom
      ) {
        targetPage = prevPage;
        recordTop = proposedRecordTop;
      }
    }
  }

  // With no height delta there is nothing to forward-pack unless reclaim
  // actually selected an earlier page. Returning unchanged here prevents an
  // equal post-font measurement from repeatedly replacing canvas state.
  //
  // Still continue when keep-together mates overlap / share a top — a crushed
  // skill category+chips pair needs a restack even when measured height matches.
  const matesNeedUncrush = fullRecordCluster.some((mate, index) => {
    if (index === 0) return false;
    const previous = fullRecordCluster[index - 1];
    const gap = absoluteTop(mate, safePageHeight)
      - (absoluteTop(previous, safePageHeight) + elementHeight(previous));
    return gap < -0.5;
  });
  if (
    heightIsUnchanged
    && targetPage === originalAnchorPage
    && !matesNeedUncrush
  ) {
    return { elements, pageCount: Math.max(1, ...elements.map(pageOf)), changed: false };
  }

  const movedToDifferentPage = targetPage !== originalAnchorPage;

  // When the measured record changes page, pull its preceding section chrome
  // (icon/heading/rule) with the record anchor — not only with the body
  // textarea — so degree/meta siblings are not left under an orphan heading.
  const chromeCluster = movedToDifferentPage ? chromeBesideRecord : [];
  const chromeAnchor = chromeCluster[0] || null;
  const chromeAnchorOffset = chromeAnchor
    ? oldRecordTop - absoluteTop(chromeAnchor, safePageHeight)
    : 0;

  // Forward jumps park at the page-top inset. Reclaim keeps the packed
  // ``proposedTop`` under the previous page's content.
  if (chromeAnchor && targetPage > originalAnchorPage) {
    recordTop = pageTop + chromeAnchorOffset;
    const maxRecordTop = contentBottom - recordHeight;
    if (recordTop > maxRecordTop && maxRecordTop >= pageTop) {
      recordTop = Math.max(pageTop, maxRecordTop);
    }
  }

  const placed = new Map();
  for (const chrome of chromeCluster) {
    const chromeOffset = oldRecordTop - absoluteTop(chrome, safePageHeight);
    placed.set(chrome.element_id, {
      ...chrome,
      page: targetPage,
      top: recordTop - chromeOffset,
    });
  }

  // Same-page growth: place preceding mates + target; following mates keep
  // their bottom-stacking path in the forward packer. Page moves place the
  // whole record atomically so reclaim cannot orphan school/meta/body.
  //
  // Exception: same-top / overlapping following mates (crushed skill category
  // + chips after a page break) must restack here — the forward packer preserves
  // authored top-to-top deltas and would keep the overlap.
  const overlappingFollowers = followingMates.filter((mate) => {
    const gap = absoluteTop(mate, safePageHeight)
      - (oldTargetTop + oldHeight);
    return gap < -0.5;
  });
  const placeCluster = movedToDifferentPage
    ? fullRecordCluster
    : [...precedingMates, target, ...overlappingFollowers];
  placeRecordCluster(
    placed,
    placeCluster,
    targetPage,
    recordTop,
    elementId,
    nextHeight,
    safePageHeight,
    spaceStack,
  );

  const placedTarget = placed.get(elementId);
  const newTargetTop = (pageOf(placedTarget) - 1) * safePageHeight + number(placedTarget.top);
  const newTargetBottom = newTargetTop + nextHeight;
  const oldClusterBottom = Math.max(
    oldTargetBottom,
    ...placeCluster.map((mate) => absoluteTop(mate, safePageHeight) + elementHeight(mate)),
  );

  const lane = elements
    .filter((element) => (
      FLOWABLE_CATEGORIES.has(element.category)
      && !isRecordOverlay(element, elements, safePageHeight)
      && !element.fixedToPage
      && !isPositionLockedForReflow(element)
      && (
        placed.has(element.element_id)
        || (
          absoluteTop(element, safePageHeight) >= oldClusterBottom - 0.01
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

  // Forward packing resumes after the resized body; record mates / chrome above
  // were already placed atomically.
  let previousOriginal = target;
  let previousPlacedTop = newTargetTop;
  let previousPlacedBottom = newTargetBottom;
  let maxPage = targetPage;
  let activeGroupPage = null;
  // Content-only cursor for flowGroup continuity. Decorative chrome can sort
  // between record mates by `top` (Nimbus chip on the degree line); comparing
  // only against `previousOriginal` would treat the next mate as a new record.
  let lastContentGroup = isChromeLike(target) ? null : flowGroupOf(target);
  let lastContentPlacedBottom = isChromeLike(target) ? null : newTargetBottom;

  for (let index = targetIndex + 1; index < lane.length; index += 1) {
    const current = lane[index];
    if (placed.has(current.element_id)) {
      const already = placed.get(current.element_id);
      previousOriginal = current;
      previousPlacedTop = (pageOf(already) - 1) * safePageHeight + number(already.top);
      previousPlacedBottom = previousPlacedTop + heightFor(already, elementId, nextHeight);
      maxPage = Math.max(maxPage, pageOf(already));
      if (!isChromeLike(current)) {
        lastContentGroup = flowGroupOf(current);
        lastContentPlacedBottom = previousPlacedBottom;
      }
      continue;
    }

    const height = elementHeight(current);
    const currentOriginalTop = absoluteTop(current, safePageHeight);
    const crossedPage = pageOf(current) > pageOf(previousOriginal);
    const group = flowGroupOf(current);
    const previousGroup = flowGroupOf(previousOriginal);
    const gapFromPrevious = rawSamePageGap(current, previousOriginal);
    // Tagged records start whenever the flowGroup changes relative to the last
    // content block (not relative to an interleaved decoration). Untagged
    // legacy records start only under section chrome — a large gap after
    // another content block is a new independent entry, not a keep-together
    // stack.
    const startsRecord = !isChromeLike(current) && (
      (Boolean(group) && group !== lastContentGroup)
      || (!group && isChromeLike(previousOriginal) && !lastContentGroup)
    );
    const continuesRecord = !isChromeLike(current) && !startsRecord && (
      (Boolean(group) && group === lastContentGroup)
      || (
        !group
        && !lastContentGroup
        && !previousGroup
        && !isChromeLike(previousOriginal)
        && gapFromPrevious >= -0.5
        && gapFromPrevious <= RECORD_STACK_GAP
      )
    );

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
          : packGapAfterPageBreak(current, pageTop, sectionPackGap, defaultPackGap)
      );
    } else if (previousOriginal.element_id === elementId) {
      nextAbsolute = newTargetBottom + Math.max(0, currentOriginalTop - oldTargetBottom);
    } else {
      // Once the directly following element has moved by the target's height
      // delta, keep every later element's authored top-to-top rhythm. Mixing
      // bottom gaps with independently measured text boxes compounds height
      // deltas and distorts section chrome rhythm and page breaks.
      nextAbsolute = previousPlacedTop + (
        currentOriginalTop - absoluteTop(previousOriginal, safePageHeight)
      );
    }

    const reservedHeight = startsRecord
      ? remainingRecordHeight(lane, index, safePageHeight, elementId, nextHeight)
      : height;

    let { page, top } = toPagePosition(
      nextAbsolute,
      reservedHeight,
      safePageHeight,
      pageTop,
      bottomMargin,
    );

    // Mid-record pieces stay on the page chosen for the record start.
    if (continuesRecord && activeGroupPage != null) {
      page = activeGroupPage;
      // Prefer the last content mate's bottom when chrome was interleaved —
      // raw gap against a decoration that shares the degree line is often 0/neg.
      const stackFrom = lastContentPlacedBottom != null
        ? lastContentPlacedBottom
        : previousPlacedBottom;
      // Negative / missing authored gaps (overlapped category+chips) fall back
      // to SPACE_STACK so the pair un-crushes instead of staying at the same Y.
      const stackGap = (!isChromeLike(previousOriginal) && gapFromPrevious >= 0)
        ? gapFromPrevious
        : spaceStack;
      top = stackFrom - (page - 1) * safePageHeight + stackGap;
      if (top < pageTop && page > 1) {
        // stackFrom still on the previous page. If the previous mate already
        // landed on this page, stack under it — clamping to pageTop alone is
        // what collapsed skill category labels onto their chip bodies.
        const pageStartAbs = (page - 1) * safePageHeight + pageTop;
        if (previousPlacedBottom >= pageStartAbs - 0.01) {
          top = previousPlacedBottom - (page - 1) * safePageHeight + spaceStack;
        } else {
          top = pageTop;
        }
      }
      if (top + height > contentBottom && height <= pageCapacity) {
        // Last resort for a record taller than one page.
        page += 1;
        top = pageTop;
        activeGroupPage = page;
      }
    }

    ({ page, top } = avoidOrphanChrome(
      lane,
      index,
      current,
      top,
      page,
      safePageHeight,
      pageTop,
      bottomMargin,
      elementId,
      nextHeight,
    ));

    if (startsRecord || (continuesRecord && activeGroupPage == null)) {
      activeGroupPage = page;
    } else if (isChromeLike(current)) {
      // Clear only when this chrome opens a later section — not when a
      // decoration is Y-sorted inside the active keep-together record.
      let nextContentGroup = null;
      for (let i = index + 1; i < lane.length; i += 1) {
        if (!isChromeLike(lane[i])) {
          nextContentGroup = flowGroupOf(lane[i]);
          break;
        }
      }
      if (nextContentGroup !== lastContentGroup || lastContentGroup == null) {
        activeGroupPage = null;
      }
    }

    const nextElement = { ...current, page, top };
    placed.set(current.element_id, nextElement);

    previousOriginal = current;
    previousPlacedTop = (page - 1) * safePageHeight + top;
    previousPlacedBottom = previousPlacedTop + height;
    maxPage = Math.max(maxPage, page);
    if (!isChromeLike(current)) {
      lastContentGroup = group;
      lastContentPlacedBottom = previousPlacedBottom;
    }
  }

  const reflowed = elements.map((element) => {
    if (isRecordOverlay(element, elements, safePageHeight)) {
      const anchor = recordOverlayAnchor(elements, element, safePageHeight);
      const placedAnchor = anchor ? placed.get(anchor.element_id) : null;
      if (placedAnchor) {
        const relativeTop = absoluteTop(element, safePageHeight)
          - absoluteTop(anchor, safePageHeight);
        const moved = {
          ...element,
          page: pageOf(placedAnchor),
          top: number(placedAnchor.top) + relativeTop,
        };
        maxPage = Math.max(maxPage, pageOf(moved));
        return moved;
      }
    }
    if (placed.has(element.element_id)) {
      return placed.get(element.element_id);
    }
    maxPage = Math.max(maxPage, pageOf(element));
    return element;
  });

  return { elements: reflowed, pageCount: maxPage, changed: true };
}
