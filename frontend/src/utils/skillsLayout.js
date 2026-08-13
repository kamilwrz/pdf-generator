/**
 * Skills section layout helpers for main ↔ sidebar transfers.
 *
 * Generators place grouped skills in the main column as bold category labels
 * plus chip bodies (`_place_skills_section`). The rail keeps one textarea in
 * `_skills_sidebar_content` form (category line, then bullet items). Transfer
 * must expand / collapse that shape so font, width, and subcategory structure
 * match Experience after the move — a naive width-only restyle leaves an
 * orphaned heading and a tall sidebar-shaped body on the next page.
 */
import { measureTextareaHeight } from "./textareaHeight.js";
import {
  FLAT_SECTION_LAYOUT_BULLET,
  FLAT_SECTION_LAYOUT_INLINE,
  formatFlatListContent,
  parseFlatListItems,
} from "./flatSectionLayout.js";
import { isSkillsSectionTitle } from "./sectionRecord.js";

export { isSkillsSectionTitle };

/** Matches backend `_LEADING_BULLET` / sidebar skill item markers. */
const LEADING_BULLET_RE = /^[\s]*[•\-–*—∙·]\s+(.*)$/;

/**
 * @param {string|null|undefined} title
 * @returns {boolean}
 */
export function isSkillsSectionHeading(title) {
  return isSkillsSectionTitle(title);
}

/**
 * Parse a sidebar (or flat) skills textarea into `{ category, items }[]`.
 *
 * Mirrors `_skills_sidebar_content` round-trip:
 *   Python
 *   • Backend development
 *   C++
 *   • OOP
 *
 * Flat mid-dot / bullet lists without category lines become one untitled group.
 *
 * @param {string} content
 * @param {boolean} [bulletList=false]
 * @returns {{ category: string, items: string[] }[]}
 */
export function parseSkillsSidebarContent(content, bulletList = false) {
  const text = String(content || "");
  if (!text.trim()) return [];

  // Flat mid-dot / bulletList chip rows have no category labels — keep them
  // as one untitled group before the category/bullet scanner invents a label.
  const hasBulletLine = text.split("\n").some((line) => LEADING_BULLET_RE.test(line.trim()));
  const hasMidDot = /\s·\s/.test(text);
  if (!hasBulletLine && (hasMidDot || bulletList)) {
    const items = parseFlatListItems(text, Boolean(bulletList));
    if (items.length > 0) return [{ category: "", items }];
  }

  const lines = text.split("\n");
  const groups = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    if (current.category || current.items.length > 0) {
      groups.push({
        category: current.category,
        items: current.items.slice(),
      });
    }
    current = null;
  };

  for (const raw of lines) {
    const line = String(raw || "").trim();
    if (!line) continue;
    const bulletMatch = line.match(LEADING_BULLET_RE);
    if (bulletMatch) {
      if (!current) current = { category: "", items: [] };
      const item = bulletMatch[1].trim();
      if (item) current.items.push(item);
      continue;
    }
    // Non-bullet line starts a new named category.
    pushCurrent();
    current = { category: line, items: [] };
  }
  pushCurrent();

  if (groups.length > 0) {
    // Lines without any bullet markers are chip names (AML / KYC / SQL), not
    // empty subcategory headers. Only keep category/item pairs when at least
    // one group actually collected bullet children.
    const allCategoriesNoItems = groups.every((group) => (
      group.category && group.items.length === 0
    ));
    if (allCategoriesNoItems && !hasBulletLine) {
      return [{ category: "", items: groups.map((group) => group.category) }];
    }
    return groups;
  }

  const items = parseFlatListItems(text, Boolean(bulletList));
  if (items.length === 0) return [];
  return [{ category: "", items }];
}

/**
 * Collect skill groups from section members (sidebar textarea or main
 * category + body pairs).
 *
 * @param {object[]} members
 * @param {string} headingId
 * @returns {{ category: string, items: string[] }[]}
 */
