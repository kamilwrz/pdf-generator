import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canFreePositionElement,
  isDecorativeChrome,
  EDITOR_MODE_TEMPLATE,
} from "./elementInteraction.js";

describe("isDecorativeChrome", () => {
  it("treats fixedToPage as non-interactive chrome", () => {
    assert.equal(isDecorativeChrome({ fixedToPage: true }), true);
    assert.equal(isDecorativeChrome({ fixedToPage: false }), false);
    assert.equal(isDecorativeChrome({}), false);
    assert.equal(isDecorativeChrome(null), false);
  });
});

describe("canFreePositionElement re-export", () => {
  it("blocks template content drag", () => {
    assert.equal(
      canFreePositionElement(
        { category: "textarea", flowRole: "content" },
        EDITOR_MODE_TEMPLATE,
      ),
      false,
    );
  });
});
