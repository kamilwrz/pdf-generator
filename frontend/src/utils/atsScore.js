/**
 * ATS overall scoring helpers shared by the AI assistant dashboard.
 *
 * Weights must stay in sync with `backend/app/services/ats_readability.py`
 * (`CATEGORY_WEIGHTS`). The UI must not display ATS overall as `rating × 10`
 * alone — the 1–10 integer scale rounds 96% to 10 → a false 100% badge.
 */

/** @type {Readonly<Record<string, number>>} */
export const ATS_CATEGORY_WEIGHTS = Object.freeze({
  text_extract: 0.25,
  headers: 0.20,
  contact: 0.15,
  section_order: 0.15,
  keywords: 0.15,
  length: 0.10,
});

/**
 * Weighted overall percent from category `{ id, score, max }` rows.
 *
 * @param {Array<{ id?: string, score?: number, max?: number }>} categories
 * @param {Record<string, number>} [weights]
 * @returns {number|null}
 */
export function overallPercentFromCategories(
  categories,
  weights = ATS_CATEGORY_WEIGHTS,
) {
  if (!Array.isArray(categories) || !weights) return null;
  const byId = new Map(
    categories
      .filter((cat) => cat && typeof cat.id === "string")
      .map((cat) => [cat.id, cat]),
  );
  let total = 0;
  let weightSum = 0;
  for (const [id, weight] of Object.entries(weights)) {
    const cat = byId.get(id);
    if (!cat) continue;
    const max = Number(cat.max);
    const score = Number(cat.score);
    if (!(max > 0) || Number.isNaN(score)) continue;
    const pct = Math.max(0, Math.min(100, (score / max) * 100));
    total += pct * weight;
    weightSum += weight;
  }
  if (weightSum <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(total / weightSum)));
}

/**
 * Overall percent from a rubric whose category `max` values are the weights
 * (design / rating / position dashboards). Example: hierarchy 3/3 + emphasis
 * 2/2 + color 2/2 + alignment 2/2 → 100%, never a stale `rating × 10` of 90.
 *
 * @param {Array<{ score?: number, max?: number }>} categories
 * @returns {number|null}
 */
export function overallPercentFromRubric(categories) {
  if (!Array.isArray(categories) || categories.length === 0) return null;
  let scoreSum = 0;
  let maxSum = 0;
  for (const cat of categories) {
    const max = Number(cat?.max);
    const score = Number(cat?.score);
    if (!(max > 0) || Number.isNaN(score)) continue;
    scoreSum += Math.max(0, Math.min(max, score));
    maxSum += max;
  }
  if (maxSum <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((scoreSum / maxSum) * 100)));
}

/**
 * Verbal band for ATS readability overall (percent 0–100).
 *
 * @param {number|null|undefined} percent
 * @returns {string|null}
 */
export function atsReadabilityBand(percent) {
  if (typeof percent !== "number" || Number.isNaN(percent)) return null;
  if (percent >= 90) return "Bardzo dobra";
  if (percent >= 75) return "Dobra";
  if (percent >= 50) return "Średnia";
  return "Słaba";
}
