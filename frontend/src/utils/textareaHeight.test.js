import test from "node:test";
import assert from "node:assert/strict";
import {
  isEmptyTextareaLine,
  measureNaturalScrollHeight,
  measureTextareaHeight,
  shouldShrinkPreservedLayout,
  trimTrailingEmptyTextareaLines,
  trimTrailingEmptyTextareaPayload,
} from "./textareaHeight.js";

test("measures intrinsic content height instead of preserving an oversized box", () => {
  const node = {
    style: { height: "96px" },
    get scrollHeight() {
      return this.style.height === "auto" ? 42 : 96;
    },
  };

  assert.equal(measureNaturalScrollHeight(node), 42);
  assert.equal(node.style.height, "96px");
});

test("returns zero for an unavailable element", () => {
  assert.equal(measureNaturalScrollHeight(null), 0);
});

test("shrinks preserveInitialLayout boxes only when browser metrics are shorter", () => {
  assert.equal(shouldShrinkPreservedLayout(67, 54), true);
  assert.equal(shouldShrinkPreservedLayout(54, 54), false);
  assert.equal(shouldShrinkPreservedLayout(54, 60), false);
  assert.equal(shouldShrinkPreservedLayout(54, 0), false);
  assert.equal(shouldShrinkPreservedLayout("66", "58"), true);
});

test("trims trailing blank and bare-bullet lines from bullet lists", () => {
  assert.equal(isEmptyTextareaLine("• ", true), true);
  assert.equal(isEmptyTextareaLine("• real item", true), false);
  assert.equal(
    trimTrailingEmptyTextareaLines("• one\n• two\n\n• \n\n", { bulletList: true }),
    "• one\n• two",
  );
  assert.equal(
    trimTrailingEmptyTextareaLines("• one\n\n", {
      bulletList: true,
      keepTrailingEmptyLines: 1,
    }),
    "• one\n",
  );
});

test("preserves trailing and middle blank paragraphs in plain textareas", () => {
  assert.equal(
    trimTrailingEmptyTextareaLines("line a\n\nline b\n\n\n"),
    "line a\n\nline b\n\n\n",
  );
});

test("preserves blank paragraphs between a heading line and a bullet group", () => {
  assert.equal(
    trimTrailingEmptyTextareaLines("Języki\n\n• Polski\n• Angielski\n\n", {
      bulletList: true,
    }),
    "Języki\n\n• Polski\n• Angielski",
  );
  assert.equal(
    trimTrailingEmptyTextareaLines("Intro\n\n• one\n\n• two\n• three", {
      bulletList: true,
    }),
    "Intro\n\n• one\n\n• two\n• three",
  );
});

test("re-bases runs when trailing empties are removed", () => {
  const runs = [{ start: 0, end: 5, bold: true }, { start: 12, end: 14, italic: true }];
  const result = trimTrailingEmptyTextareaPayload("• abc\n\n• \n\n", runs, {
    bulletList: true,
  });
  assert.equal(result.content, "• abc");
  assert.deepEqual(result.runs, [{ start: 0, end: 5, bold: true }]);
});

test("measureTextareaHeight counts authored plain trailing empty rows", () => {
  const solid = measureTextareaHeight("hello", 200, 10, 14);
  const padded = measureTextareaHeight("hello\n\n\n", 200, 10, 14);
  assert.equal(padded, solid + (3 * 14));
});

test("measureTextareaHeight ignores trailing bullet placeholders", () => {
  const solid = measureTextareaHeight("• hello", 200, 10, 14, { bulletList: true });
  const padded = measureTextareaHeight("• hello\n• \n\n", 200, 10, 14, {
    bulletList: true,
  });
  assert.equal(padded, solid);
});

test("glyph-width measurement catches word wraps hidden by the character-count fallback", () => {
  const measureTextWidth = (text) => [...String(text)].reduce((width, character) => (
    width + (character === "W" ? 10 : character === " " ? 2 : 4)
  ), 0);

  const fallback = measureTextareaHeight("WW WW", 30, 10, 14);
  const measured = measureTextareaHeight("WW WW", 30, 10, 14, {
    measureTextWidth,
  });

  assert.equal(fallback, 20);
  assert.equal(measured, 34);
});

test("glyph-width measurement reserves the rendered bullet marker column", () => {
  const measureTextWidth = (text) => [...String(text)].reduce((width, character) => (
    width + (character === "W" ? 10 : character === " " ? 2 : 4)
  ), 0);

  assert.equal(
    measureTextareaHeight("• WWW", 30, 10, 14, {
      bulletList: true,
      measureTextWidth,
    }),
    34,
  );
});
