import test from "node:test";
import assert from "node:assert/strict";
import {
  findAllHorizontalSpacingGuides,
  findAllVerticalSpacingGuides,
  findHorizontalSpacingGuides,
  findPageEdgeGuides,
  findVerticalSpacingGuides,
  resolveSpacingBox,
} from "./spacingGuides.js";

const sizeOf = (element) => ({
  left: Number(element.left) || 0,
  top: Number(element.top) || 0,
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

test("measures text gaps from glyph bounds, not authored line boxes", () => {
  // Authored top/height include line-height leading; boundsOf returns ink edges.
  const boundsOf = (element) => ({
    left: Number(element.left) || 0,
    top: (Number(element.top) || 0) + 3,
    width: Number(element.width) || 100,
    height: 10,
  });
  const moving = {
    element_id: "m",
    category: "text",
    content: "A",
    left: 40,
    top: 100,
    width: 80,
    height: 19,
    fontSize: 14,
  };
  const result = findVerticalSpacingGuides(moving, [
    {
      element_id: "below",
      category: "text",
      content: "B",
      left: 40,
      top: 140,
      width: 80,
      height: 19,
      fontSize: 14,
    },
  ], boundsOf);

  // Gap between ink bottoms/tops: (103+10)=113 → 143 = 30, not 140-119=21.
  assert.equal(result.below.gap, 30);
  assert.equal(result.below.y1, 113);
  assert.equal(result.below.y2, 143);
});

test("still finds far neighbors when no distance threshold is applied", () => {
  const moving = {
    element_id: "m",
    category: "textarea",
    left: 100,
    top: 300,
    width: 180,
    height: 40,
  };
  const result = findVerticalSpacingGuides(moving, [
    {
      element_id: "above",
      category: "textarea",
      left: 100,
      top: 100,
      width: 180,
      height: 40,
    },
  ], sizeOf);

  assert.equal(result.above.neighborId, "above");
  assert.equal(result.above.gap, 160);
});

test("ignores page decorations and connectors", () => {
  const moving = {
    element_id: "m",
    category: "text",
    content: "M",
    left: 100,
    top: 200,
    width: 180,
    height: 40,
    fontSize: 12,
  };
  const result = findVerticalSpacingGuides(moving, [
    { element_id: "bg", left: 0, top: 0, width: 595, height: 842, fixedToPage: true },
    { element_id: "link", left: 100, top: 140, width: 40, height: 40, category: "connector" },
    {
      element_id: "marker",
      category: "circle",
      left: 100,
      top: 100,
      width: 14,
      height: 14,
      locked: true,
    },
    {
      element_id: "above",
      category: "textarea",
      left: 100,
      top: 150,
      width: 180,
      height: 30,
    },
  ], sizeOf);

  assert.equal(result.above.neighborId, "above");
  assert.equal(result.above.gap, 20);
});

test("vertical guides ignore section marker shapes between text blocks", () => {
  const moving = {
    element_id: "heading",
    category: "text",
    content: "DOSWIADCZENIE",
    left: 160,
    top: 300,
    width: 200,
    height: 12,
    fontSize: 9,
  };
  const result = findVerticalSpacingGuides(moving, [
    {
      element_id: "prev-marker",
      category: "ellipse",
      left: 133,
      top: 200,
      width: 13,
      height: 13,
    },
    {
      element_id: "summary-body",
      category: "textarea",
      left: 160,
      top: 220,
      width: 365,
      height: 60,
    },
  ], sizeOf);

  assert.equal(result.above.neighborId, "summary-body");
  assert.equal(result.above.gap, 20);
});

test("estimates width for text elements without stored dimensions", () => {
  const box = resolveSpacingBox(
    { element_id: "t", category: "text", content: "WYKSZTALCENIE", left: 40, top: 10, fontSize: 10 },
    () => ({ width: 0, height: 0 }),
  );
  assert.ok(box.width > 0);
  assert.ok(box.height > 0);
  assert.ok(box.height < 10 * 1.35);
});

test("collects unique nearest-below gaps across all page elements", () => {
  const guides = findAllVerticalSpacingGuides([
    { element_id: "a", category: "textarea", left: 100, top: 40, width: 180, height: 20 },
    { element_id: "b", category: "textarea", left: 100, top: 80, width: 180, height: 20 },
    { element_id: "c", category: "textarea", left: 100, top: 140, width: 180, height: 20 },
    { element_id: "side", category: "textarea", left: 400, top: 60, width: 80, height: 20 },
    { element_id: "bg", left: 0, top: 0, width: 595, height: 842, fixedToPage: true },
  ], sizeOf);

  assert.equal(guides.length, 2);
  assert.deepEqual(
    guides.map((g) => ({ gap: g.gap, neighborId: g.neighborId })).sort((x, y) => x.gap - y.gap),
    [
      { gap: 20, neighborId: "b" },
      { gap: 40, neighborId: "c" },
    ],
  );
});

test("reports gaps to the nearest vertically-overlapping left/right neighbors", () => {
  const moving = {
    element_id: "m",
    category: "textarea",
    left: 200,
    top: 100,
    width: 120,
    height: 40,
  };
  const result = findHorizontalSpacingGuides(moving, [
    { element_id: "left", category: "rectangle", left: 40, top: 110, width: 80, height: 30 },
    { element_id: "far-left", category: "line", left: 0, top: 110, width: 10, height: 20 },
    { element_id: "right", category: "text", content: "R", left: 360, top: 105, width: 60, height: 20, fontSize: 12 },
    { element_id: "other-row", category: "rectangle", left: 40, top: 300, width: 80, height: 30 },
  ], sizeOf);

  assert.equal(result.left.neighborId, "left");
  assert.equal(result.left.gap, 80);
  assert.equal(result.right.neighborId, "right");
  assert.equal(result.right.gap, 40);
  assert.equal(result.left.axis, "x");
});

test("shows page-edge margins only when closer than 100px", () => {
  const far = findPageEdgeGuides(
    { element_id: "f", left: 140, top: 200, width: 100, height: 40 },
    595,
    sizeOf,
  );
  assert.equal(far.left, null);
  // right gap = 595 - 240 = 355 → too far, hidden
  assert.equal(far.right, null);

  const near = findPageEdgeGuides(
    { element_id: "n", left: 80, top: 200, width: 100, height: 40 },
    595,
    sizeOf,
  );
  assert.equal(near.left.gap, 80);
  assert.equal(near.left.x1, 0);
  assert.equal(near.left.x2, 80);
  assert.equal(near.left.direction, "page-left");
  assert.equal(near.right, null);

  const nearRight = findPageEdgeGuides(
    { element_id: "r", left: 450, top: 200, width: 100, height: 40 },
    595,
    sizeOf,
  );
  assert.equal(nearRight.left, null);
  assert.equal(nearRight.right.gap, 45);
  assert.equal(nearRight.right.x1, 550);
  assert.equal(nearRight.right.x2, 595);

  const atThreshold = findPageEdgeGuides(
    { element_id: "t", left: 100, top: 200, width: 100, height: 40 },
    595,
    sizeOf,
  );
  assert.equal(atThreshold.left, null);
});

test("collects unique nearest-right gaps across all page elements", () => {
  const guides = findAllHorizontalSpacingGuides([
    { element_id: "a", left: 40, top: 100, width: 60, height: 20 },
    { element_id: "b", left: 140, top: 100, width: 60, height: 20 },
    { element_id: "c", left: 260, top: 100, width: 60, height: 20 },
    { element_id: "other-row", left: 40, top: 300, width: 60, height: 20 },
    { element_id: "bg", left: 0, top: 0, width: 595, height: 842, fixedToPage: true },
  ], sizeOf);

  assert.equal(guides.length, 2);
  assert.deepEqual(
    guides.map((g) => ({ gap: g.gap, neighborId: g.neighborId })).sort((x, y) => x.gap - y.gap),
    [
      { gap: 40, neighborId: "b" },
      { gap: 60, neighborId: "c" },
    ],
  );
});
