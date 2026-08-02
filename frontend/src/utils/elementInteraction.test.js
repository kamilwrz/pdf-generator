import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isDecorativeChrome } from "./elementInteraction.js";

describe("isDecorativeChrome", () => {
  it("treats fixedToPage as non-interactive chrome", () => {
    assert.equal(isDecorativeChrome({ fixedToPage: true }), true);
    assert.equal(isDecorativeChrome({ fixedToPage: false }), false);
    assert.equal(isDecorativeChrome({}), false);
    assert.equal(isDecorativeChrome(null), false);
  });
});
