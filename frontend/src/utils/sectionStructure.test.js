import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyFlowSpacing,
  findProfilePhotoSlot,
  listDocumentSections,
  packDocumentSections,
  reorderSection,
} from "./sectionStructure.js";

describe("listDocumentSections", () => {
  it("returns chrome headings in reading order", () => {
    const sections = listDocumentSections([
      { element_id: "h2", category: "text", flowRole: "section-chrome", content: "Skills", page: 1, top: 200 },
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Experience", page: 1, top: 80 },
      { element_id: "body", category: "textarea", flowRole: "content", top: 100, page: 1 },
    ]);
    assert.deepEqual(sections.map((section) => section.title), ["Experience", "Skills"]);
  });

  it("detects untagged Cinder-style labels above a rule", () => {
    const sections = listDocumentSections([
      {
        element_id: "job-title",
        category: "text",
        content: "DYREKTORKA FINANSOWA",
        fontSize: 9.5,
        left: 78,
        top: 86,
        page: 1,
      },
      {
        element_id: "summary-h",
        category: "text",
        content: "PODSUMOWANIE ZAWODOWE",
        fontSize: 8.7,
        left: 76,
        top: 207,
        page: 1,
      },
      {
        element_id: "summary-rule",
        category: "line",
        left: 76,
        top: 226,
        width: 466,
        height: 1,
        page: 1,
      },
      {
        element_id: "exp-h",
        category: "text",
        content: "DOŚWIADCZENIE ZAWODOWE",
        fontSize: 8.7,
        left: 76,
        top: 319,
        page: 1,
      },
      {
        element_id: "exp-rule",
        category: "line",
        left: 76,
        top: 338,
        width: 466,
        height: 1,
        page: 1,
      },
    ]);
    assert.deepEqual(
      sections.map((section) => section.title),
      ["PODSUMOWANIE ZAWODOWE", "DOŚWIADCZENIE ZAWODOWE"],
    );
  });
});

describe("reorderSection", () => {
  it("swaps adjacent section clusters", () => {
    const elements = [
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "A", page: 1, top: 80, height: 14 },
      { element_id: "a1", category: "textarea", flowRole: "content", page: 1, top: 100, height: 40 },
      { element_id: "h2", category: "text", flowRole: "section-chrome", content: "B", page: 1, top: 160, height: 14 },
      { element_id: "b1", category: "textarea", flowRole: "content", page: 1, top: 180, height: 40 },
    ];
    const next = reorderSection(elements, "h2", "up");
    assert.ok(next);
    const byId = Object.fromEntries(next.map((element) => [element.element_id, element]));
    assert.ok(byId.h2.top < byId.h1.top);
    assert.ok(byId.b1.top < byId.a1.top);
  });

  it("compacts multi-page section holes and repacks following sections", () => {
    // Tall section A spans page 1→2 with footer/header dead space in its Y span.
    // Short section B sits on page 2. Moving B above A must not leave B crushed
    // inside A's old page-break hole or park later content under empty space.
    const elements = [
      { element_id: "hA", category: "text", flowRole: "section-chrome", content: "Experience", page: 1, top: 200, height: 14 },
      { element_id: "a1", category: "textarea", flowRole: "content", page: 1, top: 220, height: 500 },
      { element_id: "a2", category: "textarea", flowRole: "content", page: 2, top: 66, height: 80 },
      { element_id: "hB", category: "text", flowRole: "section-chrome", content: "Education", page: 2, top: 160, height: 14 },
      { element_id: "b1", category: "textarea", flowRole: "content", page: 2, top: 180, height: 40 },
      { element_id: "hC", category: "text", flowRole: "section-chrome", content: "Skills", page: 2, top: 240, height: 14 },
      { element_id: "c1", category: "textarea", flowRole: "content", page: 2, top: 260, height: 30 },
    ];
    const next = reorderSection(elements, "hB", "up", 842, {
      pageTop: 66,
      bottomMargin: 72,
      sectionGap: 21,
    });
    assert.ok(next);
    const byId = Object.fromEntries(next.map((element) => [element.element_id, element]));

    const abs = (element) => (element.page - 1) * 842 + element.top;
    assert.ok(abs(byId.hB) < abs(byId.hA), "Education heading moves above Experience");
    assert.ok(abs(byId.b1) < abs(byId.a1), "Education body moves above Experience body");
    // Experience continuation no longer keeps a page-break-sized hole before Skills.
    assert.ok(abs(byId.hC) > abs(byId.a2), "Skills stay after Experience content");
    const gapBeforeSkills = abs(byId.hC) - (abs(byId.a2) + 80);
    assert.ok(
      gapBeforeSkills < 80,
      `expected compact gap before Skills, got ${gapBeforeSkills}`,
    );
    // No overlap: Education body ends before Experience heading.
    assert.ok(abs(byId.b1) + 40 <= abs(byId.hA) + 1);
  });
});

