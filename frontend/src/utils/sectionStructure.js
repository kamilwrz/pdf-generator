/**
 * Structural section helpers for template-mode editing.
 *
 * Prefer explicit `flowRole: "section-chrome"` headings. For older / untagged
 * generators (e.g. Cinder), fall back to short label text sitting just above
 * a horizontal rule — the usual section chrome pattern.
 *
 * Reorder does not slide clusters by a raw absolute delta. Multi-page sections
 * encode page-break dead space in their Y span; swapping that span overlaps
 * later content and leaves holes. Instead: compact each section, pack in the
 * new order from the flow start, then paginate with the same margins as
 * `textareaReflow` (pageTop 66 / bottomMargin 72).
 */

import { DEFAULT_FLOW_SPACING, normalizeFlowSpacing } from "./flowSpacing.js";

/** Keep in sync with `textareaReflow.js` / backend CONTENT margins. */
const DEFAULT_PAGE_TOP = 66;
const DEFAULT_BOTTOM_MARGIN = 72;
/**
 * Gaps larger than this between consecutive section members are treated as
 * page-break waste (footer + next-page header) and collapsed while packing.
 */
const PAGE_BREAK_GAP_THRESHOLD = 40;

function absoluteTop(element, pageHeight = 842) {
  const page = Math.max(1, Math.trunc(Number(element?.page) || 1));
  return (page - 1) * pageHeight + (Number(element?.top) || 0);
}

function elementHeight(element) {
  const explicit = Number(element?.height);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const fontSize = Number(element?.fontSize);
  if (Number.isFinite(fontSize) && fontSize > 0) return fontSize * 1.35;
  return 12;
}

function absoluteBottom(element, pageHeight = 842) {
  return absoluteTop(element, pageHeight) + elementHeight(element);
}

function hasSectionRuleBelow(element, elements, pageHeight) {
  const abs = absoluteTop(element, pageHeight);
  const left = Number(element.left) || 0;
  return (elements || []).some((other) => {
    if (!other || other.fixedToPage) return false;
    if (other.category !== "line") return false;
    const width = Number(other.width) || 0;
    const height = Number(other.height) || 0;
    // Section underlines are wide and thin; page frames are full-bleed tall.
    if (width < 120 || height > 4) return false;
    const otherAbs = absoluteTop(other, pageHeight);
    const gap = otherAbs - abs;
    if (gap < 1 || gap > 32) return false;
    // Same visual column (Cinder rules start near the label left).
    const otherLeft = Number(other.left) || 0;
    return Math.abs(otherLeft - left) <= 40;
  });
}

/**
 * Whether this element is a section heading label.
 * @param {object|null|undefined} element
 * @param {object[]} [elements]
 * @param {number} [pageHeight=842]
 */
export function isSectionHeading(element, elements = [], pageHeight = 842) {
  if (!element || element.fixedToPage) return false;
  if (element.category !== "text" && element.category !== "textarea") return false;
  const content = String(element.content || "").trim();
  if (!content) return false;

  if (element.flowRole === "section-chrome") return true;
  // Explicit body content is never a section title.
  if (element.flowRole === "content") return false;
  if (element.autoHeight || element.flowGroup) return false;
  if (content.length > 56) return false;

  const fontSize = Number(element.fontSize) || 12;
  // Masthead names are larger; body copy is usually autoHeight textareas.
  if (fontSize < 7 || fontSize > 11.5) return false;

  return hasSectionRuleBelow(element, elements, pageHeight);
}

/**
 * List document sections in reading order.
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {{ id: string, title: string, headingId: string, startAbs: number, index: number }[]}
 */
export function listDocumentSections(elements, pageHeight = 842) {
  const list = elements || [];
  const headings = list
    .filter((element) => isSectionHeading(element, list, pageHeight))
    .sort((left, right) => absoluteTop(left, pageHeight) - absoluteTop(right, pageHeight));

  return headings.map((heading, index) => ({
    id: heading.element_id,
    title: String(heading.content || "").trim(),
    headingId: heading.element_id,
    startAbs: absoluteTop(heading, pageHeight),
    index,
  }));
}

/**
 * Collect element ids belonging to the section that starts at `headingId`
 * (heading + chrome nearby + content until the next section heading).
 */
