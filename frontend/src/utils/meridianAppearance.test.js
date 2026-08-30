import assert from "node:assert/strict";
import test from "node:test";
import { meridianTemplate } from "../templates/meridian.js";
import {
  applyMeridianPalette,
  applyMeridianTextSize,
  getMeridianAppearance,
  MERIDIAN_PALETTES,
} from "./meridianAppearance.js";

const sample = () => [
  {
    category: "line", left: 0, top: 0, width: 595, height: 842,
    fixedToPage: true, backgroundColor: "#F7F3ED",
  },
  {
    category: "textarea", content: "Aleksandra", fontSize: 34, lineHeight: 37,
    fontFamily: "CormorantGaramond", color: "#1B2A41", flowRole: "masthead",
  },
  {
    category: "textarea", content: "Senior Consultant", width: 341, height: 13,
    fontSize: 10.3, lineHeight: 13, color: "#1B2A41", flowRole: "content",
    bold: true, autoHeight: true,
  },
  {
    category: "textarea", content: "Long summary", width: 471, height: 11,
    fontSize: 8.6, lineHeight: 11, color: "#33475A", flowRole: "content",
    autoHeight: true,
  },
  {
    category: "textarea", content: "Warszawa", width: 130, height: 10.8,
    fontSize: 7.9, lineHeight: 10.8, color: "#7A8699", flowRole: "record-overlay",
    autoHeight: false,
  },
  { category: "line", backgroundColor: "#D7DEE6", flowRole: "section-chrome" },
  { category: "line", backgroundColor: "#3D5A80", flowRole: "section-chrome" },
  { category: "image", src: "/template-assets/iconic/regent/phone.png" },
  { category: "text", content: "custom", fontSize: 10, color: "#C000FF" },
  {
    category: "text", fontSize: 1,
    contactBand: {
      id: "meridian-contact",
      text: { fontSizePt: 8, colorHex: "#7A8699" },
      icon: { theme: "regent" },
      metrics: { charWidth: 5, lineStep: 13.5 },
    },
  },
  {
    category: "text", fontSize: 1,
    mastheadIdentity: {
      title: {
        spec: {
          category: "textarea", content: "", fontSizePt: 9,
          lineHeight: 12.5, height: 13, colorHex: "#3D5A80",
          appearanceTypographyRole: "job",
        },
        decorations: [{ category: "line", backgroundColor: "#D7DEE6" }],
      },
    },
  },
];

test("Meridian exposes six distinct white-paper palettes", () => {
  assert.equal(MERIDIAN_PALETTES.length, 6);
  assert.equal(new Set(MERIDIAN_PALETTES.map(({ id }) => id)).size, 6);
  assert.equal(new Set(MERIDIAN_PALETTES.map(({ name }) => name)).size, 6);
  assert.ok(MERIDIAN_PALETTES.every(({ colors }) => colors.paper === "#FFFFFF"));
});

test("Meridian monochrome uses black, white, and neutral greys only", () => {
  const monochrome = MERIDIAN_PALETTES.find(({ id }) => id === "monochrome");
  assert.ok(monochrome);
  for (const value of Object.values(monochrome.colors)) {
    const hex = value.slice(1);
    assert.equal(hex.slice(0, 2), hex.slice(2, 4));
    assert.equal(hex.slice(2, 4), hex.slice(4, 6));
  }
});

test("all Meridian text and accent inks meet WCAG AA against white paper", () => {
  const relativeLuminance = (hex) => {
    const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
    const linear = channels.map((value) => (
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  for (const palette of MERIDIAN_PALETTES) {
    for (const role of ["ink", "body", "muted", "accent"]) {
      const contrast = 1.05 / (relativeLuminance(palette.colors[role]) + 0.05);
      assert.ok(contrast >= 4.5, `${palette.id}.${role} contrast is ${contrast.toFixed(2)}:1`);
    }
  }
});

test("palette update preserves white paper and recolors text, decoration, hidden title, and icons", () => {
  const changed = applyMeridianPalette(sample(), "burgundy");
  assert.equal(changed[0].backgroundColor, "#FFFFFF");
  assert.equal(changed[1].color, "#3D2028");
  assert.equal(changed[3].color, "#593A43");
  assert.equal(changed[4].color, "#765F66");
  assert.equal(changed[5].backgroundColor, "#DCCBD0");
  assert.equal(changed[6].backgroundColor, "#8A3F53");
  assert.equal(changed[7].src, "/template-assets/iconic/meridian-burgundy/phone.png");
  assert.equal(changed[8].color, "#C000FF");
  assert.equal(changed[9].contactBand.icon.theme, "meridian-burgundy");
  assert.equal(changed[9].contactBand.text.colorHex, "#765F66");
  assert.equal(changed[10].mastheadIdentity.title.spec.colorHex, "#8A3F53");
  assert.equal(
    changed[10].mastheadIdentity.title.decorations[0].backgroundColor,
    "#DCCBD0",
  );
  assert.deepEqual(getMeridianAppearance(changed), { palette: "burgundy", textSize: "M" });
});

test("every visible authored Meridian colour belongs to the palette contract", () => {
  const knownColors = new Set(Object.values(MERIDIAN_PALETTES[0].colors));
  const authoredColors = meridianTemplate.flatMap((element) => {
    // Zero-sized metadata anchors use an invisible renderer fallback colour.
    if (Number(element.fontSize) <= 1) return [];
    return [element.color, element.backgroundColor, element.borderColor].filter(Boolean);
  });
  assert.ok(authoredColors.length > 0);
  assert.ok(
    authoredColors.every((color) => knownColors.has(color)),
    `Unmapped colours: ${authoredColors.filter((color) => !knownColors.has(color))}`,
  );
});

test("text presets scale by role and M restores Meridian's authored metrics", () => {
  const large = applyMeridianTextSize(sample(), "XL");
  const displayGrowth = large[1].fontSize / 34;
  const bodyGrowth = large[3].fontSize / 8.6;
  assert.ok(bodyGrowth > displayGrowth);
  assert.equal(large[2].appearanceTypographyRole, "title");
  assert.equal(large[3].appearanceTypographyRole, "body");
  assert.equal(large[4].appearanceTypographyRole, "meta");
  assert.ok(large[3].height > 0);
  assert.ok(large[9].contactBand.text.fontSizePt > 8);
  assert.ok(large[10].mastheadIdentity.title.spec.fontSizePt > 9);

  const compact = applyMeridianTextSize(large, "S");
  const restored = applyMeridianTextSize(compact, "M");
  assert.equal(restored[0].backgroundColor, "#F7F3ED");
  assert.equal(restored[1].fontSize, 34);
  assert.equal(restored[1].lineHeight, 37);
  assert.equal(restored[2].fontSize, 10.3);
  assert.equal(restored[3].fontSize, 8.6);
  assert.equal(restored[3].lineHeight, 11);
  assert.equal(restored[4].fontSize, 7.9);
  assert.equal(restored[10].mastheadIdentity.title.spec.fontSizePt, 9);
  assert.equal(restored[10].mastheadIdentity.title.spec.lineHeight, 12.5);
  assert.deepEqual(getMeridianAppearance(restored), { palette: "navy", textSize: "M" });
});
