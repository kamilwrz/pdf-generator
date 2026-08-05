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
/**
 * Fallback clearance under the masthead divider when the authored
 * heading gap has been corrupted by an earlier pack (Regent uses 36,
 * solid-band templates like Cinder use ~32 — both sit in this band).
 */
const DEFAULT_MASTHEAD_CLEARANCE = 36;

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
 * Whether this chrome text is a decorative ordinal badge ("01", "02", …),
 * not the section's real title.
 *
 * Prefer the explicit `isDecorativeChromeText` flag (backend Monument /
 * sectionBuilder). Also accept digit-only section-chrome labels as a safety
 * net when the flag was stripped on an older save/load path — otherwise
 * `listDocumentSections` treats every badge as its own section and
 * `applyFlowSpacing` tears the numbered chrome band apart.
 *
 * @param {object|null|undefined} element
 * @returns {boolean}
 */
export function isDecorativeOrdinalChrome(element) {
  if (!element) return false;
  if (element.isDecorativeChromeText) return true;
  if (element.flowRole !== "section-chrome") return false;
  if (element.category !== "text" && element.category !== "textarea") return false;
  // Monument ordinals are one or two digits; reject longer numeric titles.
  return /^\d{1,2}$/.test(String(element.content || "").trim());
}

/**
 * Prefer the real section title inside a chrome cluster over a decorative
 * ordinal badge that may sort first in document order.
 * @param {object[]} chromeElements
 * @returns {object|undefined}
 */
function chromeTitleAnchor(chromeElements) {
  const titles = (chromeElements || []).filter((element) => (
    (element.category === "text" || element.category === "textarea")
    && !isDecorativeOrdinalChrome(element)
  ));
  if (titles.length === 0) {
    return (chromeElements || []).find((element) => (
      element.category === "text" || element.category === "textarea"
    )) || chromeElements?.[0];
  }
  // When several non-ordinal chrome labels exist, the longest is the title
  // (Monument: "WYKSZTAŁCENIE" vs a short accent word).
  return [...titles].sort((left, right) => (
    String(right.content || "").trim().length - String(left.content || "").trim().length
  ))[0];
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

  if (element.flowRole === "section-chrome") {
    // A template may tag more than one text element as chrome inside a single
    // section (Monument's numbered badge alongside its real title). Decorative
    // ordinals must not become their own sections.
    return !isDecorativeOrdinalChrome(element);
  }
  // Explicit body / masthead copy is never a section title.
  if (element.flowRole === "content" || element.flowRole === "masthead") return false;
  if (element.autoHeight || element.flowGroup) return false;
  if (content.length > 56) return false;

  // Contact lines sit just above the Regent/Aldine header rule and match the
  // legacy "short label + rule below" heuristic — reject them explicitly.
  if (content.includes("@")) return false;
  if ((content.match(/·/g) || []).length >= 1 && /\d/.test(content)) return false;

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
 * Small marks/icons that may sit a few px above the heading baseline.
 * Wide untagged rules are NOT included — those are masthead dividers
 * (Regent/Aldine) and absorbing them into the section chrome cluster
 * pushes the heading down on the next pack.
 */
function isLeadingSectionMark(element) {
  if (!element) return false;
  if (element.flowRole === "section-chrome") return true;
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
    if (element.flowRole === "masthead") continue;
    const abs = absoluteTop(element, pageHeight);
    if (abs >= start && abs < end - 0.01) {
      ids.add(element.element_id);
      continue;
    }
    // Only tagged chrome / small marks may sit slightly above the heading.
    // Never pull the wide masthead divider into the section strip.
    if (abs >= start - 24 && abs < start && isLeadingSectionMark(element)) {
      ids.add(element.element_id);
    }
  }
  return ids;
}

/**
 * Absolute Y where the first flow section should start, anchored under the
 * masthead so corrupted heading positions cannot open a large white gap
 * (Regent) or climb into the header band.
 */
