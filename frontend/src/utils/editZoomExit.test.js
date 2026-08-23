import assert from "node:assert/strict";
import test from "node:test";

import { isCanvasInteractionTarget } from "./editZoomExit.js";

test("recognizes only A4-page clicks as edit-zoom exit interactions", () => {
  const pageTarget = {
    closest: (selector) => (selector === "[data-page-canvas]" ? {} : null),
  };
  const toolbarTarget = {
    closest: () => null,
  };
  const canvasEditorControlTarget = {
    closest: (selector) => (
      selector === "[data-editor-control]"
        ? {}
        : selector === "[data-page-canvas]"
          ? {}
          : null
    ),
  };
  const editableCanvasTarget = {
    closest: (selector) => (
      selector === '[contenteditable="true"], textarea'
        ? {}
        : selector === "[data-page-canvas]"
          ? {}
          : null
    ),
  };

  assert.equal(isCanvasInteractionTarget(pageTarget), true);
  assert.equal(isCanvasInteractionTarget(toolbarTarget), false);
  assert.equal(isCanvasInteractionTarget(canvasEditorControlTarget), false);
  assert.equal(isCanvasInteractionTarget(editableCanvasTarget), false);
  assert.equal(isCanvasInteractionTarget(null), false);
});
