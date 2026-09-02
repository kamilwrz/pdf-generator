import assert from "node:assert/strict";
import test from "node:test";

import { vellumTemplate } from "../templates/vellum.js";
import {
  applyVellumPalette,
  applyVellumTextSize,
  getVellumAppearance,
  VELLUM_PALETTES,
} from "./vellumAppearance.js";

function luminance(hex) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("Vellum defines exactly three light and three strong white-paper palettes", () => {
  assert.equal(VELLUM_PALETTES.length, 6);
  assert.equal(VELLUM_PALETTES.filter((palette) => palette.tone === "light").length, 3);
  assert.equal(VELLUM_PALETTES.filter((palette) => palette.tone === "strong").length, 3);
  assert.ok(VELLUM_PALETTES.every((palette) => palette.colors.paper === "#FFFFFF"));
  assert.equal(new Set(VELLUM_PALETTES.map((palette) => palette.iconTheme)).size, 6);
});

test("Vellum palettes keep ordinary text and field-bound copy above 4.5:1", () => {
  for (const palette of VELLUM_PALETTES) {
    for (const role of ["ink", "body", "muted", "accent", "headingOnPaper"]) {
      assert.ok(
        contrast(palette.colors[role], "#FFFFFF") >= 4.5,
        `${palette.id}.${role} must remain readable on white`,
      );
    }
    assert.ok(
      contrast(palette.colors.headingOnField, palette.colors.field) >= 4.5,
      `${palette.id} heading must contrast its résumé field`,
    );
    assert.ok(
      contrast(palette.colors.summaryText, palette.colors.field) >= 4.5,
      `${palette.id} summary copy must contrast its résumé field`,
    );
  }
});

test("a strong Vellum palette updates semantic decoration, title, fields, and real icons", () => {
  const next = applyVellumPalette(vellumTemplate, "burgundy");
  const palette = VELLUM_PALETTES.find((entry) => entry.id === "burgundy");
  const page = next.find((element) => (
    element.fixedToPage && element.left === 0 && element.top === 0 && element.height >= 840
  ));
  const title = next.find((element) => element.mastheadRole === "title");
  const identity = next.find((element) => element.mastheadIdentity);
  const field = next.find((element) => element.id === "vellum-summary-background");
  const fieldHeading = next.find((element) => (
    element.appearanceColorRole === "headingOnField"
  ));
  const summary = next.find((element) => element.appearanceColorRole === "summaryText");
  const ornament = next.find((element) => element.photoSlot === "ornament");
  const frame = next.find((element) => element.id === "vellum-photo-frame");
  const portrait = next.find((element) => element.id === "vellum-photo-glyph");
  const contactIcon = next.find((element) => (
    element.category === "image" && element.contactBandId === "vellum-contact"
  ));
  const contactAnchor = next.find((element) => element.contactBand?.id === "vellum-contact");
  const languages = next.filter((element) => element.flowRole === "grid-member");

  assert.equal(page.backgroundColor, "#FFFFFF");
  assert.deepEqual(page.appearanceSettings, { palette: "burgundy", textSize: "M" });
  assert.equal(title.color, palette.colors.accent);
  assert.equal(identity.mastheadIdentity.title.spec.colorHex, palette.colors.accent);
  assert.equal(field.backgroundColor, palette.colors.field);
  assert.equal(fieldHeading.color, palette.colors.headingOnField);
  assert.equal(summary.color, palette.colors.summaryText);
  assert.equal(ornament.backgroundColor, palette.colors.ornament);
  assert.equal(frame.backgroundColor, palette.colors.photo);
  assert.match(portrait.src, /\/vellum-burgundy\/portrait\.png$/);
  assert.match(contactIcon.src, /\/vellum-burgundy\//);
  assert.equal(contactAnchor.contactBand.icon.theme, "vellum-burgundy");
  assert.equal(contactAnchor.contactBand.text.colorHex, palette.colors.muted);
  assert.ok(languages.length > 0);
  assert.ok(languages.every((element) => (
    element.color === palette.colors.body
    && element.italic === false
    && element.runs == null
    && element.gridKind === "languages"
  )));
});

test("Vellum palette switching preserves unknown manual colours", () => {
  const custom = vellumTemplate.map((element, index) => (
    index === 0 ? { ...element, borderColor: "#123456" } : element
  ));
  const next = applyVellumPalette(custom, "emerald");
  assert.equal(next[0].borderColor, "#123456");
});

test("Vellum typography restores exact authored metrics when returning to M", () => {
  const originalName = vellumTemplate.find((element) => element.mastheadRole === "name");
  const originalBody = vellumTemplate.find((element) => (
    element.category === "textarea"
    && element.flowRole === "content"
    && element.fontFamily === "Lora"
  ));
  const xl = applyVellumTextSize(vellumTemplate, "XL");
  const restored = applyVellumTextSize(xl, "M");
  const restoredName = restored.find((element) => element.mastheadRole === "name");
  const restoredBody = restored.find((element) => element.content === originalBody.content);

  assert.ok(restoredName.fontSize > originalName.fontSize - 0.01);
  assert.equal(restoredName.fontSize, originalName.fontSize);
  assert.equal(restoredName.lineHeight, originalName.lineHeight);
  assert.equal(restoredBody.fontSize, originalBody.fontSize);
  assert.equal(restoredBody.lineHeight, originalBody.lineHeight);
  assert.deepEqual(getVellumAppearance(restored), { palette: "sage", textSize: "M" });
});
