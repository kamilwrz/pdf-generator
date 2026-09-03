import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prepareStarterElementsForRender } from "./starterElementStructure.js";

describe("starter render copy", () => {
  it("drops an empty contact channel without mutating the editor elements", () => {
    const source = [
      { element_id: "icon", category: "image", contactChannel: "email", src: "/mail.svg" },
      { element_id: "label", category: "text", contactChannel: "email", content: "", starterPlaceholder: true, cvDataBindings: [{ path: ["email"] }] },
      { element_id: "name", category: "text", content: "Ada" },
    ];
    const rendered = prepareStarterElementsForRender(source);
    assert.deepEqual(rendered.map((element) => element.element_id), ["name"]);
    assert.equal(source.length, 3);
  });

  it("keeps a completed starter field", () => {
    const rendered = prepareStarterElementsForRender([{
      element_id: "email",
      category: "text",
      content: "ada@example.com",
      contactChannel: "email",
      starterPlaceholder: false,
      cvDataBindings: [{ path: ["email"] }],
    }]);
    assert.equal(rendered.length, 1);
  });

  it("keeps a real starter photo and its frame", () => {
    const source = [
      { element_id: "frame", category: "rectangle", photoSlot: "frame", starterSectionKey: "photo", starterPlaceholder: false },
      { element_id: "photo", category: "image", photoSlot: "image", src: "/owned/photo.png", starterSectionKey: "photo", starterPlaceholder: false },
    ];
    const rendered = prepareStarterElementsForRender(source);
    assert.deepEqual(rendered.map((element) => element.element_id), ["frame", "photo"]);
  });

  it("drops the untouched starter photo cluster", () => {
    const source = [
      { element_id: "frame", category: "rectangle", photoSlot: "frame", starterSectionKey: "photo", starterPlaceholder: false },
      { element_id: "glyph", category: "image", photoSlot: "glyph", src: "/portrait-placeholder.png", starterSectionKey: "photo", starterPlaceholder: true },
    ];
    assert.deepEqual(prepareStarterElementsForRender(source), []);
  });
});
