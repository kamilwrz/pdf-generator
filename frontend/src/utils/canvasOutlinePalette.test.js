import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canvasOutlineStyle } from "./canvasOutlinePalette.js";

const bounds = { left: 30, top: 40, width: 100, height: 50 };
const rectangle = (backgroundColor, overrides = {}) => ({
  category: "rectangle", filled: true, left: 0, top: 0, width: 595, height: 842,
  backgroundColor, page: 1, zIndex: 0, ...overrides,
});
const expected = (surface) => Object.fromEntries(["element", "entry", "section"].map(
  (role) => [`--canvas-outline-${role}`, `var(--color-canvas-${role}-${surface})`],
));

test("white paper and invalid bounds use the shared light-surface colours", () => {
  assert.deepEqual(canvasOutlineStyle([], bounds), expected("light"));
  assert.deepEqual(canvasOutlineStyle([rectangle("#101820")], null), expected("light"));
  assert.deepEqual(canvasOutlineStyle([], { ...bounds, left: NaN }), expected("light"));
});

test("dark fills follow the outlined region and page instead of a template-wide theme", () => {
  const elements = [rectangle("#fff"), rectangle("#12263A", { width: 160, zIndex: 1 })];
  assert.deepEqual(canvasOutlineStyle(elements, bounds), expected("dark"));
  assert.deepEqual(canvasOutlineStyle(elements, { ...bounds, left: 300 }), expected("light"));
  assert.deepEqual(canvasOutlineStyle(elements, bounds, 2), expected("light"));
  assert.deepEqual(canvasOutlineStyle([rectangle("#12263A", { page: 2 })], bounds, 2), expected("dark"));
});

test("paint order uses z-index then document order without mutating source elements", () => {
  const white = Object.freeze(rectangle("#fff", { zIndex: 2 }));
  const navy = Object.freeze(rectangle("#12263A", { zIndex: 1 }));
  const elements = Object.freeze([white, navy]);
  assert.deepEqual(canvasOutlineStyle(elements, bounds), expected("light"));
  assert.deepEqual(canvasOutlineStyle([rectangle("#fff"), rectangle("#12263A")], bounds), expected("dark"));
  assert.deepEqual(elements, [white, navy]);
});

test("stroke-only rectangles, thin rules, text, images and invalid colours do not become surfaces", () => {
  const ignored = [
    rectangle("#000", { filled: false }),
    rectangle("#000", { height: 2 }),
    rectangle("#000", { width: 2 }),
    rectangle("#000", { category: "text" }),
    rectangle("#000", { category: "image" }),
    rectangle("linear-gradient(black, black)"),
    rectangle("rgba(no, valid, channels, 1)"),
    rectangle("#000", { left: NaN }),
  ];
  assert.deepEqual(canvasOutlineStyle(ignored, bounds), expected("light"));
});

test("hex and RGB alpha composite through lower fills over white paper", () => {
  for (const colour of ["#000e", "#000000ee", "rgba(0, 0, 0, .94)", "rgb(0 0 0 / 94%)"]) {
    assert.deepEqual(canvasOutlineStyle([rectangle(colour)], bounds), expected("dark"), colour);
  }
  for (const colour of ["#0000", "#00000000", "rgba(0, 0, 0, .05)", "rgb(100% 100% 100% / 95%)"]) {
    assert.deepEqual(canvasOutlineStyle([rectangle(colour)], bounds), expected("light"), colour);
  }
  const overlay = rectangle("rgba(255,255,255,0.95)", { zIndex: 1 });
  assert.deepEqual(canvasOutlineStyle([rectangle("#000"), overlay], bounds), expected("light"));
  assert.deepEqual(canvasOutlineStyle([rectangle("#000"), rectangle("transparent", { zIndex: 1 })], bounds), expected("dark"));
});

test("the weakest sample controls contrast where an outline crosses light and dark regions", () => {
  const halfDark = rectangle("#12263A", { width: 80 });
  // A centre-only check would choose the light blue family on navy and become
  // nearly invisible on the white half. The darker family has the better
  // minimum contrast across the actual mixed region.
  assert.deepEqual(canvasOutlineStyle([halfDark], bounds), expected("light"));
});

test("a narrow dark field uses the white exterior where its padded outline is painted", () => {
  const band = rectangle("#12263A", bounds);
  assert.deepEqual(canvasOutlineStyle([band], bounds), expected("light"));
});

test("each perimeter follows its own screen-space padding at the live canvas zoom", () => {
  const band = rectangle("#12263A", { left: 27, top: 37, width: 106, height: 56 });
  assert.deepEqual(canvasOutlineStyle([band], bounds, 1, 1), expected("light"));
  assert.deepEqual(canvasOutlineStyle([band], bounds, 1, 2), {
    ...expected("light"), "--canvas-outline-element": "var(--color-canvas-element-dark)",
  });
  assert.deepEqual(canvasOutlineStyle([band], bounds, 1, 4), expected("dark"));
  assert.deepEqual(canvasOutlineStyle([band], bounds, 1, NaN), expected("light"));
});

test("the chosen central colours meet 3:1 on representative light and dark template surfaces", async () => {
  const css = await readFile(new URL("../index.css", import.meta.url), "utf8");
  const source = await readFile(new URL("./canvasOutlinePalette.js", import.meta.url), "utf8");
  const luminance = (hex) => {
    const rgb = hex.slice(1).match(/../g).map((pair) => Number.parseInt(pair, 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const background of ["#FFFFFF", "#F5F1E8", "#DDE0E3", "#12263A", "#252525", "#421F2B"]) {
    const style = canvasOutlineStyle([rectangle(background)], bounds);
    for (const token of Object.values(style)) {
      const name = token.slice(4, -1);
      const colour = css.match(new RegExp(`${name}:\\s*(#[\\da-f]{6})`, "i"))?.[1];
      assert.ok(colour, `central token ${name} exists`);
      assert.ok(source.includes(colour.toUpperCase()), `${name} matches its contrast reference`);
      const values = [luminance(colour), luminance(background)].sort((a, b) => a - b);
      assert.ok((values[1] + 0.05) / (values[0] + 0.05) >= 3, `${name} contrasts ${background}`);
    }
  }
});
