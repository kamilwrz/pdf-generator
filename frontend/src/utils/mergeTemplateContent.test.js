import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeTemplateContent } from "./mergeTemplateContent.js";

function text(overrides = {}) {
  return {
    element_id: overrides.element_id || "element",
    id: overrides.id || "summary-body",
    category: "textarea",
    flowRole: "content",
    flowLane: "main",
    content: "Original",
    ...overrides,
  };
}

describe("mergeTemplateContent", () => {
  it("uses the current canvas text while preserving target template fields", () => {
    const current = [text({
      element_id: "old",
      content: "Translated by AI",
      color: "#AA0000",
    })];
    const generated = [text({
      element_id: "new",
      content: "Polish source",
      color: "#000000",
      left: 400,
      top: 200,
    })];

    const [merged] = mergeTemplateContent(current, generated);

    assert.equal(merged.content, "Translated by AI");
    assert.equal(merged.color, "#000000");
    assert.equal(merged.left, 400);
    assert.equal(merged.top, 200);
  });

  it("does not transfer section chrome", () => {
    const current = [text({
      id: "summary-heading",
      flowRole: "section-chrome",
      content: "PROFESSIONAL SUMMARY",
    })];
    const generated = [text({
      id: "summary-heading",
      flowRole: "section-chrome",
      content: "PODSUMOWANIE ZAWODOWE",
    })];

    assert.equal(mergeTemplateContent(current, generated)[0].content, "PODSUMOWANIE ZAWODOWE");
  });

  it("transfers an intentional empty AI result", () => {
    const current = [text({ content: "" })];
    const generated = [text({ content: "Old source" })];

    assert.equal(mergeTemplateContent(current, generated)[0].content, "");
  });
});
