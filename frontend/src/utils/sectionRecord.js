/**
 * Append / insert / remove / reorder records inside an existing template-mode
 * section.
 *
 * Heading / record hover "+" appends a structured record that clones the last
 * multi-line group's field shape with Polish placeholders:
 * education (4 lines), experience (3), or skills subcategory (bold heading +
 * body — 2 lines).
 *
 * Hovering any editable field of an existing record shows the structural
 * toolbar and an exact-field inner outline. Insert, optional-description
 * add/remove, delete, and reorder all re-pack with `applyFlowSpacing`.
 */

import { nanoid } from "nanoid";
import { DEFAULT_FLOW_SPACING, normalizeFlowSpacing } from "./flowSpacing.js";
import { SECTION_LAYOUTS } from "./sectionBuilder.js";
import {
  applyFlowSpacing,
  isDecorativeOrdinalChrome,
  isSectionHeading,
  isSidebarLaneElement,
  isSidebarSectionHeading,
  listDocumentSections,
  listSidebarSections,
  sectionElementIds,
  sidebarSectionElementIds,
} from "./sectionStructure.js";
import { isRecordOverlay } from "./textareaReflow.js";

/**
 * Resolve membership ids for a main or sidebar section heading.
 *
 * @param {object[]} elements
 * @param {string} headingId
 * @param {number} [pageHeight=842]
 * @returns {Set<string>}
 */
function resolveSectionMemberIds(elements, headingId, pageHeight = 842) {
  const heading = (elements || []).find((element) => element.element_id === headingId);
  if (heading && isSidebarSectionHeading(heading)) {
    return sidebarSectionElementIds(elements, headingId, pageHeight);
  }
  return sectionElementIds(elements, headingId, pageHeight);
}

/**
 * Main-column + sidebar section lists (each in its own reading order).
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {{ headingId: string, title: string }[]}
 */
function listEditableSections(elements, pageHeight = 842) {
  return [
    ...listDocumentSections(elements, pageHeight),
    ...listSidebarSections(elements, pageHeight),
  ];
}

/** Polish placeholders — keep aligned with `sectionBuilder` PLACEHOLDER. */
const PLACEHOLDER = Object.freeze({
  education: Object.freeze([
    "Nazwa wpisu",
    "Organizacja",
    "Lokalizacja · okres",
    "Opis…",
  ]),
  experience: Object.freeze([
    "Nazwa wpisu",
    "Organizacja · lokalizacja · okres",
    "Opis…",
  ]),
  subcategory: Object.freeze([
    "Nazwa kategorii",
    "Treść…",
  ]),
  generic: "Tekst…",
});

/**
 * Skills sections (UMIEJĘTNOŚCI / Skills / …) use bold heading + body records.
 * Short education stacks are also two lines (degree + school) — those expand
 * only when the section title looks like education (see below).
 */
const SKILLS_SECTION_TITLE_RE = /umiejęt|umiejet|skills|kompetenc/i;

/**
 * Education section titles — short wizard stacks (degree + school) must still
 * expand to the canonical 4-line education template on insert.
 */
const EDUCATION_SECTION_TITLE_RE = /wykształc|wyksztalc|edukac|studia|education|school/i;

/**
 * Common record-oriented headings whose two-line shape means title + metadata,
 * rather than a Skills-style subcategory heading + body. A fuller sibling with
 * a bullet description remains the primary, language-independent signal; this
 * fallback covers a single imported record whose description was omitted.
 */
const DESCRIPTION_RECORD_SECTION_TITLE_RE = /doświadc|doswiad|experience|employment|historia pracy|work history|projek|project|wolont|volunteer|staż|staz|intern/i;

/**
 * @param {string|null|undefined} title
 * @returns {boolean}
 */
export function isSkillsSectionTitle(title) {
  return SKILLS_SECTION_TITLE_RE.test(String(title || ""));
}

/**
 * @param {string|null|undefined} title
 * @returns {boolean}
 */
export function isEducationSectionTitle(title) {
  return EDUCATION_SECTION_TITLE_RE.test(String(title || ""));
}

/**
 * @param {string|null|undefined} title
 * @returns {boolean}
 */
export function isDescriptionRecordSectionTitle(title) {
  return DESCRIPTION_RECORD_SECTION_TITLE_RE.test(String(title || ""));
}

/**
 * True when a 2-line bold+body record should stay a subcategory (heading +
 * content) instead of expanding to education. Skills titles always qualify;
 * other titles qualify unless they look like education. Missing title keeps
 * the legacy expand behaviour for unit tests and short edu inserts.
 *
 * @param {string|null|undefined} title
 * @returns {boolean}
 */
export function isSubcategorySectionTitle(title) {
  const text = String(title || "").trim();
  if (!text) return false;
  if (isEducationSectionTitle(text)) return false;
  return true;
}

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

/**
 * First non-`record-overlay` line in a record group, so a swapped record's
 * relocation cursor starts from its true top line rather than an overlay
 * that happens to sort first (an overlay's top is designed to tie with a
 * real line's top; the tie-break isn't guaranteed to put the real line
 * first the way `sectionStructure.js`'s `sortByReadingOrder` does).
 */
function firstRealLine(group, pageHeight) {
  return group.find((element) => !isRecordOverlay(element, group, pageHeight)) || group[0];
}

/**
 * Find the real content line a record-overlay element (within the same
 * record group) is pinned beside: same `flowGroup`, top within the ~3px
 * tolerance `textareaReflow.js`'s `recordOverlayAnchor` also uses.
 */
