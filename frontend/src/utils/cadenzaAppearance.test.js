import assert from "node:assert/strict";
import test from "node:test";

import { cadenzaTemplate } from "../templates/cadenza.js";
import {
  applyCadenzaPalette,
  applyCadenzaTextSize,
  CADENZA_PALETTES,
  getCadenzaAppearance,
} from "./cadenzaAppearance.js";

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(left, right) {
  const light = Math.max(relativeLuminance(left), relativeLuminance(right));
  const dark = Math.min(relativeLuminance(left), relativeLuminance(right));
  return (light + 0.05) / (dark + 0.05);
}

test("Cadenza exposes three light and three strong white-paper palettes", () => {
  assert.equal(CADENZA_PALETTES.length, 6);
  assert.equal(new Set(CADENZA_PALETTES.map(({ id }) => id)).size, 6);
  assert.equal(new Set(CADENZA_PALETTES.map(({ name }) => name)).size, 6);
  assert.equal(CADENZA_PALETTES.filter(({ tone }) => tone === "light").length, 3);
  assert.equal(CADENZA_PALETTES.filter(({ tone }) => tone === "strong").length, 3);
  assert.ok(CADENZA_PALETTES.every(({ colors }) => colors.paper === "#FFFFFF"));
});

test("Cadenza text and adaptive section headings meet normal-text contrast", () => {
  for (const palette of CADENZA_PALETTES) {
    for (const role of ["ink", "body", "muted", "accent"]) {
      const ratio = contrast(palette.colors[role], palette.colors.paper);
      assert.ok(ratio >= 4.5, `${palette.id}.${role} contrast is ${ratio.toFixed(2)}:1`);
    }
    const headingRatio = contrast(palette.colors.headingText, palette.colors.band);
    assert.ok(
      headingRatio >= 4.5,
      `${palette.id} heading contrast is ${headingRatio.toFixed(2)}:1`,
    );
    if (palette.tone === "light") {
      assert.ok(relativeLuminance(palette.colors.band) >= 0.8);
      assert.notEqual(palette.colors.headingText, "#FFFFFF");
    } else {
      assert.ok(relativeLuminance(palette.colors.band) <= 0.16);
      assert.equal(palette.colors.headingText, "#FFFFFF");
    }
  }
});

test("palette updates white paper, adaptive bands, job line, marks, language entries, and icons", () => {
  const changed = applyCadenzaPalette(cadenzaTemplate, "burgundy");
  const palette = CADENZA_PALETTES.find(({ id }) => id === "burgundy");
  const page = changed.find((element) => (
    element.fixedToPage && Number(element.width) === 595 && Number(element.height) === 842
  ));
  const band = changed.find((element) => (
    element.flowRole === "section-chrome" && Number(element.width) === 479
    && Number(element.height) === 18
  ));
  const mark = changed.find((element) => (
    element.flowRole === "section-chrome" && Number(element.width) === 3
    && Number(element.height) === 18
  ));
  const heading = changed.find((element) => (
    element.flowRole === "section-chrome" && element.category === "text"
  ));
  const job = changed.find((element) => element.mastheadRole === "title");
  const contactAnchor = changed.find((element) => element.contactBand?.id === "cadenza-contact");
  const identityAnchor = changed.find((element) => element.mastheadIdentity);
  const languages = changed.filter((element) => element.flowRole === "grid-member");

  assert.equal(page.backgroundColor, "#FFFFFF");
  assert.equal(band.backgroundColor, "#6C2A3E");
  assert.equal(mark.backgroundColor, "#D4A06A");
  assert.equal(heading.color, "#FFFFFF");
  assert.equal(job.color, "#85364F");
  assert.ok(changed.filter((element) => element.category === "image").every(
    (element) => element.src.includes("/template-assets/iconic/cadenza-burgundy/"),
  ));
  assert.equal(contactAnchor.contactBand.text.colorHex, "#685A60");
  assert.equal(contactAnchor.contactBand.icon.theme, "cadenza-burgundy");
  assert.equal(identityAnchor.mastheadIdentity.title.spec.colorHex, "#85364F");
  assert.ok(languages.length > 0);
  assert.ok(languages.every((element) => (
    element.color === palette.colors.body
    && element.italic === false
    && element.runs == null
    && element.gridKind === "languages"
  )));
  assert.deepEqual(getCadenzaAppearance(changed), { palette: "burgundy", textSize: "M" });
});

test("palette replacement preserves an unrecognised manual colour", () => {
  const custom = { category: "text", content: "Custom", color: "#123456" };
  const changed = applyCadenzaPalette([...cadenzaTemplate, custom], "emerald");
  assert.equal(changed.at(-1).color, "#123456");
});

test("Cadenza typography is role-aware and returning to M restores authored metrics", () => {
  const original = cadenzaTemplate;
  const large = applyCadenzaTextSize(original, "XL");
  const restored = applyCadenzaTextSize(large, "M");
  const originalName = original.find((element) => element.mastheadRole === "name");
  const largeName = large.find((element) => element.mastheadRole === "name");
  const originalBody = original.find((element) => (
    element.flowRole === "content" && element.category === "textarea" && !element.bold
    && Number(element.lineHeight) === 11.2
  ));
  const largeBody = large.find((element) => element.content === originalBody.content);
  const restoredName = restored.find((element) => element.mastheadRole === "name");
  const restoredBody = restored.find((element) => element.content === originalBody.content);
  const restoredIdentity = restored.find((element) => element.mastheadIdentity);

  assert.equal(largeName.appearanceTypographyRole, "display");
  assert.equal(largeBody.appearanceTypographyRole, "body");
  assert.ok(largeName.fontSize > originalName.fontSize);
  assert.ok(largeBody.fontSize > originalBody.fontSize);
  assert.equal(restoredName.fontSize, originalName.fontSize);
  assert.equal(restoredBody.fontSize, originalBody.fontSize);
  assert.equal(
    restoredIdentity.mastheadIdentity.title.spec.fontSizePt,
    original.find((element) => element.mastheadIdentity)?.mastheadIdentity.title.spec.fontSizePt,
  );
  assert.deepEqual(getCadenzaAppearance(restored), { palette: "porcelain", textSize: "M" });
});