export function sectionElementIds(elements, headingId, pageHeight = 842) {
  const sections = listDocumentSections(elements, pageHeight);
  const index = sections.findIndex((section) => section.headingId === headingId);
  if (index < 0) return new Set();
  const start = sections[index].startAbs;
  const end = index + 1 < sections.length
    ? sections[index + 1].startAbs
    : Number.POSITIVE_INFINITY;

  const ids = new Set();
  for (const element of elements || []) {
    if (element.fixedToPage) continue;
    const abs = absoluteTop(element, pageHeight);
    // Include chrome a few px above the heading (icon/rule band).
    if (abs >= start - 24 && abs < end - 0.01) {
      ids.add(element.element_id);
    }
  }
  return ids;
}

function isChromeLike(element) {
  if (!element) return false;
  if (element.flowRole === "section-chrome") return true;
  if (element.category === "line") {
    return (Number(element.height) || 0) <= 4;
  }
  if (element.category === "rectangle" || element.category === "circle") {
    const width = Number(element.width) || 0;
    const height = Number(element.height) || 0;
    return height <= 40 && width <= 40;
  }
  if (element.category === "image") {
    return Boolean(element.alignWithText)
      || /\/template-assets\/iconic\//.test(String(element.src || ""));
  }
  return false;
}

/**
 * Classify the gap between two consecutive members of the same section.
 * @returns {"after_rule"|"stack"|"record"}
 */
function classifyIntraSectionGap(previous, next) {
  const prevChrome = isChromeLike(previous);
  const nextChrome = isChromeLike(next);
  if (prevChrome && !nextChrome) return "after_rule";
  if (prevChrome && nextChrome) return "stack";

  const groupA = typeof previous.flowGroup === "string" ? previous.flowGroup : null;
  const groupB = typeof next.flowGroup === "string" ? next.flowGroup : null;
  if (groupA && groupB && groupA === groupB) return "stack";
  if (groupA || groupB) return "record";

  // Untagged legacy stacks (degree → school) stay tight; distinct blocks use record.
  const prevH = elementHeight(previous);
  const nextH = elementHeight(next);
  if (prevH <= 22 && nextH <= 22 && !previous.autoHeight && !next.autoHeight) {
    return "stack";
  }
  return "record";
}

function targetGap(kind, spacing) {
  if (kind === "after_rule") return spacing.after_rule;
  if (kind === "stack") return spacing.stack;
  return spacing.record;
}

/**
 * Collapse page-break dead space inside a section into a continuous strip.
 *
 * When `forceTargets` is true, authored gaps are replaced with classified
 * rhythm targets from `spacing` (Sections panel apply). Otherwise small
 * authored gaps are preserved and only page-break holes collapse to `record`.
 *
 * @returns {{ element: object, relTop: number }[]}
 */
function compactSectionStrip(sectionElements, pageHeight, spacing, forceTargets = false) {
  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const sorted = [...sectionElements].sort((left, right) => {
    const topDelta = absoluteTop(left, pageHeight) - absoluteTop(right, pageHeight);
    if (Math.abs(topDelta) > 0.01) return topDelta;
    return (Number(left.left) || 0) - (Number(right.left) || 0);
  });
  if (sorted.length === 0) return [];

  const items = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const element = sorted[index];
    if (index === 0) {
      items.push({ element, relTop: 0 });
      continue;
    }
    const previous = items[index - 1];
    const prevBottomAbs = absoluteBottom(previous.element, pageHeight);
    const abs = absoluteTop(element, pageHeight);
    let gap = abs - prevBottomAbs;
    const crossedPage = Math.trunc(Number(element.page) || 1)
      > Math.trunc(Number(previous.element.page) || 1);
    const kind = classifyIntraSectionGap(previous.element, element);

    if (forceTargets) {
      gap = targetGap(kind, rhythm);
    } else if (crossedPage || gap > PAGE_BREAK_GAP_THRESHOLD) {
      // Large gaps are almost always the unused band between contentBottom and
      // the next pageTop — collapse using the record rhythm, not section.
      gap = targetGap(kind === "after_rule" ? "after_rule" : "record", rhythm);
    }
    gap = Math.max(0, gap);
    items.push({
      element,
      relTop: previous.relTop + elementHeight(previous.element) + gap,
    });
  }
  return items;
}

