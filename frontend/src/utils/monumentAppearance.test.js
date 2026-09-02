import assert from "node:assert/strict";
import test from "node:test";
import { monumentTemplate } from "../templates/monument.js";
import {
  applyMonumentPalette,
  applyMonumentTextSize,
  getMonumentAppearance,
  MONUMENT_PALETTES,
} from "./monumentAppearance.js";

const sample = () => [
  {
    category: "line", left: 0, top: 0, width: 595, height: 842,
    fixedToPage: true, backgroundColor: "#F7F7F7",
  },
  {
    category: "text", content: "Julia", fontSize: 33,
    fontFamily: "CormorantGaramond", color: "#111111", flowRole: "masthead",
  },
  {
    category: "textarea", content: "Summary", width: 427, height: 14,
    fontSize: 9, lineHeight: 14, color: "#343434", flowRole: "content", autoHeight: true,
  },
  {
    category: "textarea", content: "Company · 2024", width: 427, height: 12,
    fontSize: 9, lineHeight: 12, color: "#6D6D6D", flowRole: "content", autoHeight: true,
  },
  {
    category: "text", content: "Phone", fontSize: 9,
    color: "#111111", contactBandId: "monument-contact",
  },
  { category: "image", src: "/template-assets/iconic/monument/phone.png" },
  { category: "image", src: "/template-assets/iconic/monument/portrait.png", photoSlot: "glyph" },
  { category: "rectangle", backgroundColor: "#E8E8E8" },
  { category: "text", content: "custom", fontSize: 10, color: "#C000FF" },
  {
    category: "text", fontSize: 1,
    contactBand: {
      id: "monument-contact",
      text: { fontSizePt: 9, colorHex: "#111111" },
      icon: { theme: "monument" },
      metrics: { charWidth: 5, lineStep: 14 },
    },
  },
  {
    category: "text", fontSize: 1,
    mastheadIdentity: {
      title: {
        spec: {
          category: "textarea", content: "", fontSizePt: 12.5,
          lineHeight: 16, height: 20, colorHex: "#343434",
          appearanceTypographyRole: "job",
        },
        decorations: [{ category: "line", backgroundColor: "#C8C8C8" }],
      },
    },
  },
];

test("Monument exposes six uniquely named editorial palettes", () => {
  assert.equal(MONUMENT_PALETTES.length, 6);
  assert.equal(new Set(MONUMENT_PALETTES.map(({ id }) => id)).size, 6);
  assert.equal(new Set(MONUMENT_PALETTES.map(({ name }) => name)).size, 6);
});

test("palette update recolors every Monument semantic and swaps contact and portrait icons", () => {
  const changed = applyMonumentPalette(sample(), "olive");
  const palette = MONUMENT_PALETTES.find(({ id }) => id === "olive");
  const languages = applyMonumentPalette(monumentTemplate, "olive")
    .filter((element) => element.flowRole === "grid-member");
  assert.equal(changed[0].backgroundColor, "#F8F8F3");
  assert.equal(changed[1].color, "#30372C");
  assert.equal(changed[2].color, "#485044");
  assert.equal(changed[3].color, "#777F70");
  assert.equal(changed[5].src, "/template-assets/iconic/monument-olive/phone.png");
  assert.equal(changed[6].src, "/template-assets/iconic/monument-olive/portrait.png");
  assert.equal(changed[7].backgroundColor, "#E9EBE2");
  assert.equal(changed[8].color, "#C000FF");
  assert.equal(changed[9].contactBand.icon.theme, "monument-olive");
  assert.equal(changed[9].contactBand.text.colorHex, "#30372C");
  assert.equal(changed[10].mastheadIdentity.title.spec.colorHex, "#485044");
  assert.equal(
    changed[10].mastheadIdentity.title.decorations[0].backgroundColor,
    "#C9CEC0",
  );
  assert.ok(languages.length > 0);
  assert.ok(languages.every((element) => (
    element.color === palette.colors.body
    && element.italic === false
    && element.runs == null
    && element.gridKind === "languages"
  )));
  assert.deepEqual(getMonumentAppearance(changed), { palette: "olive", textSize: "M" });
});

test("every authored Monument decoration belongs to the palette contract", () => {
  const knownColors = new Set(Object.values(MONUMENT_PALETTES[0].colors));
  const authoredColors = monumentTemplate.flatMap((element) => {
    // The zero-sized contact-band anchor carries an invisible renderer-safe
    // fallback colour; it is metadata, not visible template decoration.
    if (Number(element.fontSize) <= 1) return [];
    return [element.color, element.backgroundColor, element.borderColor].filter(Boolean);
  });
  assert.ok(authoredColors.length > 0);
  assert.ok(authoredColors.every((color) => knownColors.has(color)), `Unmapped colours: ${authoredColors.filter((color) => !knownColors.has(color))}`);
});

test("text presets scale from baseline and M restores Monument's authored metrics", () => {
  const large = applyMonumentTextSize(sample(), "XL");
  const displayGrowth = large[1].fontSize / 33;
  const bodyGrowth = large[2].fontSize / 9;
  assert.ok(bodyGrowth > displayGrowth);
  assert.equal(large[2].appearanceTypographyRole, "body");
  assert.equal(large[3].appearanceTypographyRole, "meta");
  assert.ok(large[2].height > 0);
  assert.ok(large[9].contactBand.text.fontSizePt > 9);
  assert.ok(large[10].mastheadIdentity.title.spec.fontSizePt > 12.5);
  assert.ok(large[10].mastheadIdentity.title.spec.lineHeight > 16);

  const compact = applyMonumentTextSize(large, "S");
  const restored = applyMonumentTextSize(compact, "M");
  assert.equal(restored[1].fontSize, 33);
  assert.equal(restored[2].fontSize, 9);
  assert.equal(restored[2].lineHeight, 14);
  assert.equal(restored[3].fontSize, 9);
  assert.equal(restored[3].lineHeight, 12);
  assert.equal(restored[10].mastheadIdentity.title.spec.fontSizePt, 12.5);
  assert.equal(restored[10].mastheadIdentity.title.spec.lineHeight, 16);
  assert.deepEqual(getMonumentAppearance(restored), { palette: "inkstone", textSize: "M" });
});
