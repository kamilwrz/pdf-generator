import assert from "node:assert/strict";
import test from "node:test";
import {
  compactInlineToolbarLayoutSize,
  RECORD_TOOLBAR_OFFSET_SCREEN_PX,
  resolveStructuralToolbarSide,
  SECTION_TOOLBAR_OFFSET_SCREEN_PX,
  structuralToolbarLayoutSize,
} from "./recordPlusSize.js";

test("keeps the compact structural toolbar screen-stable across canvas zoom", () => {
  assert.deepEqual(structuralToolbarLayoutSize(1), {
    buttonSize: 28.8,
    iconSize: 12,
    gap: 2.4,
    labelWidth: 60.8,
    fontSize: 8.4,
    menuWidth: 140.8,
    offset: 10,
    borderWidth: 1,
  });
  assert.deepEqual(structuralToolbarLayoutSize(2), {
    buttonSize: 14.4,
    iconSize: 6,
    gap: 1.2,
    labelWidth: 30.4,
    fontSize: 4.2,
    menuWidth: 70.4,
    offset: 5,
    borderWidth: 0.5,
  });
});

test("shares the language-sized compact inline toolbar with Skills", () => {
  assert.deepEqual(compactInlineToolbarLayoutSize(1), {
    buttonSize: 28.8,
    iconSize: 12,
    gap: 2.4,
    labelWidth: 60.8,
    fontSize: 8.4,
    menuWidth: 140.8,
    offset: 8,
    borderWidth: 0.8,
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
