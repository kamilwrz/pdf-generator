import test from "node:test";
import assert from "node:assert/strict";
import { contactItemWidth, layoutContactBand } from "./contactBandLayout.js";

// Deterministic measure: every glyph is 5 pt wide. Mirrors the charWidth path.
const measure = (text) => text.length * 5;

const baseMetrics = { iconGap: 16, itemPad: 14, lineStep: 16, charWidth: 5.2 };

const centered = {
  mode: "centered",
  anchor: { centerX: 300, startY: 100, maxWidth: 400 },
  text: { fontFamily: "Inter", fontSizePt: 8.4, colorHex: "#3A3A3A" },
  icon: { sizePt: 11, theme: "harbor" },
  metrics: baseMetrics,
  order: ["phone", "email", "linkedin", "github", "website", "location"],
};

test("contactItemWidth = iconGap + measured text + itemPad", () => {
  assert.equal(contactItemWidth("abc", baseMetrics, measure), 16 + 15 + 14);
});

test("contactItemWidth falls back to charWidth when measure returns null", () => {
  assert.equal(contactItemWidth("abcd", baseMetrics, () => null), 16 + 4 * 5.2 + 14);
});

test("centered: a single line is centered on its visible width", () => {
  const items = [{ channel: "phone", label: "111" }, { channel: "email", label: "aa" }];
  const { placements, bottomY } = layoutContactBand(centered, items, measure);
  // advances: phone 16+15+14=45, email 16+10+14=40. visible = 85-14 = 71.
  const firstIconLeft = 300 - 71 / 2; // 264.5
  assert.equal(placements[0].iconLeft, firstIconLeft);
  assert.equal(placements[0].iconTop, 100);
  assert.equal(placements[0].labelLeft, firstIconLeft + 16);
  assert.equal(placements[1].iconLeft, firstIconLeft + 45);
  assert.equal(bottomY, 100); // one row: top of last row == startY
});

test("centered: wraps to a second line past maxWidth and bottomY advances one lineStep", () => {
  // Two long items whose combined advance exceeds maxWidth=80.
  const narrow = { ...centered, anchor: { centerX: 300, startY: 100, maxWidth: 80 } };
  const items = [{ channel: "phone", label: "1234" }, { channel: "email", label: "5678" }];
  const { placements, bottomY } = layoutContactBand(narrow, items, measure);
  assert.equal(placements[0].iconTop, 100);
  assert.equal(placements[1].iconTop, 116); // second line
  assert.equal(bottomY, 116);
});

test("wrapping: left-anchored, wraps at rightLimit", () => {
  const wrapping = {
    ...centered,
    mode: "wrapping",
    anchor: { startX: 44, startY: 104, rightLimit: 120 },
  };
  const items = [{ channel: "phone", label: "1234" }, { channel: "email", label: "5678" }];
  const { placements, bottomY } = layoutContactBand(wrapping, items, measure);
  assert.equal(placements[0].iconLeft, 44);
  assert.equal(placements[0].iconTop, 104);
  assert.equal(placements[1].iconTop, 120); // wrapped: 104 + lineStep 16
  assert.equal(bottomY, 120);
});

test("stacked: one channel per row, bottomY at the last row", () => {
  const stacked = {
    mode: "stacked",
    anchor: { startX: 44, startY: 100 },
    text: { fontFamily: "Inter", fontSizePt: 8.4, colorHex: "#3A3A3A" },
    icon: { sizePt: 11, theme: "nova" },
    metrics: { iconGap: 16, itemPad: 14, lineStep: 18, charWidth: 5.2 },
    order: ["phone", "email", "location"],
  };
  const items = [
    { channel: "phone", label: "111" },
    { channel: "email", label: "aa" },
    { channel: "location", label: "Wwa" },
  ];
  const { placements, bottomY } = layoutContactBand(stacked, items, () => 10);
  assert.equal(placements[0].iconLeft, 44);
  assert.equal(placements[0].iconTop, 100);
  assert.equal(placements[1].iconTop, 118);
  assert.equal(placements[2].labelLeft, 60);
  assert.equal(placements[2].labelTop, 136);
  assert.equal(bottomY, 136);
});

const chipDesc = {
  mode: "chip",
  anchor: { startX: 48, startY: 108, rightLimit: 547 },
  text: { fontFamily: "JetBrains Mono", fontSizePt: 7.8, colorHex: "#333" },
  icon: { sizePt: 15, theme: "test-chip" },
  metrics: {
    chipH: 20, iconSize: 15, padLeft: 6, labelOffset: 27,
    widthBase: 28, widthPerChar: 5.2, minWidth: 120, maxWidth: 168,
    chipGap: 8, lineStep: 28, charWidth: 5.2,
  },
};

test("chip: rect + icon + label geometry and clamped width", () => {
  const items = [{ channel: "phone", label: "+48 111 222 333" }];
  const { placements } = layoutContactBand(chipDesc, items, () => 999);
  const p = placements[0];
  const expectedWidth = Math.max(120, Math.min(168, 28 + "+48 111 222 333".length * 5.2));
  assert.equal(p.rectLeft, 48);
  assert.equal(p.rectTop, 108);
  assert.equal(p.rectWidth, expectedWidth);
  assert.equal(p.iconLeft, 54); // 48 + padLeft 6
  assert.equal(p.labelLeft, 75); // 48 + labelOffset 27
  const textTop = 108 + (20 - 7.8) / 2;
  assert.equal(p.iconTop, textTop);
  assert.equal(p.labelTop, textTop);
});

test("chip: wraps to the next band when the row exceeds rightLimit", () => {
  const long = { channel: "email", label: "someverylongemail@example.com" };
  const items = [long, long, long, long, long];
  const { placements } = layoutContactBand(chipDesc, items, () => 10);
  assert.ok(placements.some((p) => p.rectTop > 108), "expected a wrapped row");
});

test("removing the middle item closes the gap (no empty slot)", () => {
  const items = [{ channel: "phone", label: "111" }, { channel: "location", label: "xx" }];
  const { placements } = layoutContactBand(centered, items, measure);
  assert.equal(placements.length, 2);
  assert.equal(placements[1].iconLeft, placements[0].iconLeft + (16 + 15 + 14));
});
