/**
 * Languages section layout helpers for main ↔ sidebar transfers.
 *
 * Main-column templates place languages as an equal-width grid of
 * `flowRole: "grid-member"` cells (same shape as `_place_languages_grid` in
 * the backend). Language names and levels deliberately share one plain text
 * style; users may format the complete field with the normal text inspector.
 * Sidebar rails keep a single hyphenated textarea. Transfer must convert
 * between those shapes so a moved Języki section matches Experience rhythm.
 */
import { measureTextareaHeight } from "./textareaHeight.js";
import {
  listDocumentSections,
  listSidebarSections,
  sectionChromeRuleRelTop,
  sectionElementIds,
  sidebarSectionElementIds,
} from "./sectionStructure.js";

const LANGUAGE_SEP_MAIN = " — ";
const LANGUAGE_SEP_SIDEBAR = " - ";
/** Matches backend `_LANGUAGE_SEP` / bullet stripping. */
const LANGUAGE_SEP_RE = /\s+[—–-]\s+/;
const LEADING_BULLET_RE = /^\s*[-•–*—∙·]\s*/;
const LEGACY_LANGUAGE_TITLE_TOKENS = [
  "jezyk",
  "language",
  "sprache",
  "lingua",
  // Italian section headings normally use the plural `Lingue`, which is not
  // a substring of the backend-compatible singular token `lingua`.
  "lingue",
];

/** Stable semantic marker persisted with every generated language-grid cell. */
export const LANGUAGES_GRID_KIND = "languages";

/**
 * Allocate an id for the aggregate sidebar language body.
 *
 * A main grid contains one semantic node per language, while the rail uses one
 * combined textarea. Reusing a grid-cell id makes profile synchronization read
 * that representation change as an edit of the first language name.
 */
