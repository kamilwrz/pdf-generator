import assert from "node:assert/strict";
import test from "node:test";
import {
  applySterlingPalette,
  applySterlingTextSize,
  getSterlingAppearance,
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
];

test("Sterling exposes six uniquely named curated palettes", () => {
  assert.equal(STERLING_PALETTES.length, 6);
  assert.equal(new Set(STERLING_PALETTES.map(({ id }) => id)).size, 6);
  assert.equal(new Set(STERLING_PALETTES.map(({ name }) => name)).size, 6);
});

test("palette update recolors semantics, swaps icon assets, and preserves custom color", () => {
  const changed = applySterlingPalette(sample(), "sage");
  assert.equal(changed[0].backgroundColor, "#F7F8F4");
  assert.equal(changed[1].color, "#25322D");
  assert.equal(changed[5].src, "/template-assets/iconic/sterling-sage/phone.png");
  assert.equal(changed[6].color, "#C000FF");
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

  const compact = applySterlingTextSize(large, "S");
  const restored = applySterlingTextSize(compact, "M");
  assert.equal(restored[1].fontSize, 30);
  assert.equal(restored[1].lineHeight, 34);
  assert.equal(restored[2].fontSize, 9.5);
  assert.equal(restored[2].lineHeight, 13.8);
  assert.deepEqual(getSterlingAppearance(restored), { palette: "northstar", textSize: "M" });
});
