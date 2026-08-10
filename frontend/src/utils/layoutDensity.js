/**
 * Layout density helpers for the Układ CV panel.
 *
 * Measures per-page flow fill and proposes a spacing rhythm that better uses
 * page surface — without AI, without moving individual elements, and without
 * replacing the separate 3+ page LongCv compact pass.
 *
 * Trials call `applyFlowSpacing` offline (no React state) so undo/autosave
 * only see the final committed winner.
 */
import {
  flowSpacingEquals,
  normalizeFlowSpacing,
  scaleFlowSpacing,
} from "./flowSpacing.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { contentMaxPage } from "./structureOperation.js";

// Match reflow geometry (useA4Elements pageTop 66 / bottomMargin 72 @ 842).
const PAGE_TOP = 66;
const CONTENT_BOTTOM = 842 - 72; // 770
const FLOW_BAND = CONTENT_BOTTOM - PAGE_TOP; // 704

/** Scale factors tried around the document baseline during auto-fit. */
export const AUTO_FIT_SCALE_FACTORS = Object.freeze([
  0.65, 0.75, 0.85, 1.0, 1.1, 1.2, 1.3,
]);

/** Require at least this relative score improvement before mutating the CV. */
export const AUTO_FIT_MIN_IMPROVEMENT = 0.12;

const PAGE_COUNT_PENALTY = 1000;
const EMPTY_FILL_THRESHOLD = 0.45;
const EMPTY_PAGE_WEIGHT = 4;
const LAST_PAGE_EMPTY_EXTRA = 2;
const IMBALANCE_WEIGHT = 3;
const DENSITY_DISTANCE_WEIGHT = 0.35;
const WELL_BALANCED_MIN_FILL = 0.7;
const WELL_BALANCED_MAX_IMBALANCE = 0.2;

function elementBottom(element) {
  const top = Number(element?.top) || 0;
  const height = Number(element?.height);
  return top + (Number.isFinite(height) && height > 0 ? height : 0);
}

/**
 * Fraction of one page's usable flow band occupied by non-fixed content.
 *
 * @param {object[]} elements
 * @param {number} page 1-based page index
 * @returns {number} fill in [0, 1]
 */
export function measurePageFill(elements, page) {
  const target = Math.max(1, Math.trunc(Number(page) || 1));
  let maxBottom = PAGE_TOP;
  for (const element of elements || []) {
    if (!element || element.fixedToPage) continue;
    const elementPage = Math.max(1, Math.trunc(Number(element.page) || 1));
    if (elementPage !== target) continue;
    const bottom = elementBottom(element);
    if (bottom > maxBottom) maxBottom = bottom;
  }
  const used = (maxBottom - PAGE_TOP) / FLOW_BAND;
  return Math.min(1, Math.max(0, used));
}

/**
 * Per-page fill ratios for pages 1…pageCount.
 *
 * @param {object[]} elements
 * @param {number} pageCount
 * @returns {number[]}
 */
export function measureDocumentPageFills(elements, pageCount) {
  const pages = Math.max(1, Math.trunc(Number(pageCount) || 1));
  const fills = [];
  for (let page = 1; page <= pages; page += 1) {
    fills.push(measurePageFill(elements, page));
  }
  return fills;
}

/**
 * Polish page-count status for the Układ CV header.
 *
 * @param {number} pageCount
 * @returns {string}
 */
