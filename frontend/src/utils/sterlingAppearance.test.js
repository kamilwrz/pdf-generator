import assert from "node:assert/strict";
import test from "node:test";
import {
  applySterlingPalette,
  applySterlingTextSize,
  getSterlingAppearance,
  normalizeSterlingFamilySidebarHairlines,
  STERLING_PALETTES,
} from "./sterlingAppearance.js";

const sample = () => [
  { category: "line", left: 0, top: 0, width: 595, height: 842, fixedToPage: true, backgroundColor: "#F7F8FA" },
  { category: "textarea", content: "Julia", fontSize: 30, lineHeight: 34, fontFamily: "CormorantGaramond", color: "#26313F", flowRole: "masthead", autoHeight: true, preserveInitialLayout: true },
  { category: "textarea", content: "Summary", width: 220, fontSize: 9.5, lineHeight: 13.8, color: "#26313F", flowRole: "content", autoHeight: true },
  { category: "textarea", content: "Sidebar", width: 120, fontSize: 8.3, lineHeight: 12.04, color: "#26313F", flowRole: "content", flowLane: "sidebar", autoHeight: true },
  { category: "text", content: "Phone", fontSize: 9.4, color: "#6B7684", contactBandId: "sterling-contact" },
  { category: "image", src: "/template-assets/iconic/sterling/phone.png" },
  { category: "text", content: "custom", fontSize: 10, color: "#C000FF" },
  {
    category: "text", fontSize: 1,
    mastheadIdentity: {
      title: {
        spec: {
          category: "textarea", content: "", fontSizePt: 11.5,
          lineHeight: 15, height: 15, colorHex: "#4A6FA5",
          appearanceTypographyRole: "job",
        },
        decorations: [{ category: "line", backgroundColor: "#C7CFDA" }],
      },
    },
  },
];

test("Sterling exposes six uniquely named curated palettes", () => {
  assert.equal(STERLING_PALETTES.length, 6);
  assert.equal(new Set(STERLING_PALETTES.map(({ id }) => id)).size, 6);
  assert.equal(new Set(STERLING_PALETTES.map(({ name }) => name)).size, 6);
});

test("legacy Sterling and Linden sidebar hairlines normalize without touching other templates", () => {
  const legacy = [
    { category: "line", flowRole: "sidebar-chrome", height: 1.4 },
    { category: "line", fixedToPage: true, left: 34, top: 806, width: 152, height: 0.8 },
    { category: "line", left: 80, top: 400, width: 120, height: 1.4 },
  ];

  const sterling = normalizeSterlingFamilySidebarHairlines(legacy, "sterling");
  assert.deepEqual(sterling.map(({ height }) => height), [1, 0.8, 1.4]);

  const linden = normalizeSterlingFamilySidebarHairlines(legacy, "linden");
  assert.deepEqual(linden.map(({ height }) => height), [1, 1, 1.4]);

  assert.equal(normalizeSterlingFamilySidebarHairlines(legacy, "vestige"), legacy);
});

test("palette update recolors semantics, swaps icon assets, and preserves custom color", () => {
  const changed = applySterlingPalette(sample(), "sage");
  assert.equal(changed[0].backgroundColor, "#F7F8F4");
  assert.equal(changed[1].color, "#25322D");
  assert.equal(changed[5].src, "/template-assets/iconic/sterling-sage/phone.png");
  assert.equal(changed[6].color, "#C000FF");
  assert.equal(changed[7].mastheadIdentity.title.spec.colorHex, "#557565");
  assert.equal(
    changed[7].mastheadIdentity.title.decorations[0].backgroundColor,
    "#C7D1CA",
  );
  assert.deepEqual(getSterlingAppearance(changed), { palette: "sage", textSize: "M" });
});

test("text presets scale from baseline and M restores the original metrics", () => {
  const large = applySterlingTextSize(sample(), "XL");
  const displayGrowth = large[1].fontSize / 30;
  const bodyGrowth = large[2].fontSize / 9.5;
  assert.ok(bodyGrowth > displayGrowth);
  assert.equal(large[1].preserveInitialLayout, false);
  assert.equal(large[3].appearanceTypographyRole, "body");
  assert.ok(large[3].fontSize > 9.5);
  assert.ok(Number.isFinite(large[2].height));
  assert.ok(large[2].height > 0);
  assert.ok(large[7].mastheadIdentity.title.spec.fontSizePt > 11.5);
  assert.ok(large[7].mastheadIdentity.title.spec.lineHeight > 15);

  const compact = applySterlingTextSize(large, "S");
  const restored = applySterlingTextSize(compact, "M");
  assert.equal(restored[1].fontSize, 30);
  assert.equal(restored[1].lineHeight, 34);
  assert.equal(restored[2].fontSize, 9.5);
  assert.equal(restored[2].lineHeight, 13.8);
  assert.equal(restored[7].mastheadIdentity.title.spec.fontSizePt, 11.5);
  assert.equal(restored[7].mastheadIdentity.title.spec.lineHeight, 15);
  assert.deepEqual(getSterlingAppearance(restored), { palette: "northstar", textSize: "M" });
});
