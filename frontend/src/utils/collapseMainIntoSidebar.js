/**
 * Canvas-side sidebar collapse after a height-reducing edit.
 *
 * Generation-time `plan_columns_multi_page` decides columns from ReportLab
 * heights. After AI shortening or a spacing reduction the live canvas heights
 * change, and a leftover main-column section (typically Education) may now
 * fit the page-1 rail and drop the extra page. This module re-measures those
 * leftovers *as sidebar elements* (narrow width + rail type) and moves them
 * only when the page count actually falls. Experience stays in the main column.
 */
import { measureTextareaHeight } from "./textareaHeight.js";
import { contentMaxPage } from "./structureOperation.js";
import {
  applyFlowSpacing,
  deriveSectionStyle,
  listDocumentSections,
  listSidebarSections,
  sectionChromeRuleRelTop,
  sectionElementIds,
} from "./sectionStructure.js";
import {
  isLanguagesSectionTitle,
  restyleLanguagesMembersAsSidebar,
} from "./languagesLayout.js";
import {
  isSkillsSectionHeading,
  restyleSkillsMembersAsSidebar,
} from "./skillsLayout.js";
import { buildSectionIconChromeMarkers } from "./sectionIcons.js";

// Temporary canvas-space Y coordinate used only inside one synchronous state
// transformation. The final `applyFlowSpacing` call immediately places every
// staged section back into real page coordinates.
const SIDEBAR_TRANSFER_STAGING_TOP = 10_000;
// Keep staged chrome bands more than the 24 px leading-mark recovery window
// apart. Otherwise the preceding section's short rail rule can be mistaken for
// the next heading's leading chrome before the final pack.
const SIDEBAR_TRANSFER_STAGING_GAP = 32;

/**
 * @returns {() => string}
 */
function makeIdFactory(prefix) {
  let n = 0;
  return () => `${prefix}-${Date.now().toString(36)}-${++n}`;
}

/**
 * Returns the lower edge of a staged section using its freshly measured boxes.
 *
 * Text and thin chrome can omit an explicit height, so the font-size line box
 * remains the fallback. The value only advances the next temporary staging
 * cursor; final layout still comes exclusively from `applyFlowSpacing`.
 *
 * @param {object[]} elements
 * @param {number} fallbackTop
 * @returns {number}
 */
function stagedSectionBottom(elements, fallbackTop) {
  return (elements || []).reduce((bottom, element) => {
    const top = Number.isFinite(Number(element?.top))
      ? Number(element.top)
      : fallbackTop;
    const explicitHeight = Number(element?.height);
    const height = Number.isFinite(explicitHeight) && explicitHeight > 0
      ? explicitHeight
      : Math.max(Number(element?.fontSize) || 0, 1);
    return Math.max(bottom, top + height);
  }, fallbackTop);
}

/**
 * Rebuild the moved heading's icon-chrome cluster in the destination lane and
 * append it to `list`. Mirrors `appendTransferIconMarkers` in
 * `transferSectionLane.js` (main → sidebar direction) — every restyle branch
 * below drops the section's source decorative shapes outright, since main and
 * rail icon clusters differ in shape count/size. No-op for templates with no
 * icon chrome (Sterling), since `style.markers` is empty for those.
 *
 * @param {object[]} list - document after the heading's body/chrome restyle
 * @param {object[]} documentElements - pre-transfer document, used to detect the icon theme
 * @param {object} style - rail style sampled by the caller
 * @param {string} headingId
 * @param {number} pageHeight
 * @returns {object[]}
 */
function appendTransferIconMarkers(list, documentElements, style, headingId, pageHeight) {
  const heading = list.find((element) => element.element_id === headingId);
  if (!heading) return list;
  const markers = buildSectionIconChromeMarkers({
    style,
    elements: documentElements,
    heading,
    flowRole: "sidebar-chrome",
    flowLane: "sidebar",
    idFactory: makeIdFactory(`${headingId}-chrome`),
    pageHeight,
  });
  return markers.length > 0 ? [...list, ...markers] : list;
}

/**
 * True when a main-column heading is Experience and must not join the rail.
 *
 * Matches Polish and English titles used by the generators and the canvas
 * ("Doświadczenie zawodowe", "EXPERIENCE", "Work Experience"). Other main
 * leftovers — Education, Projects, Awards, Certifications — are eligible.
 *
 * @param {string} title
 * @returns {boolean}
 */
export function isAnchoredMainSectionTitle(title) {
  const normalized = String(title || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!normalized) return false;
  return normalized.includes("doswiadczen")
    || normalized.includes("experience")
    || normalized.includes("workhistory");
}

/**
 * Restyle one main-column member onto the sampled rail geometry and recompute
 * wrapped height at the sidebar width / type — never reuse the main-column box.
 */
