import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendSectionAtEnd,
  applyFlowSpacing,
  deriveSectionStyle,
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

  it("does not list digit-only chrome as a section even when isDecorativeChromeText was stripped", () => {
    // Older save/load paths dropped the flag; without the digit heuristic,
    // "01"/"02" become phantom sections and packing tears Monument chrome apart.
    const elements = [
      { element_id: "num", category: "text", flowRole: "section-chrome", content: "03",
        left: 74, top: 200, fontSize: 11, page: 1 },
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "WYKSZTAŁCENIE",
        left: 118, top: 200, fontSize: 12.5, page: 1 },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true,
        left: 102, top: 240, width: 427, height: 20, page: 1 },
    ];
    const sections = listDocumentSections(elements);
    assert.deepEqual(sections.map((section) => section.title), ["WYKSZTAŁCENIE"]);
  });

  it("does not list a decorative numbered badge as its own section (Monument-style chrome)", () => {
    // Monument tags both the "05" ordinal badge text and the real "JĘZYKI"
    // label as flowRole: "section-chrome" (two _text() calls in one section()
    // call). Only the label is a real heading; the badge must be excluded via
    // its isDecorativeChromeText flag.
    const sections = listDocumentSections([
      {
        element_id: "badge-05",
        category: "text",
        flowRole: "section-chrome",
        isDecorativeChromeText: true,
        content: "05",
        fontSize: 11,
        left: 74,
        top: 508,
        page: 1,
      },
      {
        element_id: "label-jezyki",
        category: "text",
        flowRole: "section-chrome",
        content: "JĘZYKI",
        fontSize: 12.5,
        left: 118,
        top: 508,
        page: 1,
      },
      {
        element_id: "jezyki-rule",
        category: "line",
        flowRole: "section-chrome",
        left: 369,
        top: 523,
        width: 160,
        height: 2,
        page: 1,
      },
    ]);
    assert.deepEqual(sections.map((section) => section.title), ["JĘZYKI"]);
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

  it("does not treat masthead contact lines as section headings", () => {
    const elements = [
      {
        element_id: "contact",
        category: "text",
        content: "kamil@example.com · +48 600 000 000 · Warszawa",
        page: 1,
        top: 133,
        left: 90,
        fontSize: 8.6,
        height: 12,
      },
      {
        element_id: "masthead-rule",
        category: "line",
        page: 1,
        top: 158,
        left: 88,
        width: 411,
        height: 1,
      },
      {
        element_id: "h1",
        category: "text",
        flowRole: "section-chrome",
        content: "PODSUMOWANIE ZAWODOWE",
        page: 1,
        top: 194,
        left: 113,
        fontSize: 8.4,
        height: 12,
      },
      {
        element_id: "r1",
        category: "line",
        flowRole: "section-chrome",
        page: 1,
        top: 206,
        left: 113,
        width: 386,
        height: 1,
      },
      {
        element_id: "a1",
        category: "textarea",
        flowRole: "content",
        autoHeight: true,
        page: 1,
        top: 215,
        height: 40,
        left: 113,
      },
    ];
    const sections = listDocumentSections(elements);
    assert.deepEqual(sections.map((section) => section.title), ["PODSUMOWANIE ZAWODOWE"]);
  });

  it("keeps Regent masthead clearance when packing after a corrupted heading gap", () => {
    // Masthead rule stays at 158; a prior pack pushed the first heading to 280
    // and opened a large white band. Packing must re-anchor under the masthead
    // (~158 + 36) instead of preserving the corrupted 280 start.
    const elements = [
      {
        element_id: "name",
        category: "text",
        flowRole: "masthead",
        content: "Kamil Wrzochalski",
        page: 1,
        top: 67,
        fontSize: 29,
        height: 39,
        left: 88,
      },
      {
        element_id: "contact",
        category: "text",
        flowRole: "masthead",
        content: "kamil@example.com · +48 600 000 000 · Warszawa",
        page: 1,
        top: 133,
        fontSize: 8.6,
        height: 12,
        left: 90,
      },
      {
        element_id: "masthead-rule",
        category: "line",
        flowRole: "masthead",
        page: 1,
        top: 158,
        left: 88,
        width: 411,
        height: 1,
      },
      {
        element_id: "h1",
        category: "text",
        flowRole: "section-chrome",
        content: "PODSUMOWANIE ZAWODOWE",
        page: 1,
        top: 280,
        left: 113,
        fontSize: 8.4,
        height: 12,
      },
      {
        element_id: "m1",
        category: "rectangle",
        flowRole: "section-chrome",
        page: 1,
        top: 282,
        left: 88,
        width: 8,
        height: 8,
      },
      {
        element_id: "r1",
        category: "line",
        flowRole: "section-chrome",
        page: 1,
        top: 292,
        left: 113,
        width: 386,
        height: 1,
      },
      {
        element_id: "a1",
        category: "textarea",
        flowRole: "content",
        autoHeight: true,
        page: 1,
        top: 301,
        height: 40,
        left: 113,
      },
    ];

    const packed = applyFlowSpacing(elements, {
      stack: 15,
      record: 10,
      section: 21,
      after_rule: 8,
    }, 842);
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));

    assert.equal(byId["masthead-rule"].top, 158, "masthead rule must not move");
    assert.ok(
      byId.h1.top >= 190 && byId.h1.top <= 210,
      `first heading should sit under the masthead clearance, got top=${byId.h1.top}`,
    );
    assert.ok(
      byId.h1.top - byId["masthead-rule"].top <= 56,
      "white gap under masthead must close",
    );
    assert.ok(byId.m1.top - byId.h1.top <= 4, "section mark stays on the heading line");
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

describe("deriveSectionStyle", () => {
  it("falls back to defaults when the document has no sections", () => {
    const style = deriveSectionStyle([]);
    assert.deepEqual(style.markers, []);
    assert.ok(style.recordWidth > 0);
    assert.ok(style.heading.fontSize > 0);
    assert.equal(typeof style.body.color, "string");
  });

  it("samples the last section's heading, rule and body", () => {
    const elements = [
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Doświadczenie",
        left: 76, top: 100, fontSize: 8.7, fontFamily: "Inter", color: "#111111", letterSpacing: 1.6 },
      { element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 76, top: 112, width: 466, height: 1, backgroundColor: "#cccccc" },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true,
        left: 76, top: 130, width: 466, height: 40, fontSize: 9.3, fontFamily: "Inter",
        lineHeight: 13, color: "#222222" },
      { element_id: "h2", category: "text", flowRole: "section-chrome", content: "Umiejętności",
        left: 76, top: 260, fontSize: 8.7, fontFamily: "Inter", color: "#733B43", letterSpacing: 1.35 },
      { element_id: "r2", category: "line", flowRole: "section-chrome",
        left: 76, top: 272, width: 466, height: 1, backgroundColor: "#bbbbbb" },
      { element_id: "b2", category: "textarea", flowRole: "content", autoHeight: true,
        left: 76, top: 290, width: 466, height: 20, fontSize: 9.1, fontFamily: "Inter",
        lineHeight: 13, color: "#222222" },
    ];
    const style = deriveSectionStyle(elements);
    assert.equal(style.left, 76);
    assert.equal(style.recordWidth, 466);
    assert.equal(style.heading.color, "#733B43"); // from the LAST section (Umiejętności)
    assert.equal(style.heading.letterSpacing, 1.35);
    assert.equal(style.rule.backgroundColor, "#bbbbbb");
    assert.equal(style.body.fontSize, 9.1);
  });

  it("captures a decorative shape offset from the heading", () => {
    const elements = [
      { element_id: "m1", category: "rectangle", flowRole: "section-chrome",
        left: 51, top: 101, width: 8, height: 8, backgroundColor: "#733B43" },
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Profil",
        left: 76, top: 100, fontSize: 8.4, fontFamily: "Inter", color: "#733B43", letterSpacing: 1.6 },
      { element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 76, top: 111, width: 466, height: 1, backgroundColor: "#cccccc" },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true,
        left: 76, top: 128, width: 466, height: 30, fontSize: 9.3, fontFamily: "Inter",
        lineHeight: 13, color: "#222222" },
    ];
    const style = deriveSectionStyle(elements);
    assert.equal(style.markers.length, 1);
    assert.equal(style.markers[0].category, "rectangle");
    assert.equal(style.markers[0].relLeft, -25); // 51 - 76
    assert.equal(style.markers[0].width, 8);
  });

  it("does not adopt far-left sidebar chrome as the last section's shape", () => {
    // Two-column templates: the last main-column section has no lower Y bound,
    // so a sidebar decoration sitting below the heading is a section member by
    // Y alone. It lives in a different column and must not be sampled as a
    // decorative shape (that would produce a wildly wrong relLeft from another
    // column).
    const elements = [
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Doświadczenie",
        left: 76, top: 100, fontSize: 8.7, fontFamily: "Inter", color: "#111111", letterSpacing: 1.6 },
      { element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 76, top: 112, width: 466, height: 1, backgroundColor: "#cccccc" },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true,
        left: 76, top: 130, width: 466, height: 40, fontSize: 9.3, fontFamily: "Inter",
        lineHeight: 13, color: "#222222" },
      { element_id: "side", category: "rectangle", flowRole: "section-chrome",
        left: 8, top: 160, width: 8, height: 8, backgroundColor: "#733B43" },
    ];
    const style = deriveSectionStyle(elements);
    assert.deepEqual(style.markers, []); // sidebar rectangle at left 8 is out of the heading's column
  });

  it("captures every decorative shape, not just one (Kernel-style circle + accent line)", () => {
    // Kernel's section() pushes TWO decorative shapes per heading: a filled
    // circle marker and a short accent line, distinct from the wide underline
    // rule. A single-marker model would silently drop the second shape.
    const elements = [
      { element_id: "circle1", category: "circle", flowRole: "section-chrome",
        left: 52, top: 101, width: 12, height: 12, backgroundColor: "#733B43", filled: true },
      { element_id: "tick1", category: "line", flowRole: "section-chrome",
        left: 68, top: 107, width: 11, height: 1, backgroundColor: "#A66B5B" },
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Doświadczenie",
        left: 76, top: 100, fontSize: 8.5, fontFamily: "Inter", color: "#733B43", letterSpacing: 1.55 },
      { element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 76, top: 111, width: 466, height: 1, backgroundColor: "#cccccc" },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true,
        left: 76, top: 128, width: 466, height: 30, fontSize: 9.3, fontFamily: "Inter",
        lineHeight: 13, color: "#222222" },
    ];
    const style = deriveSectionStyle(elements);
    assert.equal(style.markers.length, 2);
    const categories = style.markers.map((shape) => shape.category).sort();
    assert.deepEqual(categories, ["circle", "line"]);
    // The wide underline rule must not also appear as a decorative shape.
    assert.ok(!style.markers.some((shape) => shape.width >= 120));
  });

  it("captures a marker sampled at the rule's far end (Cinder-style, not left of the heading)", () => {
    // Cinder's per-section mark is a 16x16 rect at left=526 — near the RIGHT
    // end of the underline rule (heading left=76, rule width=466, so the rule
    // spans 76..542) — not near the heading's own left edge like every other
    // template's marker. The heading-only ±60px column check must not reject
    // it as cross-column sidebar contamination (real distance from heading:
    // |526-76|=450, far outside that band; the fix widens the check to also
    // accept shapes within ±60px of the identified rule's own span).
    const elements = [
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Doświadczenie",
        left: 76, top: 100, fontSize: 8.7, fontFamily: "Inter", color: "#C93F3F" },
      { element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 76, top: 111, width: 466, height: 1, backgroundColor: "#D5D6D6" },
      { element_id: "mark", category: "rectangle", flowRole: "section-chrome",
        left: 526, top: 102, width: 16, height: 16, backgroundColor: "#C93F3F", borderWidth: 1.2 },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true,
        left: 76, top: 128, width: 466, height: 30, fontSize: 9.5, fontFamily: "Inter",
        lineHeight: 13, color: "#292D31" },
    ];
    const style = deriveSectionStyle(elements);
    assert.equal(style.markers.length, 1);
    assert.equal(style.markers[0].category, "rectangle");
    assert.equal(style.markers[0].relLeft, 450); // 526 - 76
    assert.equal(style.markers[0].width, 16);
  });

  it("captures a large block shape as a decorative marker (Monument-style badge, not a rule)", () => {
    // Monument's badge square is category "line" but height 32 (a filled
    // block, not a thin underline) and its label frame is a 251-wide
    // rectangle. Neither fits the old <=40px marker size cap. The decorative
    // badge NUMBER text is sampled separately (see `badgeNumber` tests below)
    // — it never joins `markers`, since only shapes (rectangle/circle/
    // ellipse/line/image) belong there.
    const elements = [
      { element_id: "badge-sq", category: "line", flowRole: "section-chrome",
        left: 66, top: 500, width: 32, height: 32, backgroundColor: "#111111" },
      { element_id: "badge-num", category: "text", flowRole: "section-chrome",
        isDecorativeChromeText: true, content: "05", left: 74, top: 508,
        fontSize: 11, fontFamily: "Inter", color: "#ffffff" },
      { element_id: "frame", category: "rectangle", flowRole: "section-chrome",
        left: 106, top: 500, width: 251, height: 32, backgroundColor: "#111111", borderWidth: 1.2 },
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Języki",
        left: 118, top: 508, fontSize: 12.5, fontFamily: "Inter", color: "#111111" },
      { element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 369, top: 515, width: 160, height: 2, backgroundColor: "#cccccc" },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true,
        left: 102, top: 540, width: 427, height: 30, fontSize: 9.3, fontFamily: "Inter",
        lineHeight: 13, color: "#222222" },
    ];
    const style = deriveSectionStyle(elements);
    assert.equal(style.markers.length, 2); // badge square + frame rect; number text excluded
    const categories = style.markers.map((shape) => shape.category).sort();
    assert.deepEqual(categories, ["line", "rectangle"]);
    const bigLine = style.markers.find((shape) => shape.category === "line");
    assert.equal(bigLine.width, 32);
    assert.equal(bigLine.height, 32);
    const rect = style.markers.find((shape) => shape.category === "rectangle");
    assert.equal(rect.width, 251);
    // Content column (102) differs from heading column (118); rule is offset.
    assert.equal(style.left, 118);
    assert.equal(style.bodyLeft, 102);
    assert.ok(style.rule);
    assert.equal(style.rule.relLeft, 369 - 118);
    assert.equal(style.rule.width, 160);
  });

  it("captures the decorative badge-number's style, separate from markers", () => {
    // The ordinal digits themselves ("04") belong to the SAMPLED section, not
    // the new one — deriveSectionStyle captures only the badge's styling
    // (font, color, offset, digit count for zero-padding); the actual number
    // to stamp on a new section is computed by the caller (how many real
    // sections already exist), not sampled here.
    const elements = [
      { element_id: "badge-num", category: "text", flowRole: "section-chrome",
        isDecorativeChromeText: true, content: "04", left: 74, top: 508,
        fontSize: 11, fontFamily: "Montserrat", color: "#ffffff", bold: true },
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Umiejętności",
        left: 118, top: 508, fontSize: 12.5, fontFamily: "CormorantGaramond", color: "#111111", bold: true },
      { element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 369, top: 515, width: 160, height: 2, backgroundColor: "#cccccc" },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true,
        left: 118, top: 540, width: 251, height: 30, fontSize: 9, fontFamily: "Montserrat",
        lineHeight: 14, color: "#343434" },
    ];
    const style = deriveSectionStyle(elements);
    assert.ok(style.badgeNumber);
    assert.equal(style.badgeNumber.fontSize, 11);
    assert.equal(style.badgeNumber.fontFamily, "Montserrat");
    assert.equal(style.badgeNumber.color, "#ffffff");
    assert.equal(style.badgeNumber.bold, true);
    assert.equal(style.badgeNumber.digits, 2); // "04".length, for zero-padding a new ordinal
    assert.equal(style.badgeNumber.relLeft, 74 - 118); // -44
    // The badge number text must never leak into `markers` (text is excluded there).
    assert.equal(style.markers.some((shape) => shape.category === "text"), false);
  });

  it("has no badgeNumber when the section's chrome has no decorative ordinal text", () => {
    const elements = [
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Umiejętności",
        left: 76, top: 100, fontSize: 8.7, fontFamily: "Inter", color: "#733B43" },
      { element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 76, top: 111, width: 466, height: 1, backgroundColor: "#cccccc" },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true,
        left: 76, top: 128, width: 466, height: 30, fontSize: 9.3, fontFamily: "Inter",
        lineHeight: 13, color: "#222222" },
    ];
    const style = deriveSectionStyle(elements);
    assert.equal(style.badgeNumber, null);
  });
});