export function formatPageCountLabel(pageCount) {
  const pages = Math.max(1, Math.trunc(Number(pageCount) || 1));
  if (pages === 1) return "1 strona";
  const mod10 = pages % 10;
  const mod100 = pages % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${pages} strony`;
  }
  return `${pages} stron`;
}

/**
 * Relative L1 distance of candidate knobs from the baseline (0 = identical).
 *
 * @param {object} candidate
 * @param {object} baseline
 * @returns {number}
 */
export function densityDistanceFromBaseline(candidate, baseline) {
  const a = normalizeFlowSpacing(candidate);
  const b = normalizeFlowSpacing(baseline);
  const keys = ["stack", "record", "section", "after_rule"];
  let total = 0;
  for (const key of keys) {
    const base = Math.max(1, b[key]);
    total += Math.abs(a[key] - b[key]) / base;
  }
  return total / keys.length;
}

/**
 * Score a packed layout. Lower is better.
 *
 * @param {{
 *   pageCount: number,
 *   fills: number[],
 *   spacing: object,
 *   baselineSpacing: object,
 *   minAchievablePages: number,
 * }} args
 * @returns {number}
 */
export function scoreLayout({
  pageCount,
  fills,
  spacing,
  baselineSpacing,
  minAchievablePages,
}) {
  const pages = Math.max(1, Math.trunc(Number(pageCount) || 1));
  const minPages = Math.max(1, Math.trunc(Number(minAchievablePages) || pages));
  const pageFills = Array.isArray(fills) && fills.length > 0
    ? fills
    : Array.from({ length: pages }, () => 0);

  let score = 0;

  // Never prefer inventing extra pages when a denser candidate already fits.
  if (pages > minPages) {
    score += PAGE_COUNT_PENALTY * (pages - minPages);
  }

  for (let index = 0; index < pageFills.length; index += 1) {
    const fill = pageFills[index];
    const shortage = Math.max(0, EMPTY_FILL_THRESHOLD - fill);
    if (shortage <= 0) continue;
    const isLast = index === pageFills.length - 1;
    const weight = EMPTY_PAGE_WEIGHT + (isLast ? LAST_PAGE_EMPTY_EXTRA : 0);
    score += shortage * shortage * weight;
  }

  if (pageFills.length >= 2) {
    const maxFill = Math.max(...pageFills);
    const minFill = Math.min(...pageFills);
    score += (maxFill - minFill) * IMBALANCE_WEIGHT;
  }

  score += densityDistanceFromBaseline(spacing, baselineSpacing)
    * DENSITY_DISTANCE_WEIGHT;

  return score;
}

/**
 * True when the layout already looks naturally filled — skip micro-tweaks.
 *
 * @param {number[]} fills
 * @returns {boolean}
 */
export function isAlreadyWellBalanced(fills) {
  if (!Array.isArray(fills) || fills.length === 0) return false;
  const minFill = Math.min(...fills);
  const maxFill = Math.max(...fills);
  if (minFill < WELL_BALANCED_MIN_FILL) return false;
  if (fills.length >= 2 && (maxFill - minFill) > WELL_BALANCED_MAX_IMBALANCE) {
    return false;
  }
  // Single well-filled page (not sparse, not overflowing the band) — leave it.
  if (fills.length === 1 && minFill >= WELL_BALANCED_MIN_FILL && minFill <= 0.92) {
    return true;
  }
  return fills.length >= 2;
}

/**
 * Evaluate one spacing candidate offline (no React state / history / autosave).
 *
 * @param {object[]} elements
 * @param {object} spacing
 * @param {number} pageHeight
 * @param {(elements: object[], spacing: object, pageHeight: number) => object[]} packFn
 * @returns {{ spacing: object, pageCount: number, fills: number[], elements: object[] }}
 */
function evaluateCandidate(elements, spacing, pageHeight, packFn) {
  const normalized = normalizeFlowSpacing(spacing);
  // Pure pack — callers must not setState until a winner is chosen.
  const packed = packFn(elements, normalized, pageHeight) || elements || [];
  const pageCount = contentMaxPage(packed);
  const fills = measureDocumentPageFills(packed, pageCount);
  return {
    spacing: normalized,
    pageCount,
    fills,
    elements: packed,
  };
}

/**
 * Pick the best spacing rhythm for page density / balance.
 *
 * Trials are pure — callers must commit the returned spacing once via the
 * existing `applySpacing` path. Does not modify LongCv / 3+ page logic.
 *
 * @param {{
 *   elements: object[],
 *   baselineSpacing: object,
 *   currentSpacing: object,
 *   pageHeight?: number,
 *   packFn?: (elements: object[], spacing: object, pageHeight: number) => object[],
 * }} args
 * @returns {{
 *   changed: boolean,
 *   spacing: object,
 *   reason: "improved"|"already_best"|"well_balanced"|"unchanged",
 *   score?: number,
 *   currentScore?: number,
 *   fills?: number[],
 *   pageCount?: number,
 * }}
 */
export function proposeAutoFitSpacing({
  elements,
  baselineSpacing,
  currentSpacing,
  pageHeight = 842,
  packFn = applyFlowSpacing,
}) {
  const baseline = normalizeFlowSpacing(baselineSpacing);
  const current = normalizeFlowSpacing(currentSpacing);
  const list = Array.isArray(elements) ? elements : [];

  const currentTrial = evaluateCandidate(list, current, pageHeight, packFn);
  if (isAlreadyWellBalanced(currentTrial.fills)) {
    return {
      changed: false,
      spacing: current,
      reason: "well_balanced",
      score: 0,
      currentScore: 0,
      fills: currentTrial.fills,
      pageCount: currentTrial.pageCount,
    };
  }

  const candidateSpacings = [];
  const seen = new Set();
  const pushCandidate = (spacing) => {
    const normalized = normalizeFlowSpacing(spacing);
    const key = `${normalized.stack}|${normalized.record}|${normalized.section}|${normalized.after_rule}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidateSpacings.push(normalized);
  };

  for (const factor of AUTO_FIT_SCALE_FACTORS) {
    pushCandidate(scaleFlowSpacing(baseline, factor));
  }
  pushCandidate(current);
  pushCandidate(baseline);

  const trials = candidateSpacings.map((spacing) => (
    evaluateCandidate(list, spacing, pageHeight, packFn)
  ));
  const minAchievablePages = Math.min(...trials.map((trial) => trial.pageCount));

  let best = null;
  let bestScore = Infinity;
  for (const trial of trials) {
    // Hard rule: never invent an extra page when a denser fit already exists.
    if (trial.pageCount > minAchievablePages) continue;
    const score = scoreLayout({
      pageCount: trial.pageCount,
      fills: trial.fills,
      spacing: trial.spacing,
      baselineSpacing: baseline,
      minAchievablePages,
    });
    if (
      score < bestScore
      || (
        score === bestScore
        && best
        && densityDistanceFromBaseline(trial.spacing, baseline)
          < densityDistanceFromBaseline(best.spacing, baseline)
      )
    ) {
      bestScore = score;
      best = trial;
    }
  }

  if (!best) {
    return {
      changed: false,
      spacing: current,
      reason: "already_best",
      fills: currentTrial.fills,
      pageCount: currentTrial.pageCount,
    };
  }

  const currentScore = scoreLayout({
    pageCount: currentTrial.pageCount,
    fills: currentTrial.fills,
    spacing: current,
    baselineSpacing: baseline,
    minAchievablePages,
  });

  if (flowSpacingEquals(best.spacing, current)) {
    return {
      changed: false,
      spacing: current,
      reason: "already_best",
      score: currentScore,
      currentScore,
      fills: currentTrial.fills,
      pageCount: currentTrial.pageCount,
    };
  }

  // Require a meaningful improvement; tiny score deltas stay on the template rhythm.
  const improvement = currentScore <= 0
    ? 0
    : (currentScore - bestScore) / currentScore;
  if (improvement < AUTO_FIT_MIN_IMPROVEMENT) {
    return {
      changed: false,
      spacing: current,
      reason: "already_best",
      score: bestScore,
      currentScore,
      fills: currentTrial.fills,
      pageCount: currentTrial.pageCount,
    };
  }

  // Guard: never commit a winner that grows page count vs the live document
  // when the live document already sits on the minimum achievable page count.
  if (
    best.pageCount > currentTrial.pageCount
    && currentTrial.pageCount <= minAchievablePages
  ) {
    return {
      changed: false,
      spacing: current,
      reason: "already_best",
      score: currentScore,
      currentScore,
      fills: currentTrial.fills,
      pageCount: currentTrial.pageCount,
    };
  }

  return {
    changed: true,
    spacing: best.spacing,
    reason: "improved",
    score: bestScore,
    currentScore,
    fills: best.fills,
    pageCount: best.pageCount,
  };
}
