import test from "node:test";
import assert from "node:assert/strict";
import { findVerticalSpacingGuides, resolveSpacingBox } from "./spacingGuides.js";

const sizeOf = (element) => ({
  width: Number(element.width) || 0,
  height: Number(element.height) || 0,
});

test("reports gaps to the nearest overlapping neighbors for any element type", () => {
  const moving = {
    element_id: "m",
    category: "text",
    content: "Title",
    left: 100,
    top: 200,
    width: 120,
    height: 20,
    fontSize: 12,
  };
  const result = findVerticalSpacingGuides(moving, [
    {
      element_id: "above",
      category: "text",
      content: "Above",
      left: 110,
      top: 120,
      width: 120,
      height: 20,
      fontSize: 12,
    },
    { element_id: "far-above", category: "line", left: 110, top: 20, width: 160, height: 2 },
    { element_id: "below", category: "textarea", left: 90, top: 270, width: 160, height: 30 },
    { element_id: "other-column", category: "rectangle", left: 400, top: 160, width: 120, height: 40 },
  ], sizeOf);

  assert.equal(result.above.neighborId, "above");
  assert.equal(result.above.gap, 60);
  assert.deepEqual(
    { gap: result.below.gap, neighborId: result.below.neighborId },
    { gap: 50, neighborId: "below" },
  );
});

test("still finds far neighbors when no distance threshold is applied", () => {
  const moving = { element_id: "m", left: 100, top: 300, width: 180, height: 40 };
  const result = findVerticalSpacingGuides(moving, [
    { element_id: "above", left: 100, top: 100, width: 180, height: 40 },
  ], sizeOf);

  assert.equal(result.above.neighborId, "above");
  assert.equal(result.above.gap, 160);
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

test("estimates width for text elements without stored dimensions", () => {
  const box = resolveSpacingBox(
    { element_id: "t", category: "text", content: "WYKSZTALCENIE", left: 40, top: 10, fontSize: 10 },
    () => ({ width: 0, height: 0 }),
  );
  assert.ok(box.width > 0);
  assert.ok(box.height > 0);
});