export function collectSkillGroups(members, headingId) {
  const bodies = (members || [])
    .filter((element) => element
      && element.element_id !== headingId
      && element.flowRole !== "section-chrome"
      && element.flowRole !== "sidebar-chrome"
      && (element.category === "textarea" || element.category === "text")
      && element.category !== "line")
    .sort((a, b) => {
      const topA = Number(a.top) || 0;
      const topB = Number(b.top) || 0;
      if (topA !== topB) return topA - topB;
      return (Number(a.left) || 0) - (Number(b.left) || 0);
    });

  if (bodies.length === 0) return [];

  // Single body → sidebar / flat shape.
  if (bodies.length === 1) {
    return parseSkillsSidebarContent(bodies[0].content, Boolean(bodies[0].bulletList));
  }

  // Main-column shape: bold category label + following body, optionally
  // sharing a flowGroup. Untagged stacks still pair bold-then-body by order.
  const groups = [];
  let pendingCategory = "";
  for (const element of bodies) {
    const isCategory = Boolean(element.bold)
      && !element.bulletList
      && String(element.content || "").trim()
      && !String(element.content || "").includes("\n")
      && !LEADING_BULLET_RE.test(String(element.content || "").trim());
    if (isCategory) {
      if (pendingCategory) {
        groups.push({ category: pendingCategory, items: [] });
      }
      pendingCategory = String(element.content || "").trim();
      continue;
    }
    const items = parseFlatListItems(element.content, Boolean(element.bulletList));
    groups.push({ category: pendingCategory, items });
    pendingCategory = "";
  }
  if (pendingCategory) {
    groups.push({ category: pendingCategory, items: [] });
  }
  return groups.filter((group) => group.category || group.items.length > 0);
}

/**
 * Serialise groups back to the sidebar single-textarea form.
 *
 * @param {{ category: string, items: string[] }[]} groups
 * @returns {string}
 */
export function formatSkillsSidebarContent(groups) {
  const parts = [];
  for (const group of groups || []) {
    const category = String(group?.category || "").trim();
    const body = formatFlatListContent(group?.items || [], FLAT_SECTION_LAYOUT_BULLET);
    if (category) parts.push(category);
    if (body.content) parts.push(body.content);
  }
  return parts.join("\n");
}

/**
 * Build main-column skill subcategory blocks (bold category + body).
 *
 * Each category + body shares a `flowGroup` so the packer keep-together rules
 * match `_place_skills_section` and cannot orphan the section heading alone.
 *
 * @param {{ category: string, items: string[] }[]} groups
 * @param {{
 *   bodyLeft: number,
 *   recordWidth: number,
 *   body: object,
 *   appendTop: number,
 *   idFactory: () => string,
 *   stackGap?: number,
 *   recordGap?: number,
 * }} options
 * @returns {object[]}
 */
export function buildSkillsMainGroups(groups, options) {
  const list = (groups || []).filter((group) => (
    String(group?.category || "").trim() || (group?.items || []).length > 0
  ));
  if (list.length === 0) return [];

  const bodyLeft = Number(options.bodyLeft) || 0;
  const recordWidth = Number(options.recordWidth) || 300;
  const body = options.body || {};
  const bodyFs = Number(body.fontSize) || 9.5;
  const bodyLh = Number(body.lineHeight) || bodyFs * 1.4;
  // Backend: category_fs = max(body_fs, 9.5); cat_lh = cat_fs + 2.
  const catFs = Math.max(bodyFs, 9.5);
  const catLh = catFs + 2;
  const bodyColor = body.color || "#26313F";
  const fontFamily = body.fontFamily || "Montserrat";
  const stackGap = Number.isFinite(Number(options.stackGap)) ? Number(options.stackGap) : 4;
  const recordGap = Number.isFinite(Number(options.recordGap)) ? Number(options.recordGap) : 10;
  const idFactory = options.idFactory || (() => `skill-${Math.random().toString(36).slice(2, 9)}`);
  let cursor = Number(options.appendTop) || 0;
  const elements = [];

  list.forEach((group, index) => {
    const category = String(group.category || "").trim();
    const formatted = formatFlatListContent(group.items || [], FLAT_SECTION_LAYOUT_INLINE);
    const flowGroup = `skill-group-${idFactory()}`;
    const hasBody = Boolean(formatted.content);

    if (category) {
      const catH = measureTextareaHeight(category, recordWidth, catFs, catLh);
      elements.push({
        element_id: idFactory(),
        category: "textarea",
        content: category,
        left: bodyLeft,
        top: cursor,
        width: recordWidth,
        height: Math.max(catH, catLh),
        fontSize: catFs,
        lineHeight: catLh,
        fontFamily,
        color: bodyColor,
        bold: true,
        italic: false,
        align: "left",
        bulletList: false,
        autoHeight: true,
        preserveInitialLayout: false,
        flowRole: "content",
        flowGroup,
        page: 1,
        zIndex: 3,
      });
      cursor += Math.max(catH, catLh);
      if (hasBody) cursor += stackGap;
    }

    if (hasBody) {
      const bodyH = measureTextareaHeight(
        formatted.content, recordWidth, bodyFs, bodyLh, { bulletList: false },
      );
      elements.push({
        element_id: idFactory(),
        category: "textarea",
        content: formatted.content,
        left: bodyLeft,
        top: cursor,
        width: recordWidth,
        height: bodyH,
        fontSize: bodyFs,
        lineHeight: bodyLh,
        fontFamily,
        color: bodyColor,
        bold: false,
        italic: false,
        align: "left",
        bulletList: false,
        autoHeight: true,
        preserveInitialLayout: false,
        flowRole: "content",
        flowGroup,
        page: 1,
        zIndex: 3,
      });
      cursor += bodyH;
    }

    if (index < list.length - 1) cursor += recordGap;
  });

  return elements;
}

