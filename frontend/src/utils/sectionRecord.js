/**
 * Append / insert records inside an existing template-mode section.
 *
 * Heading hover "+" appends a structured education/experience record that
 * clones the last multi-line group's field shape with Polish placeholders.
 *
 * Hovering the upper part of an existing record (title / meta, not the bullet
 * description) shows a second "+" that inserts another full placeholder record
 * immediately below that record. Both paths re-pack with `applyFlowSpacing`.
 */

import { nanoid } from "nanoid";
import { DEFAULT_FLOW_SPACING, normalizeFlowSpacing } from "./flowSpacing.js";
import { SECTION_LAYOUTS } from "./sectionBuilder.js";
import {
  applyFlowSpacing,
  isDecorativeOrdinalChrome,
  isSectionHeading,
  listDocumentSections,
  sectionElementIds,
} from "./sectionStructure.js";

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
    "Firma · okres",
    "Opis…",
  ]),
  generic: "Tekst…",
});

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
  const ids = sectionElementIds(elements, headingId, pageHeight);
  const members = (elements || []).filter((element) => {
    if (!element || !ids.has(element.element_id)) return false;
    if (element.element_id === headingId) return false;
    if (element.fixedToPage) return false;
    if (element.flowRole === "section-chrome" || element.flowRole === "masthead") {
      return false;
    }
    if (isDecorativeOrdinalChrome(element)) return false;
    // Never treat another section title inside the band as a record line.
    if (isSectionHeading(element, elements, pageHeight)) return false;
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
 * @param {object[]} elements
 * @param {string} headingId
 * @param {number} [pageHeight=842]
 * @returns {boolean}
 */
export function sectionSupportsRecordAdd(elements, headingId, pageHeight = 842) {
  const body = listSectionContentElements(elements, headingId, pageHeight);
  if (body.length < 2) return false;
  const groups = partitionSectionRecords(body);
  return groups.some((group) => group.length >= 2);
}

/**
 * Infer placeholder layout from a record's line count / shape.
 *
 * Education is degree + school + meta + optional bullets (3 lines without a
 * bulletList still count as education — wizard often omits the description).
 * Experience is title + company·period + bullets (the last line is a list).
 *
 * @param {object[]} members
 * @returns {"cc-edu"|"cc-exp"|null}
 */
export function inferRecordLayout(members) {
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
  return null;
}

/**
 * Placeholder strings for a cloned record.
 *
 * @param {object[]} members
 * @returns {string[]}
 */
export function placeholderContentsForRecord(members) {
  const layout = inferRecordLayout(members);
  if (layout === SECTION_LAYOUTS.RECORD_EDUCATION) {
    return [...PLACEHOLDER.education];
  }
  if (layout === SECTION_LAYOUTS.RECORD_EXPERIENCE) {
    return [...PLACEHOLDER.experience];
  }
  return (members || []).map((element, index) => {
    if (element?.bulletList) return PLACEHOLDER.education[3];
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
 *
 * @param {object[]} members
 * @param {object[][]|null} [sectionGroups] other records in the section
 * @returns {object[]}
 */
export function ensureCanonicalRecordTemplate(members, sectionGroups = null) {
  const source = members || [];
  if (source.length === 0) return source;

  const layout = inferRecordLayout(source);
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
 * @returns {object[]}
 */
export function buildRecordClone(members, idFactory = nanoid, sectionGroups = null) {
  const source = ensureCanonicalRecordTemplate(members, sectionGroups);
  if (source.length === 0) return [];
  const placeholders = placeholderContentsForRecord(source);
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

  const clones = buildRecordClone(templateGroup, idFactory, groups);
  if (clones.length === 0) return null;

  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const lastBody = body[body.length - 1];

  // New lines must stay inside this section's absolute band so
  // `sectionElementIds` attributes them here before `applyFlowSpacing`
  // expands the strip and pushes following sections down. Placing a tall
  // record at its natural height could land past the next heading and steal
  // the lines into the wrong section.
  const sections = listDocumentSections(elements, pageHeight);
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
  const sections = listDocumentSections(elements, pageHeight);
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
 * One "+" anchor per record: mounted on the title line, listening to all upper
 * lines (title / meta) so a single control covers the whole upper block.
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {{ elementId: string, hoverIds: string[], left: number, top: number, height: number, fontSize: number }[]}
 */
export function listRecordBlockAddAnchors(elements, pageHeight = 842) {
  const anchors = [];
  const sections = listDocumentSections(elements, pageHeight);
  for (const section of sections) {
    if (!sectionSupportsRecordAdd(elements, section.headingId, pageHeight)) {
      continue;
    }
    const body = listSectionContentElements(elements, section.headingId, pageHeight);
    for (const group of partitionSectionRecords(body)) {
      const upper = listUpperRecordMembers(group);
      if (upper.length === 0) continue;
      const title = upper[0];
      anchors.push({
        elementId: title.element_id,
        hoverIds: upper.map((element) => element.element_id),
        left: Number(title.left) || 0,
        top: Number(title.top) || 0,
        height: Number(title.height) || 0,
        fontSize: Number(title.fontSize) || 10,
      });
    }
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

  const clones = buildRecordClone(templateGroup, idFactory, groups);
  if (clones.length === 0) return null;

  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);
  const lastMate = group[group.length - 1];
  const anchorIds = new Set(group.map((element) => element.element_id));
  const sectionIds = sectionElementIds(elements, headingId, pageHeight);

  const cloneStackHeight = clones.reduce((sum, element, index) => (
    sum + elementHeight(element) + (index > 0 ? rhythm.stack : 0)
  ), 0);
  // Reserve the full insert height (+ record gap) so following titles are not
  // still sitting inside the new stack's Y range when compactSectionStrip
  // sorts by absoluteTop — that interleaving was merging "Uczelnia" into the
  // next degree line before pack could separate flowGroups.
  const hole = cloneStackHeight + rhythm.record;
  const thresholdAbs = absoluteBottom(lastMate, pageHeight);

  const list = (elements || []).map((element) => {
    if (!element || !sectionIds.has(element.element_id)) return element;
    if (anchorIds.has(element.element_id)) return element;
    if (element.flowRole === "section-chrome" || element.flowRole === "masthead") {
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
