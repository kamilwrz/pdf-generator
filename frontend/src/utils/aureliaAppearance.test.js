import assert from "node:assert/strict";
import test from "node:test";

import { aureliaTemplate } from "../templates/aurelia.js";
import {
  applyAureliaPalette,
  applyAureliaTextSize,
  AURELIA_PALETTES,
  getAureliaAppearance,
} from "./aureliaAppearance.js";

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrastRatio(first, second) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

test("Aurelia exposes six semantic palettes and authored defaults", () => {
  assert.equal(AURELIA_PALETTES.length, 6);
  assert.equal(new Set(AURELIA_PALETTES.map((palette) => palette.id)).size, 6);
  assert.deepEqual(getAureliaAppearance(aureliaTemplate), {
    palette: "gilded",
    textSize: "M",
  });
});

test("Aurelia keeps every text role readable on the fixed white paper", () => {
  for (const palette of AURELIA_PALETTES) {
    assert.equal(palette.colors.paper, "#FFFFFF");
    for (const role of ["ink", "body", "muted", "heading"]) {
      assert.ok(
        contrastRatio(palette.colors[role], palette.colors.paper) >= 4.5,
        `${palette.id} ${role} must meet WCAG AA`,
      );
    }
  }
});

test("Aurelia palette recolors frame, rules, hidden title, and real icons", () => {
  const changed = applyAureliaPalette(aureliaTemplate, "burgundy");
  const frame = changed.find((element) => element.id === "aurelia-masthead-frame");
  const sectionRule = changed.find((element) => (
    element.category === "line" && element.flowRole === "section-chrome"
  ));
  const icon = changed.find((element) => element.category === "image");
  const identity = changed.find((element) => element.mastheadIdentity)?.mastheadIdentity;
  const background = changed.find((element) => element.appearanceTemplateId === "aurelia");

  assert.equal(frame?.backgroundColor, "#7E4050");
  assert.equal(sectionRule?.backgroundColor, "#7E4050");
  assert.match(icon?.src || "", /\/aurelia-burgundy\//);
  assert.equal(identity?.title?.spec?.colorHex, "#4A2D36");
  assert.equal(background?.backgroundColor, "#FFFFFF");
  assert.deepEqual(background?.appearanceSettings, { palette: "burgundy", textSize: "M" });
});

test("Aurelia typography presets return exactly to the authored M metrics", () => {
  const baseline = aureliaTemplate
    .filter((element) => ["text", "textarea"].includes(element.category))
    .map((element) => [element.content, element.fontSize, element.lineHeight]);
  const restored = applyAureliaTextSize(
    applyAureliaTextSize(aureliaTemplate, "XL"),
    "M",
  );
  const restoredMetrics = restored
    .filter((element) => ["text", "textarea"].includes(element.category))
    .map((element) => [element.content, element.fontSize, element.lineHeight]);

  assert.deepEqual(restoredMetrics, baseline);
  assert.equal(getAureliaAppearance(restored).textSize, "M");
});
