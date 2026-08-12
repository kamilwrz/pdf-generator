import assert from "node:assert/strict";
import test from "node:test";
import { selectCvTemplates } from "./cvTemplateSelection.js";

test("returns templates in registry order", () => {
  const templates = [
    { id: "volt", layouts: ["icons", "dark"] },
    { id: "nimbus", layouts: ["single"] },
    { id: "cinder", layouts: ["single"] },
  ];
  assert.deepEqual(
    selectCvTemplates(templates).map((template) => template.id),
    ["volt", "nimbus", "cinder"],
  );
});
