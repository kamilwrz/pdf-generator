import test from "node:test";
import assert from "node:assert/strict";

import { amaranthTemplate } from "../templates/amaranth.js";
import {
  AMARANTH_PALETTES,
  DEFAULT_AMARANTH_PALETTE,
  applyAmaranthPalette,
  applyAmaranthTextSize,
  getAmaranthAppearance,
} from "./amaranthAppearance.js";

const withIds = () => amaranthTemplate.map((element, index) => ({ ...element, element_id: `a-${index}` }));

test("Amaranth exposes six white-paper palettes with unique ids and icon themes", () => {
  assert.equal(AMARANTH_PALETTES.length, 6);
  assert.equal(new Set(AMARANTH_PALETTES.map((p) => p.id)).size, 6);
  assert.equal(new Set(AMARANTH_PALETTES.map((p) => p.colors.iconTheme ?? p.iconTheme)).size, 6);
  for (const palette of AMARANTH_PALETTES) {
    assert.equal(palette.colors.paper, "#FFFFFF", `${palette.id} keeps white paper`);
    assert.match(palette.iconTheme, /^amaranth-[a-z]+$/);
  }
});

test("the authored starter reports the default claret palette at size M", () => {
  assert.deepEqual(getAmaranthAppearance(withIds()), { palette: DEFAULT_AMARANTH_PALETTE, textSize: "M" });
});

test("applying a palette recolours the accent chrome, real icons, and persists intent", () => {
  const forest = AMARANTH_PALETTES.find((p) => p.id === "forest");
  const applied = applyAmaranthPalette(withIds(), "forest");

  const pageBackground = applied.find(
    (element) => element.fixedToPage && element.width === 595 && element.height === 842,
  );
  assert.equal(pageBackground.backgroundColor, "#FFFFFF", "paper stays white");

  const chip = applied.find(
    (element) => element.flowRole === "section-chrome" && element.category === "rectangle" && element.filled,
  );
  assert.equal(chip.backgroundColor, forest.colors.accent);

  const accentBar = applied.find((element) => element.id === "amaranth-masthead-accent");
  assert.equal(accentBar.backgroundColor, forest.colors.accent);

  const well = applied.find((element) => element.appearanceColorRole === "photo");
  assert.equal(well.backgroundColor, forest.colors.photo);

  const icon = applied.find((element) => /\/iconic\/amaranth-/.test(String(element.src || "")));
  assert.match(icon.src, /\/amaranth-forest\//);

  assert.deepEqual(getAmaranthAppearance(applied), { palette: "forest", textSize: "M" });
});

test("text-size presets scale content, keep the display name fixed, and restore exact M metrics", () => {
  const source = withIds();
  const name = source.find((element) => element.mastheadRole === "name");
  const body = source.find((element) => element.flowRole === "content" && element.category === "textarea");

  const xl = applyAmaranthTextSize(source, "XL");
  const nameXl = xl.find((element) => element.element_id === name.element_id);
  const bodyXl = xl.find((element) => element.element_id === body.element_id);
  assert.equal(nameXl.fontSize, name.fontSize, "the Playfair name never changes size");
  assert.ok(bodyXl.fontSize > body.fontSize, "body copy grows at XL");

  const restored = applyAmaranthTextSize(xl, "M").find((element) => element.element_id === body.element_id);
  assert.ok(Math.abs(restored.fontSize - body.fontSize) < 0.01, "XL -> M restores the authored size");
  assert.equal(getAmaranthAppearance(xl).textSize, "XL");
});

test("the rounded section chip labels never change size across presets", () => {
  const source = withIds();
  const label = source.find(
    (element) => element.flowRole === "section-chrome" && element.category === "text",
  );
  for (const size of ["S", "L", "XL"]) {
    const applied = applyAmaranthTextSize(source, size).find((element) => element.element_id === label.element_id);
    assert.equal(applied.fontSize, label.fontSize, `chip label stays fixed at ${size} so it cannot overflow its rectangle`);
  }
});
