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
  sectionElementIds,
} from "./sectionStructure.js";
import { collectSkillGroups, isSkillsSectionElement } from "./skillsLayout.js";
import {
  isLanguagesGridSection,
  parseLanguageLine,
} from "./languagesLayout.js";

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
  if (layout === SECTION_LAYOUTS.GRID) {
    // One grid cell is one semantic item, even when the user inserts a line
    // break inside that cell. Splitting on newlines here would create extra
    // columns after the next template fill.
    return (body || [])
      .filter((element) => (
        ["text", "textarea"].includes(element?.category)
        && element?.flowRole === "grid-member"
      ))
      .map(profileTextForElement)
      .filter(Boolean);
  }
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
    // Category and body are independent editable fields, not a colon-delimited
    // project title. Preserve line breaks, duplicate records and list mode.
    return groups.map((group) => ({
      title: roleValue(group, "title"),
      body: roleValue(group, "body"),
      bulletList: Boolean(group.find((element) => element.editorRecordField === "body")?.bulletList),
    })).filter((record) => record.title || record.body);
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
      ...([SECTION_LAYOUTS.GRID, SECTION_LAYOUTS.RECORD_SUBCATEGORY].includes(layout) ? { layout } : {}),
      __canvasHeadingId: heading.element_id,
    };
    // Guest/profile normalization can remove canvas ids while retaining the
    // original marked canvas. Reattach only an unambiguous category section;
    // otherwise the first refill after reload would append a duplicate.
    if (layout === SECTION_LAYOUTS.RECORD_SUBCATEGORY) {
      const matches = draft.custom_sections.filter((candidate) => (
        !candidate.__canvasHeadingId && foldLabel(candidate.title) === foldLabel(custom.title)
      ));
      if (matches.length === 1 && markedHeadings.filter((candidate) => (
        foldLabel(profileTextForElement(candidate)) === foldLabel(custom.title)
      )).length === 1) {
        matches[0].__canvasHeadingId = heading.element_id;
      }
    }
    draft.custom_sections = upsertByCanvasId(
      draft.custom_sections,
      "__canvasHeadingId",
      custom,
    );
  }

  for (const [groupId, members] of markedGroups) {
    const section = sectionForGroup(elements, groupId);
    if (!section) continue;
    // Explicit custom category sections are synchronized as a whole below,
    // including newly cloned records; heading words must not route them to skills.
    const heading = elements.find((element) => element.element_id === section.headingId);
    if (heading?.editorSectionLayout === SECTION_LAYOUTS.RECORD_SUBCATEGORY) continue;
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
 * Read canonical language entries from a generated Languages grid.
 *
 * Editor-created grid sections are intentionally excluded: their marked
 * heading is persisted through `custom_sections` by `syncEditorStructures`.
 * This bridge is for a template's canonical `cv_data.languages` array, whose
 * generated cells do not otherwise carry editor semantic ids.
 *
 * @param {object[]} elements
 * @returns {{ name: string, level: string }[]|null}
 */
function generatedLanguageGridEntries(elements) {
  const list = elements || [];
  const section = canvasSections(list).find((candidate) => {
    const heading = list.find((element) => element?.element_id === candidate.headingId);
    const cells = listSectionContentElements(list, candidate.headingId)
      .filter((element) => (
        element?.flowRole === "grid-member"
        && ["text", "textarea"].includes(element?.category)
      ));
    return heading
      && !heading.editorAddedSection
      && isLanguagesGridSection([heading, ...cells], candidate.title);
  });
  if (!section) return null;

  const cells = listSectionContentElements(list, section.headingId)
    .filter((element) => (
      element?.flowRole === "grid-member"
      && ["text", "textarea"].includes(element?.category)
    ))
    .sort((left, right) => {
      const leftTop = ((Number(left?.page) || 1) - 1) * 842 + (Number(left?.top) || 0);
      const rightTop = ((Number(right?.page) || 1) - 1) * 842 + (Number(right?.top) || 0);
      if (Math.abs(leftTop - rightTop) > 0.01) return leftTop - rightTop;
      return (Number(left?.left) || 0) - (Number(right?.left) || 0);
    });
  if (cells.length === 0) return null;

  // One grid cell is one semantic language entry. Empty cells are represented
  // by the same visible placeholder used by the add action, so switching a
  // template cannot silently reduce the number of cells while one is being
  // edited or has just been cleared.
  return cells.map((cell) => {
    const entry = parseLanguageLine(profileTextForElement(cell));
    return entry.name ? entry : { name: "Język", level: "poziom" };
  });
}

/**
 * Snapshot the current generated Languages grid immediately before a template
 * refill, without waiting for React's canvas-to-profile synchronization effect.
 *
 * Textarea commits every contentEditable `input` event into `A4_Elements`, so
 * an entry that is still in edit mode is already represented by this snapshot;
 * no focus-dependent DOM read is needed after a template button takes focus.
 *
 * @param {object|null} cvData
 * @param {object[]} elements
 * @returns {object|null}
 */
export function syncGeneratedLanguagesForTemplateSwitch(cvData, elements) {
  if (!cvData || !Array.isArray(elements)) return cvData || null;
  const languages = generatedLanguageGridEntries(elements);
  if (!languages || JSON.stringify(languages) === JSON.stringify(cvData.languages || [])) {
    return cvData;
  }
  const draft = cloneProfile(cvData);
  draft.languages = languages;
  return draft;
}

/**
 * Persist add/remove/reorder/text edits performed directly on a generated
 * Languages grid. Geometry-only repacks remain reference-equal no-ops.
 *
 * @param {object} cvData
 * @param {object[]} previousElements
 * @param {object[]} nextElements
 * @returns {object}
 */
function syncGeneratedLanguageGrid(cvData, previousElements, nextElements) {
  const previous = generatedLanguageGridEntries(previousElements);
  const next = generatedLanguageGridEntries(nextElements);
  if (!previous || !next || JSON.stringify(previous) === JSON.stringify(next)) {
    return cvData;
  }
  const draft = cloneProfile(cvData);
  draft.languages = next;
  return draft;
}

/**
 * Read semantic Skills groups from the generated main-column section.
 * Layout mode is irrelevant: collectSkillGroups understands inline, bullet,
 * and chip element graphs and returns the same category/item representation.
 */
function generatedSkillsSection(elements) {
  const list = elements || [];
  return listDocumentSections(list).find((candidate) => {
    const heading = list.find((element) => element?.element_id === candidate.headingId);
    return heading && !heading.editorAddedSection
      && heading.editorSectionLayout !== SECTION_LAYOUTS.RECORD_SUBCATEGORY
      && isSkillsSectionElement(heading);
  });
}

function generatedSkillsEntries(elements, currentSkills = []) {
  const list = elements || [];
  const section = generatedSkillsSection(list);
  if (!section) return null;
  const memberIds = sectionElementIds(list, section.headingId);
  const members = list.filter((element) => memberIds.has(element.element_id));
  // A section containing editor-stamped records is owned by
  // `syncEditorStructures`. Mixing that exact semantic mapping with heuristic
  // generated-group parsing could flatten a partially restored category while
  // its old deletion tombstone is still waiting for the autosave pass.
  if (members.some((element) => element?.editorAddedRecord)) return null;
  const groups = collectSkillGroups(members, section.headingId)
    .map((group) => ({
      category: String(group?.category || "").trim(),
      items: (group?.items || []).map((item) => String(item || "").trim()).filter(Boolean),
    }))
    .filter((group) => group.category || group.items.length > 0);
  if (groups.length === 0) return [];

  if (groups.every((group) => !group.category)) {
    return [...new Set(groups.flatMap((group) => group.items))];
  }
  const currentGroups = (Array.isArray(currentSkills) ? currentSkills : [])
    .filter((item) => item && typeof item === "object" && !Array.isArray(item));
  return groups.map((group) => {
    const existing = currentGroups.find((candidate) => (
      String(candidate?.category || candidate?.title || "").trim().toLocaleLowerCase("pl-PL")
      === group.category.toLocaleLowerCase("pl-PL")
    ));
    return { ...(existing || {}), category: group.category, items: group.items };
  });
}

/**
 * Snapshot generated Skills immediately before a template refill. This closes
 * the same one-effect timing gap handled for Languages, so a just-confirmed
 * skill cannot disappear when the user changes the template immediately.
 */
export function syncGeneratedSkillsForTemplateSwitch(cvData, elements) {
  if (!cvData || !Array.isArray(elements)) return cvData || null;
  const skills = generatedSkillsEntries(elements, cvData.skills);
  if (!skills || JSON.stringify(skills) === JSON.stringify(cvData.skills || [])) {
    return cvData;
  }
  const draft = cloneProfile(cvData);
  draft.skills = skills;
  return draft;
}

function syncGeneratedSkillsSection(cvData, previousElements, nextElements) {
  const previous = generatedSkillsEntries(previousElements, cvData.skills);
  const next = generatedSkillsEntries(nextElements, cvData.skills);
  if (!previous || !next || JSON.stringify(previous) === JSON.stringify(next)) {
    return cvData;
  }
  const draft = cloneProfile(cvData);
  draft.skills = next;
  return draft;
}

function generatedSkillsContentIds(elements) {
  const list = elements || [];
  const section = generatedSkillsSection(list);
  if (!section) return new Set();
  const memberIds = sectionElementIds(list, section.headingId);
  return new Set(
    list
      .filter((element) => (
        element?.element_id !== section.headingId
        && memberIds.has(element?.element_id)
        && ["text", "textarea"].includes(element?.category)
        && element?.flowRole !== "section-chrome"
      ))
      .map((element) => element.element_id),
  );
}

/**
 * Read generator-restored custom layouts and keep their semantic items current.
 *
 * A template replacement necessarily creates fresh canvas ids, so restored
 * custom sections are matched to `custom_sections` by their current (or previous)
 * heading. The explicit `gridKind: "entries"` marker prevents a user-created
 * section named JĘZYKI from being confused with canonical language data.
 */
function generatedCustomLayoutSections(elements) {
  const list = elements || [];
  return canvasSections(list).flatMap((section) => {
    const heading = list.find((element) => element?.element_id === section.headingId);
    if (!heading || heading.editorAddedSection) return [];
    if (heading.editorSectionLayout === SECTION_LAYOUTS.RECORD_SUBCATEGORY) {
      return [{
        headingId: section.headingId,
        title: profileTextForElement(heading),
        layout: SECTION_LAYOUTS.RECORD_SUBCATEGORY,
        items: customSectionItems(listSectionContentElements(list, section.headingId), SECTION_LAYOUTS.RECORD_SUBCATEGORY),
      }];
    }
    const cells = listSectionContentElements(list, section.headingId)
      .filter((element) => (
        ["text", "textarea"].includes(element?.category)
        && element?.flowRole === "grid-member"
        && element?.gridKind === "entries"
      ));
    if (cells.length === 0) return [];
    return [{
      headingId: section.headingId,
      title: profileTextForElement(heading),
      layout: SECTION_LAYOUTS.GRID,
      items: cells.map(profileTextForElement).filter(Boolean),
    }];
  });
}

function syncGeneratedCustomLayouts(cvData, previousElements, nextElements) {
  const nextGrids = generatedCustomLayoutSections(nextElements);
  const sections = Array.isArray(cvData?.custom_sections) ? cvData.custom_sections : [];
  if (nextGrids.length === 0 || sections.length === 0) return cvData;

  const previousByHeading = new Map(
    generatedCustomLayoutSections(previousElements)
      .map((section) => [section.headingId, section]),
  );
  let draft = cvData;
  for (const grid of nextGrids) {
    const previousTitle = previousByHeading.get(grid.headingId)?.title;
    const matchingIndices = sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => section?.layout === grid.layout);
    let match = matchingIndices.find(({ section }) => (
      foldLabel(section?.title) === foldLabel(grid.title)
    ));
    if (!match && previousTitle) {
      match = matchingIndices.find(({ section }) => (
        foldLabel(section?.title) === foldLabel(previousTitle)
      ));
    }
    if (!match && matchingIndices.length === 1 && nextGrids.length === 1) {
      [match] = matchingIndices;
    }
    if (!match) continue;

    const current = (draft === cvData ? sections : draft.custom_sections)[match.index];
    const updated = {
      ...current,
      title: grid.title,
      items: grid.items,
      layout: grid.layout,
    };
    if (JSON.stringify(current) === JSON.stringify(updated)) continue;
    if (draft === cvData) draft = cloneProfile(cvData);
    draft.custom_sections[match.index] = updated;
  }
  return draft;
}

