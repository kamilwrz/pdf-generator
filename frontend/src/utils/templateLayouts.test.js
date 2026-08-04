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
  { id: "harbor", layouts: ["sidebar", "icons"] },
  { id: "tessera", layouts: ["sidebar", "icons"] },
];

test("reads and filters known layout tags", () => {
  assert.deepEqual(getTemplateLayouts({ layouts: ["sidebar", "icons", "nope"] }), [
    "sidebar",
    "icons",
  ]);
  assert.equal(templateHasLayout(FIXTURES[3], "icons"), true);
  assert.equal(templateHasLayout(FIXTURES[2], "sidebar"), false);
});

test("preserves registry order and filters by layout", () => {
  assert.deepEqual(
    listTemplatesInRegistryOrder(FIXTURES).map((template) => template.id),
    ["volt", "words", "ledger", "harbor", "tessera"],
  );
  assert.deepEqual(
    filterTemplatesByLayout(FIXTURES, "sidebar").map((template) => template.id),
    ["harbor", "tessera"],
  );
});

test("carousel starts at the selected template", () => {
  assert.equal(startIndexForSelectedTemplate(FIXTURES, null), 0);
  assert.equal(startIndexForSelectedTemplate(FIXTURES, "harbor"), 3);
  assert.equal(startIndexForSelectedTemplate(FIXTURES, "missing"), 0);
});
