import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changeSkillsDisplayMode } from "./skillsDisplayMode.js";
import {
  insertSkillItem,
  insertSkillsChipCategoryAfter,
  listSkillsEntryAnchors,
  removeSkillsChipCategory,
  reorderSkillsChipCategory,
  reflowEditedSkillChips,
} from "./skillsEntry.js";
import { detectSkillChipVariant } from "./skillsLayout.js";

it("AI text changes resize chip pairs without replacing ids or losing the next section", () => {
  const before = changeSkillsDisplayMode(groupedFixture(), "sk-head", "chips", 842, SPACING);
  const label = before.find((element) => element.category === "text" && element.flowRole === "grid-member");
  const after = before.map((element) => element === label ? { ...element, content: "Bardzo szczegółowy opis umiejętności pracy z narzędziem" } : element);
  const next = reflowEditedSkillChips(before, after, new Set([label.element_id]), 842, { spacing: SPACING });
  assert.deepEqual(next.map((element) => element.element_id).sort(), before.map((element) => element.element_id).sort());
  assert.equal(next.find((element) => element.element_id === label.element_id).content, after.find((element) => element.element_id === label.element_id).content);
  assert.equal(next.find((element) => element.element_id === "next-body").content, "Polski — C2");
  const oldWidths = before.filter((element) => element.flowRole === "grid-member" && element.category === "rectangle").map((element) => element.width);
  const newWidths = next.filter((element) => element.flowRole === "grid-member" && element.category === "rectangle").map((element) => element.width);
  assert.ok(Math.max(...newWidths) > Math.max(...oldWidths));
});

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

function emptyGroupedFixture() {
  return groupedFixture().map((element) => {
    if (element.element_id === "body-tools" || element.element_id === "body-soft") {
      return {
        ...element,
        content: "",
        runs: null,
        placeholder: "Umiejętność",
        starterPlaceholder: true,
      };
    }
    return element;
  });
}

