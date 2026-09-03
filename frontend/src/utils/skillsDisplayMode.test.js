import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  changeSkillsDisplayMode,
  isInlineSkillsContentElement,
  listSkillsDisplayAnchors,
} from "./skillsDisplayMode.js";
import {
  SKILL_CHIP_VARIANT_PILL_FILLED,
  SKILL_CHIP_VARIANT_PILL_OUTLINE,
  SKILL_CHIP_VARIANT_RECT_FILLED,
  SKILL_CHIP_VARIANT_RECT_OUTLINE,
  SKILL_CHIP_VARIANT_ROUNDED_FILLED,
  SKILL_CHIP_VARIANT_ROUNDED_OUTLINE,
  SKILL_CHIP_VARIANT_UNDERLINE,
  collectSkillGroups,
  detectSkillChipVariant,
} from "./skillsLayout.js";
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

/**
 * Monument-style fixture: the Umiejętności heading carries a decorative icon
 * marker (`flowRole: "section-chrome"`, same tag WYKSZTAŁCENIE's own icon
 * uses) alongside heading + rule.
 */
function skillsWithMarkerFixture() {
  return [
    ...flatSkillsFixture(),
    { element_id: "sk-marker", category: "image", flowRole: "section-chrome",
      src: "/template-assets/iconic/skills.svg", left: 42, top: 102, width: 16, height: 16, page: 1 },
  ];
}

/**
 * Reproduces the live regression: a long flat skills list sitting close above
 * a Languages grid section. Converting Skills to chips makes its body taller
 * than the compact inline row it replaces (chip padding/gaps cost more per
 * item than mid-dot text) — enough to wrap past where Languages currently
 * starts.
 */
