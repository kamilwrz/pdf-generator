import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeRuns,
  applyMark,
  rangeHasMark,
  rangeColor,
  sliceRuns,
  styledSegments,
  hasRuns,
} from "./textRuns.js";

test("normalizeRuns clamps, drops empty, and merges adjacent equal spans", () => {
  const content = "abcdef";
  const runs = [
    { start: -5, end: 2, bold: true }, // clamps start to 0
    { start: 2, end: 4, bold: true }, // merges with the previous bold span
    { start: 4, end: 4, italic: true }, // empty → dropped
    { start: 10, end: 20, bold: true }, // out of range → dropped
  ];
  assert.deepEqual(normalizeRuns(content, runs), [
    { start: 0, end: 4, bold: true },
  ]);
});

test("later runs overlay earlier ones on overlap", () => {
  const content = "abcdef";
  const runs = [
    { start: 0, end: 6, bold: true },
    { start: 2, end: 4, italic: true },
  ];
  assert.deepEqual(normalizeRuns(content, runs), [
    { start: 0, end: 2, bold: true },
    { start: 2, end: 4, bold: true, italic: true },
    { start: 4, end: 6, bold: true },
  ]);
});

test("applyMark adds a mark and rangeHasMark reflects it", () => {
  const content = "Analiza KYC oraz AML";
  const runs = applyMark(content, [], 8, 11, "bold", true);
  assert.deepEqual(runs, [{ start: 8, end: 11, bold: true }]);
  assert.equal(rangeHasMark(content, runs, 8, 11, "bold"), true);
  assert.equal(rangeHasMark(content, runs, 0, 11, "bold"), false);
});

test("applyMark with a falsy value removes the mark, reverting to base", () => {
  const content = "abcdef";
  const bolded = applyMark(content, [], 0, 6, "bold", true);
  const cleared = applyMark(content, bolded, 2, 4, "bold", false);
  assert.deepEqual(cleared, [
    { start: 0, end: 2, bold: true },
    { start: 4, end: 6, bold: true },
  ]);
});

test("applyMark sets a color and can change it", () => {
  const content = "abcdef";
  let runs = applyMark(content, [], 1, 3, "color", "#ff0000");
  assert.deepEqual(runs, [{ start: 1, end: 3, color: "#ff0000" }]);
  runs = applyMark(content, runs, 1, 3, "color", "#00ff00");
  assert.deepEqual(runs, [{ start: 1, end: 3, color: "#00ff00" }]);
});

test("rangeColor returns a shared hex or null for mixed / unmarked ranges", () => {
  const content = "abcdef";
  const red = applyMark(content, [], 1, 4, "color", "#ff0000");
  assert.equal(rangeColor(content, red, 1, 4), "#ff0000");
  assert.equal(rangeColor(content, red, 0, 4), null);
  const mixed = applyMark(content, red, 3, 4, "color", "#00ff00");
  assert.equal(rangeColor(content, mixed, 1, 4), null);
});

test("sliceRuns re-bases runs onto a substring window", () => {
  const runs = [
    { start: 2, end: 10, bold: true },
    { start: 12, end: 15, italic: true },
  ];
  // Window [5, 13): the bold span clips to [5,10)→[0,5), italic clips to [12,13)→[7,8).
  assert.deepEqual(sliceRuns(runs, 5, 13), [
    { start: 0, end: 5, bold: true },
    { start: 7, end: 8, italic: true },
  ]);
});

test("styledSegments covers the whole string including plain gaps", () => {
  const content = "Analiza KYC";
  const runs = [{ start: 8, end: 11, bold: true, color: "#ff0000" }];
  assert.deepEqual(styledSegments(content, runs), [
    { text: "Analiza ", bold: false, italic: false, underline: false, color: null },
    { text: "KYC", bold: true, italic: false, underline: false, color: "#ff0000" },
  ]);
});

test("styledSegments returns a single plain segment when there are no runs", () => {
  assert.deepEqual(styledSegments("Hello", []), [
    { text: "Hello", bold: false, italic: false, underline: false, color: null },
  ]);
});

test("hasRuns ignores empty and no-op arrays", () => {
  assert.equal(hasRuns([]), false);
  assert.equal(hasRuns([{ start: 0, end: 2 }]), false);
  assert.equal(hasRuns([{ start: 0, end: 2, bold: true }]), true);
});
