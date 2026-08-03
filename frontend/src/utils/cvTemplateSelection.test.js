import assert from "node:assert/strict";
import test from "node:test";

import { selectCvTemplates } from "./cvTemplateSelection.js";

test("returns templates sorted by product collection", () => {
  const templates = [
    { id: "volt", collection: "Iconic" },
    { id: "ledger", collection: "Finanse" },
    { id: "vector", collection: "IT" },
  ];

  assert.deepEqual(
    selectCvTemplates(templates).map((template) => template.id),
    ["ledger", "vector", "volt"],
  );
});
