/**
 * Progressive page-fit engine (pure — no React state).
 *
 * Finds the LOOSEST spacing rhythm that fits a CV on a target page count,
 * descending only as far as necessary toward MIN_FLOW_SPACING. Never returns
 * the tightest fit. After AI shortening, the same search (with COMPACT as the
 * tight end) relaxes spacing back toward baseline to reclaim whitespace.
 *
 * layoutDensity.js's proposeAutoFitSpacing has a different objective
 * (balance/fill density around baseline); this module keeps the page-count
 * target objective separate so the two never tangle in one scorer.
 */
import {
  COMPACT_FLOW_SPACING,
  MIN_FLOW_SPACING,
  normalizeFlowSpacing,
} from "./flowSpacing.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { collapseSpilledMainIntoSidebar } from "./collapseMainIntoSidebar.js";
import { contentMaxPage } from "./structureOperation.js";

const KNOBS = ["stack", "record", "section", "after_rule"];

/**
 * A monotone ladder of `steps + 1` candidate rhythms interpolating per-knob
 * from `loosest` (index 0) to `tightest` (last). Endpoints are exact.
 *
 * @param {object} loosest
 * @param {object} tightest
 * @param {number} [steps=10]
 * @returns {object[]}
 */
export function buildSpacingLadder(loosest, tightest, steps = 10) {
  const from = normalizeFlowSpacing(loosest);
  const to = normalizeFlowSpacing(tightest);
  const count = Math.max(1, Math.trunc(steps));
  const ladder = [];
  for (let i = 0; i <= count; i += 1) {
    if (i === 0) { ladder.push(from); continue; }
    if (i === count) { ladder.push(to); continue; }
    const t = i / count;
    const candidate = {};
    for (const key of KNOBS) {
      candidate[key] = Math.round(from[key] + (to[key] - from[key]) * t);
    }
    ladder.push(normalizeFlowSpacing(candidate));
  }
  return ladder;
}

/** Per-knob tolerance so a candidate that rounds onto the floor reads as floor. */
const FLOOR_EPSILON = 1;

/**
 * Where a fitting rhythm sits between the compact preset and the hard floor.
 * `"impossible"` is never returned here — findFitForTarget assigns it when
 * nothing on the ladder fits.
 *
 * @param {object} spacing
 * @param {{ compact?: object, floor?: object }} [refs]
 * @returns {"clean"|"tight"|"emergency"}
 */
export function classifyFitTier(
  spacing,
  { compact = COMPACT_FLOW_SPACING, floor = MIN_FLOW_SPACING } = {},
) {
  const s = normalizeFlowSpacing(spacing);
  const c = normalizeFlowSpacing(compact);
  const f = normalizeFlowSpacing(floor);
  if (KNOBS.every((key) => s[key] >= c[key])) return "clean";
  if (KNOBS.every((key) => s[key] <= f[key] + FLOOR_EPSILON)) return "emergency";
  return "tight";
}

/**
 * Offline pack used in both trials and (pre-reconcile) commit: repack at the
 * candidate rhythm, then rail any main-column overflow into the sidebar. Pure —
 * does NOT reconcile fixed page chrome (that needs an id factory); the caller
 * reconciles at commit time. Page count is read via contentMaxPage on the
 * returned list.
 *
 * @param {object[]} elements
 * @param {object} spacing
 * @param {number} pageHeight
 * @returns {object[]}
 */
export function applyFitPack(elements, spacing, pageHeight) {
  const packed = applyFlowSpacing(elements, spacing, pageHeight);
  return collapseSpilledMainIntoSidebar(packed, { spacing, pageHeight });
}

/**
 * Loosest rhythm on the [loosest…tightest] ladder that packs the document to
 * `targetPages` or fewer. Returns the FIRST (loosest) fit — never the tightest.
 * When nothing fits, returns the tightest candidate with tier "impossible".
 *
 * @param {{
 *   elements: object[],
 *   loosest: object,
 *   tightest: object,
 *   targetPages: number,
 *   pageHeight?: number,
 *   packFn?: (elements: object[], spacing: object, pageHeight: number) => object[],
 * }} args
 * @returns {{ fits: boolean, spacing: object, pageCount: number, elements: object[], tier: string }}
 */
export function findFitForTarget({
  elements,
  loosest,
  tightest,
  targetPages,
  pageHeight = 842,
  packFn = applyFitPack,
}) {
  const list = Array.isArray(elements) ? elements : [];
  const target = Math.max(1, Math.trunc(Number(targetPages) || 1));
  const ladder = buildSpacingLadder(loosest, tightest);

  for (const candidate of ladder) {
    const packed = packFn(list, candidate, pageHeight) || list;
    const pageCount = contentMaxPage(packed);
    if (pageCount <= target) {
      return {
        fits: true,
        spacing: candidate,
        pageCount,
        elements: packed,
        tier: classifyFitTier(candidate),
      };
    }
  }

  const tightestSpacing = ladder[ladder.length - 1];
  const packed = packFn(list, tightestSpacing, pageHeight) || list;
  return {
    fits: false,
    spacing: tightestSpacing,
    pageCount: contentMaxPage(packed),
    elements: packed,
    tier: "impossible",
  };
}