/**
 * Expand a rail skills strip into main-column chrome + subcategory records.
 *
 * @param {object[]} members
 * @param {string} headingId
 * @param {object} style
 * @param {number} parkTop
 * @param {{ stack?: number, record?: number, after_rule?: number }} [spacing]
 * @returns {object[]|null}
 */
export function restyleSkillsMembersAsMain(members, headingId, style, parkTop, spacing = {}) {
  const heading = members.find((element) => element.element_id === headingId);
  if (!heading) return null;
  const groups = collectSkillGroups(members, headingId);
  if (groups.length === 0) return null;

  const headingFont = style.heading || {};
  const bodyFont = style.body || {};
  const recordWidth = Number(style.recordWidth) || 300;
  const headingLeft = Number(style.left) || Number(style.bodyLeft) || 245;
  const bodyLeft = Number.isFinite(Number(style.bodyLeft))
    ? Number(style.bodyLeft)
    : headingLeft;
  const fontSize = Number(headingFont.fontSize) || 14;
  const letterSpacing = Number.isFinite(Number(headingFont.letterSpacing))
    ? Number(headingFont.letterSpacing)
    : (Number(heading.letterSpacing) || 0);

  const chrome = [{
    ...heading,
    flowRole: "section-chrome",
    left: headingLeft,
    top: parkTop,
    fontSize,
    fontFamily: headingFont.fontFamily || heading.fontFamily,
    color: headingFont.color || heading.color,
    letterSpacing,
    bold: headingFont.bold !== undefined ? Boolean(headingFont.bold) : Boolean(heading.bold),
    height: measureTextareaHeight(heading.content, recordWidth, fontSize, fontSize * 1.35),
    page: 1,
    preserveInitialLayout: false,
  }];
  delete chrome[0].flowLane;

  const rule = members.find((element) => (
    element.element_id !== headingId
    && element.category === "line"
    && (Number(element.height) || 0) <= 4
  ));
  const afterRule = Number.isFinite(Number(spacing.after_rule))
    ? Number(spacing.after_rule)
    : 8;
  const ruleTop = parkTop + (Number(chrome[0].height) || 12) + 2;
  if (rule) {
    const ruleStyle = style.rule || {};
    const relLeft = Number.isFinite(Number(ruleStyle.relLeft)) ? Number(ruleStyle.relLeft) : 0;
    const restyledRule = {
      ...rule,
      flowRole: "section-chrome",
      left: headingLeft + relLeft,
      top: ruleTop,
      width: Number(ruleStyle.width) || recordWidth,
      height: Number(ruleStyle.height) || Number(rule.height) || 1,
      backgroundColor: ruleStyle.backgroundColor || rule.backgroundColor,
      page: 1,
      preserveInitialLayout: false,
    };
    delete restyledRule.flowLane;
    chrome.push(restyledRule);
  }

  const bodyTop = (rule ? ruleTop + (Number(chrome[chrome.length - 1].height) || 1) : ruleTop)
    + afterRule;
  let seq = 0;
  const idFactory = () => `${headingId}-sk-${Date.now().toString(36)}-${++seq}`;
  const bodies = buildSkillsMainGroups(groups, {
    bodyLeft,
    recordWidth,
    body: bodyFont,
    appendTop: bodyTop,
    idFactory,
    stackGap: Number.isFinite(Number(spacing.stack)) ? Number(spacing.stack) : 4,
    recordGap: Number.isFinite(Number(spacing.record)) ? Number(spacing.record) : 10,
  });
  if (bodies.length === 0) return null;
  return [...chrome, ...bodies];
}

