import assert from "node:assert/strict";
import test from "node:test";

import { regentTemplate } from "../templates/regent.js";
import {
  applyRegentPalette,
  applyRegentTextSize,
  getRegentAppearance,
  REGENT_PALETTES,
} from "./regentAppearance.js";

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

test("Regent exposes two classic and two creative premium editions", () => {
  assert.deepEqual(
    REGENT_PALETTES.map(({ id }) => id),
    ["monochrome", "ivory", "sapphire", "burgundy"],
  );
  assert.equal(REGENT_PALETTES.filter(({ group }) => group === "classic").length, 2);
  assert.equal(REGENT_PALETTES.filter(({ group }) => group === "creative").length, 2);
  assert.equal(new Set(REGENT_PALETTES.map(({ name }) => name)).size, 4);
  assert.equal(new Set(REGENT_PALETTES.map(({ iconTheme }) => iconTheme)).size, 4);
  assert.ok(REGENT_PALETTES.filter(({ group }) => group === "creative").every(
    ({ colors }) => relativeLuminance(colors.paper) < 0.06,
  ));
});

test("every Regent edition keeps text readable on its own paper", () => {
  for (const palette of REGENT_PALETTES) {
    for (const role of ["ink", "body", "muted", "accent", "folio"]) {
      const ratio = contrast(palette.colors[role], palette.colors.paper);
      assert.ok(
        ratio >= 4.5,
        `${palette.id}.${role} contrast is ${ratio.toFixed(2)}:1`,
      );
    }
    if (palette.group === "creative") {
      const ratio = contrast(palette.colors.rule, palette.colors.paper);
      assert.ok(ratio >= 3, `${palette.id}.rule contrast is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("a creative Regent edition recolours every semantic without moving content", () => {
  const pageOne = regentTemplate.find((element) => (
    element.fixedToPage && element.left === 0 && element.top === 0 && element.height >= 840
  ));
  const source = [...regentTemplate, { ...pageOne, page: 2 }];
  const changed = applyRegentPalette(source, "sapphire");
  const palette = REGENT_PALETTES.find(({ id }) => id === "sapphire");
  const name = changed.find((element) => element.mastheadRole === "name");
  const title = changed.find((element) => element.mastheadRole === "title");
  const identity = changed.find((element) => element.mastheadIdentity);
  const heading = changed.find((element) => (
    element.flowRole === "section-chrome" && element.category === "text"
  ));
  const rule = changed.find((element) => (
    element.flowRole === "section-chrome" && element.category === "line"
  ));
  const body = changed.find((element) => (
    element.flowRole === "content" && element.category === "textarea" && element.color === palette.colors.body
  ));
  const meta = changed.find((element) => (
    element.flowRole === "content" && element.category === "textarea" && element.color === palette.colors.muted
  ));
  const folio = changed.find((element) => element.fixedToPage && element.content === "01");
  const contactAnchor = changed.find((element) => element.contactBand?.id === "regent-contact");
  const icons = changed.filter((element) => (
    element.category === "image" && element.contactBandId === "regent-contact"
  ));

  assert.deepEqual(geometry(changed), geometry(source));
  assert.ok(changed.filter((element) => (
    element.fixedToPage && element.left === 0 && element.top === 0 && element.height >= 840
  )).every((element) => element.backgroundColor === palette.colors.paper));
  assert.equal(name.color, palette.colors.ink);
  assert.equal(title.color, palette.colors.accent);
  assert.equal(identity.mastheadIdentity.title.spec.colorHex, palette.colors.accent);
  assert.equal(heading.color, palette.colors.accent);
  assert.equal(rule.backgroundColor, palette.colors.rule);
  assert.ok(body);
  assert.ok(meta);
  assert.equal(folio.color, palette.colors.folio);
  assert.ok(icons.every((element) => element.src.includes("/regent-sapphire/")));
  assert.equal(contactAnchor.contactBand.icon.theme, "regent-sapphire");
  assert.equal(contactAnchor.contactBand.text.colorHex, palette.colors.muted);
  assert.deepEqual(getRegentAppearance(changed), { palette: "sapphire", textSize: "M" });
});

test("Regent preserves custom colours and ignores an unknown edition", () => {
  const custom = {
    category: "text",
    content: "Kolor użytkownika",
    color: "#123456",
    borderColor: "#654321",
  };
  const source = [...regentTemplate, custom];
  const changed = applyRegentPalette(source, "burgundy");

  assert.equal(changed.at(-1).color, "#123456");
  assert.equal(changed.at(-1).borderColor, "#654321");
  assert.equal(applyRegentPalette(source, "not-an-edition"), source);
});

test("Regent typography grows by role and M restores the authored metrics", () => {
  const originalName = regentTemplate.find((element) => element.mastheadRole === "name");
  const originalBody = regentTemplate.find((element) => (
    element.category === "textarea"
    && element.flowRole === "content"
    && !element.bold
    && element.fontSize === 9.5
  ));
  const originalIdentity = regentTemplate.find((element) => element.mastheadIdentity);
  const large = applyRegentTextSize(regentTemplate, "XL");
  const compact = applyRegentTextSize(large, "S");
  const restored = applyRegentTextSize(compact, "M");
  const largeName = large.find((element) => element.mastheadRole === "name");
  const largeBody = large.find((element) => element.content === originalBody.content);
  const restoredName = restored.find((element) => element.mastheadRole === "name");
  const restoredBody = restored.find((element) => element.content === originalBody.content);
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
  assert.deepEqual(getRegentAppearance(restored), { palette: "monochrome", textSize: "M" });
});