function resolveFlowStart(elements, sections, pageHeight) {
  const headingStart = Math.min(...sections.map((section) => section.startAbs));
  let mastheadBottom = 0;
  for (const element of elements || []) {
    if (!element || element.fixedToPage) continue;
    if (element.flowRole === "section-chrome") continue;
    const abs = absoluteTop(element, pageHeight);
    if (abs >= headingStart - 0.01) continue;
    mastheadBottom = Math.max(mastheadBottom, absoluteBottom(element, pageHeight));
  }
  if (mastheadBottom <= 0) return headingStart;

  const authoredGap = headingStart - mastheadBottom;
  const clearance = (authoredGap >= 20 && authoredGap <= 56)
    ? authoredGap
    : DEFAULT_MASTHEAD_CLEARANCE;
  return mastheadBottom + clearance;
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

function sortByReadingOrder(elements, pageHeight) {
  return [...elements].sort((left, right) => {
    const topDelta = absoluteTop(left, pageHeight) - absoluteTop(right, pageHeight);
    if (Math.abs(topDelta) > 0.01) return topDelta;
    return (Number(left.left) || 0) - (Number(right.left) || 0);
  });
}

/**
 * Whether chrome members still form an authored cluster (overlap / flush rule)
 * rather than a corrupted vertical stack from an earlier forceTargets pack.
 */
function chromeClusterIsHealthy(chromeElements, pageHeight) {
  if (chromeElements.length <= 1) return true;
  const sorted = sortByReadingOrder(chromeElements, pageHeight);
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = absoluteTop(sorted[index], pageHeight)
      - absoluteBottom(sorted[index - 1], pageHeight);
    // Template chrome overlaps (mark on heading) or sits flush (Builder.line).
    // A strictly positive gap between every pair means SPACE_STACK tore it apart.
    if (gap < 1) return true;
  }
  return false;
}

/**
 * Rebuild heading / rule / marker into the classic tight band used by Cinder,
 * Aldine, Regent, etc.: heading at 0, marks near +2, wide rule flush under label.
 *
 * @returns {{ element: object, relTop: number }[]}
 */
function rebuildTightChromeCluster(chromeElements) {
  // Never anchor the band on a Monument ordinal badge — that parks the real
  // title and the filled square below the digits and looks like a "reset 01".
  const heading = chromeTitleAnchor(chromeElements);
  const headingHeight = elementHeight(heading);
  const items = [{ element: heading, relTop: 0 }];

  for (const element of chromeElements) {
    if (element === heading) continue;
    const width = Number(element.width) || 0;
    if (element.category === "line" && width >= 120) {
      // Builder.line paints on the cursor without advancing — flush under label.
      items.push({ element, relTop: headingHeight });
    } else if (
      element.category === "rectangle"
      || element.category === "circle"
      || element.category === "image"
    ) {
      items.push({ element, relTop: 2 });
    } else if (element.category === "line") {
      // Short accent rules / filled badge squares belonging to the chrome band.
      // Keep tall badge blocks overlapping the title (Monument 32px square).
      const height = elementHeight(element);
      items.push({
        element,
        relTop: height >= 20 ? Math.min(0, headingHeight - height + 8) : Math.max(0, headingHeight - 1),
      });
    } else if (isDecorativeOrdinalChrome(element)) {
      // Digits sit on the badge square, level with the title baseline.
      items.push({ element, relTop: 0 });
    } else {
      items.push({ element, relTop: headingHeight });
    }
  }

  return items.sort((left, right) => left.relTop - right.relTop
    || (Number(left.element.left) || 0) - (Number(right.element.left) || 0));
}

/**
 * Rebuild the heading / rule / marker band.
 *
 * Decorative chrome must keep its authored mutual offsets (Cinder's mark sits
 * on the heading line; the rule sits flush under the label). Forcing SPACE_STACK
 * between chrome pieces — or sorting a previously orphaned rule by its bad Y —
 * destroys that rhythm. Chrome is split out of the body; stranded or previously
 * stack-corrupted pieces are healed into a tight cluster.
 *
 * @returns {{ element: object, relTop: number }[]}
 */
