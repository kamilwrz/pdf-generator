import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changeSkillsDisplayMode } from "./skillsDisplayMode.js";
import { insertSkillItem, listSkillsEntryAnchors } from "./skillsEntry.js";
import { detectSkillChipVariant } from "./skillsLayout.js";

const PAGE_HEIGHT = 842;
const SPACING = { stack: 4, record: 10, section: 21, after_rule: 8 };

function groupedFixture() {
  return [
    { element_id: "sk-head", category: "text", content: "UMIEJĘTNOŚCI",
      flowRole: "section-chrome", left: 60, top: 100, width: 460, height: 16,
      fontSize: 12, page: 1, bold: true },
    { element_id: "sk-rule", category: "line", flowRole: "section-chrome",
      left: 60, top: 121, width: 460, height: 1, page: 1 },
    { element_id: "cat-tools", category: "textarea", content: "Narzędzia",
      flowRole: "content", flowGroup: "tools", left: 60, top: 136, width: 460,
      height: 14, fontSize: 10, lineHeight: 12, page: 1, bold: true },
    { element_id: "body-tools", category: "textarea", content: "Figma  ·  Miro",
      flowRole: "content", flowGroup: "tools", left: 60, top: 154, width: 460,
      height: 14, fontSize: 9.5, lineHeight: 13, page: 1, bulletList: false,
      runs: [{ start: 0, end: 5, bold: true }] },
    { element_id: "cat-soft", category: "textarea", content: "Miękkie",
      flowRole: "content", flowGroup: "soft", left: 60, top: 178, width: 460,
      height: 14, fontSize: 10, lineHeight: 12, page: 1, bold: true },
    { element_id: "body-soft", category: "textarea", content: "Komunikacja",
      flowRole: "content", flowGroup: "soft", left: 60, top: 196, width: 460,
      height: 14, fontSize: 9.5, lineHeight: 13, page: 1, bulletList: false },
    { element_id: "next-head", category: "text", content: "JĘZYKI",
      flowRole: "section-chrome", left: 60, top: 235, width: 460, height: 16,
      fontSize: 12, page: 1, bold: true },
    { element_id: "next-body", category: "textarea", content: "Polski — C2",
      flowRole: "content", left: 60, top: 258, width: 460, height: 14,
      fontSize: 9.5, lineHeight: 13, page: 1 },
  ];
}

function flatFixture({ bullet = false } = {}) {
  return [
    { element_id: "sk-head", category: "text", content: "UMIEJĘTNOŚCI",
      flowRole: "section-chrome", left: 60, top: 100, width: 460, height: 16,
      fontSize: 12, page: 1, bold: true },
    { element_id: "sk-rule", category: "line", flowRole: "section-chrome",
      left: 60, top: 121, width: 460, height: 1, page: 1 },
    { element_id: "sk-body", category: "textarea",
      content: bullet ? "• React\n• TypeScript" : "React  ·  TypeScript",
      flowRole: "content", left: 60, top: 136, width: 460, height: bullet ? 28 : 14,
      fontSize: 9.5, lineHeight: 13, page: 1, bulletList: bullet },
  ];
}

describe("listSkillsEntryAnchors", () => {
  it("returns one anonymous group for category-free Skills", () => {
    const anchors = listSkillsEntryAnchors(flatFixture());
    assert.equal(anchors.length, 1);
    assert.equal(anchors[0].headingId, "sk-head");
    assert.equal(anchors[0].groupId, "flat:sk-body");
    assert.equal(anchors[0].categoryLabel, "");
    assert.equal(anchors[0].mountElementId, "sk-body");
  });

  it("returns one stable anchor under each named category", () => {
    const anchors = listSkillsEntryAnchors(groupedFixture());
    assert.deepEqual(anchors.map(({ groupId, categoryLabel, mountElementId }) => ({
      groupId, categoryLabel, mountElementId,
    })), [
      { groupId: "tools", categoryLabel: "Narzędzia", mountElementId: "cat-tools" },
      { groupId: "soft", categoryLabel: "Miękkie", mountElementId: "cat-soft" },
    ]);
  });
});

