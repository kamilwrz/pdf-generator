import assert from "node:assert/strict";
import test from "node:test";
import {
  filterTemplatesByLayout,
  getTemplateAtsReadability,
  getTemplateLayouts,
  listTemplatesInRegistryOrder,
  startIndexForSelectedTemplate,
  templateHasLayout,
} from "./templateLayouts.js";

const FIXTURES = [
  { id: "volt", layouts: ["icons", "dark"] },
  { id: "monument", layouts: ["single"] },
    { id: "atrium", layouts: ["single"] },
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
    ["volt", "monument", "atrium", "harbor", "tessera"],
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

test("maps layout tags to soft ATS readability labels", () => {
  assert.equal(getTemplateAtsReadability({ layouts: ["single"] }).id, "very_safe");
  assert.equal(getTemplateAtsReadability({ layouts: ["icons"] }).id, "safe");
  assert.equal(getTemplateAtsReadability({ layouts: ["sidebar", "icons"] }).id, "safe");
  assert.equal(getTemplateAtsReadability({ layouts: ["icons", "dark"] }).id, "creative");
  assert.match(getTemplateAtsReadability({ layouts: ["single"] }).label, /bardzo bezpieczny/i);
  assert.match(getTemplateAtsReadability({ layouts: ["dark"] }).hint, /rekomendacja/i);
});