function restyleMemberAsSidebar(element, headingId, style, appendTop) {
  const headingFont = style.heading || {};
  const bodyFont = style.body || {};
  const bodySize = Number(bodyFont.fontSize) || 6.6;
  const bodyLineHeight = Number(bodyFont.lineHeight) || bodySize * 1.4;
  const bodyLeft = Number.isFinite(Number(style.bodyLeft))
    ? Number(style.bodyLeft)
    : Number(style.left) || 0;
  const recordWidth = Number(style.recordWidth) || 128;
  const headingLeft = Number(style.left) || bodyLeft;

  if (element.element_id === headingId) {
    const fontSize = Number(headingFont.fontSize) || 7.6;
    return {
      ...element,
      flowRole: "sidebar-chrome",
      flowLane: "sidebar",
      left: headingLeft,
      top: appendTop,
      fontSize,
      fontFamily: headingFont.fontFamily || element.fontFamily,
      color: headingFont.color || element.color,
      letterSpacing: Number.isFinite(Number(headingFont.letterSpacing))
        ? Number(headingFont.letterSpacing)
        : element.letterSpacing,
      bold: headingFont.bold ?? element.bold,
      height: measureTextareaHeight(
        element.content, recordWidth, fontSize, fontSize * 1.35,
      ),
      page: 1,
    };
  }

  if (element.category === "line" && (Number(element.height) || 0) <= 4) {
    const rule = style.rule || {};
    const relLeft = Number.isFinite(Number(rule.relLeft)) ? Number(rule.relLeft) : 0;
    return {
      ...element,
      flowRole: "sidebar-chrome",
      flowLane: "sidebar",
      left: headingLeft + relLeft,
      top: appendTop,
      width: Number(rule.width) || 50,
      height: Number(rule.height) || Number(element.height) || 1,
      backgroundColor: rule.backgroundColor || element.backgroundColor,
      page: 1,
    };
  }

  // Main-column badges / iconic marks have no rail counterpart — drop them
  // by converting only heading + thin rule as chrome. Remaining decorative
  // chrome is omitted by the caller.
  if (element.flowRole === "section-chrome") {
    return null;
  }

  const wasMuted = Boolean(element.color)
    && Boolean(bodyFont.color)
    && String(element.color) !== String(bodyFont.color);
  const fontSize = bodySize;
  const lineHeight = bodyLineHeight;
  const next = {
    ...element,
    flowRole: element.flowRole === "grid-member" ? "grid-member" : "content",
    flowLane: "sidebar",
    left: bodyLeft,
    top: appendTop,
    width: recordWidth,
    fontSize,
    lineHeight,
    fontFamily: bodyFont.fontFamily || element.fontFamily,
    color: wasMuted ? (style.mutedColor || element.color) : (bodyFont.color || element.color),
    page: 1,
  };
  if (element.category === "textarea" || element.category === "text") {
    next.height = measureTextareaHeight(
      element.content,
      recordWidth,
      fontSize,
      lineHeight,
      { bulletList: Boolean(element.bulletList) },
    );
  }
  return next;
}

/**
 * Convert the listed main-column sections onto the rail, then pack both lanes.
 *
 * Heights for the moved strips are measured at sidebar width and type before
 * packing, so a leftover that only fits once wrapped for the rail is accepted
 * or rejected against real rail geometry rather than its main-column box.
 *
 * @param {object[]} elements
 * @param {string[]} headingIds
 * @param {number} pageHeight
 * @param {object} spacing
 * @returns {object[]|null} packed document, or null when restyle produced nothing
 */
