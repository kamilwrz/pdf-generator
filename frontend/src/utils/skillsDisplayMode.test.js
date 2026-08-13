import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { changeSkillsDisplayMode, listSkillsDisplayAnchors } from "./skillsDisplayMode.js";
import { collectSkillGroups } from "./skillsLayout.js";
import { sectionElementIds } from "./sectionStructure.js";

const PAGE_HEIGHT = 842;
const SPACING = { stack: 4, record: 10, section: 21, after_rule: 8 };

function groupedSkillsFixture() {
  return [
    { element_id: "m-exp-head", category: "text", content: "DOŚWIADCZENIE ZAWODOWE",
      flowRole: "section-chrome", left: 66, top: 100, fontSize: 12, height: 16, page: 1, bold: true },
    { element_id: "m-exp-rule", category: "line", flowRole: "section-chrome",
      left: 66, top: 120.7, width: 460, height: 1, page: 1 },
    { element_id: "m-exp-body", category: "textarea", content: "Body.",
      flowRole: "content", flowGroup: "job-0", autoHeight: true,
      left: 66, top: 140, width: 460, height: 40, fontSize: 9, page: 1 },

    { element_id: "sk-head", category: "text", content: "UMIEJĘTNOŚCI",
      flowRole: "section-chrome", left: 66, top: 220, fontSize: 12, height: 16, page: 1, bold: true },
    { element_id: "sk-rule", category: "line", flowRole: "section-chrome",
      left: 66, top: 240.7, width: 460, height: 1, page: 1 },
    { element_id: "sk-cat1", category: "textarea", content: "Umiejętności miękkie",
      flowRole: "content", flowGroup: "sk-g1", left: 66, top: 256, width: 460, height: 14, fontSize: 10, page: 1, bold: true },
    { element_id: "sk-body1", category: "textarea",
      content: "Komunikacja  ·  Praca zespołowa  ·  Analityczne myślenie",
      flowRole: "content", flowGroup: "sk-g1",
      left: 66, top: 274, width: 460, height: 14, fontSize: 9.5, page: 1, bulletList: false },
    { element_id: "sk-cat2", category: "textarea", content: "Narzędzia",
      flowRole: "content", flowGroup: "sk-g2", left: 66, top: 298, width: 460, height: 14, fontSize: 10, page: 1, bold: true },
    { element_id: "sk-body2", category: "textarea", content: "SQL  ·  Python  ·  Excel",
      flowRole: "content", flowGroup: "sk-g2",
      left: 66, top: 316, width: 460, height: 14, fontSize: 9.5, page: 1, bulletList: false },
  ];
}

function flatSkillsFixture() {
  return [
    { element_id: "sk-head", category: "text", content: "UMIEJĘTNOŚCI",
      flowRole: "section-chrome", left: 66, top: 100, fontSize: 12, height: 16, page: 1, bold: true },
    { element_id: "sk-rule", category: "line", flowRole: "section-chrome",
      left: 66, top: 120.7, width: 460, height: 1, page: 1 },
    { element_id: "sk-body", category: "textarea", content: "AML  ·  KYC  ·  SQL  ·  Python",
      flowRole: "content", left: 66, top: 136, width: 460, height: 14, fontSize: 9.5, page: 1, bulletList: false },
  ];
}

function groupsFor(elements, headingId) {
  const memberIds = sectionElementIds(elements, headingId, PAGE_HEIGHT);
  const members = elements.filter((element) => memberIds.has(element.element_id));
  return collectSkillGroups(members, headingId);
}

describe("listSkillsDisplayAnchors", () => {
  it("detects the current mode of every main-column skills section", () => {
    const anchors = listSkillsDisplayAnchors(groupedSkillsFixture(), PAGE_HEIGHT);
    assert.deepEqual(anchors, [{ headingId: "sk-head", mode: "inline" }]);
  });

  it("returns nothing for a document with no skills section", () => {
    const elements = groupedSkillsFixture().filter((element) => (
      !String(element.element_id).startsWith("sk-")
    ));
    assert.deepEqual(listSkillsDisplayAnchors(elements, PAGE_HEIGHT), []);
  });
});

