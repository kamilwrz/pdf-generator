import test from "node:test";
import assert from "node:assert/strict";
import {
  crossPageConnectorIds,
  findPageCanvasAtPoint,
  visiblePageNumbers,
} from "./pageSpread.js";

test("shows the active page and its next neighbour in two-page view", () => {
  assert.deepEqual(visiblePageNumbers(2, 4, true), [2, 3]);
  assert.deepEqual(visiblePageNumbers(4, 4, true), [3, 4]);
  assert.deepEqual(visiblePageNumbers(2, 4, false), [2]);
  assert.deepEqual(visiblePageNumbers(1, 1, true), [1]);
});

test("resolves a pointer to the matching visible page canvas", () => {
  const pageCanvases = [
    {
      page: 1,
      node: { getBoundingClientRect: () => ({ left: 10, top: 20, right: 605, bottom: 862 }) },
    },
    {
      page: 2,
      node: { getBoundingClientRect: () => ({ left: 623, top: 20, right: 1218, bottom: 862 }) },
    },
  ];

  assert.equal(findPageCanvasAtPoint(pageCanvases, 500, 300).page, 1);
  assert.equal(findPageCanvasAtPoint(pageCanvases, 800, 300).page, 2);
  assert.equal(findPageCanvasAtPoint(pageCanvases, 614, 300), null);
});

test("identifies connectors made invalid by a cross-page transfer", () => {
  const elements = [
    { element_id: "left", category: "textarea", page: 1 },
    { element_id: "right", category: "textarea", page: 2 },
    { element_id: "connector", category: "connector", source_id: "left", target_id: "right", page: 1 },
  ];

  assert.deepEqual(crossPageConnectorIds(elements), ["connector"]);
});