export function moveMainSectionsToSidebar(elements, headingIds, pageHeight, spacing) {
  const list = elements || [];
  const requestedIds = [...new Set((headingIds || []).filter(Boolean))];
  const documentOrder = new Map(
    listDocumentSections(list, pageHeight).map((section, index) => [section.headingId, index]),
  );
  const ids = requestedIds.sort((left, right) => (
    (documentOrder.get(left) ?? Number.POSITIVE_INFINITY)
    - (documentOrder.get(right) ?? Number.POSITIVE_INFINITY)
  ));
  if (ids.length === 0) return null;
  if (listSidebarSections(list, pageHeight).length === 0) return null;

  const style = deriveSectionStyle(list, pageHeight, null, { lane: "sidebar" });
  // Capture every source strip before mutating the document. This preserves
  // the original heading boundaries while allowing the transformed strips to
  // be staged and appended in their natural reading order below.
  const sourceSections = ids.map((headingId) => {
    const memberIds = sectionElementIds(list, headingId, pageHeight);
    if (memberIds.size === 0) return null;
    return {
      headingId,
      memberIds,
      members: list.filter((element) => memberIds.has(element.element_id)),
    };
  });
  if (sourceSections.some((section) => section == null)) return null;

  const sourceMemberIds = new Set();
  sourceSections.forEach((section) => {
    section.memberIds.forEach((elementId) => sourceMemberIds.add(elementId));
  });
  let next = list.filter((element) => !sourceMemberIds.has(element.element_id));
  let stagingTop = SIDEBAR_TRANSFER_STAGING_TOP;

  for (const { headingId, members } of sourceSections) {
    const heading = members.find((element) => element.element_id === headingId);
    const minAbs = Math.min(...members.map((element) => (
      (Math.max(1, Math.trunc(element.page || 1)) - 1) * pageHeight
      + (Number(element.top) || 0)
    )));
    let restyledElements = null;

    // Main-column languages grids collapse to one hyphenated sidebar textarea
    // (the rail never keeps per-cell grid-member geometry).
    if (heading && isLanguagesSectionTitle(heading.content)) {
      restyledElements = restyleLanguagesMembersAsSidebar(
        members, headingId, style, stagingTop,
      );
    } else if (heading && isSkillsSectionHeading(heading.content)) {
      // Main-column skill subcategories collapse to one
      // `_skills_sidebar_content` textarea (category lines + bullets).
      restyledElements = restyleSkillsMembersAsSidebar(
        members, headingId, style, stagingTop,
      );
    } else {
      const restyledById = new Map();
      for (const element of members) {
        const abs = (Math.max(1, Math.trunc(element.page || 1)) - 1) * pageHeight
          + (Number(element.top) || 0);
        const restyled = restyleMemberAsSidebar(
          element, headingId, style, stagingTop + (abs - minAbs),
        );
        if (restyled) restyledById.set(element.element_id, restyled);
      }
      if (!restyledById.has(headingId)) return null;
      // Re-park the rule at the rail's canonical heading→rule offset instead
      // of the preserved main-column gap, so the moved kicker matches other
      // rail sections (the packer preserves this intra-chrome offset).
      const restyledHeadForRule = restyledById.get(headingId);
      for (const restyled of restyledById.values()) {
        if (restyled.flowRole === "sidebar-chrome" && restyled.category === "line") {
          restyled.top = stagingTop
            + sectionChromeRuleRelTop(style, restyledHeadForRule.height);
        }
      }
      restyledElements = members.flatMap((element) => {
        const restyled = restyledById.get(element.element_id);
        return restyled ? [restyled] : [];
      });
    }

    if (!restyledElements || restyledElements.length === 0) return null;
    next = [...next, ...restyledElements];
    const idsBeforeMarkers = new Set(next.map((element) => element.element_id));
    next = appendTransferIconMarkers(next, list, style, headingId, pageHeight);
    const generatedMarkers = next.filter((element) => !idsBeforeMarkers.has(element.element_id));
    // Each moved section gets its own non-overlapping staging band. In the old
    // implementation every heading was parked at exactly 10_000, causing
    // `sidebarSectionElementIds` to give one section an empty interval and the
    // other both bodies. That semantic merge also produced one combined hover
    // outline on the canvas.
    stagingTop = stagedSectionBottom(
      [...restyledElements, ...generatedMarkers],
      stagingTop,
    ) + SIDEBAR_TRANSFER_STAGING_GAP;
  }

  return applyFlowSpacing(next, spacing, pageHeight);
}

/**
 * Move the shortest tail of movable main-column sections onto the sidebar
 * whenever that move drops the document page count.
 *
 * Greedy from the reading-order tail (skipping Experience): try the last
 * section, then the last two, and so on. Repeat while a move still removes a
 * page. A trial that overflows the rail onto another page does not reduce
 * `contentMaxPage` and is rejected.
 *
 * @param {object[]} elements
 * @param {{ pageHeight?: number, spacing?: object }} [options]
 * @returns {object[]} original array when nothing moved
 */
export function collapseSpilledMainIntoSidebar(elements, options = {}) {
  const pageHeight = Number(options.pageHeight) || 842;
  const spacing = options.spacing;
  const list = Array.isArray(elements) ? elements : [];
  if (listSidebarSections(list, pageHeight).length === 0) return list;

  let current = list;
  let pages = contentMaxPage(current);
  if (pages < 2) return list;

  let movedAny = false;
  // Bound by the movable-section count so a packing quirk cannot loop.
  for (let guard = 0; guard < 8 && pages >= 2; guard += 1) {
    const movables = listDocumentSections(current, pageHeight)
      .filter((section) => !isAnchoredMainSectionTitle(section.title));
    if (movables.length === 0) break;

    let committed = null;
    for (let count = 1; count <= movables.length; count += 1) {
      const suffix = movables.slice(-count);
      const trial = moveMainSectionsToSidebar(
        current,
        suffix.map((section) => section.headingId),
        pageHeight,
        spacing,
      );
      if (!trial) continue;
      const trialPages = contentMaxPage(trial);
      if (trialPages < pages) {
        committed = trial;
        pages = trialPages;
        break;
      }
    }
    if (!committed) break;
    current = committed;
    movedAny = true;
  }

  return movedAny ? current : list;
}