describe("changeSkillsDisplayMode", () => {
  it("converts categorized skills to chips, preserving category labels and every item", () => {
    const next = changeSkillsDisplayMode(groupedSkillsFixture(), "sk-head", "chips", PAGE_HEIGHT, SPACING);
    assert.ok(next);
    assert.equal(detectSkillsDisplayModeFor(next, "sk-head"), "chips");
    assert.deepEqual(groupsFor(next, "sk-head"), [
      { category: "Umiejętności miękkie", items: ["Komunikacja", "Praca zespołowa", "Analityczne myślenie"] },
      { category: "Narzędzia", items: ["SQL", "Python", "Excel"] },
    ]);
    // Every skill chip pill (rectangle) has a matching label (text), same flowGroup.
    const memberIds = sectionElementIds(next, "sk-head", PAGE_HEIGHT);
    const members = next.filter((element) => memberIds.has(element.element_id));
    const pills = members.filter((element) => element.flowRole === "grid-member" && element.category === "rectangle");
    const labels = members.filter((element) => element.flowRole === "grid-member" && element.category === "text");
    assert.equal(pills.length, 6);
    assert.equal(labels.length, 6);
    assert.ok(pills.every((pill) => labels.some((label) => label.flowGroup === pill.flowGroup)));
  });

  it("round-trips categorized skills through every mode without losing items", () => {
    let current = groupedSkillsFixture();
    const expected = [
      { category: "Umiejętności miękkie", items: ["Komunikacja", "Praca zespołowa", "Analityczne myślenie"] },
      { category: "Narzędzia", items: ["SQL", "Python", "Excel"] },
    ];
    for (const mode of ["chips", "bullet", "inline", "chips", "inline", "bullet"]) {
      const next = changeSkillsDisplayMode(current, "sk-head", mode, PAGE_HEIGHT, SPACING);
      assert.ok(next, `expected a result converting to ${mode}`);
      current = next;
      assert.equal(detectSkillsDisplayModeFor(current, "sk-head"), mode);
      assert.deepEqual(groupsFor(current, "sk-head"), expected, `items must survive a round trip through ${mode}`);
    }
  });

  it("converts flat (non-categorized) skills to chips with an empty category", () => {
    const next = changeSkillsDisplayMode(flatSkillsFixture(), "sk-head", "chips", PAGE_HEIGHT, SPACING);
    assert.ok(next);
    assert.equal(detectSkillsDisplayModeFor(next, "sk-head"), "chips");
    assert.deepEqual(groupsFor(next, "sk-head"), [
      { category: "", items: ["AML", "KYC", "SQL", "Python"] },
    ]);
  });

  it("is a no-op when the section is already in the requested mode", () => {
    const source = groupedSkillsFixture();
    const next = changeSkillsDisplayMode(source, "sk-head", "inline", PAGE_HEIGHT, SPACING);
    assert.equal(next, null);
  });

  it("returns null for a non-skills heading", () => {
    const next = changeSkillsDisplayMode(groupedSkillsFixture(), "m-exp-head", "chips", PAGE_HEIGHT, SPACING);
    assert.equal(next, null);
  });

  it("matches another chip section already in the document instead of a generic default", () => {
    // A document with two skills-titled sections is unusual, but the color
    // lookup only needs *a* chip pair anywhere in the doc — simulate that
    // with a second, already-converted chip section elsewhere in `elements`.
    const otherChipHeading = "cert-head";
    const withAnotherChipSection = [
      ...groupedSkillsFixture(),
      { element_id: otherChipHeading, category: "text", content: "CERTYFIKATY",
        flowRole: "section-chrome", left: 66, top: 500, fontSize: 12, height: 16, page: 1, bold: true },
      { element_id: "cert-rule", category: "line", flowRole: "section-chrome",
        left: 66, top: 520.7, width: 460, height: 1, page: 1 },
      { element_id: "cert-pill", category: "rectangle", flowRole: "grid-member", flowGroup: "cert-g",
        left: 66, top: 536, width: 60, height: 20, filled: true, borderRadius: 10,
        backgroundColor: "#123456", page: 1 },
      { element_id: "cert-label", category: "text", flowRole: "grid-member", flowGroup: "cert-g",
        content: "AWS", color: "#ABCDEF", left: 76, top: 546, fontSize: 9, page: 1 },
    ];
    const next = changeSkillsDisplayMode(withAnotherChipSection, "sk-head", "chips", PAGE_HEIGHT, SPACING);
    assert.ok(next);
    const memberIds = sectionElementIds(next, "sk-head", PAGE_HEIGHT);
    const pill = next.find((element) => (
      memberIds.has(element.element_id) && element.category === "rectangle" && element.flowRole === "grid-member"
    ));
    assert.equal(pill.backgroundColor, "#123456");
  });

  it("keeps chip rows aligned within one category (grid does not scatter)", () => {
    const next = changeSkillsDisplayMode(groupedSkillsFixture(), "sk-head", "chips", PAGE_HEIGHT, SPACING);
    assert.ok(next);
    const memberIds = sectionElementIds(next, "sk-head", PAGE_HEIGHT);
    const pills = next
      .filter((element) => memberIds.has(element.element_id) && element.category === "rectangle" && element.flowRole === "grid-member")
      .sort((a, b) => a.left - b.left);
    // The first category's 3 short chips fit on one row within a 460px column.
    const firstGroupPills = pills.filter((pill) => pill.flowGroup === pills[0].flowGroup);
    const tops = firstGroupPills.map((pill) => pill.top);
    assert.equal(new Set(tops).size, 1, `expected one shared row top, got ${tops}`);
  });
});

function detectSkillsDisplayModeFor(elements, headingId) {
  return listSkillsDisplayAnchors(elements, PAGE_HEIGHT)
    .find((anchor) => anchor.headingId === headingId)?.mode;
}
