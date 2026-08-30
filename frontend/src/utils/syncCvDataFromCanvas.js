/**
 * Keep the profile used for template regeneration aligned with direct canvas
 * text edits and structural additions. Canvas geometry remains the source of
 * truth for the current layout; this utility stores only semantic content in
 * the normalized profile, never coordinates or presentation styling.
 *
 * Template generators split one profile into multiple canvas text elements.
 * Replacing a value only when its previous text occurs once in the profile
 * avoids silently changing two unrelated fields with the same wording.
 * User-created records/sections carry explicit editor semantic tags, which
 * allow exact profile upserts even while multiple placeholders are identical.
 * Structural deletion is identified by `deletedRecord` tombstones, so removing
 * one freeform text box never removes its whole profile record.
 */

import { SECTION_LAYOUTS } from "./sectionBuilder.js";
import {
  listSectionContentElements,
  partitionSectionRecords,
} from "./sectionRecord.js";
import {
  listDocumentSections,
  listSidebarSections,
} from "./sectionStructure.js";

function cloneProfile(cvData) {
  return JSON.parse(JSON.stringify(cvData));
}

function countStringLeaves(value, target) {
  if (typeof value === "string") return value === target ? 1 : 0;
  if (Array.isArray(value)) {
    return value.reduce((count, item) => count + countStringLeaves(item, target), 0);
  }
  if (!value || typeof value !== "object") return 0;
  return Object.values(value).reduce(
    (count, item) => count + countStringLeaves(item, target),
    0,
  );
}

function replaceUniqueString(value, from, to) {
  if (typeof value === "string") return value === from ? to : value;
  if (Array.isArray(value)) return value.map((item) => replaceUniqueString(item, from, to));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, replaceUniqueString(item, from, to)]),
  );
}

function stringLeaves(value) {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(stringLeaves);
}

function profileTextForElement(element) {
  const content = String(element?.content ?? "").trim();
  if (!element?.bulletList) return content;

  // Template renderers add visual list markers while cv_data stores the plain
  // source sentence. Compare and persist the source form so an AI translation
  // of `• Polish text` can update `Polish text` in the profile.
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[•*–—-]\s*)+/, ""))
    .join("\n")
    .trim();
}

