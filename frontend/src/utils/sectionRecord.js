/**
 * Append / insert / remove / reorder records inside an existing template-mode
 * section.
 *
 * Heading / record hover "+" appends a structured record that clones the last
 * multi-line group's field shape with Polish placeholders:
 * education (4 lines), experience (3), or skills subcategory (bold heading +
 * body — 2 lines).
 *
 * Hovering the upper part of an existing record (title / meta, not the bullet
 * description) shows "+" / trash on the left and up/down arrows on the right.
 * Insert, delete, and reorder all re-pack with `applyFlowSpacing`.
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
    "Nazwa dyplomu",
    "Uczelnia",
    "Miasto · okres",
    "Opis…",
  ]),
  experience: Object.freeze([
    "Stanowisko",
    "Firma · Lokalizacja · okres",
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
  const count = list.length;
  if (count >= 4) return SECTION_LAYOUTS.RECORD_EDUCATION;
  if (count === 3) {
    if (list.some((element) => element.bulletList)) {
      return SECTION_LAYOUTS.RECORD_EXPERIENCE;
    }
    // degree / school / city·period without description
    return SECTION_LAYOUTS.RECORD_EDUCATION;
  }
  // Bare 2-line bold+body is ambiguous (subcategory vs short education).
  if (count === 2 && list[0]?.bold && isSubcategorySectionTitle(options.sectionTitle)) {
    return SECTION_LAYOUTS.RECORD_SUBCATEGORY;
  }
  return null;
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
 * @param {{ sectionTitle?: string|null }} [options]
 * @returns {object[]}
 */
export function buildRecordClone(
  members,
  idFactory = nanoid,
  sectionGroups = null,
  options = {},
) {
  const sectionTitle = options.sectionTitle ?? null;
  const source = ensureCanonicalRecordTemplate(members, sectionGroups, {
    sectionTitle,
  });
  if (source.length === 0) return [];
  const placeholders = placeholderContentsForRecord(source, { sectionTitle });
  const group = `record-${idFactory()}`;
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
      autoHeight: element.category === "text" ? Boolean(element.autoHeight) : true,
      preserveInitialLayout: true,
      left: Number(element.left) || 66,
      top: 0,
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
    };
    // Preserve sidebar lane so cloned records stay in the rail packer.
    if (element.flowLane === "sidebar") next.flowLane = "sidebar";
    return next;
  });
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
  });
  if (clones.length === 0) return null;

  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const lastBody = body[body.length - 1];
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

  const placedClones = clones.map((element) => {
    let abs = cursorAbs;
    if (bandCeiling != null) {
      abs = Math.min(abs, bandCeiling);
    }
    const page = Math.max(1, Math.floor(abs / pageHeight) + 1);
    const top = abs - (page - 1) * pageHeight;
    const placed = { ...element, page, top };
    if (intoSidebar) placed.flowLane = "sidebar";
    // Micro-advance under a tight ceiling so every clone stays in-band even
    // when stacked on top of each other; the packer resolves real gaps.
    cursorAbs = bandCeiling != null
      ? abs + 0.01
      : abs + elementHeight(element) + rhythm.stack;
    return placed;
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
 * One affordance anchor per record: mounted on the title line, listening to all
 * upper lines (title / meta) so a single control cluster covers the whole upper
 * block. Includes reorder flags when the section has sibling records.
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
 *   canMoveUp: boolean,
 *   canMoveDown: boolean,
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
    groups.forEach((group, groupIndex) => {
      const upper = listUpperRecordMembers(group);
      if (upper.length === 0) return;
      const title = upper[0];
      anchors.push({
        elementId: title.element_id,
        hoverIds: upper.map((element) => element.element_id),
        left: Number(title.left) || 0,
        top: Number(title.top) || 0,
        height: Number(title.height) || 0,
        width: Number(title.width) || 0,
        fontSize: Number(title.fontSize) || 10,
        canMoveUp: groupIndex > 0,
        canMoveDown: groupIndex < groups.length - 1,
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
  });
  if (clones.length === 0) return null;

  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const lastMate = group[group.length - 1];
  const anchorIds = new Set(group.map((element) => element.element_id));
  const intoSidebar = Boolean(heading && isSidebarSectionHeading(heading));

  const cloneStackHeight = clones.reduce((sum, element, index) => (
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

  let cursorAbs = thresholdAbs + rhythm.record;
  const placedClones = clones.map((element) => {
    const page = Math.max(1, Math.floor(cursorAbs / pageHeight) + 1);
    const top = cursorAbs - (page - 1) * pageHeight;
    const placed = { ...element, page, top };
    if (intoSidebar) placed.flowLane = "sidebar";
    cursorAbs += elementHeight(element) + rhythm.stack;
    return placed;
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
    ...groups.map((group) => absoluteTop(group[0], pageHeight)),
  );
  const relocated = [];
  for (let groupIndex = 0; groupIndex < order.length; groupIndex += 1) {
    if (groupIndex > 0) cursorAbs += rhythm.record;
    const group = order[groupIndex];
    for (let lineIndex = 0; lineIndex < group.length; lineIndex += 1) {
      const element = group[lineIndex];
      if (lineIndex > 0) cursorAbs += rhythm.stack;
      const page = Math.max(1, Math.floor(cursorAbs / pageHeight) + 1);
      const top = cursorAbs - (page - 1) * pageHeight;
      relocated.push({ ...element, page, top });
      cursorAbs += elementHeight(element);
    }
  }

  const next = applyFlowSpacing([...nonBody, ...relocated], rhythm, pageHeight);
  return { elements: next };
}
