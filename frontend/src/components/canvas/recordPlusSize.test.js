import assert from "node:assert/strict";
import test from "node:test";
import {
  RECORD_TOOLBAR_OFFSET_SCREEN_PX,
  resolveStructuralToolbarSide,
  SECTION_TOOLBAR_OFFSET_SCREEN_PX,
  structuralToolbarLayoutSize,
} from "./recordPlusSize.js";

test("keeps the compact structural toolbar screen-stable across canvas zoom", () => {
  assert.deepEqual(structuralToolbarLayoutSize(1), {
    buttonSize: 36,
    iconSize: 15,
    gap: 3,
    labelWidth: 76,
    fontSize: 10.5,
    menuWidth: 176,
    offset: 10,
    borderWidth: 1,
  });
  assert.deepEqual(structuralToolbarLayoutSize(2), {
    buttonSize: 18,
    iconSize: 7.5,
    gap: 1.5,
    labelWidth: 38,
    fontSize: 5.25,
    menuWidth: 88,
    offset: 5,
    borderWidth: 0.5,
  });
});

test("keeps section and record element-relative gaps exact in screen space", () => {
  assert.equal(
    structuralToolbarLayoutSize(1, SECTION_TOOLBAR_OFFSET_SCREEN_PX).offset,
    34,
  );
  assert.equal(
    structuralToolbarLayoutSize(1.6, SECTION_TOOLBAR_OFFSET_SCREEN_PX).offset,
    21.25,
  );
  assert.equal(
    structuralToolbarLayoutSize(1, RECORD_TOOLBAR_OFFSET_SCREEN_PX).offset,
    16,
  );
  assert.equal(
    structuralToolbarLayoutSize(2, RECORD_TOOLBAR_OFFSET_SCREEN_PX).offset,
    8,
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