function compactChromeCluster(chromeElements, pageHeight) {
  if (chromeElements.length === 0) return [];

  const heading = chromeTitleAnchor(chromeElements);
  const headingAbs = absoluteTop(heading, pageHeight);

  // Pieces far from the heading were stranded by an earlier footer pack.
  const COHERENT_SPAN = 48;
  const nearHeading = [];
  const stranded = [];
  for (const element of chromeElements) {
    const delta = absoluteTop(element, pageHeight) - headingAbs;
    if (Math.abs(delta) <= COHERENT_SPAN) nearHeading.push(element);
    else stranded.push(element);
  }

  // Healthy authored geometry: preserve deltas. Corrupted stack or orphans: heal.
  if (stranded.length === 0 && chromeClusterIsHealthy(nearHeading, pageHeight)) {
    const items = nearHeading.map((element) => ({
      element,
      relTop: absoluteTop(element, pageHeight) - headingAbs,
    }));
    const minRel = items.reduce(
      (min, item) => Math.min(min, item.relTop),
      items[0]?.relTop ?? 0,
    );
    for (const item of items) item.relTop -= minRel;
    return items.sort((left, right) => left.relTop - right.relTop
      || (Number(left.element.left) || 0) - (Number(right.element.left) || 0));
  }

  return rebuildTightChromeCluster(chromeElements);
}

/**
 * Heading labels count as chrome even when untagged (legacy rule-below heuristic).
 */
function isSectionChromeMember(element, sectionElements, pageHeight) {
  if (isChromeLike(element)) return true;
  return isSectionHeading(element, sectionElements, pageHeight);
}

/**
 * Collapse a section into a continuous strip: chrome cluster first, then body.
 *
 * `forceTargets` only retargets chrome→body (`after_rule`) and body gaps
 * (`stack` / `record`). Intra-chrome spacing is never replaced by SPACE_STACK.
 *
 * @returns {{ element: object, relTop: number }[]}
 */
