import test from "node:test";
import assert from "node:assert/strict";
import { findVerticalSpacingGuides, SPACING_THRESHOLD } from "./spacingGuides.js";

const sizeOf = (element) => ({
  width: Number(element.width) || 0,
  height: Number(element.height) || 0,
});

test("reports gaps to the nearest overlapping neighbors within the threshold", () => {
  const moving = { element_id: "m", left: 100, top: 200, width: 180, height: 40 };
  const result = findVerticalSpacingGuides(moving, [
    { element_id: "above", left: 110, top: 120, width: 160, height: 40 },
    { element_id: "far-above", left: 110, top: 20, width: 160, height: 40 },
    { element_id: "below", left: 90, top: 270, width: 160, height: 30 },
    { element_id: "other-column", left: 400, top: 160, width: 120, height: 40 },
  ], sizeOf);

  assert.deepEqual(
    { gap: result.above.gap, neighborId: result.above.neighborId },
    { gap: 40, neighborId: "above" },
  );
  assert.deepEqual(
    { gap: result.below.gap, neighborId: result.below.neighborId },
    { gap: 30, neighborId: "below" },
  );
});

test("hides spacing guides beyond the threshold", () => {
  const moving = { element_id: "m", left: 100, top: 300, width: 180, height: 40 };
  const result = findVerticalSpacingGuides(moving, [
    { element_id: "above", left: 100, top: 100, width: 180, height: 40 },
  ], sizeOf);

  assert.equal(result.above, null);
  assert.equal(result.below, null);
  assert.equal(SPACING_THRESHOLD, 80);
});

test("ignores page decorations and connectors", () => {
  const moving = { element_id: "m", left: 100, top: 200, width: 180, height: 40 };
  const result = findVerticalSpacingGuides(moving, [
    { element_id: "bg", left: 0, top: 0, width: 595, height: 842, fixedToPage: true },
    { element_id: "link", left: 100, top: 140, width: 40, height: 40, category: "connector" },
    { element_id: "above", left: 100, top: 150, width: 180, height: 30 },
  ], sizeOf);

  assert.equal(result.above.neighborId, "above");
  assert.equal(result.above.gap, 20);
});