/**
 * Map a flow cursor + height onto a page/top pair, bumping to the next page
 * when the block would collide with the footer margin (same rule as reflow).
 */
function placeAtFlowCursor(cursorAbs, height, pageHeight, pageTop, bottomMargin) {
  const contentBottom = pageHeight - bottomMargin;
  const pageCapacity = Math.max(0, contentBottom - pageTop);
  let page = Math.max(1, Math.floor(Math.max(0, cursorAbs) / pageHeight) + 1);
  let top = Math.max(0, cursorAbs) - (page - 1) * pageHeight;

  if (height <= pageCapacity && top + height > contentBottom) {
    page += 1;
    top = pageTop;
  } else if (top < pageTop && page > 1) {
    // Landed inside the previous page's top margin band after a naive abs map.
    top = pageTop;
  }

  return {
    page,
    top,
    abs: (page - 1) * pageHeight + top,
    bottom: (page - 1) * pageHeight + top + height,
  };
}

/** Count leading section-chrome pieces (heading, rule, markers, icons). */
function leadingChromeCount(strip) {
  let count = 0;
  while (count < strip.length && isChromeLike(strip[count].element)) {
    count += 1;
  }
  return count;
}

/**
 * Absolute page/top for an already-reserved strip origin + relTop.
 * Used for leading chrome so a 1px rule cannot independently "fit" in the
 * footer while the section body jumps to the next page.
 */
function pageTopFromOrigin(originAbs, relTop, pageHeight) {
  const abs = originAbs + relTop;
  const page = Math.max(1, Math.floor(Math.max(0, abs) / pageHeight) + 1);
  const top = abs - (page - 1) * pageHeight;
  return { page, top, abs, bottom: abs };
}

/**
 * Pack sections in `orderedHeadingIds` from the document flow start.
 * Non-section elements (masthead, fixed chrome) keep their positions.
 *
 * @param {object[]} elements
 * @param {string[]} orderedHeadingIds
 * @param {number} [pageHeight=842]
 * @param {{ pageTop?: number, bottomMargin?: number, sectionGap?: number, spacing?: object, forceTargets?: boolean }} [options]
 * @returns {object[]}
 */
export function packDocumentSections(
  elements,
  orderedHeadingIds,
  pageHeight = 842,
  {
    pageTop = DEFAULT_PAGE_TOP,
    bottomMargin = DEFAULT_BOTTOM_MARGIN,
    sectionGap,
    spacing,
    forceTargets = false,
  } = {},
) {
  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const resolvedSectionGap = Number.isFinite(sectionGap) ? sectionGap : rhythm.section;
  const list = elements || [];
  const sections = listDocumentSections(list, pageHeight);
  if (sections.length === 0 || !orderedHeadingIds?.length) return list;

  const byHeading = new Map(sections.map((section) => [section.headingId, section]));
  const order = orderedHeadingIds
    .map((headingId) => byHeading.get(headingId))
    .filter(Boolean);
  if (order.length === 0) return list;

  const flowStart = Math.min(...sections.map((section) => section.startAbs));
  const memberIds = new Set();
  const strips = order.map((section) => {
    const ids = sectionElementIds(list, section.headingId, pageHeight);
    ids.forEach((id) => memberIds.add(id));
    const members = list.filter((element) => ids.has(element.element_id));
    return compactSectionStrip(members, pageHeight, rhythm, forceTargets);
  });

  const placedById = new Map();
  let cursorAbs = flowStart;

  strips.forEach((strip, stripIndex) => {
    if (strip.length === 0) return;
    if (stripIndex > 0) cursorAbs += resolvedSectionGap;

    // Keep the full leading chrome band (heading + rule + markers) with the
    // first body block. Checking only strip[0]+strip[1] left Cinder's 1px
    // underlines stranded in the footer while body jumped to the next page.
    const chromeCount = leadingChromeCount(strip);
    const firstBody = chromeCount < strip.length ? strip[chromeCount] : null;
    let reservedHeight = 0;
    if (chromeCount > 0) {
      const lastChrome = strip[chromeCount - 1];
      reservedHeight = lastChrome.relTop + elementHeight(lastChrome.element);
      if (firstBody) {
        reservedHeight = firstBody.relTop + elementHeight(firstBody.element);
      }
    } else if (firstBody) {
      reservedHeight = elementHeight(firstBody.element);
    }

    const sectionCursor = reservedHeight > 0
      ? placeAtFlowCursor(
        cursorAbs,
        reservedHeight,
        pageHeight,
        pageTop,
        bottomMargin,
      ).abs
      : cursorAbs;

    let stripBottom = sectionCursor;
    let previous = null;
    for (let index = 0; index < strip.length; index += 1) {
      const item = strip[index];
      const height = elementHeight(item.element);
      const inLeadingChrome = index < chromeCount;

      let placed;
      if (inLeadingChrome) {
        // Origin already reserved room for chrome+first body — place by
        // relative offset so thin rules cannot park alone in the footer.
        const at = pageTopFromOrigin(sectionCursor, item.relTop, pageHeight);
        placed = {
          page: at.page,
          top: at.top,
          abs: at.abs,
          bottom: at.abs + height,
        };
      } else {
        let desiredAbs = sectionCursor;
        if (previous) {
          const gap = item.relTop
            - (previous.item.relTop + elementHeight(previous.item.element));
          desiredAbs = previous.placed.bottom + Math.max(0, gap);
        } else {
          desiredAbs = sectionCursor + item.relTop;
        }
        placed = placeAtFlowCursor(
          desiredAbs,
          height,
          pageHeight,
          pageTop,
          bottomMargin,
        );
      }

      placedById.set(item.element.element_id, {
        ...item.element,
        page: placed.page,
        top: placed.top,
      });
      previous = { item, placed };
      stripBottom = Math.max(stripBottom, placed.bottom);
    }
    cursorAbs = stripBottom;
  });

  return list.map((element) => {
    if (!memberIds.has(element.element_id)) return element;
    return placedById.get(element.element_id) || element;
  });
}

