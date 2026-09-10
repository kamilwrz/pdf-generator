import assert from "node:assert/strict";
import test from "node:test";
import { LINDEN_PALETTES } from "../utils/lindenAppearance.js";
import { MERIDIAN_PALETTES } from "../utils/meridianAppearance.js";
import { STERLING_PALETTES } from "../utils/sterlingAppearance.js";
import { isTemplateAllowed } from "../utils/entitlements.js";
import { TEMPLATES } from "./index.js";

const FREE_TEMPLATE_IDS = ["sterling", "meridian", "linden"];

test("the Free plan exposes exactly three complementary templates", () => {
  assert.deepEqual(
    TEMPLATES.filter((template) => template.tier === "free").map((template) => template.id),
    FREE_TEMPLATE_IDS,
  );
  assert.ok(
    TEMPLATES.filter((template) => !FREE_TEMPLATE_IDS.includes(template.id))
      .every((template) => template.tier === "paid"),
  );
  assert.deepEqual(
    TEMPLATES.filter((template) => isTemplateAllowed(template, null))
      .map((template) => template.id),
    FREE_TEMPLATE_IDS,
    "pre-entitlement gating must expose only the Free starter set",
  );
});

test("every Free template exposes all six appearance palettes", () => {
  const palettesByTemplateId = new Map([
    ["sterling", STERLING_PALETTES],
    ["meridian", MERIDIAN_PALETTES],
    ["linden", LINDEN_PALETTES],
  ]);

  for (const templateId of FREE_TEMPLATE_IDS) {
    const palettes = palettesByTemplateId.get(templateId);
    assert.equal(palettes.length, 6, `${templateId} must expose six appearance palettes`);
    assert.equal(
      new Set(palettes.map((palette) => palette.id)).size,
      6,
      `${templateId} palette ids must be unique`,
    );
  }
});

test("every template has clear public copy without design-industry jargon", () => {
  for (const template of TEMPLATES) {
    assert.ok(template.description.length >= 50, `${template.id} needs a useful picker description`);
    assert.ok(template.details?.heading, `${template.id} needs a detail heading`);
    assert.ok(template.details?.body, `${template.id} needs a detail explanation`);
    assert.equal(template.details?.highlights?.length, 3, `${template.id} needs three concrete highlights`);
    assert.doesNotMatch(
      `${template.description} ${template.details.heading} ${template.details.body}`,
      /editorial|executive|masthead|sidebar/i,
      `${template.id} copy must use customer language`,
    );
  }
});

test("Regent stays registered for previously saved documents", () => {
  const regent = TEMPLATES.find((template) => template.id === "regent");

  assert.ok(regent, "Regent must remain resolvable for legacy documents");
  assert.equal(regent.tier, "paid");
  assert.equal(regent.serverMaterialized, true);
  assert.equal(regent.elements, undefined);
});

test("paid authored packs are not imported by the production registry", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./index.js", import.meta.url), "utf8");
  for (const id of ["monument", "slate", "atrium", "regent", "cadenza", "vellum", "aurelia"]) {
    assert.doesNotMatch(source, new RegExp(`from ["']\\./${id}["']`));
  }
});