describe("insertSkillItem", () => {
  it("appends the canonical mid-dot without losing existing ids or runs", () => {
    const source = groupedFixture();
    const result = insertSkillItem(source, "sk-head", "tools", "  Git   Flow  ", PAGE_HEIGHT, {
      spacing: SPACING,
      idFactory: () => "unused",
      measureTextWidth: (text) => String(text).length * 5,
    });
    assert.equal(result.error, undefined);
    const body = result.elements.find((element) => element.element_id === "body-tools");
    assert.equal(body.content, "Figma  ·  Miro  ·  Git Flow");
    assert.deepEqual(body.runs, [{ start: 0, end: 5, bold: true }]);
    assert.ok(result.elements.some((element) => element.element_id === "cat-soft"));
  });

  it("adds a canonical bullet in a category-free section", () => {
    const result = insertSkillItem(
      flatFixture({ bullet: true }),
      "sk-head",
      "flat:sk-body",
      "Node.js",
      PAGE_HEIGHT,
      { spacing: SPACING },
    );
    const body = result.elements.find((element) => element.element_id === "sk-body");
    assert.equal(body.content, "• React\n• TypeScript\n• Node.js");
    assert.equal(body.bulletList, true);
  });

  it("rejects an empty value and a case-insensitive duplicate", () => {
    assert.equal(
      insertSkillItem(flatFixture(), "sk-head", "flat:sk-body", "   ").error,
      "empty",
    );
    assert.equal(
      insertSkillItem(flatFixture(), "sk-head", "flat:sk-body", "react").error,
      "duplicate",
    );
  });

  it("adds a measured chip, preserves existing pairs, and wraps when required", () => {
    const chips = changeSkillsDisplayMode(
      flatFixture(),
      "sk-head",
      "chips",
      PAGE_HEIGHT,
      SPACING,
    );
    const anchor = listSkillsEntryAnchors(chips)[0];
    let sequence = 0;
    const result = insertSkillItem(
      chips,
      "sk-head",
      anchor.groupId,
      "Accessibility",
      PAGE_HEIGHT,
      {
        spacing: SPACING,
        idFactory: () => `new-${++sequence}`,
        measureTextWidth: (text) => String(text).length * 9,
      },
    );
    assert.equal(result.error, undefined);
    const added = result.elements.find((element) => element.element_id === result.elementId);
    const shape = result.elements.find((element) => element.element_id === "new-1");
    assert.equal(added.content, "Accessibility");
    assert.equal(shape.width, "Accessibility".length * 9 + 20);
    assert.ok(chips.every((element) => (
      result.elements.some((candidate) => candidate.element_id === element.element_id)
    )));
  });

  it("inherits every persisted chip treatment when adding a new label", () => {
    const variants = [
      "pill-filled",
      "pill-outline",
      "rect-filled",
      "rect-outline",
      "rounded-outline",
      "rounded-filled",
      "underline",
    ];
    for (const variant of variants) {
      const chips = changeSkillsDisplayMode(
        flatFixture(),
        "sk-head",
        "chips",
        PAGE_HEIGHT,
        SPACING,
        variant,
      );
      const anchor = listSkillsEntryAnchors(chips)[0];
      let sequence = 0;
      const result = insertSkillItem(
        chips,
        "sk-head",
        anchor.groupId,
        "Accessibility",
        PAGE_HEIGHT,
        {
          spacing: SPACING,
          idFactory: () => `variant-${++sequence}`,
          measureTextWidth: (text) => String(text).length * 5,
        },
      );
      const previousShape = chips.find((element) => (
        element.flowRole === "grid-member"
        && (element.category === "rectangle" || element.category === "line")
      ));
      const addedShape = result.elements.find((element) => element.element_id === "variant-1");
      assert.equal(detectSkillChipVariant(result.elements), variant);
      assert.equal(addedShape.category, previousShape.category);
      assert.equal(addedShape.filled, previousShape.filled);
      assert.equal(addedShape.borderRadius, previousShape.borderRadius);
      assert.equal(addedShape.borderWidth, previousShape.borderWidth);
      assert.equal(addedShape.backgroundColor, previousShape.backgroundColor);
    }
  });
});