/**
 * Collapse main-column skill groups into sidebar chrome + one textarea.
 *
 * @param {object[]} members
 * @param {string} headingId
 * @param {object} style
 * @param {number} parkTop
 * @returns {object[]|null}
 */
export function restyleSkillsMembersAsSidebar(members, headingId, style, parkTop) {
  const heading = members.find((element) => element.element_id === headingId);
  if (!heading) return null;
  const groups = collectSkillGroups(members, headingId);
  if (groups.length === 0) return null;

  const headingFont = style.heading || {};
  const bodyFont = style.body || {};
  const recordWidth = Number(style.recordWidth) || 152;
  const headingLeft = Number(style.left) || Number(style.bodyLeft) || 34;
  const bodyLeft = Number.isFinite(Number(style.bodyLeft))
    ? Number(style.bodyLeft)
    : headingLeft;
  const fontSize = Number(headingFont.fontSize) || 7.6;
  const bodyFs = Number(bodyFont.fontSize) || 8.3;
  const bodyLh = Number(bodyFont.lineHeight) || bodyFs * 1.4;
  const content = formatSkillsSidebarContent(groups);

  const chrome = [{
    ...heading,
    flowRole: "sidebar-chrome",
    flowLane: "sidebar",
    left: headingLeft,
    top: parkTop,
    fontSize,
    fontFamily: headingFont.fontFamily || heading.fontFamily,
    color: headingFont.color || heading.color,
    letterSpacing: Number.isFinite(Number(headingFont.letterSpacing))
      ? Number(headingFont.letterSpacing)
      : heading.letterSpacing,
    bold: headingFont.bold ?? heading.bold,
    height: measureTextareaHeight(heading.content, recordWidth, fontSize, fontSize * 1.35),
    page: 1,
    preserveInitialLayout: false,
  }];

  const rule = members.find((element) => (
    element.element_id !== headingId
    && element.category === "line"
    && (Number(element.height) || 0) <= 4
  ));
  const ruleTop = parkTop + (Number(chrome[0].height) || 12) + 2;
  if (rule) {
    const ruleStyle = style.rule || {};
    const relLeft = Number.isFinite(Number(ruleStyle.relLeft)) ? Number(ruleStyle.relLeft) : 0;
    chrome.push({
      ...rule,
      flowRole: "sidebar-chrome",
      flowLane: "sidebar",
      left: headingLeft + relLeft,
      top: ruleTop,
      width: Number(ruleStyle.width) || 50,
      height: Number(ruleStyle.height) || Number(rule.height) || 1,
      backgroundColor: ruleStyle.backgroundColor || rule.backgroundColor,
      page: 1,
      preserveInitialLayout: false,
    });
  }

  const bodyId = members.find((element) => (
    element.element_id !== headingId
    && (element.category === "textarea" || element.category === "text")
    && element.flowRole !== "section-chrome"
    && element.flowRole !== "sidebar-chrome"
  ))?.element_id || `${headingId}-body`;

  chrome.push({
    element_id: bodyId,
    category: "textarea",
    content,
    left: bodyLeft,
    top: ruleTop + 6,
    width: recordWidth,
    height: measureTextareaHeight(content, recordWidth, bodyFs, bodyLh, { bulletList: true }),
    fontSize: bodyFs,
    lineHeight: bodyLh,
    fontFamily: bodyFont.fontFamily || "Montserrat",
    color: bodyFont.color || "#26313F",
    bold: false,
    italic: false,
    align: "left",
    bulletList: true,
    autoHeight: true,
    preserveInitialLayout: false,
    flowRole: "content",
    flowLane: "sidebar",
    page: 1,
    zIndex: 3,
  });
  return chrome;
}
