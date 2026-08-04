import assert from "node:assert/strict";
import test from "node:test";
import {
  filterTemplatesByLayout,
  getTemplateLayouts,
  listTemplatesInRegistryOrder,
  startIndexForSelectedTemplate,
  templateHasLayout,
} from "./templateLayouts.js";

const FIXTURES = [
  { id: "volt", layouts: ["icons", "dark"] },
  { id: "words", layouts: ["single"] },
  { id: "ledger", layouts: ["single"] },
  { id: "obsidian", layouts: ["sidebar", "dark"] },
  { id: "harbor", layouts: ["sidebar", "icons"] },
  { id: "loom", layouts: ["sidebar", "icons"] },
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
    ["volt", "words", "ledger", "obsidian", "harbor", "loom"],
  );
  assert.deepEqual(
    filterTemplatesByLayout(FIXTURES, "sidebar").map((template) => template.id),
    ["obsidian", "harbor", "loom"],
  );
});

test("carousel starts at the selected template", () => {
  assert.equal(startIndexForSelectedTemplate(FIXTURES, null), 0);
  assert.equal(startIndexForSelectedTemplate(FIXTURES, "harbor"), 4);
  assert.equal(startIndexForSelectedTemplate(FIXTURES, "missing"), 0);
});
