import assert from "node:assert/strict";
import test from "node:test";

import {
  hasActiveTextEdit,
  isCanvasInteractionTarget,
  shouldDeferEditZoomRestore,
} from "./editZoomExit.js";

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

test("recognizes a replacement text edit before restoring the page spread", () => {
  assert.equal(hasActiveTextEdit([{ category: "text", isEditing: true }]), true);
  assert.equal(hasActiveTextEdit([{ category: "textarea", isEditing: true }]), true);
  assert.equal(hasActiveTextEdit([{ category: "text", isEditing: false }]), false);
  assert.equal(hasActiveTextEdit([{ category: "image", isEditing: true }]), false);
  assert.equal(hasActiveTextEdit([]), false);
});

test("defers spread restoration for an edit that is waiting to start", () => {
  assert.equal(shouldDeferEditZoomRestore([], "next-text"), true);
  assert.equal(shouldDeferEditZoomRestore([{ category: "text", isEditing: true }]), true);
  assert.equal(shouldDeferEditZoomRestore([{ category: "text", isEditing: false }]), false);
});
