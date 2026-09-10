import assert from "node:assert/strict";
import test from "node:test";
import {
  compactInlineToolbarLayoutSize,
  recordPlusLayoutSize,
  resolveStructuralToolbarSide,
  STRUCTURAL_TOOLBAR_VERTICAL_GAP_SCREEN_PX,
  structuralToolbarLayoutSize,
  structuralToolbarScreenLayoutSize,
} from "./recordPlusSize.js";

test("structural targets, text and icons grow with zoom without double scaling", () => {
  let previous;
  for (const zoom of [0.5, 1, 1.4, 2, 2.8, 3]) {
    const screen = structuralToolbarScreenLayoutSize(zoom, 0);
    const local = structuralToolbarLayoutSize(zoom, 0);
    assert.equal(local.scaleWithCanvas, true);
    for (const [key, value] of Object.entries(screen)) {
      assert.ok(Math.abs(local[key] * zoom - value) < 0.00001, key);
    }
    assert.ok(screen.fontSize >= 12);
    assert.ok(screen.buttonSize >= 24);
    assert.equal(screen.offset, 0);
    assert.equal(screen.borderWidth, 1);
    if (previous) {
      for (const key of ["buttonSize", "iconSize", "labelWidth", "menuWidth"]) {
        assert.ok(screen[key] > previous[key], key);
      }
    }
    previous = screen;
  }
  assert.equal(structuralToolbarScreenLayoutSize(1.4).buttonSize, 36);
  assert.equal(structuralToolbarScreenLayoutSize(2.8).buttonSize, 48);
  assert.equal(structuralToolbarScreenLayoutSize(1.4).fontSize, 14);
});

test("invalid structural zoom and offsets fall back to usable geometry", () => {
  for (const zoom of [undefined, NaN, Infinity, 0, -1]) {
    assert.deepEqual(structuralToolbarScreenLayoutSize(zoom, -1), structuralToolbarScreenLayoutSize(1));
  }
});

test("shares the language-sized compact inline toolbar with Skills", () => {
  assert.deepEqual(compactInlineToolbarLayoutSize(1), {
    buttonSize: 24,
    iconSize: 12,
    gap: 2.4,
    labelWidth: 60.8,
    fontSize: 12,
    menuWidth: 140.8,
    offset: 8,
    borderWidth: 1,
  });
  assert.deepEqual(recordPlusLayoutSize(2), {
    buttonSize: 12,
    iconSize: 6,
    gap: 1.2,
    offset: 4,
  });
});

test("keeps the shared structural toolbar gap exact in screen space", () => {
  assert.equal(
    structuralToolbarLayoutSize(1, STRUCTURAL_TOOLBAR_VERTICAL_GAP_SCREEN_PX).offset,
    0,
  );
  assert.equal(
    structuralToolbarLayoutSize(2, STRUCTURAL_TOOLBAR_VERTICAL_GAP_SCREEN_PX).offset,
    0,
  );
});

test("uses outside gutters in a two-page spread", () => {
  assert.equal(resolveStructuralToolbarSide("right", "left"), "left");
  assert.equal(resolveStructuralToolbarSide("left", "right"), "right");
});

test("preserves the lane gutter in single-page view", () => {
  assert.equal(resolveStructuralToolbarSide("left", null), "left");
  assert.equal(resolveStructuralToolbarSide("right", undefined), "right");
});
