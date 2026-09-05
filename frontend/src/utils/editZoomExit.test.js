import assert from "node:assert/strict";
import test from "node:test";

import {
  hasActiveTextEdit,
  isCanvasInteractionTarget,
  isScrollbarInteraction,
  shouldDeferEditZoomRestore,
} from "./editZoomExit.js";

test("restores edit zoom only from bare A4 paper clicks", () => {
  const pageTarget = {};
  pageTarget.closest = (selector) => (
    selector === "[data-page-canvas]" ? pageTarget : null
  );
  const canvasAreaTarget = {};
  canvasAreaTarget.closest = (selector) => (
    selector === ".canvas-area" ? canvasAreaTarget : null
  );
  const canvasElementPage = {};
  const canvasArea = {};
  const canvasElementTarget = {
    closest: (selector) => (
      selector === "[data-page-canvas]"
        ? canvasElementPage
        : selector === ".canvas-area"
          ? canvasArea
          : null
    ),
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
  assert.equal(isCanvasInteractionTarget(canvasAreaTarget), false);
  assert.equal(isCanvasInteractionTarget(canvasElementTarget), false);
  assert.equal(isCanvasInteractionTarget(toolbarTarget), false);
  assert.equal(isCanvasInteractionTarget(canvasEditorControlTarget), false);
  assert.equal(isCanvasInteractionTarget(editableCanvasTarget), false);
  assert.equal(isCanvasInteractionTarget(null), false);
});

test("recognizes native scrollbar gutters even when Chromium reports the A4 page", () => {
  const canvasArea = {
    clientLeft: 0,
    clientTop: 0,
    clientWidth: 1188,
    clientHeight: 688,
    getBoundingClientRect: () => ({
      left: 72,
      right: 1280,
      top: 48,
      bottom: 748,
    }),
  };
  const pageTarget = {};
  pageTarget.closest = (selector) => (
    selector === "[data-page-canvas]" ? pageTarget : null
  );

  const verticalThumbEvent = { clientX: 1274, clientY: 360 };
  const horizontalThumbEvent = { clientX: 600, clientY: 744 };
  const paperEvent = { clientX: 900, clientY: 360 };

  assert.equal(isScrollbarInteraction(verticalThumbEvent, canvasArea), true);
  assert.equal(isScrollbarInteraction(horizontalThumbEvent, canvasArea), true);
  assert.equal(isScrollbarInteraction(paperEvent, canvasArea), false);
  assert.equal(
    isCanvasInteractionTarget(pageTarget, verticalThumbEvent, canvasArea),
    false,
  );
  assert.equal(isCanvasInteractionTarget(pageTarget, paperEvent, canvasArea), true);
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
