import assert from "node:assert/strict";
import test from "node:test";
import {
  compactInlineToolbarLayoutSize,
  recordPlusLayoutSize,
  resolveStructuralToolbarSide,
  STRUCTURAL_TOOLBAR_VERTICAL_GAP_SCREEN_PX,
  structuralToolbarLayoutSize,
} from "./recordPlusSize.js";

test("keeps the compact structural toolbar screen-stable across canvas zoom", () => {
  assert.deepEqual(structuralToolbarLayoutSize(1), {
    buttonSize: 28.8,
    iconSize: 12,
    gap: 2.4,
    labelWidth: 60.8,
    fontSize: 12,
    menuWidth: 140.8,
    offset: 10,
    borderWidth: 1,
  });
  assert.deepEqual(structuralToolbarLayoutSize(2), {
    buttonSize: 14.4,
    iconSize: 6,
    gap: 1.2,
    labelWidth: 30.4,
    fontSize: 6,
    menuWidth: 70.4,
    offset: 5,
    borderWidth: 0.5,
  });
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
    24,
  );
  assert.equal(
    structuralToolbarLayoutSize(2, STRUCTURAL_TOOLBAR_VERTICAL_GAP_SCREEN_PX).offset,
    12,
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