function foldLabel(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function contentLines(element) {
  return profileTextForElement(element)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitMeta(value, expectedParts) {
  const parts = String(value || "")
    .split(/\s*[·|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return Array(expectedParts).fill("");
  if (parts.length >= expectedParts) {
    return [
      ...parts.slice(0, expectedParts - 1),
      parts.slice(expectedParts - 1).join(" · "),
    ];
  }
  return [...parts, ...Array(expectedParts - parts.length).fill("")];
}

function roleValue(members, role) {
  const element = (members || []).find((candidate) => candidate?.editorRecordField === role);
  return element ? profileTextForElement(element) : "";
}

function recordLayout(members) {
  return (members || []).find((element) => element?.editorRecordLayout)?.editorRecordLayout
    || null;
}

/**
 * Convert a user-added canvas record to the normalized profile shape.
 *
 * The editor tags fields when it clones a record, so right-column overlays and
 * vertically stacked metadata use the same extraction path. Combined legacy
 * metadata remains supported by splitting the visible `·` separators.
 */
function profileRecordFromCanvas(members, kind) {
  const layout = recordLayout(members);
  const description = (members || [])
    .filter((element) => element?.editorRecordField === "description" || element?.bulletList)
    .flatMap(contentLines);

  if (kind === "education" || layout === SECTION_LAYOUTS.RECORD_EDUCATION) {
    let city = roleValue(members, "city");
    let period = roleValue(members, "period");
    const [metaCity, metaPeriod] = splitMeta(roleValue(members, "meta"), 2);
    city ||= metaCity;
    period ||= metaPeriod;
    return {
      degree: roleValue(members, "degree") || roleValue(members, "title"),
      school: roleValue(members, "school") || roleValue(members, "organization"),
      city,
      period,
      description: description.join("\n"),
    };
  }

  if (kind === "skills" || layout === SECTION_LAYOUTS.RECORD_SUBCATEGORY) {
    const body = roleValue(members, "body");
    return {
      category: roleValue(members, "title"),
      items: body ? [body] : [],
    };
  }

  let company = roleValue(members, "organization");
  let city = roleValue(members, "city");
  let period = roleValue(members, "period");
  const [metaCompany, metaCity, metaPeriod] = splitMeta(roleValue(members, "meta"), 3);
  company ||= metaCompany;
  city ||= metaCity;
  period ||= metaPeriod;
  return {
    title: roleValue(members, "title") || roleValue(members, "degree"),
    company,
    city,
    period,
    bullets: description,
  };
}

function customRecordFromCanvas(members) {
  const layout = recordLayout(members);
  const record = profileRecordFromCanvas(
    members,
    layout === SECTION_LAYOUTS.RECORD_EDUCATION ? "education" : "experience",
  );
  if (layout === SECTION_LAYOUTS.RECORD_EDUCATION) {
    return {
      title: record.degree,
      subtitle: [record.school, record.city, record.period].filter(Boolean).join(" · "),
      bullets: record.description ? record.description.split(/\r?\n/).filter(Boolean) : [],
    };
  }
  return {
    title: record.title,
    subtitle: [record.company, record.city, record.period].filter(Boolean).join(" · "),
    bullets: record.bullets,
  };
}

function sectionKind(cvData, title) {
  const folded = foldLabel(title);
  const labels = cvData?.labels || {};
  if (folded && folded === foldLabel(labels.experience)) return "experience";
  if (folded && folded === foldLabel(labels.education)) return "education";
  if (folded && folded === foldLabel(labels.skills)) return "skills";
  if (/doswiad|experience|employment|work history/.test(folded)) return "experience";
  if (/wyksztalc|edukac|education|school|studia/.test(folded)) return "education";
  if (/umiejet|skills|kompetenc/.test(folded)) return "skills";
  return "custom";
}

function canvasSections(elements) {
  return [
    ...listDocumentSections(elements || []),
    ...listSidebarSections(elements || []),
  ];
}

function sectionForGroup(elements, groupId) {
  for (const section of canvasSections(elements)) {
    const body = listSectionContentElements(elements, section.headingId);
    if (body.some((element) => element?.flowGroup === groupId)) {
      return { ...section, body };
    }
  }
  return null;
}

function customSectionItems(body, layout) {
  const groups = partitionSectionRecords(body || []);
  if (
    layout === SECTION_LAYOUTS.RECORD_EDUCATION
    || layout === SECTION_LAYOUTS.RECORD_EXPERIENCE
  ) {
    return groups.map((group) => ({
      ...customRecordFromCanvas(group),
      ...(group[0]?.flowGroup ? { __canvasGroup: group[0].flowGroup } : {}),
    }));
  }
  if (layout === SECTION_LAYOUTS.RECORD_SUBCATEGORY) {
    return groups.flatMap((group) => {
      const record = profileRecordFromCanvas(group, "skills");
      if (record.category && record.items.length) {
        return [`${record.category}: ${record.items.join(", ")}`];
      }
      return [record.category, ...record.items].filter(Boolean);
    });
  }
  return (body || [])
    .filter((element) => ["text", "textarea"].includes(element?.category))
    .flatMap(contentLines);
}

function placementForSection(section, elements, layout) {
  if (layout === SECTION_LAYOUTS.RECORD_EDUCATION || layout === SECTION_LAYOUTS.RECORD_EXPERIENCE) {
    return "after_experience";
  }
  const sections = canvasSections(elements);
  const current = sections.findIndex((candidate) => candidate.headingId === section.headingId);
  const experience = sections.findIndex((candidate) => (
    /doswiad|experience|employment|work history/.test(foldLabel(candidate.title))
  ));
  const skills = sections.findIndex((candidate) => (
    /umiejet|skills|kompetenc/.test(foldLabel(candidate.title))
  ));
  return experience >= 0 && current > experience && (skills < 0 || current < skills)
    ? "after_experience"
    : "after_skills";
}

function upsertByCanvasId(items, marker, value, preferredIndex = null) {
  const list = Array.isArray(items) ? items : [];
  const index = list.findIndex((item) => item?.[marker] === value?.[marker]);
  if (index < 0) {
    if (Number.isInteger(preferredIndex)) {
      const insertAt = Math.max(0, Math.min(preferredIndex, list.length));
      return [...list.slice(0, insertAt), value, ...list.slice(insertAt)];
    }
    return [...list, value];
  }
  return list.map((item, itemIndex) => (itemIndex === index ? value : item));
}

/**
 * Persist editor-created records and sections in cv_data.
 *
 * Only elements explicitly stamped by the structural add controls participate.
 * A template replacement gives every generated element a new id but no editor
 * stamp, so it cannot be mistaken for a batch of newly added profile records.
 */
function syncEditorStructures(cvData, elements) {
  const markedHeadings = (elements || []).filter((element) => (
    element?.editorAddedSection
    && element?.editorSectionId === element?.element_id
    && ["text", "textarea"].includes(element?.category)
  ));
  const markedGroups = new Map();
  for (const element of elements || []) {
    if (!element?.editorAddedRecord || !element?.flowGroup || element?.editorAddedSection) continue;
    const group = markedGroups.get(element.flowGroup) || [];
    group.push(element);
    markedGroups.set(element.flowGroup, group);
  }
  if (markedHeadings.length === 0 && markedGroups.size === 0) return cvData;

  const draft = cloneProfile(cvData);
  draft.custom_sections = Array.isArray(draft.custom_sections) ? draft.custom_sections : [];

  for (const heading of markedHeadings) {
    const section = canvasSections(elements).find((candidate) => (
      candidate.headingId === heading.element_id
    ));
    if (!section) continue;
    const body = listSectionContentElements(elements, heading.element_id);
    const layout = heading.editorSectionLayout
      || body.find((element) => element?.editorRecordLayout)?.editorRecordLayout
      || SECTION_LAYOUTS.TEXTAREA;
    const custom = {
      title: profileTextForElement(heading),
      items: customSectionItems(body, layout),
      kind: (
        layout === SECTION_LAYOUTS.RECORD_EDUCATION
        || layout === SECTION_LAYOUTS.RECORD_EXPERIENCE
      ) ? "projects" : "other",
      placement: placementForSection(section, elements, layout),
      __canvasHeadingId: heading.element_id,
    };
    draft.custom_sections = upsertByCanvasId(
      draft.custom_sections,
      "__canvasHeadingId",
      custom,
    );
  }

  for (const [groupId, members] of markedGroups) {
    const section = sectionForGroup(elements, groupId);
    if (!section) continue;
    const kind = sectionKind(draft, section.title);
    const marker = { __canvasGroup: groupId };
    const visualIndex = partitionSectionRecords(section.body).findIndex((group) => (
      group.some((element) => element?.flowGroup === groupId)
    ));
    if (kind === "experience") {
      const value = { ...profileRecordFromCanvas(members, kind), ...marker };
      draft.experience = upsertByCanvasId(
        draft.experience,
        "__canvasGroup",
        value,
        visualIndex,
      );
      continue;
    }
    if (kind === "education") {
      const value = { ...profileRecordFromCanvas(members, kind), ...marker };
      draft.education = upsertByCanvasId(
        draft.education,
        "__canvasGroup",
        value,
        visualIndex,
      );
      continue;
    }
    if (kind === "skills") {
      const value = { ...profileRecordFromCanvas(members, kind), ...marker };
      draft.skills = upsertByCanvasId(
        draft.skills,
        "__canvasGroup",
        value,
        visualIndex,
      );
      continue;
    }

    const foldedTitle = foldLabel(section.title);
    let customIndex = draft.custom_sections.findIndex((candidate) => (
      foldLabel(candidate?.title) === foldedTitle
    ));
    if (customIndex < 0) {
      draft.custom_sections.push({
        title: section.title,
        items: [],
        kind: "projects",
        placement: "after_experience",
      });
      customIndex = draft.custom_sections.length - 1;
    }
    const current = draft.custom_sections[customIndex];
    const value = { ...customRecordFromCanvas(members), ...marker };
    draft.custom_sections[customIndex] = {
      ...current,
      kind: ["projects", "references", "awards", "publications", "volunteering"]
        .includes(current.kind) ? current.kind : "projects",
      items: upsertByCanvasId(current.items, "__canvasGroup", value, visualIndex),
    };
  }

  return JSON.stringify(draft) === JSON.stringify(cvData) ? cvData : draft;
}

/**
 * Return whether the same canvas id now represents a different structural
 * text node rather than an edit of the original semantic field.
 *
 * Lane transfers and layout conversions may replace a category/body pair with
 * one aggregate textarea. Older documents could reuse a source id for that new
 * node, so content equality alone is not enough to establish identity. Writing
 * the aggregate text back into `cv_data` would turn an entire Skills section
 * into one category and duplicate its remaining items on the next template
 * fill. Only structurally stable nodes are eligible for profile synchronization.
 */
function isStructuralTextRemap(previous, next) {
  const normalized = (value) => value ?? null;
  return (
    normalized(previous?.category) !== normalized(next?.category)
    || normalized(previous?.flowLane) !== normalized(next?.flowLane)
    || normalized(previous?.flowRole) !== normalized(next?.flowRole)
    || normalized(previous?.flowGroup) !== normalized(next?.flowGroup)
    || Boolean(previous?.bulletList) !== Boolean(next?.bulletList)
  );
}

function pruneDeletedRecords(value, deletedTexts) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return true;
        }
        const leaves = stringLeaves(item);
        const matched = leaves.filter((leaf) => deletedTexts.has(leaf));
        return matched.length === 0;
      })
      .map((item) => pruneDeletedRecords(item, deletedTexts));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, pruneDeletedRecords(item, deletedTexts)]),
  );
}