/**
 * Move a section up/down, then repack every section so page-break holes and
 * following content reflow instead of overlapping.
 *
 * @returns {object[]|null} new elements, or null if move is invalid
 */
export function reorderSection(
  elements,
  headingId,
  direction,
  pageHeight = 842,
  options = {},
) {
  const sections = listDocumentSections(elements, pageHeight);
  const index = sections.findIndex((section) => section.headingId === headingId);
  if (index < 0) return null;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= sections.length) return null;

  const order = sections.map((section) => section.headingId);
  const tmp = order[index];
  order[index] = order[swapWith];
  order[swapWith] = tmp;

  const rhythm = normalizeFlowSpacing(options.spacing || DEFAULT_FLOW_SPACING);
  return packDocumentSections(elements, order, pageHeight, {
    ...options,
    spacing: rhythm,
    sectionGap: options.sectionGap ?? rhythm.section,
  });
}

/**
 * Re-pack every section in current order using target rhythm values.
 * Used when the Sections panel changes stack/record/section/after_rule.
 *
 * @param {object[]} elements
 * @param {object} spacing
 * @param {number} [pageHeight=842]
 * @param {object} [options]
 * @returns {object[]}
 */
export function applyFlowSpacing(elements, spacing, pageHeight = 842, options = {}) {
  const rhythm = normalizeFlowSpacing(spacing);
  const sections = listDocumentSections(elements, pageHeight);
  if (sections.length === 0) return elements || [];
  return packDocumentSections(
    elements,
    sections.map((section) => section.headingId),
    pageHeight,
    {
      ...options,
      spacing: rhythm,
      sectionGap: rhythm.section,
      forceTargets: true,
    },
  );
}

/**
 * Find a likely profile-photo image slot for template drop targets.
 */
export function findProfilePhotoSlot(elements) {
  const images = (elements || []).filter((element) => (
    element.category === "image"
    && !element.fixedToPage
    && !/template-assets\/iconic\//.test(String(element.src || ""))
  ));
  if (images.length === 0) return null;
  // Prefer larger near-top images (typical headshot placement).
  return [...images].sort((a, b) => {
    const score = (element) => {
      const area = (Number(element.width) || 0) * (Number(element.height) || 0);
      const top = Number(element.top) || 0;
      return area - top * 2;
    };
    return score(b) - score(a);
  })[0];
}
