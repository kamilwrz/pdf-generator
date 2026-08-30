import assert from "node:assert/strict";
import test from "node:test";
import { slateTemplate } from "../templates/slate.js";
import {
  applySlatePalette,
  applySlateTextSize,
  getSlateAppearance,
  SLATE_PALETTES,
} from "./slateAppearance.js";

const sample = () => [
  {
    category: "line", left: 0, top: 0, width: 595, height: 842,
    fixedToPage: true, backgroundColor: "#FFFFFF",
  },
  { category: "line", left: 0, top: 0, width: 178, height: 842, backgroundColor: "#F1F4F8" },
  {
    category: "text", content: "Julia", fontSize: 24,
    fontFamily: "Montserrat", color: "#1C2530", flowRole: "masthead", mastheadRole: "name",
  },
  {
    category: "textarea", content: "Summary", width: 329, height: 14,
    fontSize: 9, lineHeight: 13.2, color: "#3A424C", flowRole: "content", autoHeight: true,
  },
  {
    category: "textarea", content: "Sidebar", width: 128, height: 13,
    fontSize: 8.3, lineHeight: 12.04, color: "#1C2530",
    flowRole: "content", flowLane: "sidebar", autoHeight: true,
  },
  {
    category: "textarea", content: "2024", width: 128, height: 12,
    fontSize: 7.5, lineHeight: 11.54, color: "#7A8794",
    flowRole: "content", flowLane: "sidebar", autoHeight: true,
  },
  { category: "image", src: "/template-assets/iconic/slate-accent/phone.png" },
  { category: "image", src: "/template-assets/iconic/slate-accent/portrait.png", photoSlot: "glyph" },
  { category: "image", src: "/template-assets/iconic/slate/skills.png" },
  { category: "text", content: "custom", fontSize: 10, color: "#C000FF" },
  {
    category: "text", fontSize: 1,
    contactBand: {
      id: "contact-main",
      text: { fontSizePt: 7.8, colorHex: "#7A8794" },
      icon: { theme: "slate-accent" },
      metrics: { charWidth: 5, lineStep: 16 },
    },
  },
  {
    category: "text", fontSize: 1,
    mastheadIdentity: {
      title: {
        spec: {
          category: "text", content: "Analyst", fontSizePt: 8.2,
          lineHeight: 10, height: 12, colorHex: "#FFFFFF",
          appearanceTypographyRole: "job",
        },
        decorations: [{ category: "line", backgroundColor: "#3E5C76" }],
      },
    },
  },
];

test("Slate exposes six distinct palettes including a strict black-white-grey option", () => {
  assert.equal(SLATE_PALETTES.length, 6);
  assert.equal(new Set(SLATE_PALETTES.map(({ id }) => id)).size, 6);
  assert.equal(new Set(SLATE_PALETTES.map(({ name }) => name)).size, 6);
  const monochrome = SLATE_PALETTES.find(({ id }) => id === "monochrome");
  for (const value of Object.values(monochrome.colors)) {
    const [, red, green, blue] = value.match(/^#(..)(..)(..)$/);
    assert.equal(red, green);
    assert.equal(green, blue);
  }
});

test("palette update recolors Slate chrome, swaps accent icons, and preserves white badge glyphs", () => {
  const changed = applySlatePalette(sample(), "copper");
  assert.equal(changed[0].backgroundColor, "#FFFDF9");
  assert.equal(changed[1].backgroundColor, "#F6EDE3");
  assert.equal(changed[2].color, "#33251D");
  assert.equal(changed[3].color, "#534338");
  assert.equal(changed[5].color, "#837468");
  assert.equal(changed[6].src, "/template-assets/iconic/slate-copper-accent/phone.png");
  assert.equal(changed[7].src, "/template-assets/iconic/slate-copper-accent/portrait.png");
  assert.equal(changed[8].src, "/template-assets/iconic/slate/skills.png");
  assert.equal(changed[9].color, "#C000FF");
  assert.equal(changed[10].contactBand.icon.theme, "slate-copper-accent");
  assert.equal(changed[10].contactBand.text.colorHex, "#837468");
  assert.equal(changed[11].mastheadIdentity.title.spec.colorHex, "#FFFFFF");
  assert.equal(changed[11].mastheadIdentity.title.decorations[0].backgroundColor, "#A14F2B");
  assert.deepEqual(getSlateAppearance(changed), { palette: "copper", textSize: "M" });
});

test("every visible authored Slate decoration belongs to the palette contract", () => {
  const knownColors = new Set(Object.values(SLATE_PALETTES[0].colors));
  const authoredColors = slateTemplate.flatMap((element) => {
    // Zero-sized metadata anchors use renderer-safe black and are not visible.
    if (Number(element.fontSize) <= 1) return [];
    return [element.color, element.backgroundColor, element.borderColor].filter(Boolean);
  });
  assert.ok(authoredColors.length > 0);
  const unmapped = authoredColors.filter((color) => !knownColors.has(color));
  assert.deepEqual(unmapped, []);
});

test("text presets grow narrow body copy most and M restores authored Slate metrics", () => {
  const large = applySlateTextSize(sample(), "XL");
  const displayGrowth = large[2].fontSize / 24;
  const bodyGrowth = large[3].fontSize / 9;
  assert.ok(bodyGrowth > displayGrowth);
  assert.equal(large[4].appearanceTypographyRole, "body");
  assert.equal(large[5].appearanceTypographyRole, "meta");
  assert.ok(large[3].height > 0);
  assert.ok(large[10].contactBand.text.fontSizePt > 7.8);
  assert.ok(large[11].mastheadIdentity.title.spec.fontSizePt > 8.2);

  const compact = applySlateTextSize(large, "S");
  const restored = applySlateTextSize(compact, "M");
  assert.equal(restored[2].fontSize, 24);
  assert.equal(restored[3].fontSize, 9);
  assert.equal(restored[3].lineHeight, 13.2);
  assert.equal(restored[4].fontSize, 8.3);
  assert.equal(restored[4].lineHeight, 12.04);
  assert.equal(restored[11].mastheadIdentity.title.spec.fontSizePt, 8.2);
  assert.deepEqual(getSlateAppearance(restored), { palette: "steelgrid", textSize: "M" });
});
