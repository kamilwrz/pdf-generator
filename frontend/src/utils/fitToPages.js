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
import { normalizeFlowSpacing } from "./flowSpacing.js";

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
