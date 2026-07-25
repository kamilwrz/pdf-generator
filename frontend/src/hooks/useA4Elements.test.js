import test from "node:test";
import assert from "node:assert/strict";
import { moveElementsToPage } from "../utils/pageDrag.js";

test("moves a selected group into the adjacent page and keeps its shared clamp", () => {
  const result = moveElementsToPage([
    { element_id: "a", category: "textarea", page: 1, left: 540, top: 30, width: 30, height: 20 },
    { element_id: "b", category: "textarea", page: 1, left: 100, top: 70, width: 80, height: 20 },
  ], new Set(["a", "b"]), 100, 10, 2, { width: 595, height: 842 });

  assert.equal(result.deltaX, 25);
  assert.equal(result.deltaY, 10);
  assert.deepEqual(
    result.elements.map(({ element_id, page, left, top }) => ({ element_id, page, left, top })),
    [
      { element_id: "a", page: 2, left: 565, top: 40 },
      { element_id: "b", page: 2, left: 125, top: 80 },
    ],
  );
});

test("updates internal connectors and removes connectors split by a page transfer", () => {
  const result = moveElementsToPage([
    { element_id: "a", category: "textarea", page: 1, left: 20, top: 20, width: 40, height: 20 },
    { element_id: "b", category: "textarea", page: 1, left: 100, top: 20, width: 40, height: 20 },
    { element_id: "stays", category: "textarea", page: 1, left: 200, top: 20, width: 40, height: 20 },
    { element_id: "inside", category: "connector", page: 1, source_id: "a", target_id: "b" },
    { element_id: "split", category: "connector", page: 1, source_id: "a", target_id: "stays" },
  ], new Set(["a", "b"]), 10, 0, 2, { width: 595, height: 842 });

  assert.deepEqual(result.removedConnectorIds, ["split"]);
  assert.equal(result.elements.find((element) => element.element_id === "inside").page, 2);
  assert.equal(result.elements.some((element) => element.element_id === "split"), false);
});