describe("packDocumentSections", () => {
  it("places sections in the given heading order from the flow start", () => {
    const elements = [
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "A", page: 1, top: 100, height: 14 },
      { element_id: "a1", category: "textarea", flowRole: "content", page: 1, top: 120, height: 20 },
      { element_id: "h2", category: "text", flowRole: "section-chrome", content: "B", page: 1, top: 160, height: 14 },
      { element_id: "b1", category: "textarea", flowRole: "content", page: 1, top: 180, height: 20 },
    ];
    const packed = packDocumentSections(elements, ["h2", "h1"], 842, { sectionGap: 21 });
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));
    assert.equal(byId.h2.top, 100);
    assert.ok(byId.h1.top > byId.b1.top);
  });
});

describe("applyFlowSpacing", () => {
  it("widens section gaps when section rhythm increases", () => {
    const elements = [
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "A", page: 1, top: 100, height: 14 },
      { element_id: "a1", category: "textarea", flowRole: "content", autoHeight: true, page: 1, top: 122, height: 40 },
      { element_id: "h2", category: "text", flowRole: "section-chrome", content: "B", page: 1, top: 183, height: 14 },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true, page: 1, top: 205, height: 30 },
    ];
    const tight = applyFlowSpacing(elements, { section: 10 }, 842);
    const loose = applyFlowSpacing(elements, { section: 40 }, 842);
    const tightH2 = tight.find((element) => element.element_id === "h2");
    const looseH2 = loose.find((element) => element.element_id === "h2");
    assert.ok(looseH2.top > tightH2.top);
  });

  it("keeps section heading, rule, and body together instead of parking the rule in the footer", () => {
    // Tall first section fills page 1 almost to contentBottom (770). The next
    // section's 1px underline used to "fit" in the leftover footer band while
    // the body jumped to page 2 — the Cinder decorative-line bug.
    const elements = [
      {
        element_id: "h1",
        category: "text",
        flowRole: "section-chrome",
        content: "Experience",
        page: 1,
        top: 200,
        height: 14,
        left: 76,
      },
      {
        element_id: "r1",
        category: "line",
        flowRole: "section-chrome",
        page: 1,
        top: 214,
        height: 1,
        width: 466,
        left: 76,
      },
      {
        element_id: "a1",
        category: "textarea",
        flowRole: "content",
        autoHeight: true,
        page: 1,
        top: 222,
        height: 540,
        left: 76,
      },
      {
        element_id: "h2",
        category: "text",
        flowRole: "section-chrome",
        content: "Education",
        page: 1,
        top: 780,
        height: 14,
        left: 76,
      },
      {
        element_id: "mark2",
        category: "rectangle",
        flowRole: "section-chrome",
        page: 1,
        top: 782,
        height: 16,
        width: 16,
        left: 526,
      },
      {
        element_id: "r2",
        category: "line",
        flowRole: "section-chrome",
        page: 1,
        top: 794,
        height: 1,
        width: 466,
        left: 76,
      },
      {
        element_id: "b1",
        category: "textarea",
        flowRole: "content",
        autoHeight: true,
        page: 2,
        top: 66,
        height: 80,
        left: 76,
      },
    ];
    const packed = applyFlowSpacing(elements, {
      stack: 4,
      record: 10,
      section: 21,
      after_rule: 8,
    }, 842, { pageTop: 66, bottomMargin: 72 });
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));

    assert.equal(byId.h2.page, byId.r2.page, "heading and rule stay on the same page");
    assert.equal(byId.h2.page, byId.b1.page, "heading and first body stay on the same page");
    assert.ok(byId.r2.top < 700, `rule must not sit in the footer, got top=${byId.r2.top}`);
    assert.ok(byId.r2.top > byId.h2.top, "rule stays under the heading");
    assert.ok(byId.b1.top > byId.r2.top, "body stays under the rule");
  });

  it("preserves Cinder chrome rhythm instead of stacking heading/mark/rule with SPACE_STACK", () => {
    // Authored Cinder geometry: mark overlaps the heading (+2), wide ash rule
    // sits flush under the label (Builder.line does not advance before paint).
    const elements = [
      {
        element_id: "h1",
        category: "text",
        flowRole: "section-chrome",
        content: "PODSUMOWANIE ZAWODOWE",
        page: 1,
        top: 200,
        height: 12,
        fontSize: 8.7,
        left: 76,
      },
      {
        element_id: "mark1",
        category: "rectangle",
        flowRole: "section-chrome",
        page: 1,
        top: 202,
        height: 16,
        width: 16,
        left: 526,
      },
      {
        element_id: "r1",
        category: "line",
        flowRole: "section-chrome",
        page: 1,
        top: 212,
        height: 1,
        width: 466,
        left: 76,
      },
      {
        element_id: "a1",
        category: "textarea",
        flowRole: "content",
        autoHeight: true,
        page: 1,
        top: 221,
        height: 40,
        left: 76,
      },
      {
        element_id: "h2",
        category: "text",
        flowRole: "section-chrome",
        content: "WYKSZTAŁCENIE",
        page: 1,
        top: 282,
        height: 12,
        fontSize: 8.7,
        left: 76,
      },
      {
        element_id: "mark2",
        category: "rectangle",
        flowRole: "section-chrome",
        page: 1,
        top: 284,
        height: 16,
        width: 16,
        left: 526,
      },
      {
        element_id: "r2",
        category: "line",
        flowRole: "section-chrome",
        page: 1,
        top: 294,
        height: 1,
        width: 466,
        left: 76,
      },
      {
        element_id: "b1",
        category: "textarea",
        flowRole: "content",
        autoHeight: true,
        page: 1,
        top: 303,
        height: 30,
        left: 76,
      },
    ];

    const packed = applyFlowSpacing(elements, {
      stack: 4,
      record: 10,
      section: 21,
      after_rule: 8,
    }, 842);

    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));
    const markDelta = byId.mark1.top - byId.h1.top;
    const ruleDelta = byId.r1.top - byId.h1.top;

    assert.ok(markDelta >= 0 && markDelta <= 4, `mark should sit on the heading line, got Δ=${markDelta}`);
    assert.ok(
      Math.abs(ruleDelta - byId.h1.height) <= 2,
      `rule should sit flush under the heading, got Δ=${ruleDelta} height=${byId.h1.height}`,
    );
    assert.ok(byId.a1.top >= byId.r1.top + 6, "body keeps after_rule breathing room");
    // Mark must not be pushed into a vertical stack below the rule.
    assert.ok(byId.mark1.top < byId.r1.top + 4, "mark stays in the heading band, not below the rule");
  });

  it("heals chrome that was previously torn apart by SPACE_STACK packing", () => {
    // Simulate a document already corrupted by the old forceTargets path:
    // heading → 4px → mark → 4px → rule (no overlap / flush).
    const elements = [
      {
        element_id: "h1",
        category: "text",
        flowRole: "section-chrome",
        content: "Skills",
        page: 1,
        top: 200,
        height: 12,
        left: 76,
      },
      {
        element_id: "mark1",
        category: "rectangle",
        flowRole: "section-chrome",
        page: 1,
        top: 216,
        height: 16,
        width: 16,
        left: 526,
      },
      {
        element_id: "r1",
        category: "line",
        flowRole: "section-chrome",
        page: 1,
        top: 236,
        height: 1,
        width: 466,
        left: 76,
      },
      {
        element_id: "a1",
        category: "textarea",
        flowRole: "content",
        autoHeight: true,
        page: 1,
        top: 245,
        height: 40,
        left: 76,
      },
    ];

    const packed = applyFlowSpacing(elements, {
      stack: 4,
      record: 10,
      section: 21,
      after_rule: 8,
    }, 842);
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));

    assert.ok(
      byId.mark1.top - byId.h1.top <= 4,
      `corrupted mark stack should heal onto the heading, got Δ=${byId.mark1.top - byId.h1.top}`,
    );
    assert.ok(
      Math.abs(byId.r1.top - (byId.h1.top + byId.h1.height)) <= 2,
      "corrupted rule stack should heal flush under the heading",
    );
  });
});

describe("findProfilePhotoSlot", () => {
  it("prefers large near-top non-icon images", () => {
    const slot = findProfilePhotoSlot([
      { element_id: "icon", category: "image", src: "/template-assets/iconic/x.svg", width: 14, height: 14, top: 40 },
      { element_id: "photo", category: "image", src: "/images/2/content", width: 90, height: 90, top: 50 },
      { element_id: "logo", category: "image", src: "/images/3/content", width: 40, height: 20, top: 400 },
    ]);
    assert.equal(slot.element_id, "photo");
  });
});