function findGroupOverlayAnchor(group, overlayElement, pageHeight) {
  const groupId = typeof overlayElement.flowGroup === "string" ? overlayElement.flowGroup : null;
  if (!groupId) return null;
  const overlayAbs = absoluteTop(overlayElement, pageHeight);
  let best = null;
  let bestDelta = Infinity;
  for (const candidate of group) {
    if (
      candidate === overlayElement
      || (
        candidate.element_id
        && overlayElement.element_id
        && candidate.element_id === overlayElement.element_id
      )
    ) continue;
    if (candidate.flowGroup !== groupId) continue;
    if (isRecordOverlay(candidate, group, pageHeight)) continue;
    const delta = Math.abs(absoluteTop(candidate, pageHeight) - overlayAbs);
    if (delta <= 3 && delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

function absoluteBottom(element, pageHeight = 842) {
  return absoluteTop(element, pageHeight) + elementHeight(element);
}

/**
 * Body content members of a section (excludes chrome / decorative ordinals).
 *
 * @param {object[]} elements
 * @param {string} headingId
 * @param {number} [pageHeight=842]
 * @returns {object[]}
 */
export function listSectionContentElements(elements, headingId, pageHeight = 842) {
  const ids = resolveSectionMemberIds(elements, headingId, pageHeight);
  const members = (elements || []).filter((element) => {
    if (!element || !ids.has(element.element_id)) return false;
    if (element.element_id === headingId) return false;
    if (element.fixedToPage) return false;
    if (
      element.flowRole === "section-chrome"
      || element.flowRole === "sidebar-chrome"
      || element.flowRole === "masthead"
    ) {
      return false;
    }
    if (isDecorativeOrdinalChrome(element)) return false;
    // Never treat another section title inside the band as a record line.
    if (isSectionHeading(element, elements, pageHeight)) return false;
    if (isSidebarSectionHeading(element)) return false;
    if (element.category === "line") return false;
    if (element.category === "rectangle" || element.category === "circle"
      || element.category === "ellipse" || element.category === "image") {
      // Shapes / icons are chrome, not record lines.
      return false;
    }
    if (element.category !== "text" && element.category !== "textarea") return false;
    // Explicit content, auto-height body, or any remaining text/textarea in the
    // section strip that is not chrome.
    if (element.flowRole === "content") return true;
    if (element.autoHeight || element.flowGroup) return true;
    // Untagged short body lines from older generators.
    return true;
  });

  return members.sort(
    (left, right) => absoluteTop(left, pageHeight) - absoluteTop(right, pageHeight),
  );
}

/**
 * Partition section body into record groups (shared flowGroup, else bold-title runs).
 *
 * @param {object[]} bodySorted
 * @returns {object[][]}
 */
export function partitionSectionRecords(bodySorted) {
  const list = bodySorted || [];
  if (list.length === 0) return [];

  const hasFlowGroups = list.some(
    (element) => typeof element.flowGroup === "string" && element.flowGroup,
  );

  if (hasFlowGroups) {
    const byGroup = new Map();
    const order = [];
    for (const element of list) {
      const key = (typeof element.flowGroup === "string" && element.flowGroup)
        ? element.flowGroup
        : `solo:${element.element_id}`;
      if (!byGroup.has(key)) {
        byGroup.set(key, []);
        order.push(key);
      }
      byGroup.get(key).push(element);
    }
    return order.map((key) => byGroup.get(key));
  }

  // Legacy untagged stacks: a bold line starts a new record.
  const groups = [];
  let current = [];
  for (const element of list) {
    if (element.bold && current.length > 0) {
      groups.push(current);
      current = [element];
    } else {
      current.push(element);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * Whether the section should offer "add record" on its heading hover.
 *
 * True when the body is more than a lone textarea — i.e. at least one record
 * group with two or more lines (education / experience / custom cc structure).
 *
 * Excludes sections in a wrapped chip grid (Skills/Languages "chips" mode,
 * `flowRole: "grid-member"`): the generic clone model stacks one full-width
 * line per source element and copies each element's own `left`, which for a
 * chip is its x-offset *inside* the wrapped row, not a line-start margin.
 * `listSectionContentElements` also drops the chip's rectangle background as
 * decorative chrome, so a clone comes out as bare, unstyled placeholder text
 * scattered across the row's x-offsets instead of a new pill — and, being far
 * taller than a real chip row, can push past the next section's heading and
 * get attributed to the wrong section by `listDocumentSections`. Growing a
 * chips section safely requires the wrap-aware layout in
 * `skillsLayout.buildSkillsChipGroups`, not this generic per-line clone;
 * until "+" is chip-aware, switch the section to bullet/inline mode (where
 * body lines are plain `flowRole: "content"` and the generic add works),
 * edit there, then switch back via the display-mode picker, which rebuilds
 * chip geometry from scratch.
 *
 * @param {object[]} elements
 * @param {string} headingId
 * @param {number} [pageHeight=842]
 * @returns {boolean}
 */
export function sectionSupportsRecordAdd(elements, headingId, pageHeight = 842) {
  const body = listSectionContentElements(elements, headingId, pageHeight);
  if (body.length < 2) return false;
  if (body.some((element) => element.flowRole === "grid-member")) return false;
  const groups = partitionSectionRecords(body);
  return groups.some((group) => group.length >= 2);
}

/**
 * Infer placeholder layout from a record's line count / shape.
 *
 * Education is degree + school + meta + optional bullets (3 lines without a
 * bulletList still count as education — wizard often omits the description).
 * Experience is title + company·period + bullets (the last line is a list).
 * Subcategory is bold heading + body (skills / user "kategorie" sections) —
 * the same 2-line shape as a short wizard education entry, so the section
 * title decides (education titles expand; other titles keep heading+body).
 *
 * @param {object[]} members
 * @param {{ sectionTitle?: string|null }} [options]
 * @returns {"cc-edu"|"cc-exp"|"cc-sub"|null}
 */
export function inferRecordLayout(members, options = {}) {
  const list = members || [];
  // Right-column dates and locations are fields in the record, but they are
  // not extra rows in its vertical layout. Classify from the flowing column
  // so a three-row experience record remains experience when it also owns one
  // or two `record-overlay` fields.
  const linear = list.filter((element) => !isRecordOverlay(element, list));
  const hasOverlay = linear.length !== list.length;
  const count = linear.length;
  if (hasOverlay && isEducationSectionTitle(options.sectionTitle)) {
    return SECTION_LAYOUTS.RECORD_EDUCATION;
  }
  if (isSkillsSectionTitle(options.sectionTitle)) {
    return SECTION_LAYOUTS.RECORD_SUBCATEGORY;
  }
  if (count >= 4) return SECTION_LAYOUTS.RECORD_EDUCATION;
  if (count === 3) {
    if (linear.some((element) => element.bulletList)) {
      return SECTION_LAYOUTS.RECORD_EXPERIENCE;
    }
    // degree / school / city·period without description
    return SECTION_LAYOUTS.RECORD_EDUCATION;
  }
  // Bare 2-line bold+body is ambiguous (subcategory vs short education).
  if (count === 2 && linear[0]?.bold && isSubcategorySectionTitle(options.sectionTitle)) {
    return SECTION_LAYOUTS.RECORD_SUBCATEGORY;
  }
  return null;
}

/**
 * Field copy for records that place metadata beside flowing text.
 *
 * The relationship is derived from structure, not a template name: an overlay
 * pinned to the bold title/degree row is the period, while an overlay pinned to
 * the organisation/school row is the location. This covers Cadenza, Meridian,
 * Vellum, and any later template authored with the same `record-overlay`
 * contract. Records without overlays keep the legacy positional placeholders.
 *
 * @param {object[]} members
 * @param {"cc-edu"|"cc-exp"|"cc-sub"|null} layout
 * @returns {string[]|null}
 */
function overlayRecordPlaceholders(members, layout) {
  const list = members || [];
  const overlays = list.filter((element) => isRecordOverlay(element, list));
  if (overlays.length === 0) return null;

  const linear = list.filter((element) => !isRecordOverlay(element, list));
  const overlayAnchors = new Map(overlays.map((overlay, index) => [
    overlay,
    findGroupOverlayAnchor(list, overlay, 842) || linear[index] || linear[0] || null,
  ]));
  const locationAnchorIds = new Set(overlays.flatMap((overlay, index) => {
    const anchor = overlayAnchors.get(overlay);
    const isPeriod = Boolean(anchor?.bold)
      || (!linear.some((element) => element?.bold) && index === 0);
    return isPeriod || !anchor?.element_id ? [] : [anchor.element_id];
  }));

  let plainLineIndex = 0;
  let overlayIndex = 0;
  return list.map((element) => {
    if (isRecordOverlay(element, list)) {
      const anchor = overlayAnchors.get(element);
      const isPeriod = Boolean(anchor?.bold)
        || (!linear.some((candidate) => candidate?.bold) && overlayIndex === 0);
      overlayIndex += 1;
      return isPeriod ? "Okres" : "Lokalizacja";
    }
    if (element?.bulletList) return PLACEHOLDER.education[3];
    if (element?.bold) return PLACEHOLDER.education[0];

    const currentPlainIndex = plainLineIndex;
    plainLineIndex += 1;
    if (layout === SECTION_LAYOUTS.RECORD_SUBCATEGORY) {
      return currentPlainIndex === 0
        ? PLACEHOLDER.subcategory[0]
        : PLACEHOLDER.subcategory[1];
    }

    // When a location already has its own right-column field, the left row is
    // organisation only. Otherwise retain location in the flowing metadata so
    // a period-only rail does not remove a field from the generic record.
    const hasRightLocation = element?.element_id
      ? locationAnchorIds.has(element.element_id)
      : overlays.some((overlay) => overlayAnchors.get(overlay) === element
        && !element.bold);
    return hasRightLocation ? "Organizacja" : "Organizacja · lokalizacja";
  });
}

/**
 * Placeholder strings for a cloned record.
 *
 * @param {object[]} members
 * @param {{ sectionTitle?: string|null }} [options]
 * @returns {string[]}
 */
export function placeholderContentsForRecord(members, options = {}) {
  const layout = inferRecordLayout(members, options);
  const overlayPlaceholders = overlayRecordPlaceholders(members, layout);
  if (overlayPlaceholders) return overlayPlaceholders;
  if (layout === SECTION_LAYOUTS.RECORD_EDUCATION) {
    return [...PLACEHOLDER.education];
  }
  if (layout === SECTION_LAYOUTS.RECORD_EXPERIENCE) {
    return [...PLACEHOLDER.experience];
  }
  if (layout === SECTION_LAYOUTS.RECORD_SUBCATEGORY) {
    return [...PLACEHOLDER.subcategory];
  }
  return (members || []).map((element, index) => {
    if (element?.bulletList) return PLACEHOLDER.education[3];
    if (index === 0 && element?.bold) return PLACEHOLDER.education[0];
    if (index === 1 && members?.[0]?.bold) return PLACEHOLDER.education[1];
    if (index === 0) return PLACEHOLDER.experience[0];
    return PLACEHOLDER.generic;
  });
}

/**
 * Rough line-box height matching `sectionBuilder` / ReportLab measure_block.
 *
 * @param {string} content
 * @param {number} width
 * @param {number} fontSize
 * @param {number} lineHeight
 * @returns {number}
 */
function measurePlaceholderHeight(content, width, fontSize, lineHeight) {
  const lh = lineHeight || Math.round(fontSize * 1.4);
  const cpl = Math.max(10, Math.floor(width / (fontSize * 0.52)));
  let renderedLines = 0;
  for (const seg of String(content || "").split("\n")) {
    renderedLines += seg.trim() ? Math.max(1, Math.ceil(seg.length / cpl)) : 1;
  }
  return Math.max(lh, renderedLines * lh);
}

/**
 * Prefer the fullest bold-title record in the section as the structural
 * template. Hovering a short education entry (degree + school only) must still
 * clone a sibling's complete 4-line shape — otherwise the insert misses meta /
 * description and collapses into the next record's title.
 *
 * @param {object[][]} groups
 * @param {object[]|null} preferred
 * @returns {object[]|null}
 */
export function pickRecordTemplateGroup(groups, preferred = null) {
  const list = (groups || []).filter((group) => group && group.length >= 2);
  if (list.length === 0) return null;

  const score = (group) => {
    const bold = group[0]?.bold ? 100 : 0;
    return bold + group.length;
  };

  const ranked = [...list].sort((left, right) => score(right) - score(left));
  // Longest bold-title group wins (full edu/exp), even when `preferred` is a
  // shorter hovered entry.
  if (ranked[0][0]?.bold) return ranked[0];

  if (preferred?.length >= 2) return preferred;
  return ranked[0];
}

/**
 * Expand a short wizard education/experience stack to the canonical field
 * count so placeholders and inter-record rhythm match the builder layouts.
 *
 * Education: degree + school + meta + bullets (4).
 * Experience: title + company·period + bullets (3).
 * Subcategory (skills / kategorie): bold heading + body (2) — when
 * `sectionTitle` is not an education heading; otherwise a 2-line bold stack
 * expands to education (short edu records).
 *
 * @param {object[]} members
 * @param {object[][]|null} [sectionGroups] other records in the section
 * @param {{ sectionTitle?: string|null }} [options]
 * @returns {object[]}
 */
export function ensureCanonicalRecordTemplate(
  members,
  sectionGroups = null,
  options = {},
) {
  const source = members || [];
  if (source.length === 0) return source;

  // An explicit overlay rail is already a complete, template-authored record
  // shape. Expanding it by raw element count would turn right-column metadata
  // into invented vertical rows and destroy the source structure.
  if (source.some((element) => isRecordOverlay(element, source))) return source;

  const sectionTitle = options.sectionTitle ?? null;
  const layout = inferRecordLayout(source, { sectionTitle });
  // Subcategory / heading+body — keep the 2-line shape.
  if (layout === SECTION_LAYOUTS.RECORD_SUBCATEGORY) return source;
  // Full experience (3 with bullets) — leave as-is.
  if (layout === SECTION_LAYOUTS.RECORD_EXPERIENCE) return source;
  // Education with 4 lines — leave as-is. 3-line edu (no bullets) still needs
  // a description line so inserts keep SPACE_RECORD separation from the next title.
  if (layout === SECTION_LAYOUTS.RECORD_EDUCATION && source.length >= 4) {
    return source;
  }

  const title = source[0];
  const second = source[1] || source[0];
  if (!title?.bold) return source;

  // Category sections (skills or user-added "kategorie"): never invent
  // education meta / description lines for a new heading+body block.
  if (
    isSubcategorySectionTitle(sectionTitle)
    && source.length === 2
  ) {
    return source;
  }

  const fullest = sectionGroups
    ? pickRecordTemplateGroup(sectionGroups, source)
    : source;
  const sectionLooksLikeExperience = Boolean(
    fullest
    && fullest.length === 3
    && fullest.some((element) => element.bulletList),
  );

  const mutedColor = second.color && second.color !== title.color
    ? second.color
    : (title.color || "#24201E");
  const metaFs = Math.min(Number(second.fontSize) || 8.7, 8.7);
  const metaLh = Number(second.lineHeight) || Math.round(metaFs * 1.35);
  const bodyFs = Number(second.fontSize) || 9;
  const bodyLh = Number(second.lineHeight) || Math.round(bodyFs * 1.35);

  const metaLine = {
    ...second,
    bold: false,
    bulletList: false,
    fontSize: metaFs,
    lineHeight: metaLh,
    color: mutedColor,
    height: metaLh,
  };
  const bulletLine = {
    ...second,
    bold: false,
    bulletList: true,
    fontSize: bodyFs,
    lineHeight: bodyLh,
    height: bodyLh,
  };

  if (sectionLooksLikeExperience) {
    if (source.length >= 3) return source;
    return [title, second, bulletLine];
  }

  // Education (default for bold stacks without experience bullets).
  if (source.length >= 4) return source;
  if (source.length === 3) return [...source, bulletLine];
  if (source.length === 2) return [title, second, metaLine, bulletLine];
  return source;
}

/**
 * Build cloned record elements with new ids, a fresh flowGroup, and placeholders.
 *
 * Geometry/typography are taken from the template lines (bold title, muted meta,
 * bullet description). Heights are re-measured for the placeholder copy so a
 * tall source description does not inflate an empty "Opis…" line.
 *
 * @param {object[]} members last record members in reading order
 * @param {() => string} [idFactory]
 * @param {object[][]|null} [sectionGroups]
 * @param {{ sectionTitle?: string|null, pageHeight?: number }} [options]
 * @returns {object[]} Cloned canvas fields tagged for cv_data synchronization.
 */
export function buildRecordClone(
  members,
  idFactory = nanoid,
  sectionGroups = null,
  options = {},
) {
  const sectionTitle = options.sectionTitle ?? null;
  const pageHeight = Number(options.pageHeight) || 842;
  const source = ensureCanonicalRecordTemplate(members, sectionGroups, {
    sectionTitle,
  });
  if (source.length === 0) return [];
  const placeholders = placeholderContentsForRecord(source, { sectionTitle });
  const layout = inferRecordLayout(source, { sectionTitle });
  const group = `record-${idFactory()}`;
  const realSource = source.filter((element) => !isRecordOverlay(element, source, pageHeight));
  const originAbs = realSource.length > 0
    ? absoluteTop(realSource[0], pageHeight)
    : absoluteTop(source[0], pageHeight);
  return source.map((element, index) => {
    const fontSize = Number(element.fontSize) || 9.3;
    const lineHeight = Number(element.lineHeight) || Math.round(fontSize * 1.4);
    const width = Number(element.width) || 466;
    const content = placeholders[index] ?? PLACEHOLDER.generic;
    const measured = measurePlaceholderHeight(content, width, fontSize, lineHeight);
    // Keep at least the template's single-line box so pack `record` gaps do not
    // collapse before the browser remeasures; never inherit a tall bullet box.
    const sourceH = elementHeight(element);
    const height = Math.max(measured, lineHeight, Math.min(sourceH, lineHeight * 2.2));
    // Explicit field copy — do not spread ephemeral UI flags (selection, move,
    // editing) or stale page/top from the source record.
    const next = {
      element_id: idFactory(),
      category: element.category === "text" ? "text" : "textarea",
      content,
      flowRole: element.flowRole || "content",
      flowGroup: group,
      autoHeight: isRecordOverlay(element, source, pageHeight)
        ? false
        : (element.category === "text" ? Boolean(element.autoHeight) : true),
      preserveInitialLayout: true,
      left: Number(element.left) || 66,
      // Retain source-relative Y long enough for placement to recover which
      // flowing row owns each right-column overlay. Callers translate the
      // completed record to its final page before the document packer runs.
      top: absoluteTop(element, pageHeight) - originAbs,
      width,
      height,
      fontSize,
      fontFamily: element.fontFamily || "Inter",
      lineHeight,
      letterSpacing: Number(element.letterSpacing) || 0,
      color: element.color || "#24201E",
      // Keep template emphasis: title bold, meta muted colour, bullet body.
      bold: Boolean(element.bold),
      italic: Boolean(element.italic),
      underline: Boolean(element.underline),
      align: element.align || "left",
      bulletList: Boolean(element.bulletList),
      isSelected: false,
      isMove: false,
      isEditing: false,
      locked: false,
      zIndex: Number.isFinite(Number(element.zIndex)) ? Number(element.zIndex) : 4,
      page: 1,
      // Unlike generator-authored records, this group has no representation in
      // cv_data yet. Semantic field roles allow the canvas/profile synchronizer
      // to append and subsequently update the exact record without relying on
      // translated heading text or template-specific element positions.
      editorAddedRecord: true,
      editorRecordLayout: layout,
      editorRecordField: (() => {
        const placeholder = String(content || "").trim().toLocaleLowerCase();
        if (placeholder === "okres") return "period";
        if (placeholder === "lokalizacja") return "city";
        if (element?.bulletList) return "description";
        if (layout === SECTION_LAYOUTS.RECORD_EDUCATION) {
          if (element?.bold) return "degree";
          if (placeholder === "organizacja") return "school";
          return index === 1 ? "school" : "meta";
        }
        if (layout === SECTION_LAYOUTS.RECORD_SUBCATEGORY) {
          return element?.bold || index === 0 ? "title" : "body";
        }
        if (element?.bold || index === 0) return "title";
        if (placeholder === "organizacja") return "organization";
        return "meta";
      })(),
    };
    if (element.editorAddedSection && element.editorSectionId) {
      next.editorAddedSection = true;
      next.editorSectionId = element.editorSectionId;
    }
    // Preserve sidebar lane so cloned records stay in the rail packer.
    if (element.flowLane === "sidebar") next.flowLane = "sidebar";
    return next;
  });
}

/**
 * Translate a cloned record to a flow position without counting overlays as
 * vertical rows. Overlay fields are pinned to the same cloned row as in the
 * source record, preserving any small authored baseline correction.
 *
 * @param {object[]} clones
 * @param {number} startAbs
 * @param {object} rhythm
 * @param {number} pageHeight
 * @param {{ intoSidebar?: boolean, bandCeiling?: number|null }} [options]
 * @returns {object[]}
 */
function placeRecordClone(
  clones,
  startAbs,
  rhythm,
  pageHeight,
  { intoSidebar = false, bandCeiling = null } = {},
) {
  const list = clones || [];
  const real = list.filter((element) => !isRecordOverlay(element, list, pageHeight));
  const overlays = list.filter((element) => isRecordOverlay(element, list, pageHeight));
  const overlayAnchors = new Map(overlays.map((overlay) => [
    overlay.element_id,
    findGroupOverlayAnchor(list, overlay, pageHeight),
  ]));

  const deltas = overlays.map((overlay) => {
    const anchor = overlayAnchors.get(overlay.element_id);
    return anchor
      ? absoluteTop(overlay, pageHeight) - absoluteTop(anchor, pageHeight)
      : 0;
  });
  const maxPositiveDelta = Math.max(0, ...deltas);
  const tightBand = bandCeiling != null && Number.isFinite(Number(bandCeiling));
  const microAdvance = tightBand ? 0.01 : null;
  let cursorAbs = Number(startAbs) || 0;
  if (tightBand) {
    // Keep every provisional member inside the section's old membership band
    // while retaining distinct row tops, so the packer can still pair each
    // overlay with the correct row before it opens real space for the record.
    cursorAbs = Math.min(
      cursorAbs,
      Number(bandCeiling) - Math.max(0, real.length - 1) * microAdvance - maxPositiveDelta,
    );
  }

  const placedById = new Map();
  for (const element of real) {
    const page = Math.max(1, Math.floor(cursorAbs / pageHeight) + 1);
    const top = cursorAbs - (page - 1) * pageHeight;
    const placed = { ...element, page, top };
    if (intoSidebar) placed.flowLane = "sidebar";
    placedById.set(element.element_id, placed);
    cursorAbs += microAdvance ?? (elementHeight(element) + rhythm.stack);
  }

  const placedOverlays = new Map();
  overlays.forEach((overlay, index) => {
    const anchor = overlayAnchors.get(overlay.element_id);
    const placedAnchor = anchor ? placedById.get(anchor.element_id) : null;
    let overlayAbs = placedAnchor
      ? absoluteTop(placedAnchor, pageHeight) + deltas[index]
      : cursorAbs;
    if (tightBand) overlayAbs = Math.min(overlayAbs, Number(bandCeiling));
    const page = Math.max(1, Math.floor(overlayAbs / pageHeight) + 1);
    const top = overlayAbs - (page - 1) * pageHeight;
    const placed = { ...overlay, page, top };
    if (intoSidebar) placed.flowLane = "sidebar";
    placedOverlays.set(overlay.element_id, placed);
  });

  return list.map((element) => (
    placedById.get(element.element_id)
    || placedOverlays.get(element.element_id)
    || element
  ));
}

/**
 * Append a generic record after the last record of the section, then re-pack.
 *
 * @param {object[]} elements
 * @param {string} headingId
 * @param {number} [pageHeight=842]
 * @param {{ spacing?: object, idFactory?: () => string }} [options]
 * @returns {{ elements: object[], firstBodyId: string|null }|null}
 *   null when the section cannot accept a record
 */
export function appendRecordToSection(
  elements,
  headingId,
  pageHeight = 842,
  { spacing, idFactory = nanoid } = {},
) {
  if (!sectionSupportsRecordAdd(elements, headingId, pageHeight)) {
    return null;
  }

  const body = listSectionContentElements(elements, headingId, pageHeight);
  const groups = partitionSectionRecords(body);
  const templateGroup = pickRecordTemplateGroup(groups);
  if (!templateGroup) return null;

  const heading = (elements || []).find((element) => element.element_id === headingId);
  const sectionTitle = heading?.content ?? null;
  const clones = buildRecordClone(templateGroup, idFactory, groups, {
    sectionTitle,
    pageHeight,
  });
  if (clones.length === 0) return null;

  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const flowingBody = body.filter((element) => !isRecordOverlay(element, body, pageHeight));
  const lastBody = flowingBody[flowingBody.length - 1] || body[body.length - 1];
  const intoSidebar = Boolean(heading && isSidebarSectionHeading(heading));

  // New lines must stay inside this section's absolute band so
  // membership helpers attribute them here before `applyFlowSpacing`
  // expands the strip and pushes following sections down. Placing a tall
  // record at its natural height could land past the next heading and steal
  // the lines into the wrong section.
  const sections = intoSidebar
    ? listSidebarSections(elements, pageHeight)
    : listDocumentSections(elements, pageHeight);
  const sectionIndex = sections.findIndex((section) => section.headingId === headingId);
  const nextSectionStart = sectionIndex >= 0 && sectionIndex + 1 < sections.length
    ? sections[sectionIndex + 1].startAbs
    : Number.POSITIVE_INFINITY;
  const bandCeiling = Number.isFinite(nextSectionStart)
    ? nextSectionStart - 0.05
    : null;

  let cursorAbs = absoluteBottom(lastBody, pageHeight) + rhythm.record;
  if (bandCeiling != null) {
    cursorAbs = Math.min(cursorAbs, bandCeiling);
  }
  const placedClones = placeRecordClone(clones, cursorAbs, rhythm, pageHeight, {
    intoSidebar,
    bandCeiling,
  });

  const next = applyFlowSpacing(
    [...(elements || []), ...placedClones],
    rhythm,
    pageHeight,
  );

  return {
    elements: next,
    firstBodyId: placedClones[0]?.element_id ?? null,
  };
}

/**
 * Locate the record group that owns `elementId` inside an eligible section.
 *
 * @param {object[]} elements
 * @param {string} elementId
 * @param {number} [pageHeight=842]
 * @returns {{ headingId: string, group: object[], body: object[] }|null}
 */
export function findRecordGroupForElement(elements, elementId, pageHeight = 842) {
  if (!elementId) return null;
  const sections = listEditableSections(elements, pageHeight);
  for (const section of sections) {
    if (!sectionSupportsRecordAdd(elements, section.headingId, pageHeight)) {
      continue;
    }
    const body = listSectionContentElements(elements, section.headingId, pageHeight);
    const groups = partitionSectionRecords(body);
    for (const group of groups) {
      if (group.some((member) => member.element_id === elementId)) {
        return { headingId: section.headingId, group, body };
      }
    }
  }
  return null;
}

/**
 * Upper chrome of a record: title / school / meta — everything before the first
 * bullet description. When the group has no bullet line, only the first line
 * (job/degree title) counts so the long body copy never owns a "+".
 *
 * @param {object[]} group
 * @returns {object[]}
 */
export function listUpperRecordMembers(group) {
  const list = group || [];
  if (list.length === 0) return [];
  const hasBullet = list.some((element) => element.bulletList);
  if (!hasBullet) return [list[0]];
  const upper = [];
  for (const element of list) {
    if (element.bulletList) break;
    upper.push(element);
  }
  return upper.length > 0 ? upper : [list[0]];
}

/**
 * Return the optional bullet-description field owned by one record.
 *
 * Record titles, metadata, and date/location overlays may all share the same
 * `flowGroup`; `bulletList` is the persisted semantic flag that distinguishes
 * the authored description from those structural lines.
 *
 * @param {object[]} group
 * @returns {object|null}
 */
export function findRecordDescription(group) {
  return (group || []).find((element) => Boolean(element?.bulletList)) || null;
}

/**
 * Decide which description operation belongs in a record's overflow menu.
 *
 * Existing bullet fields can always be removed. A missing field can be added
 * when the record is structurally education-like, belongs to a known
 * experience/project section, or has a fuller sibling proving that this
 * section supports descriptions. Skills-style subcategories are deliberately
 * excluded because their second line is already the record body.
 *
 * @param {object[]} group
 * @param {object[][]} groups
 * @param {string|null|undefined} sectionTitle
 * @returns {"add"|"remove"|null}
 */
function descriptionActionForGroup(group, groups, sectionTitle) {
  if (findRecordDescription(group)) return "remove";
  if (isSkillsSectionTitle(sectionTitle)) return null;

  const siblingHasDescription = (groups || []).some((candidate) => (
    candidate !== group && Boolean(findRecordDescription(candidate))
  ));
  if (siblingHasDescription) return "add";

  const realLineCount = (group || []).filter((element) => (
    element?.flowRole !== "record-overlay"
  )).length;
  if (realLineCount >= 3) return "add";
  if (isEducationSectionTitle(sectionTitle)) return "add";
  if (isDescriptionRecordSectionTitle(sectionTitle)) return "add";
  return null;
}

/**
 * Resolve the dynamic description action for the record owning an upper-line
 * canvas anchor.
 *
 * @param {object[]} elements
 * @param {string} elementId
 * @param {number} [pageHeight=842]
 * @returns {"add"|"remove"|null}
 */
export function getRecordDescriptionAction(elements, elementId, pageHeight = 842) {
  const anchor = findRecordGroupForElement(elements, elementId, pageHeight);
  if (!anchor) return null;
  if (!listUpperRecordMembers(anchor.group).some((member) => member.element_id === elementId)) {
    return null;
  }

  const groups = partitionSectionRecords(anchor.body);
  const heading = (elements || []).find((element) => element.element_id === anchor.headingId);
  return descriptionActionForGroup(anchor.group, groups, heading?.content);
}

/**
 * Whether a content element may trigger the in-record "+" (upper lines only).
 *
 * @param {object[]} elements
 * @param {string} elementId
 * @param {number} [pageHeight=842]
 * @returns {boolean}
 */
export function elementSupportsRecordBlockAdd(elements, elementId, pageHeight = 842) {
  const anchor = findRecordGroupForElement(elements, elementId, pageHeight);
  if (!anchor) return false;
  return listUpperRecordMembers(anchor.group)
    .some((member) => member.element_id === elementId);
}

/**
 * One affordance anchor per record: mounted on the title line, listening to
 * every editable field painted on the title's page so title, metadata, and
 * description can each reveal an exact inner outline. Structural operations
 * still use the upper-line title anchor. Includes reorder flags when the
 * section has sibling records.
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {{
 *   elementId: string,
 *   hoverIds: string[],
 *   left: number,
 *   top: number,
 *   height: number,
 *   width: number,
 *   fontSize: number,
 *   highlight: {left:number,top:number,width:number,height:number},
 *   canMoveUp: boolean,
 *   canMoveDown: boolean,
 *   descriptionAction: "add"|"remove"|null,
 * }[]}
 */
export function listRecordBlockAddAnchors(elements, pageHeight = 842) {
  const anchors = [];
  const sections = listEditableSections(elements, pageHeight);
  for (const section of sections) {
    if (!sectionSupportsRecordAdd(elements, section.headingId, pageHeight)) {
      continue;
    }
    const body = listSectionContentElements(elements, section.headingId, pageHeight);
    const groups = partitionSectionRecords(body);
    const heading = (elements || []).find((element) => element.element_id === section.headingId);
    groups.forEach((group, groupIndex) => {
      const upper = listUpperRecordMembers(group);
      if (upper.length === 0) return;
      const title = upper[0];
      const titlePage = Math.max(1, Math.trunc(Number(title.page) || 1));
      // A record may continue onto another page. Highlight only the members
      // painted beside this title's toolbar; spanning both pages with one box
      // would create a misleading overlay through the page break.
      const pageMembers = group.filter((member) => (
        Math.max(1, Math.trunc(Number(member.page) || 1)) === titlePage
      ));
      const left = Math.min(...pageMembers.map((member) => Number(member.left) || 0));
      const top = Math.min(...pageMembers.map((member) => Number(member.top) || 0));
      const right = Math.max(...pageMembers.map((member) => (
        (Number(member.left) || 0) + Math.max(0, Number(member.width) || 0)
      )));
      const bottom = Math.max(...pageMembers.map((member) => {
        const explicitHeight = Number(member.height);
        const fallbackHeight = (Number(member.fontSize) || 10) * 1.35;
        return (Number(member.top) || 0)
          + (Number.isFinite(explicitHeight) && explicitHeight > 0
            ? explicitHeight
            : fallbackHeight);
      }));
      anchors.push({
        elementId: title.element_id,
        hoverIds: pageMembers.map((element) => element.element_id),
        left: Number(title.left) || 0,
        top: Number(title.top) || 0,
        height: Number(title.height) || 0,
        width: Number(title.width) || 0,
        fontSize: Number(title.fontSize) || 10,
        highlight: {
          left,
          top,
          width: Math.max(1, right - left),
          height: Math.max(1, bottom - top),
        },
        canMoveUp: groupIndex > 0,
        canMoveDown: groupIndex < groups.length - 1,
        descriptionAction: descriptionActionForGroup(group, groups, heading?.content),
      });
    });
  }
  return anchors;
}

/**
 * Title-line ids that mount the in-record "+" control (one per record).
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {Set<string>}
 */
export function listRecordBlockAddElementIds(elements, pageHeight = 842) {
  return new Set(
    listRecordBlockAddAnchors(elements, pageHeight).map((anchor) => anchor.elementId),
  );
}

/**
 * Insert a full placeholder record (edu/exp field shape with generic copy)
 * immediately below the record that owns `afterElementId`, then re-pack.
 *
 * @param {object[]} elements
 * @param {string} afterElementId any upper-line member of the anchor record
 * @param {number} [pageHeight=842]
 * @param {{ spacing?: object, idFactory?: () => string }} [options]
 * @returns {{ elements: object[], firstBodyId: string|null }|null}
 */
export function insertRecordBlockAfterRecord(
  elements,
  afterElementId,
  pageHeight = 842,
  { spacing, idFactory = nanoid } = {},
) {
  const anchor = findRecordGroupForElement(elements, afterElementId, pageHeight);
  if (!anchor) return null;

  // Only the upper part of a record may trigger insert (matches the "+" UI).
  if (!listUpperRecordMembers(anchor.group).some((m) => m.element_id === afterElementId)) {
    return null;
  }

  const { headingId, group, body } = anchor;
  const groups = partitionSectionRecords(body);
  // Fullest bold-title sibling wins over a short hovered edu entry (2 lines).
  const templateGroup = pickRecordTemplateGroup(groups, group);
  if (!templateGroup) return null;

  const heading = (elements || []).find((element) => element.element_id === headingId);
  const sectionTitle = heading?.content ?? null;
  const clones = buildRecordClone(templateGroup, idFactory, groups, {
    sectionTitle,
    pageHeight,
  });
  if (clones.length === 0) return null;

  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const flowingGroup = group.filter((element) => !isRecordOverlay(element, group, pageHeight));
  const lastMate = flowingGroup.reduce((latest, element) => (
    !latest || absoluteBottom(element, pageHeight) > absoluteBottom(latest, pageHeight)
      ? element
      : latest
  ), null) || group[group.length - 1];
  const anchorIds = new Set(group.map((element) => element.element_id));
  const intoSidebar = Boolean(heading && isSidebarSectionHeading(heading));

  const cloneFlowLines = clones.filter((element) => (
    !isRecordOverlay(element, clones, pageHeight)
  ));
  const cloneStackHeight = cloneFlowLines.reduce((sum, element, index) => (
    sum + elementHeight(element) + (index > 0 ? rhythm.stack : 0)
  ), 0);
  // Open a lane-scoped hole under the anchor. Shifting only this section's
  // body (and leaving the next section heading put) pushed later education
  // lines past UMIEJĘTNOŚCI — sectionElementIds then stole them into Skills.
  // Sidebar inserts must not drag the main column down (and vice versa).
  const hole = cloneStackHeight + rhythm.record;
  const thresholdAbs = absoluteBottom(lastMate, pageHeight);

  const list = (elements || []).map((element) => {
    if (!element || element.fixedToPage) return element;
    if (anchorIds.has(element.element_id)) return element;
    // Masthead stays; every later flow element (sibling records AND later
    // section chrome/body) in the same lane moves down by the reserved height.
    if (element.flowRole === "masthead") return element;
    if (intoSidebar) {
      if (!isSidebarLaneElement(element)) return element;
    } else if (isSidebarLaneElement(element)) {
      return element;
    }
    if (absoluteTop(element, pageHeight) + 0.01 < thresholdAbs) return element;
    const newAbs = absoluteTop(element, pageHeight) + hole;
    const page = Math.max(1, Math.floor(newAbs / pageHeight) + 1);
    const top = newAbs - (page - 1) * pageHeight;
    return { ...element, page, top };
  });

  const cursorAbs = thresholdAbs + rhythm.record;
  const placedClones = placeRecordClone(clones, cursorAbs, rhythm, pageHeight, {
    intoSidebar,
  });

  const mateIndex = list.findIndex((element) => element.element_id === lastMate.element_id);
  const withBlock = mateIndex >= 0
    ? [
      ...list.slice(0, mateIndex + 1),
      ...placedClones,
      ...list.slice(mateIndex + 1),
    ]
    : [...list, ...placedClones];

  const next = applyFlowSpacing(withBlock, rhythm, pageHeight);

  const firstBodyId = placedClones[0]?.element_id ?? null;
  const packedBody = listSectionContentElements(next, headingId, pageHeight);
  if (firstBodyId && !packedBody.some((element) => element.element_id === firstBodyId)) {
    return null;
  }

  return {
    elements: next,
    firstBodyId,
  };
}

/**
 * Build one renderer-ready placeholder description for an existing record.
 *
 * A sibling description is the strongest style source because templates may
 * use a body width/color that differs from title and metadata lines. When no
 * sibling exists, the last real line supplies a conservative same-column
 * fallback. UI-only selection/editing flags and stale geometry are never
 * copied into the new element.
 *
 * @param {object|null} templateDescription
 * @param {object} fallbackLine
 * @param {object[]} targetGroup
 * @param {() => string} idFactory
 * @returns {object}
 */
function buildRecordDescription(
  templateDescription,
  fallbackLine,
  targetGroup,
  idFactory,
) {
  const source = templateDescription || fallbackLine;
  const fontSize = Number(source?.fontSize) || 9.3;
  const lineHeight = Number(source?.lineHeight) || Math.round(fontSize * 1.4);
  const width = Number(source?.width) || Number(fallbackLine?.width) || 466;
  const content = PLACEHOLDER.education[3];
  const targetFlowGroup = (targetGroup || []).find((element) => (
    typeof element?.flowGroup === "string" && element.flowGroup
  ))?.flowGroup;
  const targetFlowLane = (targetGroup || []).find((element) => (
    typeof element?.flowLane === "string" && element.flowLane
  ))?.flowLane;
  const editorRecord = (targetGroup || []).find((element) => element?.editorAddedRecord);
  const editorSection = (targetGroup || []).find((element) => (
    element?.editorAddedSection && element?.editorSectionId
  ));

  const description = {
    element_id: idFactory(),
    category: "textarea",
    content,
    flowRole: "content",
    autoHeight: true,
    preserveInitialLayout: true,
    left: Number(source?.left) || Number(fallbackLine?.left) || 66,
    top: 0,
    width,
    height: measurePlaceholderHeight(content, width, fontSize, lineHeight),
    fontSize,
    fontFamily: source?.fontFamily || fallbackLine?.fontFamily || "Inter",
    lineHeight,
    letterSpacing: Number(source?.letterSpacing) || 0,
    color: source?.color || fallbackLine?.color || "#24201E",
    bold: false,
    italic: Boolean(source?.italic),
    underline: false,
    align: source?.align || "left",
    bulletList: true,
    isSelected: false,
    isMove: false,
    isEditing: false,
    locked: false,
    zIndex: Number.isFinite(Number(source?.zIndex)) ? Number(source.zIndex) : 4,
    page: 1,
  };
  // Do not invent a flowGroup for legacy untagged records: one tagged line in
  // an otherwise untagged section would make every other line partition as a
  // separate solo record. Existing groups and sidebar lanes are safe to copy.
  if (targetFlowGroup) description.flowGroup = targetFlowGroup;
  if (targetFlowLane || source?.flowLane === "sidebar") {
    description.flowLane = targetFlowLane || "sidebar";
  }
  if (editorRecord) {
    description.editorAddedRecord = true;
    description.editorRecordLayout = editorRecord.editorRecordLayout;
    description.editorRecordField = "description";
  }
  if (editorSection) {
    description.editorAddedSection = true;
    description.editorSectionId = editorSection.editorSectionId;
  }
  return description;
}

/**
 * Add an editable "Opis…" bullet field to the record owning `elementId`.
 *
 * The operation opens a lane-scoped geometry hole before re-packing. This is
 * required when a record sits directly above another section: inserting the
 * field at its natural bottom without moving the boundary first can make the
 * next section temporarily claim it during membership detection.
 *
 * @param {object[]} elements
 * @param {string} elementId any upper-line member of the target record
 * @param {number} [pageHeight=842]
 * @param {{ spacing?: object, idFactory?: () => string }} [options]
 * @returns {{ elements: object[], descriptionId: string }|null}
 */
export function addRecordDescription(
  elements,
  elementId,
  pageHeight = 842,
  { spacing, idFactory = nanoid } = {},
) {
  const anchor = findRecordGroupForElement(elements, elementId, pageHeight);
  if (!anchor) return null;
  if (!listUpperRecordMembers(anchor.group).some((member) => member.element_id === elementId)) {
    return null;
  }

  const groups = partitionSectionRecords(anchor.body);
  const heading = (elements || []).find((element) => element.element_id === anchor.headingId);
  if (descriptionActionForGroup(anchor.group, groups, heading?.content) !== "add") {
    return null;
  }

  const realMembers = anchor.group.filter((element) => (
    !isRecordOverlay(element, anchor.group, pageHeight)
  ));
  if (realMembers.length === 0) return null;
  const lastReal = realMembers.reduce((latest, element) => (
    absoluteBottom(element, pageHeight) > absoluteBottom(latest, pageHeight)
      ? element
      : latest
  ));
  const templateDescription = groups
    .filter((group) => group !== anchor.group)
    .map((group) => findRecordDescription(group))
    .find(Boolean) || null;
  const description = buildRecordDescription(
    templateDescription,
    lastReal,
    anchor.group,
    idFactory,
  );

  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const groupIds = new Set(anchor.group.map((element) => element.element_id));
  const intoSidebar = Boolean(heading && isSidebarSectionHeading(heading));
  const thresholdAbs = Math.max(...realMembers.map((element) => (
    absoluteBottom(element, pageHeight)
  )));
  const hole = rhythm.stack + elementHeight(description);

  const shifted = (elements || []).map((element) => {
    if (!element || element.fixedToPage || groupIds.has(element.element_id)) return element;
    if (element.flowRole === "masthead") return element;
    if (intoSidebar) {
      if (!isSidebarLaneElement(element)) return element;
    } else if (isSidebarLaneElement(element)) {
      return element;
    }
    if (absoluteTop(element, pageHeight) + 0.01 < thresholdAbs) return element;
    const newAbs = absoluteTop(element, pageHeight) + hole;
    const page = Math.max(1, Math.floor(newAbs / pageHeight) + 1);
    const top = newAbs - (page - 1) * pageHeight;
    return { ...element, page, top };
  });

  const descriptionAbs = thresholdAbs + rhythm.stack;
  const descriptionPage = Math.max(1, Math.floor(descriptionAbs / pageHeight) + 1);
  const placedDescription = {
    ...description,
    page: descriptionPage,
    top: descriptionAbs - (descriptionPage - 1) * pageHeight,
    ...(intoSidebar ? { flowLane: "sidebar" } : {}),
  };
  const lastGroupIndex = shifted.reduce((latest, element, index) => (
    groupIds.has(element.element_id) ? index : latest
  ), -1);
  const withDescription = lastGroupIndex >= 0
    ? [
      ...shifted.slice(0, lastGroupIndex + 1),
      placedDescription,
      ...shifted.slice(lastGroupIndex + 1),
    ]
    : [...shifted, placedDescription];
  const next = applyFlowSpacing(withDescription, rhythm, pageHeight);
  const packedBody = listSectionContentElements(next, anchor.headingId, pageHeight);
  if (!packedBody.some((element) => element.element_id === description.element_id)) {
    return null;
  }

  return {
    elements: next,
    descriptionId: description.element_id,
  };
}

/**
 * Remove only the optional bullet description from a record, preserving title,
 * metadata, overlays, and the rest of the section before rhythm re-packing.
 *
 * @param {object[]} elements
 * @param {string} elementId any upper-line member of the target record
 * @param {number} [pageHeight=842]
 * @param {{ spacing?: object }} [options]
 * @returns {{ elements: object[], removedIds: Set<string> }|null}
 */
export function removeRecordDescription(
  elements,
  elementId,
  pageHeight = 842,
  { spacing } = {},
) {
  const anchor = findRecordGroupForElement(elements, elementId, pageHeight);
  if (!anchor) return null;
  if (!listUpperRecordMembers(anchor.group).some((member) => member.element_id === elementId)) {
    return null;
  }

  const description = findRecordDescription(anchor.group);
  if (!description) return null;
  const removedIds = new Set([description.element_id]);
  const remaining = (elements || []).filter((element) => (
    !removedIds.has(element.element_id)
  ));
  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  return {
    elements: applyFlowSpacing(remaining, rhythm, pageHeight),
    removedIds,
  };
}

/**
 * Remove one multi-line record (every mate in its `flowGroup` / bold-title
 * group) from a template-mode section, then re-pack with `applyFlowSpacing` so
 * sibling records and later sections close the hole under the template rhythm.
 *
 * Only upper-line anchors are accepted — the same eligibility as the hover
 * trash / "+" controls (`listUpperRecordMembers`).
 *
 * @param {object[]} elements
 * @param {string} elementId any upper-line member of the record to delete
 * @param {number} [pageHeight=842]
 * @param {{ spacing?: object }} [options]
 * @returns {{ elements: object[], removedIds: Set<string> }|null}
 */
export function removeRecordBlock(
  elements,
  elementId,
  pageHeight = 842,
  { spacing } = {},
) {
  const anchor = findRecordGroupForElement(elements, elementId, pageHeight);
  if (!anchor) return null;

  // Match the in-record "+" / trash UI: only upper title/meta lines may delete.
  if (!listUpperRecordMembers(anchor.group).some((member) => member.element_id === elementId)) {
    return null;
  }

  const removedIds = new Set(anchor.group.map((element) => element.element_id));
  if (removedIds.size === 0) return null;

  const remaining = (elements || []).filter(
    (element) => !removedIds.has(element.element_id),
  );
  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const next = applyFlowSpacing(remaining, rhythm, pageHeight);

  return {
    elements: next,
    removedIds,
  };
}

/**
 * Swap one multi-line record with its previous/next sibling in the same section,
 * then re-pack with `applyFlowSpacing` so the whole document keeps template rhythm.
 *
 * Only upper-line anchors are accepted (same eligibility as trash / "+" / arrows).
 *
 * @param {object[]} elements
 * @param {string} elementId any upper-line member of the record to move
 * @param {"up"|"down"} direction
 * @param {number} [pageHeight=842]
 * @param {{ spacing?: object }} [options]
 * @returns {{ elements: object[] }|null}
 */
export function reorderRecordBlock(
  elements,
  elementId,
  direction,
  pageHeight = 842,
  { spacing } = {},
) {
  if (direction !== "up" && direction !== "down") return null;

  const anchor = findRecordGroupForElement(elements, elementId, pageHeight);
  if (!anchor) return null;
  if (!listUpperRecordMembers(anchor.group).some((member) => member.element_id === elementId)) {
    return null;
  }

  const body = listSectionContentElements(elements, anchor.headingId, pageHeight);
  const groups = partitionSectionRecords(body);
  const index = groups.findIndex((group) => (
    group.some((member) => member.element_id === elementId)
  ));
  if (index < 0) return null;

  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= groups.length) return null;

  const order = groups.slice();
  const tmp = order[index];
  order[index] = order[swapWith];
  order[swapWith] = tmp;

  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const bodyIds = new Set(body.map((element) => element.element_id));
  const nonBody = (elements || []).filter((element) => !bodyIds.has(element.element_id));

  // Stack relocated records from the original first-record top so they stay
  // inside this section's Y band; applyFlowSpacing retargets real gaps.
  let cursorAbs = Math.min(
    ...groups.map((group) => absoluteTop(firstRealLine(group, pageHeight), pageHeight)),
  );
  const relocated = [];
  for (let groupIndex = 0; groupIndex < order.length; groupIndex += 1) {
    if (groupIndex > 0) cursorAbs += rhythm.record;
    const group = order[groupIndex];
    // Record-overlay lines (a date/location rail, Axis's date gutter, …) are
    // pinned beside a real content line rather than stacked below it — they
    // must not advance `cursorAbs` themselves, or every later line (and
    // every following record) drifts downward by the overlay's height, the
    // same corruption `sectionStructure.js`'s `compactSectionStrip` guards
    // against for density/reorder-at-the-section-level repacking. Real lines
    // are relocated first so each overlay's anchor already has its final
    // position when the overlay is placed.
    const overlays = [];
    let placedRealLine = false;
    for (const element of group) {
      if (isRecordOverlay(element, elements, pageHeight)) {
        overlays.push(element);
        continue;
      }
      if (placedRealLine) cursorAbs += rhythm.stack;
      const page = Math.max(1, Math.floor(cursorAbs / pageHeight) + 1);
      const top = cursorAbs - (page - 1) * pageHeight;
      relocated.push({ ...element, page, top });
      placedRealLine = true;
      cursorAbs += elementHeight(element);
    }
    for (const overlay of overlays) {
      const anchor = findGroupOverlayAnchor(group, overlay, pageHeight);
      const relocatedAnchor = anchor
        ? relocated.find((candidate) => candidate.element_id === anchor.element_id)
        : null;
      if (relocatedAnchor) {
        const delta = absoluteTop(overlay, pageHeight) - absoluteTop(anchor, pageHeight);
        const overlayAbs = absoluteTop(relocatedAnchor, pageHeight) + delta;
        const page = Math.max(1, Math.floor(overlayAbs / pageHeight) + 1);
        const top = overlayAbs - (page - 1) * pageHeight;
        relocated.push({ ...overlay, page, top });
      } else {
        // No anchor found in this group (should not happen for a
        // well-formed record) — fall back to sequential placement rather
        // than dropping the element.
        const page = Math.max(1, Math.floor(cursorAbs / pageHeight) + 1);
        const top = cursorAbs - (page - 1) * pageHeight;
        relocated.push({ ...overlay, page, top });
        cursorAbs += elementHeight(overlay);
      }
    }
  }

  const next = applyFlowSpacing([...nonBody, ...relocated], rhythm, pageHeight);
  return { elements: next };
}