/**
 * Snapshot custom layouts before refill, even if the canvas synchronization
 * effect has not run yet. Existing editor-stamped category sections are also
 * upgraded from the old flattened profile while their field structure survives.
 * No geometry or unrelated profile fields are changed.
 */
export function syncCustomSectionsForTemplateSwitch(cvData, elements) {
  if (!cvData || !Array.isArray(elements)) return cvData || null;
  return syncGeneratedCustomLayouts(syncEditorStructures(cvData, elements), elements, elements);
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

/**
 * Collect semantic identifiers for editor-authored structures that still exist
 * on the canvas.
 *
 * Generated template groups deliberately do not participate. Their identifiers
 * are layout-only and cannot safely override the legacy tombstone fallback.
 */
function liveCanvasStructureIds(elements) {
  const groups = new Set();
  const sections = new Set();
  for (const element of elements || []) {
    if (element?.editorAddedRecord && element?.flowGroup) {
      groups.add(element.flowGroup);
    }
    if (element?.editorAddedSection && element?.editorSectionId) {
      sections.add(element.editorSectionId);
    }
  }
  return { groups, sections };
}

function isLiveCanvasStructure(value, liveStructureIds) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && (
      liveStructureIds.groups.has(value.__canvasGroup)
      || liveStructureIds.sections.has(value.__canvasHeadingId)
    )
  );
}