describe("appendSectionAtEnd", () => {
  const pageHeight = 842;

  function sampleDoc() {
    return [
      // masthead (excluded from section packing but counts as flow content)
      { element_id: "name", category: "text", flowRole: "masthead", content: "Jan Kowalski", left: 76, top: 60, fontSize: 20, height: 24, page: 1 },
      // one existing section
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Doświadczenie", left: 76, top: 120, fontSize: 8.7, height: 12, page: 1 },
      { element_id: "r1", category: "line", flowRole: "section-chrome", left: 76, top: 132, width: 466, height: 1, page: 1 },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true, left: 76, top: 150, width: 466, height: 60, fontSize: 9.3, page: 1 },
    ];
  }

  function newSection() {
    // Rule flush under the heading box — same geometry sectionBuilder produces
    // (fontSize*1.35 ≈ height 12 here). A rule authored above the heading
    // bottom would make rule→body measure larger than after_rule when the
    // packer anchors the first body to the full chrome band.
    return [
      { element_id: "h2", category: "text", flowRole: "section-chrome", content: "Umiejętności", left: 76, top: 0, fontSize: 8.7, height: 12, page: 1 },
      { element_id: "r2", category: "line", flowRole: "section-chrome", left: 76, top: 12, width: 466, height: 1, page: 1 },
      { element_id: "b2", category: "textarea", flowRole: "content", autoHeight: true, left: 76, top: 30, width: 466, height: 40, fontSize: 9.3, page: 1 },
    ];
  }

  it("appends the new section and retargets every section onto the document rhythm", () => {
    // Wizard-authored under-rule gaps often measure ~7px even when the panel
    // knobs say 8. Appending used to pin only the new strip, leaving wizard
    // sections on their authored rhythm — the visible mismatch in the editor.
    const rhythm = { stack: 4, record: 10, section: 21, after_rule: 8 };
    const doc = [
      { element_id: "name", category: "text", flowRole: "masthead", content: "Jan Kowalski", left: 76, top: 60, fontSize: 20, height: 24, page: 1 },
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Doświadczenie", left: 76, top: 120, fontSize: 8.7, height: 12, page: 1 },
      { element_id: "r1", category: "line", flowRole: "section-chrome", left: 76, top: 132, width: 466, height: 1, page: 1 },
      // Authored after_rule = 7 (140 - 133), not the panel's 8.
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true, left: 76, top: 140, width: 466, height: 60, fontSize: 9.3, page: 1 },
    ];
    const result = appendSectionAtEnd(doc, newSection(), pageHeight, { spacing: rhythm });
    assert.equal(result.length, doc.length + 3);

    const byId = Object.fromEntries(result.map((element) => [element.element_id, element]));
    const wizardGap = byId.b1.top - (byId.r1.top + byId.r1.height);
    const addedGap = byId.b2.top - (byId.r2.top + byId.r2.height);
    assert.equal(wizardGap, rhythm.after_rule);
    assert.equal(addedGap, rhythm.after_rule);
  });

  it("places the new heading below the previous section's body", () => {
    const doc = sampleDoc();
    const result = appendSectionAtEnd(doc, newSection(), pageHeight, { spacing: { stack: 4, record: 10, section: 21, after_rule: 8 } });
    const byId = Object.fromEntries(result.map((element) => [element.element_id, element]));
    const prevBodyBottom = (byId.b1.page - 1) * pageHeight + byId.b1.top + byId.b1.height;
    const newHeadingAbs = (byId.h2.page - 1) * pageHeight + byId.h2.top;
    assert.ok(newHeadingAbs >= prevBodyBottom, `expected ${newHeadingAbs} >= ${prevBodyBottom}`);
  });

  it("produces a section detectable by listDocumentSections", () => {
    const result = appendSectionAtEnd(sampleDoc(), newSection(), pageHeight, {});
    const titles = listDocumentSections(result, pageHeight).map((section) => section.title);
    assert.deepEqual(titles, ["Doświadczenie", "Umiejętności"]);
  });

  it("returns the original list unchanged when there is nothing to add", () => {
    const doc = sampleDoc();
    assert.equal(appendSectionAtEnd(doc, [], pageHeight, {}), doc);
  });
});
