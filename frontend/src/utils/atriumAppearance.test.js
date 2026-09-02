import assert from "node:assert/strict";
import test from "node:test";

import { atriumTemplate } from "../templates/atrium.js";
import {
  applyAtriumPalette,
  applyAtriumTextSize,
  ATRIUM_PALETTES,
  getAtriumAppearance,
} from "./atriumAppearance.js";

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function geometry(elements) {
  return elements.map((element) => ({
    category: element.category,
    left: element.left,
    top: element.top,
    width: element.width,
    height: element.height,
    page: element.page,
    zIndex: element.zIndex,
  }));
}

test("Atrium exposes the authored edition, white paper, dark mode, and three strong palettes", () => {
  assert.deepEqual(
    ATRIUM_PALETTES.map(({ id }) => id),
    ["sage", "carrara", "nocturne", "cobalt", "burgundy", "emerald"],
  );
  assert.equal(ATRIUM_PALETTES.filter(({ tone }) => tone === "original").length, 1);
  assert.equal(ATRIUM_PALETTES.filter(({ tone }) => tone === "light").length, 1);
  assert.equal(ATRIUM_PALETTES.filter(({ tone }) => tone === "dark").length, 1);
  assert.equal(ATRIUM_PALETTES.filter(({ tone }) => tone === "strong").length, 3);
  assert.equal(new Set(ATRIUM_PALETTES.map(({ name }) => name)).size, 6);
  assert.equal(new Set(ATRIUM_PALETTES.map(({ iconTheme }) => iconTheme)).size, 6);

  const original = ATRIUM_PALETTES[0];
  assert.deepEqual(original.colors, {
    paper: "#FBFAF7",
    ink: "#242521",
    body: "#2C2C29",
    muted: "#78796F",
    accent: "#556158",
    ornament: "#556158",
    rule: "#E5E3DB",
    folio: "#78796F",
    photo: "#556158",
  });
  assert.equal(ATRIUM_PALETTES.find(({ id }) => id === "carrara").colors.paper, "#FFFFFF");
});

test("new Atrium editions keep all small text readable on their paper", () => {
  for (const palette of ATRIUM_PALETTES.filter(({ id }) => id !== "sage")) {
    for (const role of ["ink", "body", "muted", "accent", "folio", "photo"]) {
      const ratio = contrast(palette.colors[role], palette.colors.paper);
      assert.ok(
        ratio >= 4.5,
        `${palette.id}.${role} contrast is ${ratio.toFixed(2)}:1`,
      );
    }
    if (palette.tone === "dark" || palette.tone === "strong") {
      for (const role of ["rule", "ornament"]) {
        const ratio = contrast(palette.colors[role], palette.colors.paper);
        assert.ok(
          ratio >= 3,
          `${palette.id}.${role} graphical contrast is ${ratio.toFixed(2)}:1`,
        );
      }
    }
  }
});

test("a strong Atrium palette recolours every semantic while preserving geometry", () => {
  const pageOne = atriumTemplate.find((element) => (
    element.fixedToPage && element.left === 0 && element.top === 0 && element.height >= 840
  ));
  const source = [...atriumTemplate, { ...pageOne, page: 2 }];
  const changed = applyAtriumPalette(source, "burgundy");
  const palette = ATRIUM_PALETTES.find(({ id }) => id === "burgundy");
  const name = changed.find((element) => element.mastheadRole === "name");
  const title = changed.find((element) => element.mastheadRole === "title");
  const identity = changed.find((element) => element.mastheadIdentity);
  const sectionHeading = changed.find((element) => (
    element.flowRole === "section-chrome" && element.category === "text"
  ));
  const sectionOrnament = changed.find((element) => (
    element.flowRole === "section-chrome"
    && element.category === "line"
    && Number(element.width) === 18
  ));
  const sectionRule = changed.find((element) => (
    element.flowRole === "section-chrome"
    && element.category === "line"
    && Number(element.width) > 100
  ));
  const folio = changed.find((element) => (
    element.fixedToPage && String(element.content || "").trim() === "01"
  ));
  const contactAnchor = changed.find((element) => element.contactBand?.id === "contact-main");
  const contactIcons = changed.filter((element) => (
    element.category === "image" && element.contactBandId === "contact-main"
  ));
  const portrait = changed.find((element) => element.id === "atrium-photo-glyph");
  const languages = changed.filter((element) => element.flowRole === "grid-member");

  assert.deepEqual(geometry(changed), geometry(source));
  assert.ok(changed.filter((element) => (
    element.fixedToPage && element.left === 0 && element.top === 0 && element.height >= 840
  )).every((element) => element.backgroundColor === palette.colors.paper));
  assert.deepEqual(
    changed.find((element) => element.appearanceTemplateId === "atrium").appearanceSettings,
    { palette: "burgundy", textSize: "M" },
  );
  assert.equal(name.color, palette.colors.ink);
  assert.equal(title.color, palette.colors.accent);
  assert.equal(identity.mastheadIdentity.title.spec.colorHex, palette.colors.accent);
  assert.equal(sectionHeading.color, palette.colors.accent);
  assert.equal(sectionOrnament.backgroundColor, palette.colors.ornament);
  assert.equal(sectionRule.backgroundColor, palette.colors.rule);
  assert.equal(folio.color, palette.colors.folio);
  assert.ok(contactIcons.length > 0);
  assert.ok(contactIcons.every((element) => element.src.includes("/atrium-burgundy/")));
  assert.match(portrait.src, /\/atrium-burgundy\/portrait\.png$/);
  assert.equal(contactAnchor.contactBand.icon.theme, "atrium-burgundy");
  assert.equal(contactAnchor.contactBand.text.colorHex, palette.colors.muted);
  assert.ok(languages.length > 0);
  assert.ok(languages.every((element) => (
    element.color === palette.colors.body
    && element.italic === false
    && element.runs == null
    && element.gridKind === "languages"
  )));
  assert.deepEqual(getAtriumAppearance(changed), { palette: "burgundy", textSize: "M" });
});

