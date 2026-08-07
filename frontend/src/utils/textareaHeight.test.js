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

test("trims trailing empties from plain textareas without touching mid gaps", () => {
  assert.equal(
    trimTrailingEmptyTextareaLines("line a\n\nline b\n\n\n"),
    "line a\n\nline b",
  );
});

test("re-bases runs when trailing empties are removed", () => {
  const runs = [{ start: 0, end: 3, bold: true }, { start: 10, end: 12, italic: true }];
  const result = trimTrailingEmptyTextareaPayload("abc\n\n\n", runs);
  assert.equal(result.content, "abc");
  assert.deepEqual(result.runs, [{ start: 0, end: 3, bold: true }]);
});

test("measureTextareaHeight ignores trailing empty rows", () => {
  const solid = measureTextareaHeight("hello", 200, 10, 14);
  const padded = measureTextareaHeight("hello\n\n\n", 200, 10, 14);
  assert.equal(padded, solid);
});
