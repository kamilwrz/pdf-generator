/**
 * Main-column skills layout picker: switch a Skills section (flat or with
 * subcategories) between the inline mid-dot row, a bullet list, or wrapped
 * chip pills — one mode for the whole section, matching how the backend
 * generators render it (`_place_skills_section(mode=...)`).
 *
 * Sidebar skills always stay `_skills_sidebar_content` (bullet list); this
 * picker only offers a mode change for a section already in the main column
 * (native, or after a sidebar → main lane transfer).
 */
import {
  applyFlowSpacing,
  deriveSectionStyle,
  listDocumentSections,
  sectionElementIds,
} from "./sectionStructure.js";
import {
  SKILLS_LAYOUT_MODES,
  detectSkillsDisplayMode,
  isSkillsSectionTitle,
  resolveSkillChipColors,
  restyleSkillsMembersAsMode,
} from "./skillsLayout.js";

function absoluteTop(element, pageHeight) {
  const page = Math.max(1, Math.trunc(Number(element?.page) || 1));
  return (page - 1) * pageHeight + (Number(element?.top) || 0);
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
 * @returns {object[]|null} null when the section cannot be found/converted or is already in `mode`
 */
export function changeSkillsDisplayMode(elements, headingId, mode, pageHeight = 842, spacing) {
  if (!SKILLS_LAYOUT_MODES.includes(mode)) return null;
  const list = elements || [];
  const section = listDocumentSections(list, pageHeight)
    .find((candidate) => candidate.headingId === headingId);
  if (!section || !isSkillsSectionTitle(section.title)) return null;

  const memberIds = sectionElementIds(list, headingId, pageHeight);
  if (memberIds.size === 0) return null;
  const members = list.filter((element) => memberIds.has(element.element_id));
  if (detectSkillsDisplayMode(members) === mode) return null;

  // Sample this section's OWN current geometry/type (not another section's) —
  // `deriveSectionStyle` samples whichever heading id it is given.
  const style = deriveSectionStyle(list, pageHeight, headingId, { lane: "main" });
  const { chipBg, chipFg } = resolveSkillChipColors(members, list, style);
  const parkTop = Math.min(...members.map((element) => absoluteTop(element, pageHeight)));

  const restyled = restyleSkillsMembersAsMode(
    members, headingId, { ...style, chipBg, chipFg }, parkTop, spacing, mode,
  );
  if (!restyled) return null;

  const next = [
    ...list.filter((element) => !memberIds.has(element.element_id)),
    ...restyled,
  ];
  return applyFlowSpacing(next, spacing, pageHeight);
}
