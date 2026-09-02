import assert from "node:assert/strict";
import test from "node:test";

import {
  EDITOR_INSPECTOR_FIXED_WIDTH_PX,
  resolveEditorInspectorWidth,
} from "./editorInspectorWidth.js";

test("inspector keeps its preferred 220% footprint when the live dock fits", () => {
  assert.equal(EDITOR_INSPECTOR_FIXED_WIDTH_PX, 248);
  for (const exactDockWidth of [248, 320, 640]) {
    assert.equal(resolveEditorInspectorWidth({
      exactDockWidth,
      availableWidth: 900,
    }), EDITOR_INSPECTOR_FIXED_WIDTH_PX);
  }
});

test("inspector shrinks against the live A4 edge before it can cover the page", () => {
  assert.equal(resolveEditorInspectorWidth({
    exactDockWidth: 236,
    availableWidth: 900,
  }), 236);
  assert.equal(resolveEditorInspectorWidth({
    exactDockWidth: 80,
    availableWidth: 900,
  }), 120);
});

test("inspector never exceeds its fixed footprint or the available viewport width", () => {
  assert.equal(resolveEditorInspectorWidth({
    exactDockWidth: 700,
    availableWidth: 900,
  }), EDITOR_INSPECTOR_FIXED_WIDTH_PX);
  assert.equal(resolveEditorInspectorWidth({
    exactDockWidth: 700,
    availableWidth: 240,
  }), 240);
});
