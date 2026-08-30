import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLindenPalette,
  applyLindenTextSize,
  getLindenAppearance,
  LINDEN_PALETTES,
} from "./lindenAppearance.js";

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => parseInt(value, 16) / 255);
  const linear = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

const sample = () => [
  { category: "line", left: 0, top: 0, width: 595, height: 842, fixedToPage: true, backgroundColor: "#FBFAF6" },
  { category: "line", left: 0, top: 0, width: 210, height: 842, fixedToPage: true, backgroundColor: "#F2EFE6" },
  { category: "textarea", content: "Julia", left: 245, width: 300, fontSize: 29, lineHeight: 31.5, fontFamily: "CormorantGaramond", color: "#1E4037", flowRole: "masthead", mastheadBandId: "linden-masthead", autoHeight: true },
  { category: "textarea", content: "Consultant", left: 245, width: 300, fontSize: 9.2, lineHeight: 12.5, fontFamily: "Montserrat", color: "#1E4037", flowRole: "masthead", mastheadBandId: "linden-masthead", italic: true, autoHeight: true },
  { category: "rectangle", titleDecoration: "identity-band", backgroundColor: "#E5DDCB" },
  { category: "textarea", content: "Main", left: 245, width: 300, fontSize: 9.5, lineHeight: 13.8, color: "#252823", flowRole: "content", autoHeight: true },
  { category: "textarea", content: "Sidebar", left: 34, width: 152, fontSize: 8.3, lineHeight: 12.04, color: "#252823", flowRole: "content", flowLane: "sidebar", autoHeight: true },
  { category: "text", content: "SUMMARY", left: 245, fontSize: 10.2, color: "#1E4037", flowRole: "section-chrome" },
  { category: "text", content: "SKILLS", left: 34, fontSize: 9.4, color: "#1E4037", flowRole: "sidebar-chrome", flowLane: "sidebar" },
  { category: "text", content: "2026", left: 245, fontSize: 8.6, color: "#70766F", flowRole: "content" },
  { category: "text", content: "Phone", left: 48, fontSize: 7.5, color: "#70766F", flowRole: "masthead", contactBandId: "linden-contact" },
  { category: "image", src: "/template-assets/iconic/linden/phone.png", contactBandId: "linden-contact" },
  { category: "image", id: "linden-photo-glyph", src: "/template-assets/iconic/linden/portrait.png" },
  { category: "text", content: "custom", fontSize: 10, color: "#C000FF" },
  {
    category: "text", fontSize: 1,
    mastheadIdentity: {
      id: "linden-masthead",
      title: {
        spec: {
          category: "textarea", content: "Consultant", fontSizePt: 9.2,
          lineHeight: 12.5, height: 13, colorHex: "#1E4037",
          appearanceTypographyRole: "job",
        },
        decorations: [{ category: "rectangle", titleDecoration: "identity-band", backgroundColor: "#E5DDCB" }],
      },
    },
  },
  {
    category: "text", fontSize: 1,
    contactBand: {
      id: "linden-contact",
      text: { fontSizePt: 7.5, colorHex: "#70766F" },
      icon: { theme: "linden" },
      metrics: { charWidth: 5.2, lineStep: 15 },
    },
  },
];

test("Linden exposes six distinct palettes whose job band is darker than the sidebar", () => {
  assert.equal(LINDEN_PALETTES.length, 6);
  assert.equal(new Set(LINDEN_PALETTES.map(({ id }) => id)).size, 6);
  assert.equal(new Set(LINDEN_PALETTES.map(({ name }) => name)).size, 6);
  for (const palette of LINDEN_PALETTES) {
    assert.ok(
      relativeLuminance(palette.colors.jobBand) < relativeLuminance(palette.colors.sidebar),
      `${palette.name} keeps the job band darker than its sidebar`,
    );
  }
  assert.equal(LINDEN_PALETTES[0].colors.paper, "#FFFFFF");
  assert.equal(LINDEN_PALETTES[0].colors.sidebar, "#FFFFFF");
  assert.match(LINDEN_PALETTES[1].colors.sidebar, /^#F3E3E2$/);
  assert.match(LINDEN_PALETTES[1].colors.jobBand, /^#8A3540$/);
});

test("all Linden text roles meet WCAG AA contrast on their assigned surfaces", () => {
  for (const palette of LINDEN_PALETTES) {
    const { colors } = palette;
    const pairs = [
      [colors.ink, colors.paper],
      [colors.accentDeep, colors.paper],
      [colors.muted, colors.paper],
      [colors.sidebarInk, colors.sidebar],
      [colors.sidebarHeading, colors.sidebar],
      [colors.sidebarMuted, colors.sidebar],
      [colors.jobText, colors.jobBand],
    ];
    for (const [foreground, background] of pairs) {
      assert.ok(
        contrastRatio(foreground, background) >= 4.5,
        `${palette.name}: ${foreground} remains readable on ${background}`,
      );
    }
  }
});

test("palette changes both lanes, the darker job band, descriptor, and real icon assets", () => {
  const changed = applyLindenPalette(sample(), "midnight");
  assert.equal(changed[0].backgroundColor, "#F8FAF9");
  assert.equal(changed[1].backgroundColor, "#18323B");
  assert.equal(changed[2].color, "#244A57");
  assert.equal(changed[3].color, "#F8F3E9");
  assert.equal(changed[4].backgroundColor, "#0E2730");
  assert.equal(changed[5].color, "#202D31");
  assert.equal(changed[6].color, "#F4F0E8");
  assert.equal(changed[7].color, "#244A57");
  assert.equal(changed[8].color, "#E6C987");
  assert.equal(changed[9].color, "#627276");
  assert.equal(changed[10].color, "#C2CED0");
  assert.match(changed[11].src, /\/linden-midnight\/phone\.png$/);
  assert.match(changed[12].src, /\/linden-midnight\/portrait\.png$/);
  assert.equal(changed[13].color, "#C000FF");
  assert.equal(changed[14].mastheadIdentity.title.spec.colorHex, "#F8F3E9");
  assert.equal(changed[14].mastheadIdentity.title.decorations[0].backgroundColor, "#0E2730");
  assert.equal(changed[15].contactBand.text.colorHex, "#C2CED0");
  assert.equal(changed[15].contactBand.icon.theme, "linden-midnight");
  assert.deepEqual(getLindenAppearance(changed), { palette: "midnight", textSize: "M" });
});

test("Linden type presets grow by role and M restores authored metrics", () => {
  const large = applyLindenTextSize(sample(), "XL");
  const displayGrowth = large[2].fontSize / 29;
  const bodyGrowth = large[5].fontSize / 9.5;
  assert.ok(bodyGrowth > displayGrowth);
  assert.equal(large[6].appearanceTypographyRole, "body");
  assert.equal(large[10].appearanceTypographyRole, "contact");
  assert.ok(large[14].mastheadIdentity.title.spec.fontSizePt > 9.2);
  assert.ok(large[15].contactBand.text.fontSizePt > 7.5);

  const restored = applyLindenTextSize(applyLindenTextSize(large, "S"), "M");
  assert.equal(restored[2].fontSize, 29);
  assert.equal(restored[2].lineHeight, 31.5);
  assert.equal(restored[5].fontSize, 9.5);
  assert.equal(restored[5].lineHeight, 13.8);
  assert.equal(restored[10].fontSize, 7.5);
  assert.equal(restored[14].mastheadIdentity.title.spec.fontSizePt, 9.2);
  assert.equal(restored[15].contactBand.text.fontSizePt, 7.5);
  assert.deepEqual(getLindenAppearance(restored), { palette: "botanical", textSize: "M" });
});
