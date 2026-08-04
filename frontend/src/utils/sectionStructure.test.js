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
