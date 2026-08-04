import assert from "node:assert/strict";
import test from "node:test";
import { selectCvTemplates } from "./cvTemplateSelection.js";

test("returns templates in registry order", () => {
  const templates = [
    { id: "volt", layouts: ["icons", "dark"] },
    { id: "ledger", layouts: ["single"] },
    { id: "kernel", layouts: ["single"] },
  ];
  assert.deepEqual(
    selectCvTemplates(templates).map((template) => template.id),
    ["volt", "ledger", "kernel"],
  );
});
