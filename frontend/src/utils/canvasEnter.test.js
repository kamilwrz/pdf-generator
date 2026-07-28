import assert from "node:assert/strict";
import {
  clearEnteringIds,
  markElementsEnter,
  takeEnteringIds,
} from "./canvasEnter.js";

// Isolate module state between tests by clearing whatever we mark.
clearEnteringIds(takeEnteringIds(["a", "b", "c", "d", "e"]));

markElementsEnter(["a", "b"]);
assert.deepEqual(takeEnteringIds(["a", "c", "b"]), ["a", "b"]);
clearEnteringIds(["a"]);
assert.deepEqual(takeEnteringIds(["a", "b"]), ["b"]);
clearEnteringIds(["b"]);
assert.deepEqual(takeEnteringIds(["a", "b"]), []);