/**
 * Remove legacy records matched by deleted canvas text with structural sharing.
 *
 * Tombstones remain queued until an explicit save, so the same deletion is
 * processed after `activeCvData` changes. Returning the original reference
 * when nothing is removed prevents that repeated pass from scheduling another
 * React state update. A live editor-authored structure is authoritative over a
 * legacy tombstone with matching copy: that tombstone refers to the old canvas
 * ids and must not erase a replacement the user has just added.
 */
function pruneDeletedRecords(value, deletedTexts, liveStructureIds) {
  if (Array.isArray(value)) {
    let changed = false;
    const next = [];
    for (const item of value) {
      // Protect the complete semantic subtree. Custom sections can contain
      // nested records whose copy overlaps a retained legacy tombstone.
      if (isLiveCanvasStructure(item, liveStructureIds)) {
        next.push(item);
        continue;
      }
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const leaves = stringLeaves(item);
        if (leaves.some((leaf) => deletedTexts.has(leaf))) {
          changed = true;
          continue;
        }
      }
      const pruned = pruneDeletedRecords(item, deletedTexts, liveStructureIds);
      if (pruned !== item) changed = true;
      next.push(pruned);
    }
    return changed ? next : value;
  }
  if (!value || typeof value !== "object") return value;
  let changed = false;
  const entries = Object.entries(value).map(([key, item]) => {
    const pruned = pruneDeletedRecords(item, deletedTexts, liveStructureIds);
    if (pruned !== item) changed = true;
    return [key, pruned];
  });
  return changed ? Object.fromEntries(entries) : value;
}

