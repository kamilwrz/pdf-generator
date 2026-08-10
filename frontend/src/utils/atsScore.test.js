import assert from "node:assert/strict";
import test from "node:test";
import {
  ATS_CATEGORY_WEIGHTS,
  atsReadabilityBand,
  overallPercentFromCategories,
  overallPercentFromRubric,
} from "./atsScore.js";

test("ATS overall is the weighted blend of categories, not a rounded 1–10 scale", () => {
  // Same mix as the live bug: 95% headers + 82% keywords with the rest at 100%
  // → ~96%, never 100%.
  const categories = [
    { id: "text_extract", score: 100, max: 100 },
    { id: "headers", score: 95, max: 100 },
    { id: "contact", score: 100, max: 100 },
    { id: "section_order", score: 100, max: 100 },
    { id: "keywords", score: 82, max: 100 },
    { id: "length", score: 100, max: 100 },
  ];
  // 25 + 19 + 15 + 15 + 12.3 + 10 = 96.3 → 96
  assert.equal(overallPercentFromCategories(categories), 96);
  assert.notEqual(overallPercentFromCategories(categories), 100);
  assert.equal(atsReadabilityBand(96), "Bardzo dobra");
});

test("ATS weights sum to 1.0", () => {
  const sum = Object.values(ATS_CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("missing categories renormalise instead of inventing 100%", () => {
  const categories = [
    { id: "headers", score: 50, max: 100 },
    { id: "keywords", score: 50, max: 100 },
  ];
  assert.equal(overallPercentFromCategories(categories), 50);
});

test("design rubric overall follows category maxes, not rating × 10", () => {
  // Live bug: every bar at 100% while rating=9 → badge showed 90%.
  const categories = [
    { id: "hierarchy", score: 3, max: 3 },
    { id: "emphasis", score: 2, max: 2 },
    { id: "color", score: 2, max: 2 },
    { id: "alignment", score: 2, max: 2 },
  ];
  assert.equal(overallPercentFromRubric(categories), 100);
  assert.equal(overallPercentFromRubric([
    { id: "hierarchy", score: 3, max: 3 },
    { id: "emphasis", score: 1, max: 2 },
    { id: "color", score: 2, max: 2 },
    { id: "alignment", score: 2, max: 2 },
  ]), 89);
});
