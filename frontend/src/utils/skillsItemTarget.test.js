import assert from "node:assert/strict";
import test from "node:test";
import { mergeSkillRects, skillDeletePosition } from "./skillsItemTarget.js";

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

test("styled spans form one target per visual line, with no hit area between wrapped lines", () => {
  const lines = mergeSkillRects([rect(100, 50, 25, 14), rect(125, 50, 40, 14),
    rect(20, 70, 90, 14), rect(110, 70, 0, 14)]);
  assert.deepEqual(lines, [
    { left: 100, right: 165, top: 50, bottom: 64 },
    { left: 20, right: 110, top: 70, bottom: 84 },
  ]);
  const position = skillDeletePosition(lines, 1, { width: 800, height: 600 });
  assert.equal(position.left + 24, 110);
  assert.equal(position.top + 12, 77);
});

test("trash overlays the active fragment using its live size through zoom and scrolling", () => {
  for (const zoom of [0.7, 1.4, 2.8]) {
    const size = zoom === 2.8 ? 32 : 24;
    const bounds = rect(100 * zoom, 80 * zoom, 180 * zoom, 14 * zoom);
    const position = skillDeletePosition([bounds], 0, { width: 1920, height: 1200 }, size);
    assert.equal(position.left + size, bounds.right);
    assert.equal(position.top + size / 2, (bounds.top + bounds.bottom) / 2);
    const scrolled = skillDeletePosition([{ ...bounds, top: bounds.top - 20, bottom: bounds.bottom - 20 }], 0,
      { width: 1920, height: 1200 }, size);
    assert.equal(scrolled.top, position.top - 20);
  }
});

test("offscreen targets disappear and partially clipped targets keep the action reachable", () => {
  const viewport = { width: 390, height: 600 };
  assert.equal(skillDeletePosition([rect(400, 50, 90, 14)], 0, viewport), null);
  assert.equal(skillDeletePosition([rect(30, -50, 90, 14)], 0, viewport), null);
  assert.equal(skillDeletePosition([], 0, viewport), null);
  assert.deepEqual(skillDeletePosition([rect(360, 0, 90, 14)], 0, viewport), { left: 358, top: 8 });
});
