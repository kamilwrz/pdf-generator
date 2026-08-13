import assert from "node:assert/strict";
import test from "node:test";
import { adjacentAllowedTemplate, selectCvTemplates } from "./cvTemplateSelection.js";

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

test("adjacentAllowedTemplate wraps among plan-allowed templates only", () => {
  const templates = [
    { id: "nimbus", tier: "free" },
    { id: "cinder", tier: "paid" },
    { id: "nova", tier: "free" },
    { id: "volt", tier: "paid" },
  ];
  const freeEntitlements = { template_tier: "free", allowed_template_ids: ["nimbus", "nova"] };

  const nextFromNimbus = adjacentAllowedTemplate(templates, "nimbus", 1, freeEntitlements);
  assert.equal(nextFromNimbus?.id, "nova");

  const prevFromNimbus = adjacentAllowedTemplate(templates, "nimbus", -1, freeEntitlements);
  assert.equal(prevFromNimbus?.id, "nova");

  const allEntitlements = { template_tier: "all", allowed_template_ids: null };
  assert.equal(adjacentAllowedTemplate(templates, "nimbus", 1, allEntitlements)?.id, "cinder");
  assert.equal(adjacentAllowedTemplate(templates, "nimbus", -1, allEntitlements)?.id, "volt");
});

test("adjacentAllowedTemplate returns null when the plan has fewer than two templates", () => {
  const templates = [
    { id: "nimbus", tier: "free" },
    { id: "cinder", tier: "paid" },
  ];
  const freeEntitlements = { allowed_template_ids: ["nimbus"] };
  assert.equal(adjacentAllowedTemplate(templates, "nimbus", 1, freeEntitlements), null);
});