function compactSectionStrip(sectionElements, pageHeight, spacing, forceTargets = false) {
  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  if (!sectionElements.length) return [];

  // Pull chrome ahead of body so a rule stranded at the page footer cannot sort
  // into the middle of experience records.
  const chrome = [];
  const body = [];
  for (const element of sectionElements) {
    if (isSectionChromeMember(element, sectionElements, pageHeight)) {
      chrome.push(element);
    } else {
      body.push(element);
    }
  }

  const chromeItems = compactChromeCluster(chrome, pageHeight).map((item) => ({
    ...item,
    // Prefix marker so pagination can reserve the whole band even when a
    // legacy heading is not isChromeLike (untagged short label).
    leadingChrome: true,
  }));
  const items = [...chromeItems];
  const bodySorted = sortByReadingOrder(body, pageHeight);
  const chromeBottom = chromeItems.reduce(
    (max, item) => Math.max(max, item.relTop + elementHeight(item.element)),
    0,
  );

  for (let index = 0; index < bodySorted.length; index += 1) {
    const element = bodySorted[index];
    if (items.length === 0) {
      items.push({ element, relTop: 0, leadingChrome: false });
      continue;
    }

    // First body follows the full chrome band (not the last chrome piece alone),
    // so an overlapping mark cannot push content down by its full height.
    if (index === 0) {
      let gap = targetGap("after_rule", rhythm);
      if (!forceTargets && chrome.length > 0) {
        const deepestChromeAbs = Math.max(
          ...chrome.map((piece) => absoluteBottom(piece, pageHeight)),
        );
        const authored = absoluteTop(element, pageHeight) - deepestChromeAbs;
        // Keep authored breathing room when it is still a normal under-rule gap.
        if (authored >= 0 && authored <= PAGE_BREAK_GAP_THRESHOLD) {
          gap = authored;
        }
      }
      items.push({
        element,
        relTop: chromeBottom + gap,
        leadingChrome: false,
      });
      continue;
    }

    const previous = items[items.length - 1];
    const kind = classifyIntraSectionGap(previous.element, element);
    let gap;
    if (forceTargets) {
      gap = targetGap(kind, rhythm);
    } else {
      const prevBottomAbs = absoluteBottom(previous.element, pageHeight);
      const abs = absoluteTop(element, pageHeight);
      gap = abs - prevBottomAbs;
      const crossedPage = Math.trunc(Number(element.page) || 1)
        > Math.trunc(Number(previous.element.page) || 1);
      if (crossedPage || gap > PAGE_BREAK_GAP_THRESHOLD) {
        gap = targetGap(kind === "after_rule" ? "after_rule" : "record", rhythm);
      }
      gap = Math.max(0, gap);
    }

    items.push({
      element,
      relTop: previous.relTop + elementHeight(previous.element) + gap,
      leadingChrome: false,
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
  while (count < strip.length && strip[count].leadingChrome) {
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
 * Place one compacted strip starting at `cursorAbs`. The leading chrome band
 * (heading + rule + markers) is reserved together with the first body block so
 * a 1px rule can never independently "fit" in the footer while the body jumps
 * to the next page.
 *
 * @returns {{ placedById: Map<string, object>, bottomAbs: number }}
 */
function placeStrip(strip, cursorAbs, pageHeight, pageTop, bottomMargin) {
  const placedById = new Map();
  if (strip.length === 0) return { placedById, bottomAbs: cursorAbs };

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
    ? placeAtFlowCursor(cursorAbs, reservedHeight, pageHeight, pageTop, bottomMargin).abs
    : cursorAbs;

  let stripBottom = sectionCursor;
  let previous = null;
  for (let index = 0; index < strip.length; index += 1) {
    const item = strip[index];
    const height = elementHeight(item.element);
    const inLeadingChrome = index < chromeCount;

    let placed;
    if (inLeadingChrome) {
      const at = pageTopFromOrigin(sectionCursor, item.relTop, pageHeight);
      placed = { page: at.page, top: at.top, abs: at.abs, bottom: at.abs + height };
    } else {
      let desiredAbs = sectionCursor;
      if (previous) {
        const gap = item.relTop
          - (previous.item.relTop + elementHeight(previous.item.element));
        desiredAbs = previous.placed.bottom + Math.max(0, gap);
      } else {
        desiredAbs = sectionCursor + item.relTop;
      }
      placed = placeAtFlowCursor(desiredAbs, height, pageHeight, pageTop, bottomMargin);
    }

    placedById.set(item.element.element_id, {
      ...item.element,
      page: placed.page,
      top: placed.top,
    });
    previous = { item, placed };
    stripBottom = Math.max(stripBottom, placed.bottom);
  }

  return { placedById, bottomAbs: stripBottom };
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

  const flowStart = resolveFlowStart(list, sections, pageHeight);
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
    const { placedById: stripPlaced, bottomAbs } = placeStrip(
      strip, cursorAbs, pageHeight, pageTop, bottomMargin,
    );
    for (const [id, element] of stripPlaced) placedById.set(id, element);
    cursorAbs = bottomAbs;
  });

  return list.map((element) => {
    if (!memberIds.has(element.element_id)) return element;
    return placedById.get(element.element_id) || element;
  });
}

/**
 * Append a freshly built section's elements at the end of the document flow,
 * then retarget every section to the document's governing rhythm.
 *
 * The new strip is first placed below the deepest existing non-fixed element
 * plus one SPACE_SECTION gap (so `listDocumentSections` sees it last), then
 * `applyFlowSpacing` force-packs the whole document. Without that second pass,
 * wizard-authored under-rule / inter-section gaps (often ~7px / ~14–18px from
 * ReportLab) stay put while the new strip alone snaps to the panel knobs —
 * the visible "added section rhythm differs from wizard sections" bug.
 *
 * `fixedToPage` decorations (page frames, footers) are excluded from the flow
 * bottom so the section follows real content rather than the page border.
 *
 * @param {object[]} elements current document elements
 * @param {object[]} newElements the section's chrome + body (unplaced)
 * @param {number} [pageHeight=842]
 * @param {{ spacing?: object, pageTop?: number, bottomMargin?: number }} [options]
 * @returns {object[]} elements with the new section appended and positioned
 */
export function appendSectionAtEnd(
  elements,
  newElements,
  pageHeight = 842,
  { spacing, pageTop = DEFAULT_PAGE_TOP, bottomMargin = DEFAULT_BOTTOM_MARGIN } = {},
) {
  const list = elements || [];
  const additions = newElements || [];
  if (additions.length === 0) return list;

  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);

  let flowBottom = 0;
  for (const element of list) {
    if (!element || element.fixedToPage) continue;
    flowBottom = Math.max(flowBottom, absoluteBottom(element, pageHeight));
  }
  const cursorAbs = flowBottom > 0 ? flowBottom + rhythm.section : pageTop;

  // forceTargets: the strip was authored with placeholder gaps, so pin it to the
  // document's exact SPACE_* rhythm on the way in.
  const strip = compactSectionStrip(additions, pageHeight, rhythm, true);
  const { placedById } = placeStrip(strip, cursorAbs, pageHeight, pageTop, bottomMargin);

  const placedAdditions = additions.map(
    (element) => placedById.get(element.element_id) || element,
  );
  // Unify wizard + new strip onto one SPACE_* rhythm (see JSDoc above).
  return applyFlowSpacing(
    [...list, ...placedAdditions],
    rhythm,
    pageHeight,
    { pageTop, bottomMargin },
  );
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
 * Template-neutral fallback used when a document has no detectable sections
 * (rare — the structural editor runs in template mode). Values mirror a mid
 * single-column CV: a thin ruled heading over ~9px body copy.
 */
const DEFAULT_SECTION_STYLE = Object.freeze({
  left: 66,
  /** Content column left — may differ from heading left (Monument: 102 vs 118). */
  bodyLeft: 66,
  recordWidth: 463,
  heading: { fontSize: 8.5, fontFamily: "Inter", color: "#24201E", letterSpacing: 1.4, bold: false },
  rule: { width: 463, height: 1, backgroundColor: "#BFB4AA", relLeft: 0 },
  markers: [],
  badgeNumber: null,
  body: { fontSize: 9.3, fontFamily: "Inter", lineHeight: 13, color: "#24201E" },
  mutedColor: "#756F6B",
});

/**
 * Categories eligible to be replicated as a decorative shape alongside a
 * section heading (rectangles, circles, filled "line" blocks used as badges,
 * icons). Text is deliberately excluded — some templates (Monument) tag a
 * decorative ordinal-number text as chrome, but the frontend has no access to
 * the backend generator's per-section counter, so that number can never be
 * faithfully reproduced on a new section. Skipping it (rather than guessing a
 * number) matches the rest of that badge's shapes without an incorrect digit.
 */
const DECORATIVE_SHAPE_CATEGORIES = new Set(["rectangle", "circle", "ellipse", "line", "image"]);

/**
 * Derive a style profile from the document's last section so a newly added
 * section matches the active template (heading font, rule, decorative shapes, body copy).
 *
 * Sampling the LAST section keeps the new section visually consistent with the
 * content it will sit directly beneath. When no section exists, returns a copy
 * of the template-neutral defaults.
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {object} style profile (see plan `SectionStyle`)
 */
export function deriveSectionStyle(elements, pageHeight = 842) {
  const list = elements || [];
  const sections = listDocumentSections(list, pageHeight);
  if (sections.length === 0) {
    return JSON.parse(JSON.stringify(DEFAULT_SECTION_STYLE));
  }

  const last = sections[sections.length - 1];
  const heading = list.find((element) => element.element_id === last.headingId) || null;
  const memberIds = sectionElementIds(list, last.headingId, pageHeight);
  const members = list.filter((element) => memberIds.has(element.element_id));

  // Resolve the heading's left edge before sampling so candidates can be
  // constrained to the heading's column. The LAST section has no lower Y bound,
  // so on sidebar / two-column templates `members` may include sidebar chrome
  // sitting below the heading. Sampling those elements would yield a wrong
  // marker offset (`relLeft`) or body/rule color. The left-proximity band
  // mirrors the same-column check in `hasSectionRuleBelow` (widened from 40 to
  // 60 so an offset marker at roughly -25px and normal body copy stay in scope).
  const headingLeft = Number(heading?.left);
  const left = Number.isFinite(headingLeft) ? headingLeft : DEFAULT_SECTION_STYLE.left;
  const inHeadingColumn = (element) => Math.abs((Number(element.left) || 0) - left) <= 60;

  // Widest thin line in the section is the heading rule. Do not require the
  // heading column — Monument's rule sits far right of the label (left≈369)
  // while the title is at left≈118; an in-column filter would drop it and
  // the built section would ship without an underline.
  const rule = members
    .filter((element) => element.category === "line"
      && (Number(element.width) || 0) >= 120
      && (Number(element.height) || 0) <= 4)
    .sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0))[0] || null;

  // Decorative shapes cluster near the heading's own left edge in most
  // templates (Regent, Aldine, Kernel, Monument, …), but Cinder places its
  // mark at the FAR RIGHT end of the underline rule instead (16px square at
  // left=526, heading at left=76, rule spanning 76..542) — ~450px from the
  // heading, well outside the heading-only column band. Once the rule is
  // known, its own span is an equally valid "same column" region: a shape
  // near either end of the rule the section actually draws is part of this
  // section, not a different column's sidebar chrome.
  const inDecorativeShapeColumn = (element) => {
    const elementLeft = Number(element.left) || 0;
    if (inHeadingColumn(element)) return true;
    if (!rule) return false;
    const ruleLeft = Number(rule.left) || left;
    const ruleRight = ruleLeft + (Number(rule.width) || 0);
    return elementLeft >= ruleLeft - 60 && elementLeft <= ruleRight + 60;
  };

  // Every tagged shape offset from the label (marker, badge square, icon
  // frame, accent tick, …) is a decorative shape to replicate. Size is not a
  // filter here — templates range from an 8px marker dot (Regent) to a 32px
  // badge block plus a 251px label frame (Monument). Only the identified rule
  // and decorative text are excluded (see DECORATIVE_SHAPE_CATEGORIES doc).
  const decorativeShapes = members.filter((element) => element.element_id !== last.headingId
    && element.element_id !== rule?.element_id
    && element.flowRole === "section-chrome"
    && inDecorativeShapeColumn(element)
    && DECORATIVE_SHAPE_CATEGORIES.has(element.category))
    .sort((a, b) => absoluteTop(a, pageHeight) - absoluteTop(b, pageHeight)
      || (Number(a.left) || 0) - (Number(b.left) || 0));

  // Decorative ordinal badge (Monument's "01"/"02"/…): sample its styling so
  // a new section can stamp its own computed position in the document, but
  // never its sampled digits — those belong to the section it was copied
  // from. `digits` records how many characters the sampled number had, so
  // the caller can zero-pad the new ordinal to match ("04" -> 2 digits).
  const badgeNumberElement = members.find((element) => element.element_id !== last.headingId
    && element.flowRole === "section-chrome"
    && isDecorativeOrdinalChrome(element)
    && (element.category === "text" || element.category === "textarea")) || null;
  const badgeNumber = badgeNumberElement
    ? {
      fontSize: Number(badgeNumberElement.fontSize) || DEFAULT_SECTION_STYLE.heading.fontSize,
      fontFamily: String(badgeNumberElement.fontFamily || DEFAULT_SECTION_STYLE.heading.fontFamily),
      color: String(badgeNumberElement.color || DEFAULT_SECTION_STYLE.heading.color),
      bold: Boolean(badgeNumberElement.bold),
      digits: String(badgeNumberElement.content || "").trim().length || 2,
      relLeft: (Number(badgeNumberElement.left) || 0) - left,
      relTop: absoluteTop(badgeNumberElement, pageHeight) - absoluteTop(heading, pageHeight),
    }
    : null;

  // Body copy: non-chrome content elements, in reading order.
  const bodyElements = members
    .filter((element) => element.element_id !== last.headingId
      && element.flowRole !== "section-chrome"
      && inHeadingColumn(element)
      && element.category !== "line")
    .sort((a, b) => absoluteTop(a, pageHeight) - absoluteTop(b, pageHeight));
  const body = bodyElements[0] || null;

  const recordWidth = Number(body?.width) || Number(rule?.width) || DEFAULT_SECTION_STYLE.recordWidth;
  // Content column may sit left of the title (Monument body at 102, title at 118).
  const bodyLeftRaw = Number(body?.left);
  const bodyLeft = Number.isFinite(bodyLeftRaw) ? bodyLeftRaw : left;

  // Muted color: a body line whose color differs from the main body color
  // (typically the meta line). Best-effort — falls back to the body color.
  const bodyColor = String(body?.color || DEFAULT_SECTION_STYLE.body.color);
  const mutedElement = bodyElements.find((element) => String(element.color || "") && String(element.color) !== bodyColor);
  const mutedColor = mutedElement ? String(mutedElement.color) : DEFAULT_SECTION_STYLE.mutedColor;

  return {
    left,
    bodyLeft,
    recordWidth,
    heading: {
      fontSize: Number(heading?.fontSize) || DEFAULT_SECTION_STYLE.heading.fontSize,
      fontFamily: String(heading?.fontFamily || DEFAULT_SECTION_STYLE.heading.fontFamily),
      color: String(heading?.color || DEFAULT_SECTION_STYLE.heading.color),
      letterSpacing: Number(heading?.letterSpacing) || 0,
      bold: Boolean(heading?.bold),
    },
    rule: rule
      ? {
        width: Number(rule.width) || recordWidth,
        height: Number(rule.height) || 1,
        backgroundColor: String(rule.backgroundColor || DEFAULT_SECTION_STYLE.rule.backgroundColor),
        relLeft: (Number(rule.left) || 0) - left,
      }
      : null,
    markers: decorativeShapes.map((shape) => {
      const built = {
        category: shape.category,
        width: Number(shape.width) || 8,
        height: Number(shape.height) || 8,
        backgroundColor: String(shape.backgroundColor || DEFAULT_SECTION_STYLE.heading.color),
        relLeft: (Number(shape.left) || 0) - left,
        relTop: absoluteTop(shape, pageHeight) - absoluteTop(heading, pageHeight),
      };
      if (shape.category === "rectangle" || shape.category === "circle" || shape.category === "ellipse") {
        built.borderWidth = Number(shape.borderWidth) || 1;
      }
      if (shape.category === "circle" || shape.category === "ellipse") {
        built.filled = Boolean(shape.filled);
      }
      return built;
    }),
    badgeNumber,
    body: {
      fontSize: Number(body?.fontSize) || DEFAULT_SECTION_STYLE.body.fontSize,
      fontFamily: String(body?.fontFamily || DEFAULT_SECTION_STYLE.body.fontFamily),
      lineHeight: Number(body?.lineHeight) || Math.round((Number(body?.fontSize) || DEFAULT_SECTION_STYLE.body.fontSize) * 1.4),
      color: bodyColor,
    },
    mutedColor,
  };
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
