/**
 * Manual main ↔ sidebar section transfer for two-column template CVs.
 *
 * After a click on the heading lane-transfer control, the whole section is
 * restyled for the destination column (width / type / chrome roles) and
 * packed last in that lane under the live flow spacing. Page breaks may land
 * between records via the normal packer — Experience never moves onto the rail.
 *
 * Languages are a special case: the rail keeps one hyphenated textarea, while
 * the main column uses the equal-width, uniformly styled grid every template generator
 * emits (`_place_languages_grid`). Skills with subcategories are the other:
 * the rail keeps `_skills_sidebar_content` (category + bullets), while main
 * expands to bold category labels + chip bodies (`_place_skills_section`).
 * Transfer expands / collapses those shapes so spacing and palette match
 * Experience after the move.
 */
import { measureTextareaHeight } from "./textareaHeight.js";
import { moveMainSectionsToSidebar, isAnchoredMainSectionTitle } from "./collapseMainIntoSidebar.js";
import {
  applyFlowSpacing,
  deriveSectionStyle,
  isSidebarSectionHeading,
  listDocumentSections,
  listSidebarSections,
  sectionChromeRuleRelTop,
  sectionElementIds,
  sidebarSectionElementIds,
} from "./sectionStructure.js";
import {
  buildLanguagesMainGrid,
  collectLanguageEntries,
  isLanguagesSectionTitle,
} from "./languagesLayout.js";
import {
  isSkillsSectionHeading,
  restyleSkillsMembersAsMain,
} from "./skillsLayout.js";
import { buildSectionIconChromeMarkers } from "./sectionIcons.js";

/**
 * Absolute Y used only to park a strip so reading-order packing appends it
 * after every existing section in the destination lane.
 */
const APPEND_PARK_TOP = 10_000;

/**
 * @param {object} element
 * @param {number} pageHeight
 * @returns {number}
 */
function absoluteTop(element, pageHeight) {
  const page = Math.max(1, Math.trunc(Number(element?.page) || 1));
  return (page - 1) * pageHeight + (Number(element?.top) || 0);
}

/**
 * Drop sidebar lane tags so the main packer owns the element again.
 *
 * @param {object} element
 * @returns {object}
 */
function clearSidebarLane(element) {
  const next = { ...element };
  delete next.flowLane;
  return next;
}

/**
 * @returns {() => string}
 */
function makeIdFactory(prefix) {
  let n = 0;
  return () => `${prefix}-${Date.now().toString(36)}-${++n}`;
}

/**
 * Rebuild the moved heading's icon-chrome cluster in the destination lane and
 * append it to `list`. Every restyle branch above (generic / languages /
 * skills) drops the section's source decorative shapes outright — they never
 * fit the destination lane's cluster shape (see `buildSectionIconChromeMarkers`
 * doc) — so this runs once per transferred heading regardless of which branch
 * placed its body content. No-op ([]) for templates with no icon chrome
 * (Sterling), since `style.markers` is empty for those.
 *
 * @param {object[]} list - document after the heading's body/chrome restyle
 * @param {object[]} documentElements - pre-transfer document, used to detect the icon theme
 * @param {object} style - destination-lane style sampled by the caller
 * @param {string} headingId
 * @param {"section-chrome"|"sidebar-chrome"} flowRole
 * @param {"sidebar"|null} flowLane
 * @param {number} pageHeight
 * @returns {object[]}
 */
function appendTransferIconMarkers(list, documentElements, style, headingId, flowRole, flowLane, pageHeight) {
  const heading = list.find((element) => element.element_id === headingId);
  if (!heading) return list;
  const markers = buildSectionIconChromeMarkers({
    style,
    elements: documentElements,
    heading,
    flowRole,
    flowLane,
    idFactory: makeIdFactory(`${headingId}-chrome`),
    pageHeight,
  });
  return markers.length > 0 ? [...list, ...markers] : list;
}