function pruneCanvasStructures(value, deletedGroupIds, deletedSectionIds) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !(
        item
        && typeof item === "object"
        && !Array.isArray(item)
        && (
          deletedGroupIds.has(item.__canvasGroup)
          || deletedSectionIds.has(item.__canvasHeadingId)
        )
      ))
      .map((item) => pruneCanvasStructures(item, deletedGroupIds, deletedSectionIds));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      pruneCanvasStructures(item, deletedGroupIds, deletedSectionIds),
    ]),
  );
}

function canvasStructureIds(value, groups = new Set(), sections = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => canvasStructureIds(item, groups, sections));
    return { groups, sections };
  }
  if (!value || typeof value !== "object") return { groups, sections };
  if (value.__canvasGroup) groups.add(value.__canvasGroup);
  if (value.__canvasHeadingId) sections.add(value.__canvasHeadingId);
  Object.values(value).forEach((item) => canvasStructureIds(item, groups, sections));
  return { groups, sections };
}

function editableTextChanges(previousElements, nextElements) {
  const previousById = new Map(
    previousElements
      .filter((element) => element?.element_id)
      .map((element) => [element.element_id, element]),
  );

  return nextElements.flatMap((next) => {
    if (!next?.element_id || !["text", "textarea"].includes(next.category)) return [];
    const previous = previousById.get(next.element_id);
    if (!previous || previous.content === next.content) return [];
    // The semantic title mapper below owns this field. Letting the generic
    // unique-string pass process the same edit can mutate a different profile
    // leaf when the old title text is duplicated elsewhere in the CV.
    if (previous.mastheadRole === "title" || next.mastheadRole === "title") return [];
    // Editor-created structures have an explicit field-to-profile mapping.
    // Running the ambiguous unique-string mapper as well could mutate an
    // unrelated placeholder when two freshly added records still share copy.
    if (
      previous.editorAddedRecord || next.editorAddedRecord
      || previous.editorAddedSection || next.editorAddedSection
    ) return [];
    if (isStructuralTextRemap(previous, next)) return [];
    const from = profileTextForElement(previous);
    const to = profileTextForElement(next);
    // An accepted AI shortening can intentionally clear a field. Ignoring an
    // empty `to` value would make the old profile text return on the next
    // template fill, even though the canvas correctly shows it removed.
    return from && from !== to ? [{ from, to }] : [];
  });
}

