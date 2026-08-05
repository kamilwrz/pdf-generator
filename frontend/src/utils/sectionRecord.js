/**
 * Append / insert records inside an existing template-mode section.
 *
 * Heading hover "+" appends a structured education/experience record that
 * clones the last multi-line group's field shape with Polish placeholders.
 *
 * Hovering any line of an existing record shows a second "+" that inserts a
 * single generic text block (`Tekst…`) immediately below that record — not a
 * structural clone. Both paths re-pack with `applyFlowSpacing`.
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
 * @param {object[]} members
 * @returns {"cc-edu"|"cc-exp"|null}
 */
export function inferRecordLayout(members) {
  const count = (members || []).length;
  if (count >= 4) return SECTION_LAYOUTS.RECORD_EDUCATION;
  if (count === 3) return SECTION_LAYOUTS.RECORD_EXPERIENCE;
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
 * Build cloned record elements with new ids, a fresh flowGroup, and placeholders.
 *
 * @param {object[]} members last record members in reading order
 * @param {() => string} [idFactory]
 * @returns {object[]}
 */
export function buildRecordClone(members, idFactory = nanoid) {
  const source = members || [];
  if (source.length === 0) return [];
  const placeholders = placeholderContentsForRecord(source);
  const group = `record-${idFactory()}`;
  return source.map((element, index) => {
    const next = {
      ...element,
      element_id: idFactory(),
      content: placeholders[index] ?? PLACEHOLDER.generic,
      flowGroup: group,
      flowRole: element.flowRole || "content",
      isSelected: false,
      isMove: false,
      isEditing: false,
    };
    // Fresh lines should shrink to measured content on mount like builder output.
    if (next.category === "textarea") {
      next.preserveInitialLayout = true;
    }
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
  const templateGroup = [...groups].reverse().find((group) => group.length >= 2);
  if (!templateGroup) return null;

  const clones = buildRecordClone(templateGroup, idFactory);
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
 * Whether a content element should offer the in-record "+" affordance.
 *
 * @param {object[]} elements
 * @param {string} elementId
 * @param {number} [pageHeight=842]
 * @returns {boolean}
 */
export function elementSupportsRecordBlockAdd(elements, elementId, pageHeight = 842) {
  return findRecordGroupForElement(elements, elementId, pageHeight) != null;
}

/**
 * Content element ids that may show the in-record "+" control.
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {Set<string>}
 */
export function listRecordBlockAddElementIds(elements, pageHeight = 842) {
  const ids = new Set();
  const sections = listDocumentSections(elements, pageHeight);
  for (const section of sections) {
    if (!sectionSupportsRecordAdd(elements, section.headingId, pageHeight)) {
      continue;
    }
    const body = listSectionContentElements(elements, section.headingId, pageHeight);
    for (const element of body) {
      ids.add(element.element_id);
    }
  }
  return ids;
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
 * Build one generic body textarea (not a structural clone of a record).
 *
 * Style is sampled from a non-bold line of the anchor record when possible so
 * the new block matches surrounding body type, not a bold title line.
 *
 * @param {object} sample
 * @param {() => string} [idFactory]
 * @returns {object}
 */
export function buildGenericTextBlock(sample, idFactory = nanoid) {
  const fontSize = Number(sample?.fontSize) || 9.3;
  const lineHeight = Number(sample?.lineHeight) || Math.round(fontSize * 1.4);
  const width = Number(sample?.width) || 466;
  const left = Number(sample?.left) || 66;
  const content = PLACEHOLDER.generic;
  return {
    element_id: idFactory(),
    category: "textarea",
    content,
    flowRole: "content",
    // Own keep-together id so a later structured record cannot absorb this line.
    flowGroup: `record-${idFactory()}`,
    autoHeight: true,
    preserveInitialLayout: true,
    left,
    top: Number(sample?.top) || 0,
    width,
    height: measurePlaceholderHeight(content, width, fontSize, lineHeight),
    fontSize,
    fontFamily: sample?.fontFamily || "Inter",
    lineHeight,
    letterSpacing: Number(sample?.letterSpacing) || 0,
    color: sample?.color || "#24201E",
    bold: false,
    italic: false,
    underline: false,
    align: sample?.align || "left",
    bulletList: false,
    isSelected: false,
    isMove: false,
    isEditing: false,
    locked: false,
    zIndex: Number.isFinite(Number(sample?.zIndex)) ? Number(sample.zIndex) : 4,
    page: Math.max(1, Math.trunc(Number(sample?.page) || 1)),
  };
}

/**
 * Insert a generic text block immediately below the record that owns
 * `afterElementId`, then re-pack the document rhythm.
 *
 * @param {object[]} elements
 * @param {string} afterElementId any member of the anchor record
 * @param {number} [pageHeight=842]
 * @param {{ spacing?: object, idFactory?: () => string }} [options]
 * @returns {{ elements: object[], firstBodyId: string|null }|null}
 */
export function insertGenericBlockAfterRecord(
  elements,
  afterElementId,
  pageHeight = 842,
  { spacing, idFactory = nanoid } = {},
) {
  const anchor = findRecordGroupForElement(elements, afterElementId, pageHeight);
  if (!anchor) return null;

  const { headingId, group, body } = anchor;
  const lastMate = group[group.length - 1];
  // Prefer body-weight styling over a bold title line for the generic block.
  const styleSample = [...group].reverse().find((member) => !member.bold)
    || group.find((member) => member.element_id === afterElementId)
    || lastMate;

  const block = buildGenericTextBlock(styleSample, idFactory);
  const rhythm = normalizeFlowSpacing(spacing || DEFAULT_FLOW_SPACING);

  const sections = listDocumentSections(elements, pageHeight);
  const sectionIndex = sections.findIndex((section) => section.headingId === headingId);
  const nextSectionStart = sectionIndex >= 0 && sectionIndex + 1 < sections.length
    ? sections[sectionIndex + 1].startAbs
    : Number.POSITIVE_INFINITY;
  const bandCeiling = Number.isFinite(nextSectionStart)
    ? nextSectionStart - 0.05
    : null;

  // Sit just under the anchor record so section membership stays correct
  // before applyFlowSpacing expands gaps and pushes following sections.
  let cursorAbs = absoluteBottom(lastMate, pageHeight) + rhythm.record;
  if (bandCeiling != null) {
    cursorAbs = Math.min(cursorAbs, bandCeiling);
  }
  const page = Math.max(1, Math.floor(cursorAbs / pageHeight) + 1);
  const top = cursorAbs - (page - 1) * pageHeight;
  const placed = { ...block, page, top };

  // Splice after the last mate in document order so reading order matches Y.
  const list = elements || [];
  const mateIndex = list.findIndex((element) => element.element_id === lastMate.element_id);
  const withBlock = mateIndex >= 0
    ? [
      ...list.slice(0, mateIndex + 1),
      placed,
      ...list.slice(mateIndex + 1),
    ]
    : [...list, placed];

  const next = applyFlowSpacing(withBlock, rhythm, pageHeight);

  // Verify the new block landed in this section after pack (band theft guard).
  const packedBody = listSectionContentElements(next, headingId, pageHeight);
  if (!packedBody.some((element) => element.element_id === placed.element_id)) {
    return null;
  }

  return {
    elements: next,
    firstBodyId: placed.element_id,
  };
}
