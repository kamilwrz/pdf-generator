import test from "node:test";
import assert from "node:assert/strict";
import {
  cloneFixedPageDecorations,
  previewStructureOperation,
} from "./structureOperation.js";

test("preview replaces the source and renders proposed movement without mutating canvas state", () => {
  const current = [
    { element_id: "source", category: "textarea", content: "Original", left: 20, top: 80, page: 1 },
    { element_id: "later", category: "text", content: "Later", left: 20, top: 140, page: 1 },
  ];
  const result = previewStructureOperation(current, {
    remove_element_ids: ["source"],
    patches: [{ element_id: "later", left: 20, top: 180, page: 1 }],
    add_elements: [{ element_id: "heading", category: "text", content: "Heading", left: 20, top: 80, page: 1 }],
  });

  assert.deepEqual(current.map((element) => element.element_id), ["source", "later"]);
  assert.deepEqual(result.map((element) => element.element_id), ["later", "heading"]);
  assert.equal(result.find((element) => element.element_id === "later").top, 180);
  assert.equal(result.find((element) => element.element_id === "heading").locked, false);
});

test("new continuation pages receive cloned fixed artwork and refreshed page numbers", () => {
  let count = 0;
  const clones = cloneFixedPageDecorations([
    { element_id: "background", category: "image", fixedToPage: true, page: 1, src: "/art.png" },
    { element_id: "page-number", category: "text", fixedToPage: true, page: 1, content: "1" },
  ], 2, 3, () => `clone-${++count}`);

  assert.equal(clones.length, 4);
  assert.deepEqual(clones.filter((element) => element.page === 2).map((element) => element.content), [undefined, "2"]);
  assert.deepEqual(clones.filter((element) => element.page === 3).map((element) => element.content), [undefined, "3"]);
  assert.equal(new Set(clones.map((element) => element.element_id)).size, 4);
});
