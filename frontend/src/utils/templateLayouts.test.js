import assert from "node:assert/strict";
import test from "node:test";
import {
  filterTemplatesByLayout,
  getTemplateLayouts,
  listTemplatesInRegistryOrder,
  templateHasLayout,
} from "./templateLayouts.js";

const FIXTURES = [
  { id: "volt", layouts: ["icons", "dark"] },
  { id: "words", layouts: ["single"] },
  { id: "ledger", layouts: ["single"] },
  { id: "moss", layouts: ["sidebar"] },
  { id: "harbor", layouts: ["sidebar", "icons"] },
  { id: "onyx", layouts: ["dark"] },
];

test("reads and filters known layout tags", () => {
  assert.deepEqual(getTemplateLayouts({ layouts: ["sidebar", "icons", "nope"] }), [
    "sidebar",
    "icons",
  ]);
  assert.equal(templateHasLayout(FIXTURES[4], "icons"), true);
  assert.equal(templateHasLayout(FIXTURES[2], "sidebar"), false);
});

test("preserves registry order and filters by layout", () => {
  assert.deepEqual(
    listTemplatesInRegistryOrder(FIXTURES).map((template) => template.id),
    ["volt", "words", "ledger", "moss", "harbor", "onyx"],
  );
  assert.deepEqual(
    filterTemplatesByLayout(FIXTURES, "sidebar").map((template) => template.id),
    ["moss", "harbor"],
  );
});