/**
 * Read an explicit semantic edit of the professional title.
 *
 * A title created through the masthead `+` control starts as a new, empty
 * element. The generic unique-string mapper intentionally ignores new ids and
 * empty source strings, so it cannot observe the first value typed into that
 * field. `mastheadRole` is an unambiguous contract shared by every managed
 * template and lets this one root profile property be synchronized directly.
 * Removing the element is not treated as a data deletion: hide/show is a
 * presentation choice and must not erase the title used by another template.
 */
function editedMastheadTitle(previousElements, nextElements) {
  const nextTitle = nextElements.find((element) => (
    element?.mastheadRole === "title"
    && ["text", "textarea"].includes(element.category)
  ));
  if (!nextTitle) return null;

  const previousTitle = previousElements.find((element) => (
    element?.element_id === nextTitle.element_id
    && element?.mastheadRole === "title"
  ));
  if (previousTitle) {
    if (previousTitle.content === nextTitle.content) return null;
    return { content: profileTextForElement(nextTitle) };
  }

  // A legitimate `+` materialisation keeps the same identity anchor and flips
  // only its `title.present` flag. A template replacement gives every element,
  // including the anchor, a fresh id; treating that replacement as an edit
  // would persist generator-truncated display copy back into `cv_data.title`.
  const nextAnchor = nextElements.find((element) => (
    element?.flowRole === "masthead-anchor"
    && element?.mastheadBandId === nextTitle.mastheadBandId
    && element?.mastheadIdentity
  ));
  const previousAnchor = nextAnchor
    ? previousElements.find((element) => (
      element?.element_id === nextAnchor.element_id
      && element?.flowRole === "masthead-anchor"
      && element?.mastheadBandId === nextTitle.mastheadBandId
      && element?.mastheadIdentity
    ))
    : null;
  const addedInsideExistingBand = (
    previousAnchor?.mastheadIdentity?.title?.present === false
    && nextAnchor?.mastheadIdentity?.title?.present === true
  );
  if (!addedInsideExistingBand) return null;
  return { content: profileTextForElement(nextTitle) };
}