/**
 * Remove records carrying explicit canvas ids while preserving unchanged refs.
 *
 * This has the same idempotency requirement as the legacy text fallback: a
 * retained tombstone must become a reference-equal no-op after its first pass.
 */
function pruneCanvasStructures(value, deletedGroupIds, deletedSectionIds) {
  if (Array.isArray(value)) {
    let changed = false;
    const next = [];
    for (const item of value) {
      if (
        item
        && typeof item === "object"
        && !Array.isArray(item)
        && (
          deletedGroupIds.has(item.__canvasGroup)
          || deletedSectionIds.has(item.__canvasHeadingId)
        )
      ) {
        changed = true;
        continue;
      }
      const pruned = pruneCanvasStructures(item, deletedGroupIds, deletedSectionIds);
      if (pruned !== item) changed = true;
      next.push(pruned);
    }
    return changed ? next : value;
  }
  if (!value || typeof value !== "object") return value;
  let changed = false;
  const entries = Object.entries(value).map(([key, item]) => {
    const pruned = pruneCanvasStructures(item, deletedGroupIds, deletedSectionIds);
    if (pruned !== item) changed = true;
    return [key, pruned];
  });
  return changed ? Object.fromEntries(entries) : value;
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
    return from && from !== to ? [{ elementId: next.element_id, from, to }] : [];
  });
}

