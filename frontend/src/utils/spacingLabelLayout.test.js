import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateLabelSize,
  resolveSpacingLabelLayouts,
  spacingGuideKey,
} from "./spacingLabelLayout.js";

test("estimates compact label size from gap text", () => {
  const small = estimateLabelSize(8);
  const large = estimateLabelSize(240);
  assert.ok(small.width >= 22);
  assert.ok(large.width > small.width);
  assert.equal(small.height, 11);
});

test("places above/below Y labels on opposite sides by default", () => {
  const layouts = resolveSpacingLabelLayouts({
    y: [
      { direction: "above", neighborId: "a", gap: 20, x: 100, y1: 40, y2: 60 },
      { direction: "below", neighborId: "b", gap: 24, x: 100, y1: 120, y2: 144 },
    ],
  });

  const above = layouts.get(spacingGuideKey(
    { direction: "above", neighborId: "a", gap: 20, x: 100, y1: 40, y2: 60 },
    "y",
  ));
  const below = layouts.get(spacingGuideKey(
    { direction: "below", neighborId: "b", gap: 24, x: 100, y1: 120, y2: 144 },
    "y",
  ));

  assert.equal(above.side, "left");
  assert.equal(below.side, "right");
});

test("flips an X label when it would cover another", () => {
  // Two short green guides sharing the same y — default sides would stack.
  const left = {
    direction: "left",
    neighborId: "l",
    gap: 40,
    x1: 40,
    x2: 80,
    y: 200,
  };
  const right = {
    direction: "right",
    neighborId: "r",
    gap: 40,
    x1: 200,
    x2: 240,
    y: 200,
  };
  // Force potential mid-label collision by making gaps meet near the same midpoints
  // with a page-edge style preferred "above" for both via kind.
  const pageLeft = {
    direction: "page-left",
    neighborId: "page-left",
    kind: "page-edge",
    gap: 50,
    x1: 0,
    x2: 50,
    y: 200,
  };
  const neighbor = {
    direction: "left",
    neighborId: "n",
    gap: 36,
    x1: 60,
    x2: 96,
    y: 200,
  };

  const layouts = resolveSpacingLabelLayouts({ x: [pageLeft, neighbor, left, right] });
  const sides = [...layouts.values()].map((layout) => layout.side);
  assert.ok(sides.includes("above"));
  assert.ok(sides.includes("below"));
});

test("nudges labels along the rail when both sides are blocked", () => {
  // Three vertical markers on the same x with overlapping midpoints.
  const guides = [
    { direction: "above", neighborId: "a", gap: 12, x: 150, y1: 100, y2: 160 },
    { direction: "below", neighborId: "b", gap: 12, x: 150, y1: 100, y2: 160 },
    { direction: "above", neighborId: "c", gap: 12, x: 150, y1: 100, y2: 160 },
  ];
  const layouts = resolveSpacingLabelLayouts({ y: guides });
  const nudges = [...layouts.values()].map((layout) => layout.nudge);
  assert.equal(layouts.size, 3);
  assert.ok(nudges.some((nudge) => nudge !== 0));
});
