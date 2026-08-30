import assert from "node:assert/strict";
import test from "node:test";
import { slateTemplate } from "../templates/slate.js";
import {
  applySlatePalette,
  applySlateTextSize,
  getSlateAppearance,
  SLATE_PALETTES,
} from "./slateAppearance.js";
import { hideProfilePhoto, showProfilePhoto } from "./profilePhotoVisibility.js";

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

function relativeLuminance(hex) {
  const channels = String(hex).slice(1).match(/../g).map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrastRatio(foreground, background) {
  const values = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

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

test("every Slate text role meets WCAG AA on paper and the sidebar rail", () => {
  for (const palette of SLATE_PALETTES) {
    for (const role of ["ink", "body", "muted"]) {
      for (const surface of ["paper", "sidebar"]) {
        const ratio = contrastRatio(palette.colors[role], palette.colors[surface]);
        assert.ok(
          ratio >= 4.5,
          `${palette.id}.${role}/${surface} contrast is ${ratio.toFixed(2)}:1`,
        );
      }
    }
    const badgeRatio = contrastRatio(palette.colors.badgeText, palette.colors.accent);
    assert.ok(
      badgeRatio >= 4.5,
      `${palette.id}.badgeText/accent contrast is ${badgeRatio.toFixed(2)}:1`,
    );
  }
});

test("palette update recolors Slate chrome, swaps accent icons, and preserves white badge glyphs", () => {
  const changed = applySlatePalette(sample(), "copper");
  assert.equal(changed[0].backgroundColor, "#FFFDF9");
  assert.equal(changed[1].backgroundColor, "#F6EDE3");
  assert.equal(changed[2].color, "#33251D");
  assert.equal(changed[3].color, "#534338");
  assert.equal(changed[5].color, "#76665B");
  assert.equal(changed[6].src, "/template-assets/iconic/slate-copper-accent/phone.png");
  assert.equal(changed[7].src, "/template-assets/iconic/slate-copper-accent/portrait.png");
  assert.equal(changed[8].src, "/template-assets/iconic/slate/skills.png");
  assert.equal(changed[9].color, "#C000FF");
  assert.equal(changed[10].contactBand.icon.theme, "slate-copper-accent");
  assert.equal(changed[10].contactBand.text.colorHex, "#76665B");
  assert.equal(changed[11].mastheadIdentity.title.spec.colorHex, "#FFFFFF");
  assert.equal(changed[11].mastheadIdentity.title.decorations[0].backgroundColor, "#A14F2B");
  assert.deepEqual(getSlateAppearance(changed), { palette: "copper", textSize: "M" });
});

test("every Slate palette styles the photo-less contact heading in either operation order", () => {
  for (const palette of SLATE_PALETTES) {
    const paletteThenHidden = hideProfilePhoto(
      applySlatePalette(slateTemplate, palette.id),
      "slate",
    ).elements;
    const hiddenThenPalette = applySlatePalette(
      hideProfilePhoto(slateTemplate, "slate").elements,
      palette.id,
    );

    for (const document of [paletteThenHidden, hiddenThenPalette]) {
      const members = document.filter(
        (element) => element.flowRole === "photo-contact-header",
      );
      const badge = members.find(
        (element) => element.element_id === "slate-contact-header-badge",
      );
      const icon = members.find((element) => element.category === "image");
      const label = members.find((element) => element.category === "text");
      const rule = members.find(
        (element) => element.element_id === "slate-contact-header-rule",
      );
      assert.equal(members.length, 4, palette.id);
      assert.match(icon.src, /\/slate\/contact\.png$/, palette.id);
      assert.equal(badge.backgroundColor, palette.colors.accent, palette.id);
      assert.equal(label.color, palette.colors.ink, palette.id);
      assert.equal(rule.backgroundColor, palette.colors.accent, palette.id);
    }
  }
});

test("photo-less heading inherits S–XL size without remaining sidebar chrome", () => {
  const noSidebarHeadings = slateTemplate.filter(
    (element) => element.flowRole !== "sidebar-chrome",
  );
  const expected = { S: 7.37, M: 7.6, L: 7.98, XL: 8.36 };

  for (const [textSize, fontSize] of Object.entries(expected)) {
    const resized = applySlateTextSize(noSidebarHeadings, textSize);
    const hidden = hideProfilePhoto(resized, "slate").elements;
    const label = hidden.find((element) => (
      element.flowRole === "photo-contact-header" && element.category === "text"
    ));
    assert.equal(label.fontSize, fontSize, textSize);
    assert.equal(label.appearanceBaseFontSize, 7.6, textSize);
  }
});

test("hidden Slate keeps palette, typography, and portrait fallback when the photo returns", () => {
  const userPhoto = {
    category: "image",
    src: "/uploads/profile.png",
    photoSlot: "image",
    photoPlaceholder: {
      src: "/template-assets/iconic/slate-accent/portrait.png",
      photoSlot: "glyph",
    },
  };
  const source = [...slateTemplate, userPhoto];
  const originalAnchor = source.find((element) => element.contactBand?.id === "contact-main");
  const hidden = hideProfilePhoto(source, "slate").elements;
  const themed = applySlatePalette(hidden, "copper");
  const resized = applySlateTextSize(themed, "XL");
  const shown = showProfilePhoto(resized, "slate").elements;
  const restoredAnchor = shown.find((element) => element.contactBand?.id === "contact-main");
  const restoredPhoto = shown.find((element) => element.src === "/uploads/profile.png");

  assert.equal(restoredAnchor.contactBand.icon.theme, "slate-copper-accent");
  assert.equal(restoredAnchor.contactBand.text.colorHex, "#76665B");
  assert.ok(
    restoredAnchor.contactBand.text.fontSizePt
      > originalAnchor.contactBand.text.fontSizePt,
  );
  assert.match(restoredPhoto.photoPlaceholder.src, /\/slate-copper-accent\/portrait\.png$/);
  assert.equal(
    shown.some((element) => element.flowRole === "photo-contact-header"),
    false,
  );
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