function flatSkillsBeforeLanguagesFixture() {
  const items = [
    "Analiza AML/KYC", "Transaction Monitoring", "CDD / EDD",
    "Screening (PEP, Sanctions, Adverse Media)", "SAR Reporting", "Analityczne myślenie",
    "Dbałość o szczegóły", "Praca zespołowa", "MS Office", "SAP", "SAP CIC", "SQL",
    "Python", "LexisNexis",
  ];
  return [
    { element_id: "sk-head", category: "text", content: "UMIEJĘTNOŚCI",
      flowRole: "section-chrome", left: 76, top: 252.745, fontSize: 8.7, height: 12, page: 2, bold: false },
    { element_id: "sk-rule", category: "line", flowRole: "section-chrome",
      left: 76, top: 264.49, width: 466, height: 1, page: 2 },
    { element_id: "sk-body", category: "textarea", content: items.join("  ·  "),
      flowRole: "content", left: 76, top: 273.49, width: 466, height: 41, fontSize: 9.4, page: 2, bulletList: false },

    { element_id: "lang-head", category: "text", content: "JĘZYKI",
      flowRole: "section-chrome", left: 76, top: 335.49, fontSize: 8.7, height: 12, page: 2, bold: false },
    { element_id: "lang-rule", category: "line", flowRole: "section-chrome",
      left: 76, top: 347.235, width: 466, height: 1, page: 2 },
    { element_id: "lang-pl", category: "textarea", content: "Polski — A2",
      flowRole: "grid-member", flowGroup: "lang-g", left: 76, top: 356.235, width: 108.5, height: 14, fontSize: 9.4, page: 2 },
    { element_id: "lang-de", category: "textarea", content: "Niemiecki — C1",
      flowRole: "grid-member", flowGroup: "lang-g", left: 192.5, top: 356.235, width: 108.5, height: 14, fontSize: 9.4, page: 2 },
    { element_id: "lang-en", category: "textarea", content: "Angielski — B2",
      flowRole: "grid-member", flowGroup: "lang-g", left: 309, top: 356.235, width: 108.5, height: 14, fontSize: 9.4, page: 2 },
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

describe("isInlineSkillsContentElement", () => {
  it("recognises editable inline Skills bodies, including categorized groups", () => {
    const elements = groupedSkillsFixture();
    assert.equal(isInlineSkillsContentElement(elements, "sk-body1", PAGE_HEIGHT), true);
    assert.equal(isInlineSkillsContentElement(elements, "sk-body2", PAGE_HEIGHT), true);
  });

  it("rejects the heading, unrelated textareas, and non-inline Skills modes", () => {
    const inline = groupedSkillsFixture();
    assert.equal(isInlineSkillsContentElement(inline, "sk-head", PAGE_HEIGHT), false);
    assert.equal(isInlineSkillsContentElement(inline, "sk-cat1", PAGE_HEIGHT), false);
    assert.equal(isInlineSkillsContentElement(inline, "m-exp-body", PAGE_HEIGHT), false);

    const bullet = changeSkillsDisplayMode(
      inline,
      "sk-head",
      "bullet",
      PAGE_HEIGHT,
      SPACING,
    );
    const bulletBody = bullet.find((element) => (
      element.category === "textarea" && element.bulletList
    ));
    assert.ok(bulletBody);
    assert.equal(
      isInlineSkillsContentElement(bullet, bulletBody.element_id, PAGE_HEIGHT),
      false,
    );
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

  it("sizes modal-created chips with the active browser font measurer", () => {
    const measuredWidths = { AML: 31, KYC: 33, SQL: 27, Python: 48 };
    const next = changeSkillsDisplayMode(
      flatSkillsFixture(),
      "sk-head",
      "chips",
      PAGE_HEIGHT,
      SPACING,
      SKILL_CHIP_VARIANT_PILL_FILLED,
      (text, style) => {
        assert.equal(style.fontSize, 9.5);
        return measuredWidths[text];
      },
    );
    assert.ok(next);

    const memberIds = sectionElementIds(next, "sk-head", PAGE_HEIGHT);
    const members = next.filter((element) => memberIds.has(element.element_id));
    const labels = members.filter((element) => (
      element.flowRole === "grid-member" && element.category === "text"
    ));
    const shapes = members.filter((element) => (
      element.flowRole === "grid-member" && element.category === "rectangle"
    ));
    for (const label of labels) {
      const shape = shapes.find((candidate) => (
        candidate.flowGroup === label.flowGroup
        && Math.abs(candidate.left + 10 - label.left) < 0.001
      ));
      assert.ok(shape, `expected a shape paired with ${label.content}`);
      assert.equal(shape.width, measuredWidths[label.content] + 20);
    }
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

  it("preserves a decorative heading marker (icon) across every mode conversion", () => {
    // Regression: restyleSkillsMembersAsMode only ever emitted [heading, rule]
    // — any other section-chrome the heading owned (marker icons, Monument's
    // ordinal badge/frame, …) was silently dropped on the first conversion
    // and never came back on a later conversion, since it no longer existed
    // in the document to carry forward.
    let current = skillsWithMarkerFixture();
    for (const mode of ["chips", "bullet", "inline", "chips"]) {
      const next = changeSkillsDisplayMode(current, "sk-head", mode, PAGE_HEIGHT, SPACING);
      assert.ok(next, `expected a result converting to ${mode}`);
      current = next;
      const memberIds = sectionElementIds(current, "sk-head", PAGE_HEIGHT);
      const members = current.filter((element) => memberIds.has(element.element_id));
      const marker = members.find((element) => element.element_id === "sk-marker");
      assert.ok(marker, `marker must survive conversion to ${mode}`);
      assert.equal(marker.src, "/template-assets/iconic/skills.svg");
      assert.equal(marker.width, 16);
      assert.equal(marker.height, 16);
      const heading = members.find((element) => element.element_id === "sk-head");
      // Marker keeps its authored offset from the heading (left=42 vs
      // heading left=66 → -24), translated along with wherever the heading
      // itself landed after packing.
      assert.equal(
        Math.round(marker.left - heading.left), -24,
        `marker must keep its offset from the heading after converting to ${mode}`,
      );
    }
  });

  it("does not leak overflow chip rows into a following section when chips grow taller than the inline body", () => {
    // Regression: converting a long flat skills list to chips can wrap into
    // more vertical space than the compact inline row it replaces. Without
    // shifting later content down first, `sectionElementIds`'s Y-interval
    // membership (bounded by the next heading's stale position) misattributes
    // the overflowing chip rows to Languages instead of Skills.
    const next = changeSkillsDisplayMode(
      flatSkillsBeforeLanguagesFixture(), "sk-head", "chips", PAGE_HEIGHT, SPACING,
    );
    assert.ok(next);

    const skillsGroups = groupsFor(next, "sk-head");
    assert.equal(skillsGroups.length, 1);
    assert.equal(skillsGroups[0].items.length, 14, "every skill chip must stay attributed to Skills");

    const langMemberIds = sectionElementIds(next, "lang-head", PAGE_HEIGHT);
    const langMembers = next.filter((element) => langMemberIds.has(element.element_id));
    const langLabels = langMembers
      .filter((element) => element.category === "textarea" && element.flowRole === "grid-member")
      .map((element) => element.content);
    assert.deepEqual(
      langLabels.sort(),
      ["Angielski — B2", "Niemiecki — C1", "Polski — A2"],
      "Languages must contain only its own 3 entries, no stray skill chips",
    );
    assert.equal(
      langMembers.some((element) => element.category === "rectangle"),
      false,
      "no chip pill (skill content) should be attributed to the Languages section",
    );
  });

  it("builds and detects all seven persisted chip variants", () => {
    const variants = [
      { value: SKILL_CHIP_VARIANT_PILL_FILLED, category: "rectangle", filled: true, radius: "pill" },
      { value: SKILL_CHIP_VARIANT_PILL_OUTLINE, category: "rectangle", filled: false, radius: "pill" },
      { value: SKILL_CHIP_VARIANT_RECT_FILLED, category: "rectangle", filled: true, radius: 0 },
      { value: SKILL_CHIP_VARIANT_RECT_OUTLINE, category: "rectangle", filled: false, radius: 0 },
      { value: SKILL_CHIP_VARIANT_ROUNDED_OUTLINE, category: "rectangle", filled: false, radius: 6 },
      { value: SKILL_CHIP_VARIANT_ROUNDED_FILLED, category: "rectangle", filled: true, radius: 6 },
      { value: SKILL_CHIP_VARIANT_UNDERLINE, category: "line" },
    ];

    for (const expected of variants) {
      const next = changeSkillsDisplayMode(
        flatSkillsFixture(), "sk-head", "chips", PAGE_HEIGHT, SPACING, expected.value,
      );
      assert.ok(next, `expected ${expected.value} to be created`);
      const memberIds = sectionElementIds(next, "sk-head", PAGE_HEIGHT);
      const members = next.filter((element) => memberIds.has(element.element_id));
      const shapes = members.filter((element) => (
        element.flowRole === "grid-member" && element.category === expected.category
      ));
      assert.equal(shapes.length, 4, `${expected.value} needs one shape per skill`);
      assert.equal(detectSkillChipVariant(members), expected.value);
      assert.deepEqual(groupsFor(next, "sk-head"), [
        { category: "", items: ["AML", "KYC", "SQL", "Python"] },
      ]);

      if (expected.category === "rectangle") {
        assert.ok(shapes.every((shape) => shape.filled === expected.filled));
        if (expected.radius === "pill") {
          assert.ok(shapes.every((shape) => shape.borderRadius === shape.height / 2));
        } else {
          assert.ok(shapes.every((shape) => shape.borderRadius === expected.radius));
        }
      }
    }
  });

  it("changes the chip treatment while remaining in chip mode", () => {
    const filled = changeSkillsDisplayMode(
      flatSkillsFixture(), "sk-head", "chips", PAGE_HEIGHT, SPACING,
      SKILL_CHIP_VARIANT_PILL_FILLED,
    );
    const outlined = changeSkillsDisplayMode(
      filled, "sk-head", "chips", PAGE_HEIGHT, SPACING,
      SKILL_CHIP_VARIANT_PILL_OUTLINE,
    );
    assert.ok(outlined);
    const memberIds = sectionElementIds(outlined, "sk-head", PAGE_HEIGHT);
    const members = outlined.filter((element) => memberIds.has(element.element_id));
    assert.equal(detectSkillChipVariant(members), SKILL_CHIP_VARIANT_PILL_OUTLINE);
    assert.equal(
      changeSkillsDisplayMode(
        outlined, "sk-head", "chips", PAGE_HEIGHT, SPACING,
        SKILL_CHIP_VARIANT_PILL_OUTLINE,
      ),
      null,
      "reapplying the current chip variant must remain a no-op",
    );
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