describe("listSkillsEntryAnchors", () => {
  it("returns one anonymous group for category-free Skills", () => {
    const anchors = listSkillsEntryAnchors(flatFixture());
    assert.equal(anchors.length, 1);
    assert.equal(anchors[0].headingId, "sk-head");
    assert.equal(anchors[0].groupId, "flat:sk-body");
    assert.equal(anchors[0].categoryLabel, "");
    assert.equal(anchors[0].mountElementId, "sk-body");
    assert.equal(anchors[0].mode, "inline");
    assert.equal(anchors[0].left, 60);
    assert.equal(anchors[0].width, 460);
    assert.deepEqual(anchors[0].highlight, { left: 60, top: 136, width: 460, height: 14 });
  });

  it("returns one stable anchor under each named category", () => {
    const anchors = listSkillsEntryAnchors(groupedFixture());
    assert.deepEqual(anchors.map(({ groupId, categoryLabel, mountElementId }) => ({
      groupId, categoryLabel, mountElementId,
    })), [
      { groupId: "tools", categoryLabel: "Narzędzia", mountElementId: "cat-tools" },
      { groupId: "soft", categoryLabel: "Miękkie", mountElementId: "cat-soft" },
    ]);
    assert.ok(anchors.every((anchor) => anchor.highlight?.width > 0));
  });

  it("keeps category anchors after a semantic Skills heading is renamed", () => {
    const elements = groupedFixture().map((element) => (
      element.element_id === "sk-head"
        ? { ...element, content: "PROJEKTY", editorSectionType: "skills-categories" }
        : element
    ));
    const anchors = listSkillsEntryAnchors(elements);
    assert.deepEqual(anchors.map((anchor) => anchor.groupId), ["tools", "soft"]);
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
    assert.equal(anchor.mode, "chips");
    assert.equal(anchor.left, 60);
    assert.equal(anchor.width, 460);
    const chipShapes = chips.filter((element) => (
      element.flowRole === "grid-member"
      && (element.category === "rectangle" || element.category === "line")
    ));
    assert.equal(anchor.bottom, Math.max(...chipShapes.map((element) => (
      element.top + element.height
    ))));
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

  it("materializes an empty placeholder chip instead of appending beside it", () => {
    const chips = changeSkillsDisplayMode(
      emptyGroupedFixture(),
      "sk-head",
      "chips",
      PAGE_HEIGHT,
      SPACING,
    );
    const anchor = listSkillsEntryAnchors(chips).find((item) => item.groupId.includes("sk-"));
    assert.ok(anchor);
    const beforeLabels = chips.filter((element) => (
      element.flowGroup === anchor.groupId && element.category === "text"
    ));
    assert.equal(beforeLabels.length, 1);
    assert.equal(beforeLabels[0].content, "");
    assert.equal(beforeLabels[0].placeholder, "Umiejętność");

    const result = insertSkillItem(
      chips,
      "sk-head",
      anchor.groupId,
      "TypeScript",
      PAGE_HEIGHT,
      {
        spacing: SPACING,
        measureTextWidth: (text) => String(text).length * 6,
      },
    );
    assert.equal(result.error, undefined);
    const afterLabels = result.elements.filter((element) => (
      element.flowGroup === anchor.groupId && element.category === "text"
    ));
    assert.equal(afterLabels.length, 1);
    assert.equal(afterLabels[0].content, "TypeScript");
    assert.equal(afterLabels[0].placeholder, undefined);
    assert.equal(afterLabels[0].starterPlaceholder, false);
    const shape = result.elements.find((element) => (
      element.flowGroup === anchor.groupId && element.category === "rectangle"
    ));
    assert.equal(shape.starterPlaceholder, false);
    assert.equal(shape.width, "TypeScript".length * 6 + 20);
  });

  it("adds a placeholder category in chip mode without rebuilding existing ids", () => {
    const chips = changeSkillsDisplayMode(
      groupedFixture(),
      "sk-head",
      "chips",
      PAGE_HEIGHT,
      SPACING,
    );
    const existingIds = new Set(chips.map((element) => element.element_id));
    const firstCategory = chips.find((element) => (
      element.flowRole === "content" && element.bold
    ));
    let sequence = 0;
    const inserted = insertSkillsChipCategoryAfter(
      chips,
      firstCategory.element_id,
      PAGE_HEIGHT,
      {
        spacing: SPACING,
        idFactory: () => `category-${++sequence}`,
        measureTextWidth: (text) => String(text).length * 5,
      },
    );
    assert.ok(inserted);
    assert.ok([...existingIds].every((id) => (
      inserted.elements.some((element) => element.element_id === id)
    )));
    const newCategory = inserted.elements.find((element) => (
      element.element_id === inserted.firstBodyId
    ));
    assert.equal(newCategory.content, "");
    assert.equal(newCategory.placeholder, "Kategoria umiejętności");
    const newPlaceholder = inserted.elements.find((element) => (
      element.flowGroup === newCategory.flowGroup
      && element.category === "text"
      && element.starterPlaceholder
    ));
    assert.equal(newPlaceholder.placeholder, "Umiejętność");
  });

  it("reorders whole chip categories while preserving every shape and label id", () => {
    const chips = changeSkillsDisplayMode(
      groupedFixture(),
      "sk-head",
      "chips",
      PAGE_HEIGHT,
      SPACING,
    );
    const toolsCategory = chips.find((element) => element.content === "Narzędzia");
    const softCategory = chips.find((element) => element.content === "Miękkie");
    const originalIds = new Set(chips.map((element) => element.element_id));
    const toolsGroup = toolsCategory.flowGroup;
    const softGroup = softCategory.flowGroup;

    const result = reorderSkillsChipCategory(
      chips,
      softCategory.element_id,
      "up",
      PAGE_HEIGHT,
      { spacing: SPACING },
    );
    assert.ok(result);
    assert.deepEqual(new Set(result.elements.map((element) => element.element_id)), originalIds);
    const minTop = (flowGroup) => Math.min(...result.elements
      .filter((element) => element.flowGroup === flowGroup)
      .map((element) => (element.page - 1) * PAGE_HEIGHT + element.top));
    assert.ok(minTop(softGroup) < minTop(toolsGroup));
    assert.equal(
      result.elements.filter((element) => (
        element.flowGroup === toolsGroup && element.flowRole === "grid-member"
      )).length,
      chips.filter((element) => (
        element.flowGroup === toolsGroup && element.flowRole === "grid-member"
      )).length,
    );
  });

  it("removes a chip category as one shape/label transaction", () => {
    const chips = changeSkillsDisplayMode(
      groupedFixture(),
      "sk-head",
      "chips",
      PAGE_HEIGHT,
      SPACING,
    );
    const toolsCategory = chips.find((element) => element.content === "Narzędzia");
    const toolsGroup = toolsCategory.flowGroup;
    const removedGroupIds = chips
      .filter((element) => element.flowGroup === toolsGroup)
      .map((element) => element.element_id);
    const result = removeSkillsChipCategory(
      chips,
      toolsCategory.element_id,
      PAGE_HEIGHT,
      { spacing: SPACING },
    );
    assert.ok(result);
    assert.ok(removedGroupIds.every((id) => result.removedIds.has(id)));
    assert.equal(result.elements.some((element) => element.flowGroup === toolsGroup), false);
    assert.ok(result.elements.some((element) => element.content === "Miękkie"));
  });
});