test("Atrium preserves manual colours and ignores unknown palette ids", () => {
  const custom = {
    category: "text",
    content: "Kolor użytkownika",
    color: "#123456",
    borderColor: "#654321",
  };
  const source = [...atriumTemplate, custom];
  const changed = applyAtriumPalette(source, "emerald");

  assert.equal(changed.at(-1).color, "#123456");
  assert.equal(changed.at(-1).borderColor, "#654321");
  assert.equal(applyAtriumPalette(source, "not-a-palette"), source);
});

test("palette switching never tints a user photo and restores a matching portrait glyph", () => {
  const glyph = atriumTemplate.find((element) => element.id === "atrium-photo-glyph");
  const uploadedSrc = "https://example.test/user-portrait.jpg";
  const photo = {
    ...glyph,
    id: "profile-photo",
    src: uploadedSrc,
    photoSlot: "image",
    photoPlaceholder: { ...glyph },
  };
  const withSnapshot = atriumTemplate.map((element) => (element === glyph ? photo : element));
  const changed = applyAtriumPalette(withSnapshot, "nocturne");
  const changedPhoto = changed.find((element) => element.id === "profile-photo");

  assert.equal(changedPhoto.src, uploadedSrc);
  assert.match(changedPhoto.photoPlaceholder.src, /\/atrium-nocturne\/portrait\.png$/);
  assert.deepEqual(
    [changedPhoto.left, changedPhoto.top, changedPhoto.width, changedPhoto.height],
    [462, 19, 60, 80],
  );

  const legacyPhoto = { ...photo };
  delete legacyPhoto.photoPlaceholder;
  const legacySource = atriumTemplate.map((element) => (element === glyph ? legacyPhoto : element));
  const migrated = applyAtriumPalette(legacySource, "cobalt")
    .find((element) => element.id === "profile-photo");
  assert.match(migrated.photoPlaceholder.src, /\/atrium-cobalt\/portrait\.png$/);
  assert.equal(migrated.photoPlaceholder.photoShape, "direct");
});

test("Atrium typography scales by role and returning to M restores authored metrics", () => {
  const originalName = atriumTemplate.find((element) => element.mastheadRole === "name");
  const originalBody = atriumTemplate.find((element) => (
    element.category === "textarea"
    && element.flowRole === "content"
    && !element.bold
    && Number(element.lineHeight) === 14.1
  ));
  const originalPortrait = atriumTemplate.find((element) => element.id === "atrium-photo-glyph");
  const originalIdentity = atriumTemplate.find((element) => element.mastheadIdentity);
  const large = applyAtriumTextSize(atriumTemplate, "XL");
  const compact = applyAtriumTextSize(large, "S");
  const restored = applyAtriumTextSize(compact, "M");
  const largeName = large.find((element) => element.mastheadRole === "name");
  const largeBody = large.find((element) => element.content === originalBody.content);
  const restoredName = restored.find((element) => element.mastheadRole === "name");
  const restoredBody = restored.find((element) => element.content === originalBody.content);
  const restoredPortrait = restored.find((element) => element.id === "atrium-photo-glyph");
  const restoredIdentity = restored.find((element) => element.mastheadIdentity);

  assert.equal(largeName.appearanceTypographyRole, "display");
  assert.equal(largeBody.appearanceTypographyRole, "body");
  assert.ok(largeName.fontSize > originalName.fontSize);
  assert.ok(largeBody.fontSize > originalBody.fontSize);
  assert.equal(restoredName.fontSize, originalName.fontSize);
  assert.equal(restoredName.lineHeight, originalName.lineHeight);
  assert.equal(restoredBody.fontSize, originalBody.fontSize);
  assert.equal(restoredBody.lineHeight, originalBody.lineHeight);
  assert.equal(
    restoredIdentity.mastheadIdentity.title.spec.fontSizePt,
    originalIdentity.mastheadIdentity.title.spec.fontSizePt,
  );
  assert.deepEqual(
    [restoredPortrait.left, restoredPortrait.top, restoredPortrait.width, restoredPortrait.height],
    [originalPortrait.left, originalPortrait.top, originalPortrait.width, originalPortrait.height],
  );
  assert.deepEqual(getAtriumAppearance(restored), { palette: "sage", textSize: "M" });
});