function compositeSidebarBodyId(members, headingId) {
  const sourceIds = new Set((members || []).map((element) => element?.element_id));
  const base = `${headingId}-languages-sidebar-composite`;
  let candidate = base;
  let suffix = 2;
  while (sourceIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/** Default column count for the main-column languages grid (backend default). */
export const LANGUAGES_GRID_COLUMNS = 4;

/**
 * Below this main-column width, a 4-column grid leaves too little space per
 * cell for a "Name — Level" line without wrapping or cutting off mid-word.
 * Matches the backend's own `languages_columns=3` cutoff (`shared/extras.py`):
 * sidebar templates' main column is ~300-335pt (Sterling/Tessera/Slate),
 * single-column templates' is ~460-500pt. This call site has no
 * template-id context (only the sampled `style.recordWidth`), so the column
 * count is derived from the actual available width instead of a template
 * allow-list — self-adapting instead of needing an update whenever a new
 * narrow-column template is added.
 */
const NARROW_MAIN_COLUMN_MAX_WIDTH = 400;
const NARROW_MAIN_COLUMN_LANGUAGES_COLUMNS = 3;

/**
 * @param {string|null|undefined} title
 * @returns {boolean}
 */
export function isLanguagesSectionTitle(title) {
  const folded = String(title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return LEGACY_LANGUAGE_TITLE_TOKENS.some((token) => folded.includes(token));
}

/**
 * Return whether a text cell carries the persisted Languages identity.
 *
 * Title matching remains a migration fallback only. Generated documents use
 * this marker so renaming a heading cannot disable actions or profile sync.
 *
 * @param {object|null|undefined} element
 * @returns {boolean}
 */
export function isLanguagesGridCell(element) {
  return Boolean(
    element
    && element.flowRole === "grid-member"
    && (element.category === "text" || element.category === "textarea")
    && element.gridKind === LANGUAGES_GRID_KIND
  );
}

/**
 * Resolve a grid section's semantic identity before consulting its title.
 *
 * An explicit non-Languages marker (currently `entries`) wins over a heading
 * such as JĘZYKI. This prevents a user-created grid with that title from
 * mutating canonical `cv_data.languages` or losing manual inline styles. The
 * localized title dictionary is used only for documents saved before semantic
 * grid metadata existed.
 *
 * @param {object[]} elements Heading and/or grid cells from one section.
 * @param {string|null|undefined} title
 * @returns {boolean}
 */
export function isLanguagesGridSection(elements, title) {
  const declaredKinds = (elements || [])
    .map((element) => String(element?.gridKind || "").trim().toLowerCase())
    .filter(Boolean);
  if (declaredKinds.some((kind) => kind !== LANGUAGES_GRID_KIND)) return false;
  if (declaredKinds.includes(LANGUAGES_GRID_KIND)) return true;
  return isLanguagesSectionTitle(title);
}

/**
 * @param {string} raw
 * @returns {{ name: string, level: string }}
 */
export function parseLanguageLine(raw) {
  const text = String(raw || "").trim().replace(LEADING_BULLET_RE, "");
  if (!text) return { name: "", level: "" };
  const parts = text.split(LANGUAGE_SEP_RE);
  if (parts.length >= 2) {
    return { name: parts[0].trim(), level: parts.slice(1).join(" - ").trim() };
  }
  return { name: text, level: "" };
}

/**
 * @param {string} name
 * @param {string} level
 * @param {string} sep
 * @returns {string}
 */
export function formatLanguageLine(name, level, sep = LANGUAGE_SEP_MAIN) {
  const n = String(name || "").trim();
  const l = String(level || "").trim();
  if (n && l) return `${n}${sep}${l}`;
  return n || l;
}

function isLegacyGeneratedLevelRun(run, levelStart, contentLength) {
  if (!run || typeof run !== "object") return false;
  const keys = Object.keys(run).filter((key) => run[key] !== undefined);
  return Number(run.start) === levelStart
    && Number(run.end) === contentLength
    && run.italic === true
    && typeof run.color === "string"
    && run.color.trim().length > 0
    && keys.every((key) => ["start", "end", "italic", "color"].includes(key));
}

/**
 * Remove the obsolete generator-owned colour/italic run from saved Languages
 * grids while preserving every other inline edit. Recognized legacy grids are
 * also backfilled with `gridKind`, making their identity survive later heading
 * edits and the next save/reopen cycle.
 *
 * Older documents stored one exact run over the trailing language level. The
 * strict signature check avoids deleting a user's bold, underline, full-field
 * italic, or unrelated custom-grid formatting during hydration.
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {object[]}
 */
export function removeLegacyLanguageLevelStyling(elements, pageHeight = 842) {
  const list = Array.isArray(elements) ? elements : [];
  const languageCellIds = new Set();
  const sections = [
    ...listDocumentSections(list, pageHeight).map((section) => ({ ...section, sidebar: false })),
    ...listSidebarSections(list, pageHeight).map((section) => ({ ...section, sidebar: true })),
  ];

  for (const section of sections) {
    const heading = list.find((element) => element?.element_id === section.headingId);
    const memberIds = section.sidebar
      ? sidebarSectionElementIds(list, section.headingId, pageHeight)
      : sectionElementIds(list, section.headingId, pageHeight);
    const cells = list.filter((element) => (
      memberIds.has(element?.element_id)
      && element?.flowRole === "grid-member"
      && (element?.category === "text" || element?.category === "textarea")
    ));
    if (!isLanguagesGridSection([heading, ...cells], section.title)) continue;
    for (const element of cells) {
      languageCellIds.add(element.element_id);
    }
  }

  if (languageCellIds.size === 0) return list;
  let changed = false;
  const normalized = list.map((element) => {
    if (!languageCellIds.has(element?.element_id)) {
      return element;
    }
    const withGridKind = element.gridKind === LANGUAGES_GRID_KIND
      ? element
      : { ...element, gridKind: LANGUAGES_GRID_KIND };
    if (withGridKind !== element) changed = true;
    if (!Array.isArray(withGridKind.runs)) return withGridKind;
    const content = String(withGridKind.content || "");
    const { level } = parseLanguageLine(content);
    if (!level || !content.endsWith(level)) return withGridKind;
    const levelStart = content.length - level.length;
    const runs = withGridKind.runs.filter((run) => (
      !isLegacyGeneratedLevelRun(run, levelStart, content.length)
    ));
    if (runs.length === withGridKind.runs.length) return withGridKind;
    changed = true;
    return { ...withGridKind, runs: runs.length > 0 ? runs : null };
  });
  return changed ? normalized : list;
}

/**
 * Collect `(name, level)` pairs from section body members (flat textarea or
 * existing grid cells).
 *
 * @param {object[]} members
 * @param {string} headingId
 * @returns {{ name: string, level: string }[]}
 */
export function collectLanguageEntries(members, headingId) {
  const bodies = (members || [])
    .filter((element) => element
      && element.element_id !== headingId
      && element.flowRole !== "section-chrome"
      && element.flowRole !== "sidebar-chrome"
      && (element.category === "textarea" || element.category === "text")
      && !(element.category === "line"))
    .sort((a, b) => {
      const topA = Number(a.top) || 0;
      const topB = Number(b.top) || 0;
      if (topA !== topB) return topA - topB;
      return (Number(a.left) || 0) - (Number(b.left) || 0);
    });

  const entries = [];
  for (const body of bodies) {
    const lines = String(body.content || "").split(/\n+/);
    for (const line of lines) {
      const parsed = parseLanguageLine(line);
      if (parsed.name) entries.push(parsed);
    }
  }
  return entries;
}

/**
 * Build main-column language grid cells for the given entries.
 *
 * Shared `flowGroup` keeps the row geometry in `placeStrip`. Each complete
 * `Name — Level` entry uses the body's single colour and text style.
 *
 * @param {{ name: string, level: string }[]} entries
 * @param {{
 *   bodyLeft: number,
 *   recordWidth: number,
 *   body: object,
 *   appendTop: number,
 *   idFactory: () => string,
 *   columns?: number,
 * }} options
 * @returns {object[]}
 */
export function buildLanguagesMainGrid(entries, options) {
  const list = entries || [];
  if (list.length === 0) return [];
  const bodyLeft = Number(options.bodyLeft) || 0;
  const recordWidth = Number(options.recordWidth) || 300;
  const defaultColumns = recordWidth < NARROW_MAIN_COLUMN_MAX_WIDTH
    ? NARROW_MAIN_COLUMN_LANGUAGES_COLUMNS
    : LANGUAGES_GRID_COLUMNS;
  const columns = Math.max(1, Number(options.columns) || defaultColumns);
  const body = options.body || {};
  const fontSize = Number(body.fontSize) || 9;
  const lineHeight = Number(body.lineHeight) || fontSize * 1.4;
  const bodyColor = body.color || "#26313F";
  const fontFamily = body.fontFamily || "Montserrat";
  const appendTop = Number(options.appendTop) || 0;
  const idFactory = options.idFactory || (() => `lang-${Math.random().toString(36).slice(2, 9)}`);
  const gutter = 8;
  const colW = recordWidth / columns;
  const cellW = Math.max(colW - gutter, 12);
  const flowGroup = `lang-grid-${idFactory()}`;

  const cells = [];
  for (let rowStart = 0; rowStart < list.length; rowStart += columns) {
    const row = list.slice(rowStart, rowStart + columns);
    const rowIndex = Math.floor(rowStart / columns);
    let rowH = 0;
    const payloads = row.map((entry) => {
      const content = formatLanguageLine(entry.name, entry.level, LANGUAGE_SEP_MAIN);
      const height = measureTextareaHeight(content, cellW, fontSize, lineHeight);
      rowH = Math.max(rowH, height);
      return { entry, content, height };
    });
    payloads.forEach((payload, colIndex) => {
      cells.push({
        element_id: idFactory(),
        category: "textarea",
        content: payload.content,
        left: bodyLeft + colIndex * colW,
        top: appendTop + rowIndex * (rowH + 0.01),
        width: cellW,
        height: payload.height,
        fontSize,
        lineHeight,
        fontFamily,
        color: bodyColor,
        bold: false,
        italic: false,
        align: "left",
        bulletList: false,
        autoHeight: true,
        // Remeasure at destination geometry after main ↔ sidebar transfer;
        // locking the authored rail box leaves wrong cell heights / gaps.
        preserveInitialLayout: false,
        flowRole: "grid-member",
        flowGroup,
        gridKind: LANGUAGES_GRID_KIND,
        page: 1,
        zIndex: 3,
      });
    });
  }
  return cells;
}

/**
 * Collapse language entries into one sidebar hyphenated textarea body.
 *
 * @param {{ name: string, level: string }[]} entries
 * @param {{
 *   bodyLeft: number,
 *   recordWidth: number,
 *   body: object,
 *   appendTop: number,
 *   elementId: string,
 * }} options
 * @returns {object}
 */
export function buildLanguagesSidebarBody(entries, options) {
  const content = (entries || [])
    .map((entry) => formatLanguageLine(entry.name, entry.level, LANGUAGE_SEP_SIDEBAR))
    .filter(Boolean)
    .join("\n");
  const body = options.body || {};
  const fontSize = Number(body.fontSize) || 8.3;
  const lineHeight = Number(body.lineHeight) || fontSize * 1.4;
  const recordWidth = Number(options.recordWidth) || 152;
  return {
    element_id: options.elementId,
    category: "textarea",
    content,
    left: Number(options.bodyLeft) || 0,
    top: Number(options.appendTop) || 0,
    width: recordWidth,
    height: measureTextareaHeight(content, recordWidth, fontSize, lineHeight),
    fontSize,
    lineHeight,
    fontFamily: body.fontFamily || "Montserrat",
    color: body.color || "#26313F",
    bold: false,
    italic: false,
    align: "left",
    bulletList: false,
    autoHeight: true,
    preserveInitialLayout: true,
    flowRole: "content",
    flowLane: "sidebar",
    page: 1,
    zIndex: 3,
  };
}

/**
 * Collapse a main-column languages grid (or flat body) into sidebar chrome +
 * one hyphenated textarea. Used when transferring / auto-collapsing onto the rail.
 *
 * @param {object[]} members
 * @param {string} headingId
 * @param {object} style
 * @param {number} parkTop
 * @returns {object[]|null}
 */
export function restyleLanguagesMembersAsSidebar(members, headingId, style, parkTop) {
  const heading = members.find((element) => element.element_id === headingId);
  if (!heading) return null;
  const entries = collectLanguageEntries(members, headingId);
  if (entries.length === 0) return null;

  const headingFont = style.heading || {};
  const recordWidth = Number(style.recordWidth) || 152;
  const headingLeft = Number(style.left) || Number(style.bodyLeft) || 34;
  const fontSize = Number(headingFont.fontSize) || 7.6;
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
  }];

  const rule = members.find((element) => (
    element.element_id !== headingId
    && element.category === "line"
    && (Number(element.height) || 0) <= 4
  ));
  const ruleTop = parkTop + sectionChromeRuleRelTop(style, chrome[0].height);
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
    });
  }

  // The rail body combines every language cell and therefore has a different
  // semantic identity from each source cell.
  const bodyId = compositeSidebarBodyId(members, headingId);

  const body = buildLanguagesSidebarBody(entries, {
    bodyLeft: Number.isFinite(Number(style.bodyLeft)) ? Number(style.bodyLeft) : headingLeft,
    recordWidth,
    body: style.body || {},
    appendTop: ruleTop + 6,
    elementId: bodyId,
  });
  return [...chrome, body];
}
