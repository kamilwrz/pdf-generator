import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FLAT_SECTION_LAYOUT_BULLET,
  FLAT_SECTION_LAYOUT_INLINE,
  convertFlatListContent,
  flatSectionLayoutStyle,
  formatFlatListContent,
  parseFlatListItems,
} from "./flatSectionLayout.js";

describe("parseFlatListItems", () => {
  it("splits inline content on the mid-dot separator", () => {
    const content = "Strategia  ·  Leadership  ·  P&L";
    assert.deepEqual(parseFlatListItems(content, false), ["Strategia", "Leadership", "P&L"]);
  });

  it("tolerates whitespace drift around the mid-dot from manual edits", () => {
    const content = "Strategia ·Leadership·  P&L";
    assert.deepEqual(parseFlatListItems(content, false), ["Strategia", "Leadership", "P&L"]);
  });

  it("splits bullet content by line and strips the leading marker", () => {
    const content = "• Polski — C2\n• Niemiecki — C1\n• Angielski — B2";
    assert.deepEqual(
      parseFlatListItems(content, true),
      ["Polski — C2", "Niemiecki — C1", "Angielski — B2"],
    );
  });

  it("returns an empty array for blank content", () => {
    assert.deepEqual(parseFlatListItems("", false), []);
    assert.deepEqual(parseFlatListItems("   ", true), []);
  });

  it("drops empty lines/items instead of keeping blanks", () => {
    assert.deepEqual(parseFlatListItems("• A\n\n• B", true), ["A", "B"]);
    assert.deepEqual(parseFlatListItems("A ·  · B", false), ["A", "B"]);
  });
});

describe("formatFlatListContent", () => {
  it("joins items with the two-space mid-dot separator for inline style", () => {
    const result = formatFlatListContent(["Strategia", "Leadership", "P&L"], FLAT_SECTION_LAYOUT_INLINE);
    assert.equal(result.content, "Strategia  ·  Leadership  ·  P&L");
    assert.equal(result.bulletList, false);
  });

  it("prefixes each item with a bullet marker for bullet style", () => {
    const result = formatFlatListContent(["Polski — C2", "Niemiecki — C1"], FLAT_SECTION_LAYOUT_BULLET);
    assert.equal(result.content, "• Polski — C2\n• Niemiecki — C1");
    assert.equal(result.bulletList, true);
  });

  it("strips a pre-existing leading marker so it is never doubled", () => {
    const result = formatFlatListContent(["• Already bulleted"], FLAT_SECTION_LAYOUT_BULLET);
    assert.equal(result.content, "• Already bulleted");
  });
});

describe("convertFlatListContent", () => {
  it("round-trips items from inline to bullet and back without loss", () => {
    const original = "Strategia  ·  Leadership  ·  P&L";
    const toBullet = convertFlatListContent(original, false, FLAT_SECTION_LAYOUT_BULLET);
    assert.equal(toBullet.content, "• Strategia\n• Leadership\n• P&L");

    const backToInline = convertFlatListContent(toBullet.content, true, FLAT_SECTION_LAYOUT_INLINE);
    assert.equal(backToInline.content, original);
  });
});

describe("flatSectionLayoutStyle", () => {
  it("reads the current style from an element's bulletList flag", () => {
    assert.equal(flatSectionLayoutStyle({ bulletList: true }), FLAT_SECTION_LAYOUT_BULLET);
    assert.equal(flatSectionLayoutStyle({ bulletList: false }), FLAT_SECTION_LAYOUT_INLINE);
    assert.equal(flatSectionLayoutStyle({}), FLAT_SECTION_LAYOUT_INLINE);
    assert.equal(flatSectionLayoutStyle(null), FLAT_SECTION_LAYOUT_INLINE);
  });
});