function setProfilePath(profile, path, value) {
  if (!Array.isArray(path) || path.length === 0) return profile;
  let cursor = profile;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (cursor[key] == null || typeof cursor[key] !== "object") {
      cursor[key] = typeof path[index + 1] === "number" ? [] : {};
    }
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
  return profile;
}

/**
 * Apply starter bindings before the legacy text matcher. Empty starter fields
 * have no previous cv_data string to match, while composite metadata rows map
 * one visible value to several paths in a deterministic left-to-right order.
 */
function syncStarterBindings(cvData, previousElements, nextElements) {
  const previousById = new Map(
    previousElements.filter((element) => element?.element_id)
      .map((element) => [element.element_id, element]),
  );
  let draft = cvData;
  for (const next of nextElements) {
    const bindings = Array.isArray(next?.cvDataBindings) ? next.cvDataBindings : [];
    const previous = previousById.get(next?.element_id);
    if (!previous || bindings.length === 0 || previous.content === next.content) continue;
    const content = profileTextForElement(next);
    const values = bindings.length === 1
      ? [content]
      : splitMeta(content, bindings.length);
    if (draft === cvData) draft = cloneProfile(cvData);
    bindings.forEach((binding, index) => {
      setProfilePath(draft, binding?.path, values[index] || "");
    });
  }
  return draft;
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

  const liveStructureIds = liveCanvasStructureIds(nextElements);
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
  // Editor-stamped tombstones stay semantic after their profile record is gone.
  // Without this stable classification, the next effect pass could downgrade
  // the same tombstone to text matching and remove an unrelated duplicate.
  const identifiedDeleteIds = new Set(
    markedRecordDeletes
      .filter((element) => (
        canvasIdentifiedDeletes.includes(element)
        || element?.editorAddedRecord
        || element?.editorAddedSection
      ))
      .map((element) => element.element_id),
  );
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
    nextProfile = pruneDeletedRecords(nextProfile, deletedTexts, liveStructureIds);
  }
  nextProfile = syncEditorStructures(nextProfile, nextElements);
  nextProfile = syncGeneratedLanguageGrid(
    nextProfile,
    previousElements,
    nextElements,
  );
  nextProfile = syncGeneratedSkillsSection(
    nextProfile,
    previousElements,
    nextElements,
  );
  nextProfile = syncGeneratedCustomLayouts(
    nextProfile,
    previousElements,
    nextElements,
  );
  nextProfile = syncStarterBindings(nextProfile, previousElements, nextElements);
  const titleEdit = editedMastheadTitle(previousElements, nextElements);
  if (
    titleEdit
    && String(nextProfile?.title ?? "").trim() !== titleEdit.content
  ) {
    if (nextProfile === cvData) nextProfile = cloneProfile(cvData);
    nextProfile.title = titleEdit.content;
  }
  // Skills are synchronized as a complete semantic section above. Excluding
  // those same canvas fields from the generic string mapper prevents an
  // appended inline value (for example `Figma · Miro`) from replacing the
  // original `Figma` leaf that was just preserved as the first list item.
  const generatedSkillIds = new Set([
    ...generatedSkillsContentIds(previousElements),
    ...generatedSkillsContentIds(nextElements),
  ]);
  for (const { elementId, from, to } of editableTextChanges(previousElements, nextElements)) {
    if (generatedSkillIds.has(elementId)) continue;
    // Category fields were already synchronized by their section identity.
    // A matching old string elsewhere is unrelated, even if now unique.
    if (nextElements.some((element) => element.element_id === elementId
      && (element.editorRecordLayout === SECTION_LAYOUTS.RECORD_SUBCATEGORY
        || element.editorSectionLayout === SECTION_LAYOUTS.RECORD_SUBCATEGORY))) continue;
    if (countStringLeaves(nextProfile, from) !== 1) continue;
    if (nextProfile === cvData) nextProfile = cloneProfile(cvData);
    nextProfile = replaceUniqueString(nextProfile, from, to);
  }
  if (nextProfile === cvData) return cvData;
  // A retained semantic tombstone (for example after restoring the same group)
  // can still prune and re-upsert an equal structure within one call. Preserve
  // the public no-op contract so the React synchronization effect cannot loop
  // on a value-equivalent profile with a fresh reference.
  return JSON.stringify(nextProfile) === JSON.stringify(cvData) ? cvData : nextProfile;
}
