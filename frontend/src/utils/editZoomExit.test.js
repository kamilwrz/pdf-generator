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

  assert.equal(isCanvasInteractionTarget(pageTarget), true);
  assert.equal(isCanvasInteractionTarget(toolbarTarget), false);
  assert.equal(isCanvasInteractionTarget(null), false);
});
