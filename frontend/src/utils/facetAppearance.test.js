import test from "node:test";
import assert from "node:assert/strict";
import { facetTemplate } from "../templates/facet.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import { materializeElementSpecs } from "./materializeElementSpecs.js";
import { contentMaxPage } from "./structureOperation.js";
import { FACET_PALETTES, applyFacetPalette, applyFacetTextSize, applyFacetTextSizeLayout, getFacetAppearance } from "./facetAppearance.js";

function contrast(foreground, background) {
  const luminance = (hex) => {
    const rgb = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
      .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

test("Facet has four white and two dark palettes with readable text in both lanes", () => {
  assert.equal(FACET_PALETTES.filter((p) => p.colors.paper === "#FFFFFF").length, 4);
  for (const { colors } of FACET_PALETTES) {
    for (const background of ["paper", "sidebar"]) {
      for (const role of ["ink", "muted", "accentDeep", "accent"]) {
        assert.ok(contrast(colors[role], colors[background]) >= 4.5, `${role} on ${background}`);
      }
    }
  }
});

test("Facet palettes round-trip geometry, roles, future contacts and hidden title", () => {
  const source = structuredClone(facetTemplate);
  const dark = applyFacetPalette(source, "carbon");
  assert.equal(getFacetAppearance(dark).palette, "carbon");
  assert.equal(dark.find((e) => e.appearanceTemplateId === "facet").backgroundColor, "#1E241F");
  assert.equal(dark.find((e) => e.contactBand)?.contactBand.icon.theme, "facet-carbon");
  assert.equal(dark.find((e) => e.mastheadIdentity).mastheadIdentity.title.spec.colorHex, "#C0D875");
  assert.deepEqual(applyFacetPalette(dark, "olive"), source);
  assert.deepEqual(source, facetTemplate, "palette edits do not mutate the source");
  const custom = source.map((e) => e.mastheadRole === "name" ? { ...e, color: "#AB1234" } : e);
  assert.equal(applyFacetPalette(custom, "midnight").find((e) => e.mastheadRole === "name").color, "#AB1234");
});

test("Facet restores authored type metrics and packs after XL to M", () => {
  let counter = 0;
  const createId = () => `facet-test-${++counter}`;
  const source = materializeElementSpecs(facetTemplate, createId);
  const restored = applyFacetTextSize(applyFacetTextSize(source, "XL"), "M");
  for (let i = 0; i < source.length; i += 1) {
    if (source[i].fontSize) assert.equal(restored[i].fontSize, source[i].fontSize);
    if (source[i].lineHeight) assert.equal(restored[i].lineHeight, source[i].lineHeight);
  }
  let packed = source;
  for (const size of ["XL", "S", "M"]) {
    packed = applyFacetTextSizeLayout(packed, size, { spacing: DEFAULT_FLOW_SPACING, createId });
    assert.equal(getFacetAppearance(packed).textSize, size);
    const body = packed.filter((e) => e.flowRole === "content" && e.category === "textarea");
    for (const field of body) {
      assert.ok(field.top + field.height <= 771, `${size}: ${field.content}`);
    }
  }
  assert.equal(contentMaxPage(packed), 1);
});
