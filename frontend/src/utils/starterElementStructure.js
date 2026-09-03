/**
 * Adds structural starter metadata after backend template materialization and
 * produces a compact render-only copy. The editable element array is never
 * mutated or stripped, so empty guidance survives saving and reopening.
 */
import { applyChannelRelayout } from "./contactBandOps.js";
import {
  alignSidebarAfterProfileContacts,
  hideProfilePhoto,
} from "./profilePhotoVisibility.js";
import {
  listDocumentSections,
  listSidebarSections,
  packDocumentSections,
  packSidebarLane,
  removeSection,
  sectionElementIds,
  sidebarSectionElementIds,
} from "./sectionStructure.js";
import { finalizeStarterElements } from "./cvStarter.js";
import { compactExperienceMetadata } from "./experienceMetadata.js";

function contactBandIds(elements) {
  return [...new Set((elements || [])
    .filter((element) => (
      element.flowRole === "masthead-anchor"
      && element.contactBandId
      && element.contactBand
    ))
    .map((element) => element.contactBandId))];
}

/**
 * Rebuild every generated contact row from the current visible values.
 *
 * Backend generation initially lays out technical starter sentinels. Once the
 * sentinels become empty editor fields, the same contact-band engine used by
 * live typing must run again so centered/wrapping rows use placeholder widths.
 * The sidebar alignment pass keeps Slate and Linden sections below their final
 * contact stack after a photo-state transition.
 */
function reflowStarterContacts(source, templateId) {
  let elements = source || [];
  let generatedId = 0;
  const createId = () => `starter-contact-reflow-${generatedId += 1}`;
  for (const bandId of contactBandIds(elements)) {
    elements = applyChannelRelayout(elements, bandId, null, createId).elements;
    elements = alignSidebarAfterProfileContacts(elements, bandId, templateId);
  }
  return elements;
}

