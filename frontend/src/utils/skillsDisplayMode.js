/**
 * Main-column skills layout picker: switch a Skills section (flat or with
 * subcategories) between the inline mid-dot row, a bullet list, or wrapped
 * chips. Chip mode additionally supports seven shape treatments; all share
 * the generator's wrapping geometry and persist through ordinary canvas
 * rectangle/line properties.
 *
 * Sidebar skills always stay `_skills_sidebar_content` (bullet list); this
 * picker only offers a mode change for a section already in the main column
 * (native, or after a sidebar → main lane transfer).
 */
import {
  applyFlowSpacing,
  deriveSectionStyle,
  isSidebarLaneElement,
  listDocumentSections,
  sectionElementIds,
} from "./sectionStructure.js";
import {
  SKILL_CHIP_VARIANT_PILL_FILLED,
  SKILLS_LAYOUT_MODES,
  SKILLS_LAYOUT_CHIPS,
  detectSkillChipVariant,
  detectSkillsDisplayMode,
  isSkillsSectionTitle,
  normalizeSkillChipVariant,
  resolveSkillChipColors,
  restyleSkillsMembersAsMode,
} from "./skillsLayout.js";

function absoluteTop(element, pageHeight) {
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

function absoluteBottom(element, pageHeight) {
  return absoluteTop(element, pageHeight) + elementHeight(element);
}

/**
 * List every main-column Skills section and its current display mode, for
 * the canvas hover control and the "Układ CV" panel.
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {{ headingId: string, mode: "inline"|"bullet"|"chips" }[]}
 */
export function listSkillsDisplayAnchors(elements, pageHeight = 842) {
  const list = elements || [];
  const sections = listDocumentSections(list, pageHeight);
  const anchors = [];
  for (const section of sections) {
    if (!isSkillsSectionTitle(section.title)) continue;
    const memberIds = sectionElementIds(list, section.headingId, pageHeight);
    if (memberIds.size === 0) continue;
    const members = list.filter((element) => memberIds.has(element.element_id));
    anchors.push({ headingId: section.headingId, mode: detectSkillsDisplayMode(members) });
  }
  return anchors;
}

/**
 * Report whether `elementId` is an editable textarea inside a main-column
 * Skills section that currently uses the inline mid-dot presentation.
 *
 * Section membership is used instead of translated labels or element-id
 * conventions, so user-added Skills sections and every template follow the
 * same editor contract. Heading textareas and bullet/chip variants are
 * deliberately excluded, as are bold category labels: a mid-dot action would
 * be misleading in those states.
 *
 * @param {object[]} elements
 * @param {string|null|undefined} elementId
 * @param {number} [pageHeight=842]
 * @returns {boolean}
 */
export function isInlineSkillsContentElement(elements, elementId, pageHeight = 842) {
  if (!elementId) return false;
  const list = elements || [];
  const target = list.find((element) => element.element_id === elementId);
  if (
    target?.category !== "textarea"
    || target.bulletList
    || target.bold
    || target.flowRole === "section-chrome"
    || target.flowRole === "sidebar-chrome"
  ) {
    return false;
  }

  return listSkillsDisplayAnchors(list, pageHeight).some((anchor) => (
    anchor.mode === "inline"
    && anchor.headingId !== elementId
    && sectionElementIds(list, anchor.headingId, pageHeight).has(elementId)
  ));
}

/**
 * Switch one main-column Skills section into `mode`, in place (does not move
 * or reorder the section), then re-pack the document under the live flow
 * spacing so every other section's chrome/gaps stay consistent
 * (`applyFlowSpacing` also runs `healSimpleChromeRuleGaps`).
 *
 * @param {object[]} elements
 * @param {string} headingId
 * @param {"inline"|"bullet"|"chips"} mode
 * @param {number} [pageHeight=842]
 * @param {object} [spacing]
 * @param {string} [chipVariant="pill-filled"]
 * @param {Function|null} [measureTextWidth]
 * @returns {object[]|null} null when the section cannot be found/converted or already has the requested mode and chip variant
 */
export function changeSkillsDisplayMode(
  elements,
  headingId,
  mode,
  pageHeight = 842,
  spacing,
  chipVariant = SKILL_CHIP_VARIANT_PILL_FILLED,
  measureTextWidth = null,
) {
  if (!SKILLS_LAYOUT_MODES.includes(mode)) return null;
  const list = elements || [];
  const section = listDocumentSections(list, pageHeight)
    .find((candidate) => candidate.headingId === headingId);
  if (!section || !isSkillsSectionTitle(section.title)) return null;

  const memberIds = sectionElementIds(list, headingId, pageHeight);
  if (memberIds.size === 0) return null;
  const members = list.filter((element) => memberIds.has(element.element_id));
  const currentMode = detectSkillsDisplayMode(members);
  const targetChipVariant = normalizeSkillChipVariant(chipVariant);
  if (
    currentMode === mode
    && (mode !== SKILLS_LAYOUT_CHIPS || detectSkillChipVariant(members) === targetChipVariant)
  ) return null;

  // Sample this section's OWN current geometry/type (not another section's) —
  // `deriveSectionStyle` samples whichever heading id it is given.
  const style = deriveSectionStyle(list, pageHeight, headingId, { lane: "main" });
  const { chipBg, chipFg } = resolveSkillChipColors(
    members,
    list,
    style,
    { chipVariant: targetChipVariant },
  );
  const parkTop = Math.min(...members.map((element) => absoluteTop(element, pageHeight)));

  const restyled = restyleSkillsMembersAsMode(
    members,
    headingId,
    { ...style, chipBg, chipFg, chipVariant: targetChipVariant },
    parkTop,
    spacing,
    mode,
    { measureTextWidth },
  );
  if (!restyled) return null;

  // Chips take more vertical room per item than the inline/bullet body they
  // replace (or less, going the other way). `sectionElementIds` attributes
  // membership by Y-interval against neighbouring sections' CURRENT (stale)
  // positions — if the new body grows past where the next section's heading
  // still sits, that heading's own membership sweep claims the overflowing
  // rows as ITS content before `applyFlowSpacing` ever gets a chance to push
  // it down, splitting one skill group across two sections. Shifting every
  // later same-lane element by the exact height delta first (same "open a
  // hole" fix as `insertRecordBlockAfterRecord` in sectionRecord.js) keeps
  // the boundary honest before membership is recomputed.
  const oldBottomAbs = Math.max(...members.map((element) => absoluteBottom(element, pageHeight)));
  const newBottomAbs = Math.max(...restyled.map((element) => absoluteBottom(element, pageHeight)));
  const delta = newBottomAbs - oldBottomAbs;

  const shifted = list
    .filter((element) => !memberIds.has(element.element_id))
    .map((element) => {
      if (delta === 0 || !element || element.fixedToPage) return element;
      if (element.flowRole === "masthead") return element;
      if (isSidebarLaneElement(element)) return element;
      if (absoluteTop(element, pageHeight) + 0.01 < oldBottomAbs) return element;
      const newAbs = absoluteTop(element, pageHeight) + delta;
      const page = Math.max(1, Math.floor(newAbs / pageHeight) + 1);
      const top = newAbs - (page - 1) * pageHeight;
      return { ...element, page, top };
    });

  const next = [...shifted, ...restyled];
  return applyFlowSpacing(next, spacing, pageHeight);
}
