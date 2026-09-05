import assert from "node:assert/strict";
import test from "node:test";
import { elementToolbarPosition } from "./elementToolbarPosition.js";

const viewport = { left: 56, top: 64, right: 1440, bottom: 900 };
const intersects = (a, b) => a.left < b.left + b.width && a.left + a.width > b.left
  && a.top < b.top + b.height && a.top + a.height > b.top;

test("the reported 280% experience title keeps its panel on the free right side", () => {
  const anchor = { left: 331, top: 580, width: 924, height: 44 };
  const result = elementToolbarPosition(anchor, { left: 72, top: 169, right: 1904, bottom: 1032 });
  assert.ok(result.panel.left >= anchor.left + anchor.width + 8);
  assert.equal(intersects({ ...result.panel, height: result.panel.maxHeight }, anchor), false);
});

test("a full-width title uses a shorter panel above it instead of overlapping", () => {
  const anchor = { left: 331, top: 580, width: 1318, height: 44 };
  const result = elementToolbarPosition(anchor, { left: 72, top: 169, right: 1904, bottom: 1032 });
  assert.equal(result.needsReveal, false);
  assert.ok(result.panel.maxHeight < 480);
  assert.equal(intersects({ ...result.panel, height: result.panel.maxHeight }, anchor), false);
});

test("the cog avoids existing record controls and retains its slot after hover ends", () => {
  const anchor = { left: 331, top: 580, width: 924, height: 44 };
  const obstacle = { left: 120, top: 586, width: 195, height: 35 };
  const first = elementToolbarPosition(anchor, viewport, { obstacles: [obstacle] });
  assert.equal(intersects({ ...first.trigger, width: 36, height: 36 }, obstacle), false);
  assert.equal(first.trigger.left + 36, anchor.left - 8);
  const next = elementToolbarPosition(anchor, viewport, { triggerOffsetY: first.triggerOffsetY });
  assert.deepEqual(next.trigger, first.trigger);
});

test("scrolling offscreen does not permanently displace the cog", () => {
  const offscreen = elementToolbarPosition({ left: 500, top: -400, width: 500, height: 36 }, viewport);
  assert.equal(offscreen.triggerOffsetY, 0);
  const visible = elementToolbarPosition({ left: 500, top: 400, width: 500, height: 36 }, viewport,
    { triggerOffsetY: offscreen.triggerOffsetY });
  assert.equal(visible.trigger.top, 400);
});

test("all feasible placements remain outside the edited rectangle at every scroll position", () => {
  for (const left of [64, 331, 700]) {
    for (const top of [72, 160, 350, 580, 790]) {
      for (const width of [300, 900, 1300]) {
        const anchor = { left, top, width, height: 44 };
        const result = elementToolbarPosition(anchor, viewport);
        if (!result.needsReveal) assert.equal(intersects({ ...result.panel, height: result.panel.maxHeight }, anchor), false);
      }
    }
  }
});
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
