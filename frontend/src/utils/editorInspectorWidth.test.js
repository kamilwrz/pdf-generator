import assert from "node:assert/strict";
import test from "node:test";

import {
  EDITOR_INSPECTOR_FIXED_WIDTH_PX,
  resolveEditorInspectorWidth,
} from "./editorInspectorWidth.js";

test("inspector keeps its 200% footprint when canvas zoom is 200% or lower", () => {
  for (const zoom of [0.25, 0.5, 1, 1.5, 2]) {
    assert.equal(resolveEditorInspectorWidth({
      zoom,
      exactDockWidth: 640,
      availableWidth: 900,
    }), EDITOR_INSPECTOR_FIXED_WIDTH_PX);
  }
});

test("inspector may shrink against the A4 page only above 200% zoom", () => {
  assert.equal(resolveEditorInspectorWidth({
    zoom: 2,
    exactDockWidth: 236,
    availableWidth: 900,
  }), EDITOR_INSPECTOR_FIXED_WIDTH_PX);
  assert.equal(resolveEditorInspectorWidth({
    zoom: 2.1,
    exactDockWidth: 236,
    availableWidth: 900,
  }), 236);
});

test("inspector never exceeds its fixed footprint or the available viewport width", () => {
  assert.equal(resolveEditorInspectorWidth({
    zoom: 2.5,
    exactDockWidth: 700,
    availableWidth: 900,
  }), EDITOR_INSPECTOR_FIXED_WIDTH_PX);
  assert.equal(resolveEditorInspectorWidth({
    zoom: 1,
    exactDockWidth: 700,
    availableWidth: 240,
  }), 240);
});
