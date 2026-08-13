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
  sectionElementIds,
} from "./sectionStructure.js";

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
  const ids = (headingIds || []).filter(Boolean);
  if (ids.length === 0) return null;
  if (listSidebarSections(list, pageHeight).length === 0) return null;

  const style = deriveSectionStyle(list, pageHeight, null, { lane: "sidebar" });
  const movedIds = new Set();
  let next = list;

  // Restyle deepest first so each `sectionElementIds` sweep still sees the
  // remaining main-column neighbour as the band end.
  for (const headingId of [...ids].reverse()) {
    const memberIds = sectionElementIds(next, headingId, pageHeight);
    if (memberIds.size === 0) return null;
    const members = next.filter((element) => memberIds.has(element.element_id));
    // Park the strip below the current rail so Y-order listing appends it
    // after existing kickers, while preserving intra-section reading order.
    const minAbs = Math.min(...members.map((element) => (
      (Math.max(1, Math.trunc(element.page || 1)) - 1) * pageHeight
      + (Number(element.top) || 0)
    )));
    const restyledById = new Map();
    for (const element of members) {
      const abs = (Math.max(1, Math.trunc(element.page || 1)) - 1) * pageHeight
        + (Number(element.top) || 0);
      const restyled = restyleMemberAsSidebar(
        element, headingId, style, 10_000 + (abs - minAbs),
      );
      if (restyled) restyledById.set(element.element_id, restyled);
    }
    if (!restyledById.has(headingId)) return null;
    next = next.flatMap((element) => {
      if (!memberIds.has(element.element_id)) return [element];
      const restyled = restyledById.get(element.element_id);
      return restyled ? [restyled] : [];
    });
    movedIds.add(headingId);
  }

  if (movedIds.size === 0) return null;
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
