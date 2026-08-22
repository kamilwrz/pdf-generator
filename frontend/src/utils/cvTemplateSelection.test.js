import assert from "node:assert/strict";
import test from "node:test";
import { adjacentAllowedTemplate, selectCvTemplates } from "./cvTemplateSelection.js";

// These suites exercise the generic selection/navigation algorithm, so they use
// synthetic template ids ("free-a", "paid-a", …) rather than live registry ids.
// This keeps the two-free-template wrap-around scenario expressible even though
// the real registry only exposes a small free starter set.

test("returns templates in registry order", () => {
  const templates = [
    { id: "paid-a", layouts: ["icons", "dark"] },
    { id: "free-a", layouts: ["single"] },
    { id: "paid-b", layouts: ["single"] },
  ];
  assert.deepEqual(
    selectCvTemplates(templates).map((template) => template.id),
    ["paid-a", "free-a", "paid-b"],
  );
});

test("adjacentAllowedTemplate wraps among plan-allowed templates only", () => {
  const templates = [
    { id: "free-a", tier: "free" },
    { id: "paid-a", tier: "paid" },
    { id: "free-b", tier: "free" },
    { id: "paid-b", tier: "paid" },
  ];
  const freeEntitlements = { template_tier: "free", allowed_template_ids: ["free-a", "free-b"] };

  const nextFromFreeA = adjacentAllowedTemplate(templates, "free-a", 1, freeEntitlements);
  assert.equal(nextFromFreeA?.id, "free-b");

  const prevFromFreeA = adjacentAllowedTemplate(templates, "free-a", -1, freeEntitlements);
  assert.equal(prevFromFreeA?.id, "free-b");

  const allEntitlements = { template_tier: "all", allowed_template_ids: null };
  assert.equal(adjacentAllowedTemplate(templates, "free-a", 1, allEntitlements)?.id, "paid-a");
  assert.equal(adjacentAllowedTemplate(templates, "free-a", -1, allEntitlements)?.id, "paid-b");
});

test("adjacentAllowedTemplate returns null when the plan has fewer than two templates", () => {
  const templates = [
    { id: "free-a", tier: "free" },
    { id: "paid-a", tier: "paid" },
  ];
  const freeEntitlements = { allowed_template_ids: ["free-a"] };
  assert.equal(adjacentAllowedTemplate(templates, "free-a", 1, freeEntitlements), null);
});