/**
 * Restyle one rail member onto sampled main-column geometry and recompute
 * wrapped height at the main record width — never reuse the sidebar box.
 *
 * @param {object} element
 * @param {string} headingId
 * @param {object} style
 * @param {number} appendTop
 * @returns {object|null}
 */
function restyleMemberAsMain(element, headingId, style, appendTop) {
  const headingFont = style.heading || {};
  const bodyFont = style.body || {};
  const bodySize = Number(bodyFont.fontSize) || 9.3;
  const bodyLineHeight = Number(bodyFont.lineHeight) || bodySize * 1.4;
  const bodyLeft = Number.isFinite(Number(style.bodyLeft))
    ? Number(style.bodyLeft)
    : Number(style.left) || 66;
  const recordWidth = Number(style.recordWidth) || 329;
  const headingLeft = Number(style.left) || bodyLeft;

  if (element.element_id === headingId) {
    // Always take the sampled main heading metrics. Rail kickers keep accent
    // colour / 9.4px / wider tracking; leaving any of those on a transferred
    // Summary or Languages strip is the live Sterling mismatch vs Experience.
    const fontSize = Number(headingFont.fontSize) || 10;
    const letterSpacing = Number.isFinite(Number(headingFont.letterSpacing))
      ? Number(headingFont.letterSpacing)
      : (Number(element.letterSpacing) || 0);
    return clearSidebarLane({
      ...element,
      flowRole: "section-chrome",
      left: headingLeft,
      top: appendTop,
      fontSize,
      fontFamily: headingFont.fontFamily || element.fontFamily,
      color: headingFont.color || element.color,
      letterSpacing,
      bold: headingFont.bold !== undefined ? Boolean(headingFont.bold) : Boolean(element.bold),
      height: measureTextareaHeight(
        element.content, recordWidth, fontSize, fontSize * 1.35,
      ),
      page: 1,
      preserveInitialLayout: false,
    });
  }

  if (element.category === "line" && (Number(element.height) || 0) <= 4) {
    const rule = style.rule || {};
    const relLeft = Number.isFinite(Number(rule.relLeft)) ? Number(rule.relLeft) : 0;
    return clearSidebarLane({
      ...element,
      flowRole: "section-chrome",
      left: headingLeft + relLeft,
      top: appendTop,
      width: Number(rule.width) || recordWidth,
      height: Number(rule.height) || Number(element.height) || 1,
      backgroundColor: rule.backgroundColor || element.backgroundColor,
      page: 1,
    });
  }

  // Rail-only decorative chrome has no main counterpart — drop it. Heading +
  // thin rule already cover section identity in the main column.
  if (element.flowRole === "sidebar-chrome") {
    return null;
  }

  const wasMuted = Boolean(element.color)
    && Boolean(bodyFont.color)
    && String(element.color) !== String(bodyFont.color);
  const fontSize = bodySize;
  const lineHeight = bodyLineHeight;
  const next = clearSidebarLane({
    ...element,
    flowRole: element.flowRole === "grid-member" ? "grid-member" : "content",
    left: bodyLeft,
    top: appendTop,
    width: recordWidth,
    fontSize,
    lineHeight,
    fontFamily: bodyFont.fontFamily || element.fontFamily,
    color: wasMuted ? (style.mutedColor || element.color) : (bodyFont.color || element.color),
    page: 1,
    // Rail bodies often carry preserveInitialLayout from the generator; drop it
    // so the canvas remasures at the new main-column width after transfer.
    preserveInitialLayout: false,
  });
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
 * Convert a languages rail strip into main-column chrome + plain grid cells.
 * Body members are replaced wholesale so a single hyphenated textarea becomes
 * the equal-width grid used by every main-column generator.
 *
 * @param {object[]} members
 * @param {string} headingId
 * @param {object} style
 * @param {number} parkTop
 * @returns {object[]|null}
 */
function restyleLanguagesMembersAsMain(members, headingId, style, parkTop) {
  const heading = members.find((element) => element.element_id === headingId);
  if (!heading) return null;
  const entries = collectLanguageEntries(members, headingId);
  if (entries.length === 0) return null;

  const chrome = [];
  const restyledHeading = restyleMemberAsMain(heading, headingId, style, parkTop);
  if (!restyledHeading) return null;
  chrome.push(restyledHeading);

  const rule = members.find((element) => (
    element.element_id !== headingId
    && element.category === "line"
    && (Number(element.height) || 0) <= 4
  ));
  // Park the rule at the destination lane's canonical heading→rule offset so
  // the moved section matches its neighbours (the packer preserves this
  // intra-chrome offset). applyFlowSpacing still retargets rule→body.
  const ruleTop = parkTop + sectionChromeRuleRelTop(style, restyledHeading.height);
  if (rule) {
    const restyledRule = restyleMemberAsMain(rule, headingId, style, ruleTop);
    if (restyledRule) {
      // The rule belongs to the destination lane's section system. Retaining
      // the source rail colour here made a moved Languages section the only
      // main-column heading with a sidebar-coloured underline (e.g. a
      // sidebar template's graphite rail rule moving onto a neutral-grey main rule).
      chrome.push(restyledRule);
    }
  }

  const bodyTop = ruleTop + 6;
  const cells = buildLanguagesMainGrid(entries, {
    bodyLeft: Number.isFinite(Number(style.bodyLeft)) ? Number(style.bodyLeft) : Number(style.left) || 245,
    recordWidth: Number(style.recordWidth) || 300,
    body: style.body || {},
    appendTop: bodyTop,
    idFactory: makeIdFactory(`${headingId}-lang`),
  });
  if (cells.length === 0) return null;
  return [...chrome, ...cells];
}

/**
 * Convert listed sidebar sections into the main column, then pack both lanes
 * under the current spacing so the strip becomes last in main (page 1 or
 * continuation pages when records do not fit).
 *
 * @param {object[]} elements
 * @param {string[]} headingIds
 * @param {number} pageHeight
 * @param {object} spacing
 * @returns {object[]|null}
 */
/**
 * Pick a main-column heading to sample style from — prefer a linear section
 * (Experience / Education) over a trailing languages grid so transfers inherit
 * full column width and body type, not a ~70px CEFR cell.
 *
 * @param {object[]} elements
 * @param {number} pageHeight
 * @returns {string|null}
 */
function resolveMainStyleSampleHeadingId(elements, pageHeight) {
  const sections = listDocumentSections(elements, pageHeight);
  if (sections.length === 0) return null;
  const linear = sections.find((section) => !isLanguagesSectionTitle(section.title));
  return (linear || sections[sections.length - 1]).headingId;
}

export function moveSidebarSectionsToMain(elements, headingIds, pageHeight, spacing) {
  const list = elements || [];
  const ids = (headingIds || []).filter(Boolean);
  if (ids.length === 0) return null;

  const sampleHeadingId = resolveMainStyleSampleHeadingId(list, pageHeight);
  const style = deriveSectionStyle(list, pageHeight, sampleHeadingId, { lane: "main" });
  let next = list;
  const movedIds = new Set();

  // Restyle deepest first so each membership sweep still sees the next kicker.
  for (const headingId of [...ids].reverse()) {
    const memberIds = sidebarSectionElementIds(next, headingId, pageHeight);
    if (memberIds.size === 0) return null;
    const members = next.filter((element) => memberIds.has(element.element_id));
    const heading = members.find((element) => element.element_id === headingId);
    const minAbs = Math.min(...members.map((element) => absoluteTop(element, pageHeight)));
    const parkBase = APPEND_PARK_TOP;

    if (heading && isLanguagesSectionTitle(heading.content)) {
      const restyled = restyleLanguagesMembersAsMain(members, headingId, style, parkBase);
      if (!restyled) return null;
      next = [
        ...next.filter((element) => !memberIds.has(element.element_id)),
        ...restyled,
      ];
      next = appendTransferIconMarkers(next, list, style, headingId, "section-chrome", null, pageHeight);
      movedIds.add(headingId);
      continue;
    }

    // Grouped skills: expand the single rail textarea into bold category +
    // body records so the packer keep-together rules match Experience and
    // type/width match the main column (not the orphaned-heading failure).
    if (heading && isSkillsSectionHeading(heading)) {
      const restyled = restyleSkillsMembersAsMain(
        members, headingId, style, parkBase, spacing,
      );
      if (!restyled) return null;
      next = [
        ...next.filter((element) => !memberIds.has(element.element_id)),
        ...restyled,
      ];
      next = appendTransferIconMarkers(next, list, style, headingId, "section-chrome", null, pageHeight);
      movedIds.add(headingId);
      continue;
    }

    const restyledById = new Map();
    for (const element of members) {
      const abs = absoluteTop(element, pageHeight);
      const restyled = restyleMemberAsMain(
        element, headingId, style, parkBase + (abs - minAbs),
      );
      if (restyled) restyledById.set(element.element_id, restyled);
    }
    if (!restyledById.has(headingId)) return null;
    // The generic path preserves each member's source (sidebar) offset from the
    // heading, so the rule would keep the SIDEBAR heading→rule gap. Re-park it
    // at the destination lane's canonical offset so the moved section's rule
    // lines up with its main-column neighbours (the packer preserves it).
    const restyledHeadForRule = restyledById.get(headingId);
    for (const restyled of restyledById.values()) {
      if (restyled.flowRole === "section-chrome" && restyled.category === "line") {
        restyled.top = parkBase + sectionChromeRuleRelTop(style, restyledHeadForRule.height);
      }
    }
    next = next.flatMap((element) => {
      if (!memberIds.has(element.element_id)) return [element];
      const restyled = restyledById.get(element.element_id);
      return restyled ? [restyled] : [];
    });
    next = appendTransferIconMarkers(next, list, style, headingId, "section-chrome", null, pageHeight);
    movedIds.add(headingId);
  }

  if (movedIds.size === 0) return null;
  return applyFlowSpacing(next, spacing, pageHeight);
}

/**
 * Which lane a heading can transfer into, or null when transfer is unavailable.
 *
 * Requires a sidebar rail in the document. Main → sidebar skips Experience.
 * Sidebar → main is always offered for rail kickers.
 *
 * @param {object[]} elements
 * @param {string} headingId
 * @param {number} [pageHeight=842]
 * @returns {"to-sidebar"|"to-main"|null}
 */
export function resolveSectionLaneTransfer(elements, headingId, pageHeight = 842) {
  if (!headingId) return null;
  const list = elements || [];
  const heading = list.find((element) => element.element_id === headingId);
  if (!heading) return null;

  if (isSidebarSectionHeading(heading)) {
    return "to-main";
  }

  // Main-column heading: need a rail and a movable (non-Experience) section.
  if (listSidebarSections(list, pageHeight).length === 0) return null;
  const mainIds = sectionElementIds(list, headingId, pageHeight);
  if (!mainIds.has(headingId)) return null;
  if (isAnchoredMainSectionTitle(heading.content)) return null;
  return "to-sidebar";
}

/**
 * Move one section into the opposite column and re-pack with live spacing.
 *
 * The strip is restyled for the destination lane, parked last, then packed.
 * Oversized content may continue onto page 2 between records — same keep-
 * together rules as add/reorder. Languages expand to the main uniform grid
 * (or collapse back to a sidebar hyphen list). Skills with subcategories
 * expand to bold category + body records (or collapse to one rail textarea).
 *
 * @param {object[]} elements
 * @param {string} headingId
 * @param {number} [pageHeight=842]
 * @param {object} [spacing]
 * @returns {object[]|null}
 */
export function transferSectionLane(elements, headingId, pageHeight = 842, spacing) {
  const direction = resolveSectionLaneTransfer(elements, headingId, pageHeight);
  if (!direction) return null;

  if (direction === "to-sidebar") {
    return moveMainSectionsToSidebar(elements, [headingId], pageHeight, spacing);
  }
  return moveSidebarSectionsToMain(elements, [headingId], pageHeight, spacing);
}