/**
 * Apply direct text edits and editor-created structures to a CV profile.
 *
 * Added Experience, Education, Skills, and custom-section structures are
 * stored before a template refill. Generated replacement canvases do not carry
 * the editor-add tags, preventing an entire new template from being re-added.
 *
 * @param {object|null} cvData - Current structured CV profile.
 * @param {object[]} previousElements - Canvas state before an edit.
 * @param {object[]} nextElements - Canvas state after an edit.
 * @param {object[]} deletedElements - Tombstones emitted by structural deletes.
 * @returns {object|null} The updated profile, or the original when nothing changed.
 */
export function syncCvDataFromCanvas(
  cvData,
  previousElements,
  nextElements,
  deletedElements = [],
) {
  if (!cvData || !Array.isArray(previousElements) || !Array.isArray(nextElements)) {
    return cvData || null;
  }

  const markedRecordDeletes = deletedElements.filter((element) => element?.deletedRecord);
  const deletedGroupIds = new Set(
    markedRecordDeletes.map((element) => element?.flowGroup).filter(Boolean),
  );
  const deletedSectionIds = new Set(
    markedRecordDeletes.map((element) => element?.editorSectionId).filter(Boolean),
  );
  const knownStructureIds = canvasStructureIds(cvData);
  const canvasIdentifiedDeletes = markedRecordDeletes.filter((element) => (
    element?.flowGroup && knownStructureIds.groups.has(element.flowGroup)
  ) || (
    element?.editorSectionId
    && knownStructureIds.sections.has(element.editorSectionId)
  ));
  const identifiedDeleteIds = new Set(canvasIdentifiedDeletes.map((element) => element.element_id));
  const deletedTexts = new Set(
    deletedElements
      .filter((element) => element?.deletedRecord && !identifiedDeleteIds.has(element.element_id))
      .flatMap((element) => stringLeaves(element?.content))
      .map((text) => text.trim())
      .filter(Boolean),
  );
  let nextProfile = deletedGroupIds.size > 0 || deletedSectionIds.size > 0
    ? pruneCanvasStructures(cvData, deletedGroupIds, deletedSectionIds)
    : cvData;
  if (markedRecordDeletes.length > 0 && deletedTexts.size > 0) {
    nextProfile = pruneDeletedRecords(nextProfile, deletedTexts);
  }
  nextProfile = syncEditorStructures(nextProfile, nextElements);
  const titleEdit = editedMastheadTitle(previousElements, nextElements);
  if (
    titleEdit
    && String(nextProfile?.title ?? "").trim() !== titleEdit.content
  ) {
    if (nextProfile === cvData) nextProfile = cloneProfile(cvData);
    nextProfile.title = titleEdit.content;
  }
  for (const { from, to } of editableTextChanges(previousElements, nextElements)) {
    if (countStringLeaves(nextProfile, from) !== 1) continue;
    if (nextProfile === cvData) nextProfile = cloneProfile(cvData);
    nextProfile = replaceUniqueString(nextProfile, from, to);
  }
  return nextProfile;
}
