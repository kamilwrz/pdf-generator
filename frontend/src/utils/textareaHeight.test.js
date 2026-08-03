import test from "node:test";
import assert from "node:assert/strict";
import {
  measureNaturalScrollHeight,
  shouldShrinkPreservedLayout,
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
