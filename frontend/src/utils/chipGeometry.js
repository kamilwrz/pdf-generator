/**
 * Pure geometry for wrapped skill-chip pills — no project imports, so both
 * `skillsLayout.buildSkillsChipGroups` (fresh chip rows) and
 * `sectionStructure.healOrphanedGridMemberChips` (repairing already-saved
 * broken chip rows) can share the exact same wrap math without importing
 * from each other. `skillsLayout.js` already imports from
 * `sectionStructure.js`, so `sectionStructure.js` cannot import back from
 * `skillsLayout.js` without a circular dependency — this module is the
 * shared leaf both sides depend on instead.
 */

/** Horizontal/vertical pill padding and gaps, px — mirrors backend `CHIP_PAD_*`/`CHIP_GAP_*`. */
export const CHIP_PAD_X = 10;
export const CHIP_PAD_Y = 5;
export const CHIP_GAP_X = 8;
export const CHIP_GAP_Y = 8;

/**
 * @param {string} text
 * @param {number} fontSize
 * @returns {number}
 */
export function estimateTextWidth(text, fontSize) {
  return Math.max(1, String(text || "").length) * (Number(fontSize) || 9) * 0.56;
}

/**
 * Wrap one category's skill chips into rows, mirroring the backend's
 * `_layout_skill_chips` greedy left-to-right wrap so the canvas and a
 * regenerated PDF wrap identically.
 *
 * @param {string[]} items
 * @param {number} width
 * @param {number} fontSize
 * @returns {{ placements: { skill: string, dx: number, dy: number, width: number }[], height: number }}
 */
export function layoutSkillChips(items, width, fontSize) {
  const cleaned = (items || []).map((item) => String(item || "").trim()).filter(Boolean);
  if (cleaned.length === 0) return { placements: [], height: 0 };
  const chipH = fontSize + 2 * CHIP_PAD_Y;
  const rowStep = chipH + CHIP_GAP_Y;
  const placements = [];
  let cx = 0;
  let cy = 0;
  let rowStarted = false;
  for (const skill of cleaned) {
    const chipW = estimateTextWidth(skill, fontSize) + 2 * CHIP_PAD_X;
    if (rowStarted && cx + chipW > width) {
      cx = 0;
      cy += rowStep;
      rowStarted = false;
    }
    placements.push({ skill, dx: cx, dy: cy, width: chipW });
    cx += chipW + CHIP_GAP_X;
    rowStarted = true;
  }
  return { placements, height: cy + chipH };
}
