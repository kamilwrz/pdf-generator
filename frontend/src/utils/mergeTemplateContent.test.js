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

  it("does not map masthead contacts into the name slot", () => {
    const current = [
      text({ id: undefined, element_id: "phone", flowRole: "masthead", mastheadRole: "contact", contactChannel: "phone", content: "694 732 542" }),
      text({ id: undefined, element_id: "name", flowRole: "masthead", mastheadRole: "name", content: "Anna Rojek" }),
    ];
    const generated = [
      text({ id: undefined, element_id: "new-name", flowRole: "masthead", mastheadRole: "name", content: "Name" }),
      text({ id: undefined, element_id: "new-phone", flowRole: "masthead", mastheadRole: "contact", contactChannel: "phone", content: "Phone" }),
    ];

    const merged = mergeTemplateContent(current, generated);

    assert.equal(merged[0].content, "Anna Rojek");
    assert.equal(merged[1].content, "694 732 542");
  });

  it("transfers an intentional empty AI result", () => {
    const current = [text({ content: "" })];
    const generated = [text({ content: "Old source" })];

    assert.equal(mergeTemplateContent(current, generated)[0].content, "");
  });

  it("matches record members when each fill creates a new flowGroup", () => {
    const current = [
      text({ id: undefined, element_id: "old-title", flowGroup: "record-old-a", content: "English title" }),
      text({ id: undefined, element_id: "old-body", flowGroup: "record-old-a", content: "English description" }),
    ];
    const generated = [
      text({ id: undefined, element_id: "new-title", flowGroup: "record-new-b", content: "Polish title" }),
      text({ id: undefined, element_id: "new-body", flowGroup: "record-new-b", content: "Polish description" }),
    ];

    const merged = mergeTemplateContent(current, generated);

    assert.deepEqual(merged.map((element) => element.content), [
      "English title",
      "English description",
    ]);
  });
});
