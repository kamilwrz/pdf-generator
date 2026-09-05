import assert from "node:assert/strict";
import test from "node:test";
import { elementToolbarPosition } from "./elementToolbarPosition.js";

const viewport = { left: 56, top: 64, right: 1440, bottom: 900 };
test("settings sit eight screen pixels left of the selected glyphs", () => {
  const result = elementToolbarPosition({ left: 700, top: 250, width: 400, height: 28 }, viewport);
  assert.equal(result.trigger.left + 36, 692);
  assert.equal(result.trigger.top + 18, 264);
  assert.equal(result.panel.left + result.panel.width + 8, result.trigger.left);
  assert.equal(result.visible, true);
});
test("partially clipped selections keep a reachable trigger and panel", () => {
  const result = elementToolbarPosition({ left: -100, top: 40, width: 500, height: 120 }, viewport);
  assert.equal(result.trigger.left, 64);
  assert.equal(result.trigger.top, 72);
  assert.ok(result.panel.left >= 64);
  assert.ok(result.panel.top >= 72);
  assert.ok(result.panel.top + result.panel.maxHeight <= 892);
});
test("offscreen selections hide their cog", () => {
  for (const anchor of [
    { left: 600, top: -100, width: 100, height: 20 },
    { left: 1500, top: 300, width: 100, height: 20 },
    { left: 600, top: 950, width: 100, height: 20 },
  ]) assert.equal(elementToolbarPosition(anchor, viewport).visible, false);
});
test("compact and low-height viewports never overflow", () => {
  for (const width of [320, 390, 720, 834, 1280, 1920]) {
    for (const height of [300, 600, 1000]) {
      const result = elementToolbarPosition({ left: 110, top: 200, width: 500, height: 20 },
        { left: 56, top: 100, right: width, bottom: height });
      assert.ok(result.panel.left + result.panel.width <= width - 8);
      assert.ok(result.panel.top + result.panel.maxHeight <= height - 8);
      assert.ok(result.trigger.left >= 64);
    }
  }
});
test("large zoom changes position, never control or preferred panel size", () => {
  for (const zoom of [0.5, 1, 1.4, 2.8, 4]) {
    const result = elementToolbarPosition({ left: 200 * zoom, top: 150 * zoom, width: 80 * zoom, height: 20 * zoom }, viewport);
    assert.equal(result.panel.width, 344);
    assert.equal(result.panel.maxHeight, 480);
  }
});
