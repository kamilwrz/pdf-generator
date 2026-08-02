import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createCircleElement,
  createImageElement,
  createTextElement,
  createTextareaElement,
} from "./a4ElementFactories.js";

describe("a4ElementFactories", () => {
  it("creates text on the requested page", () => {
    const el = createTextElement({ elementId: "t1", page: 2 });
    assert.equal(el.element_id, "t1");
    assert.equal(el.category, "text");
    assert.equal(el.page, 2);
  });

  it("keeps circle width and height equal", () => {
    const el = createCircleElement({ elementId: "c1" });
    assert.equal(el.width, el.height);
  });

  it("scales image height from natural aspect ratio", () => {
    const el = createImageElement({
      elementId: "i1",
      src: "https://example.com/images/9/content",
      imgId: 9,
      naturalWidth: 200,
      naturalHeight: 100,
    });
    assert.equal(el.width, 100);
    assert.equal(el.height, 50);
    assert.equal(el.img_id, 9);
    assert.equal(el.src, "https://example.com/images/9/content");
  });

  it("creates an editing textarea with measured height", () => {
    const el = createTextareaElement({ elementId: "ta1" });
    assert.equal(el.category, "textarea");
    assert.equal(el.isEditing, true);
    assert.ok(el.height > 0);
  });
});
