import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertCanvasElementRoot } from "./canvasElementSchema.js";

describe("assertCanvasElementRoot", () => {
  it("accepts a valid element list", () => {
    assert.doesNotThrow(() => assertCanvasElementRoot([
      { element_id: "a", category: "text", content: "Hi" },
      { element_id: "b", category: "image", src: "/x", img_id: 1 },
    ]));
  });

  it("rejects unknown categories", () => {
    assert.throws(
      () => assertCanvasElementRoot([{ element_id: "a", category: "widget" }]),
      /kategorię/,
    );
  });

  it("rejects missing element_id", () => {
    assert.throws(
      () => assertCanvasElementRoot([{ category: "text" }]),
      /identyfikatora/,
    );
  });
});
