import assert from "node:assert/strict";
import {
  clearEnteringIds,
  endCanvasEnterReflowSuppress,
  isCanvasEnterReflowSuppressed,
  markContentElementsEnter,
  markElementsEnter,
  takeEnteringIds,
} from "./canvasEnter.js";

// Isolate module state between tests by clearing whatever we mark.
clearEnteringIds(takeEnteringIds(["a", "b", "c", "d", "e", "chrome", "body"]));
endCanvasEnterReflowSuppress();

markElementsEnter(["a", "b"]);
assert.deepEqual(takeEnteringIds(["a", "c", "b"]), ["a", "b"]);
clearEnteringIds(["a"]);
assert.deepEqual(takeEnteringIds(["a", "b"]), ["b"]);
clearEnteringIds(["b"]);
assert.deepEqual(takeEnteringIds(["a", "b"]), []);

markContentElementsEnter([
  { element_id: "body", fixedToPage: false, category: "textarea" },
  { element_id: "chrome", fixedToPage: true, category: "line" },
  { element_id: "link", category: "connector" },
  { element_id: "photo", fixedToPage: false, category: "image" },
]);
assert.deepEqual(takeEnteringIds(["body", "chrome", "link", "photo"]), ["body", "photo"]);
assert.equal(isCanvasEnterReflowSuppressed(), true);
endCanvasEnterReflowSuppress();
assert.equal(isCanvasEnterReflowSuppressed(), false);
clearEnteringIds(["body", "photo"]);
assert.deepEqual(takeEnteringIds(["body", "chrome", "link", "photo"]), []);