function fold(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SECTION_ALIASES = {
  summary: ["podsumowanie", "podsumowanie zawodowe", "profil"],
  experience: ["doswiadczenie", "doswiadczenie zawodowe"],
  education: ["wyksztalcenie", "edukacja"],
  skills: ["umiejetnosci", "kompetencje"],
  languages: ["jezyki", "jezyki obce"],
};

function sectionMatches(section, definition) {
  const title = fold(section.title);
  const candidates = definition.custom
    ? [definition.title]
    : [definition.title, ...(SECTION_ALIASES[definition.key] || [])];
  return candidates.some((candidate) => {
    const normalized = fold(candidate);
    return normalized && (title === normalized || title.includes(normalized));
  });
}

function orderedHeadingIds(sections, structure) {
  const priority = new Map((structure?.sections || []).map((item, index) => [item.key, index]));
  return [...sections]
    .sort((left, right) => {
      const leftPriority = priority.get(left.starterSectionKey) ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = priority.get(right.starterSectionKey) ?? Number.MAX_SAFE_INTEGER;
      return leftPriority - rightPriority || left.index - right.index;
    })
    .map((section) => section.headingId);
}

/**
 * Finalize marker fields, tag complete section groups, apply the chosen order
 * independently to main/sidebar lanes, and honor the template photo choice.
 */
export function applyStarterElementStructure(rawElements, cvData, templateId, pageHeight = 842) {
  const structure = cvData?.starter_structure;
  if (!structure) return rawElements || [];
  let elements = finalizeStarterElements(rawElements);
  const definitions = structure.sections || [];

  const tagLane = (sections, idsForSection) => {
    const claimed = new Set();
    for (const definition of definitions) {
      const match = sections.find((section) => (
        !claimed.has(section.headingId) && sectionMatches(section, definition)
      ));
      if (!match) continue;
      claimed.add(match.headingId);
      const memberIds = idsForSection(elements, match.headingId, pageHeight);
      elements = elements.map((element) => (
        memberIds.has(element.element_id)
          ? { ...element, starterSectionKey: definition.key }
          : element
      ));
    }
  };

  tagLane(listDocumentSections(elements, pageHeight), sectionElementIds);
  tagLane(listSidebarSections(elements, pageHeight), sidebarSectionElementIds);

  const main = listDocumentSections(elements, pageHeight).map((section) => ({
    ...section,
    starterSectionKey: elements.find((item) => item.element_id === section.headingId)?.starterSectionKey,
  }));
  if (main.length > 1) {
    elements = packDocumentSections(elements, orderedHeadingIds(main, structure), pageHeight);
  }
  const sidebar = listSidebarSections(elements, pageHeight).map((section) => ({
    ...section,
    starterSectionKey: elements.find((item) => item.element_id === section.headingId)?.starterSectionKey,
  }));
  if (sidebar.length > 1) {
    elements = packSidebarLane(elements, pageHeight, {
      orderedHeadingIds: orderedHeadingIds(sidebar, structure),
      forceTargets: true,
    });
  }

  if (!structure.includePhoto) {
    elements = hideProfilePhoto(
      elements,
      templateId,
      (part) => `starter-photo-${part}`,
    ).elements;
  } else {
    elements = elements.map((element) => (
      element.photoSlot
        ? {
          ...element,
          // Only the generated portrait glyph represents the empty value.
          // Frame/ornament chrome must survive once a real image is applied.
          starterPlaceholder: element.photoSlot === "glyph",
          starterSectionKey: "photo",
        }
        : element
    ));
  }
  return reflowStarterContacts(elements, templateId);
}

function hasRealStarterContent(element) {
  if (!["text", "textarea"].includes(element?.category)) return false;
  if (!Array.isArray(element.cvDataBindings) || element.cvDataBindings.length === 0) return false;
  return Boolean(String(element.content || "").trim());
}

/**
 * Return a renderer-only clone without untouched contacts, photo chrome, or
 * empty sections. `removeSection` repacks each lane using the same structural
 * rules as the editor, closing gaps while leaving the source array unchanged.
 */
export function prepareStarterElementsForRender(source, pageHeight = 842, templateId = null) {
  let elements = (source || []).map((element) => compactExperienceMetadata({ ...element }));
  const emptySectionKeys = new Set();
  const sectionKeys = new Set(elements.map((element) => element.starterSectionKey).filter(Boolean));
  for (const key of sectionKeys) {
    if (key === "photo") continue;
    const members = elements.filter((element) => element.starterSectionKey === key);
    if (!members.some(hasRealStarterContent)) emptySectionKeys.add(key);
  }

  for (const key of emptySectionKeys) {
    const heading = elements.find((element) => (
      element.starterSectionKey === key
      && ["section-chrome", "sidebar-chrome"].includes(element.flowRole)
      && ["text", "textarea"].includes(element.category)
    ));
    const removed = heading ? removeSection(elements, heading.element_id, pageHeight) : null;
    elements = removed?.elements || elements.filter((element) => element.starterSectionKey !== key);
  }

  const emptyChannels = new Set();
  for (const channel of new Set(elements.map((element) => element.contactChannel).filter(Boolean))) {
    const labels = elements.filter((element) => (
      element.contactChannel === channel
      && ["text", "textarea"].includes(element.category)
      && Array.isArray(element.cvDataBindings)
    ));
    if (labels.length > 0 && labels.every((element) => !String(element.content || "").trim())) {
      emptyChannels.add(channel);
    }
  }

  // Removing empty channels is a render-only transformation. Reflow the
  // remaining members afterwards so an optional gap never survives in the PDF.
  elements = elements.filter((element) => !emptyChannels.has(element.contactChannel));
  elements = reflowStarterContacts(elements, templateId);

  const hasRealPhoto = elements.some((element) => (
    element.photoSlot === "image"
    && element.category === "image"
    && String(element.src || "").trim()
    && !element.starterPlaceholder
  ));
  return elements.filter((element) => {
    if (element.starterSectionKey === "photo" && !hasRealPhoto) return false;
    // Empty Skills groups keep a real chip shell on the editor canvas so the
    // placeholder has the same visual affordance as a future skill. The shape
    // is guidance, not authored document content, and must leave together with
    // its empty label in every PDF/render-only copy.
    if (
      element.starterPlaceholder
      && element.flowRole === "grid-member"
      && (element.category === "rectangle" || element.category === "line")
    ) return false;
    if (
      ["text", "textarea"].includes(element.category)
      && element.starterPlaceholder
      && !String(element.content || "").trim()
    ) return false;
    return true;
  });
}
