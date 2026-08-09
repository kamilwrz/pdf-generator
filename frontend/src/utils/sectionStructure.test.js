import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendSectionAtEnd,
  insertSectionAfter,
  applyFlowSpacing,
  deriveSectionStyle,
  findProfilePhotoSlot,
  listDocumentSections,
  packDocumentSections,
  removeSection,
  reorderSection,
  sectionElementIds,
} from "./sectionStructure.js";
import { novaTemplate, voltTemplate } from "../templates/iconic.js";
import { cardinalTemplate } from "../templates/cardinal.js";
import { porticoTemplate } from "../templates/portico.js";

/**
 * Two-column sidebar fixture modeled on Tessera/Slate's real geometry
 * (`side_left=25`, `main_left=218`). Sidebar headings are emitted with
 * `flowRole: "content"` (never "section-chrome" — see `tessera.py` /
 * `slate.py` `sidebar_heading()`), so they are structurally invisible to
 * `listDocumentSections`; only the main-column headings are real "sections".
 */
function twoColumnFixture() {
  return [
    // --- sidebar rail (left 25/51) ---
    { element_id: "sb-kontakt-head", category: "text", content: "KONTAKT", flowRole: "content",
      left: 51, top: 194, fontSize: 7.6 },
    { element_id: "sb-kontakt-rule", category: "line", flowRole: "content",
      left: 51, top: 207, width: 50, height: 1 },
    { element_id: "sb-phone", category: "text", content: "+48792575970", flowRole: "content",
      left: 25, top: 222, fontSize: 7.3 },
    { element_id: "sb-email", category: "text", content: "kwrzochalski@gmail.com", flowRole: "content",
      left: 25, top: 241, fontSize: 7.3 },
    { element_id: "sb-edu-head", category: "text", content: "WYKSZTAŁCENIE", flowRole: "content",
      left: 51, top: 340, fontSize: 7.6 },
    { element_id: "sb-edu-rule", category: "line", flowRole: "content",
      left: 51, top: 353, width: 50, height: 1 },
    { element_id: "sb-edu-body", category: "textarea", content: "Bachelor of Laws (LL.B.)", flowRole: "content",
      autoHeight: true, left: 25, top: 365, width: 128, height: 120, fontSize: 6.6, lineHeight: 9 },

    // --- main column (left 218/248), properly tagged section-chrome ---
    { element_id: "m-summary-head", category: "text", content: "PODSUMOWANIE ZAWODOWE", flowRole: "section-chrome",
      left: 248, top: 199, fontSize: 8.1 },
    { element_id: "m-summary-rule", category: "line", flowRole: "section-chrome",
      left: 248, top: 220, width: 299, height: 1 },
    { element_id: "m-summary-body", category: "textarea", content: "Starszy Analityk AML/KYC…", flowRole: "content",
      autoHeight: true, left: 218, top: 231, width: 329, height: 65, fontSize: 9.0, lineHeight: 13.2 },
    { element_id: "m-exp-head", category: "text", content: "DOŚWIADCZENIE ZAWODOWE", flowRole: "section-chrome",
      left: 248, top: 317, fontSize: 8.1 },
    { element_id: "m-exp-rule", category: "line", flowRole: "section-chrome",
      left: 248, top: 338, width: 299, height: 1 },
    { element_id: "m-exp-title", category: "text", content: "Senior AML Analyst", flowRole: "content",
      flowGroup: "job-0", left: 218, top: 349, fontSize: 10.4, bold: true },
    { element_id: "m-exp-meta", category: "text", content: "PwC Polska · 2020 - obecnie", flowRole: "content",
      flowGroup: "job-0", left: 218, top: 366, fontSize: 8.3 },
    { element_id: "m-exp-body", category: "textarea", content: "- Transaction monitoring…", flowRole: "content",
      flowGroup: "job-0", autoHeight: true, left: 218, top: 380, width: 329, height: 60, fontSize: 9.0, lineHeight: 13.2 },
  ];
}

/** Monument-style chrome band: badge + frame sit 8px above the title baseline. */
function monumentSection(n, title, bandTop) {
  const num = String(n).padStart(2, "0");
  return [
    {
      element_id: `sq${n}`, category: "line", flowRole: "section-chrome",
      left: 66, top: bandTop, width: 32, height: 32, page: 1,
    },
    {
      element_id: `num${n}`, category: "text", flowRole: "section-chrome",
      isDecorativeChromeText: true, content: num,
      left: 74, top: bandTop + 8, fontSize: 11, page: 1,
    },
    {
      element_id: `frame${n}`, category: "rectangle", flowRole: "section-chrome",
      left: 106, top: bandTop, width: 251, height: 32, page: 1,
    },
    {
      element_id: `h${n}`, category: "text", flowRole: "section-chrome", content: title,
      left: 118, top: bandTop + 8, fontSize: 12.5, bold: true, page: 1,
    },
    {
      element_id: `r${n}`, category: "line", flowRole: "section-chrome",
      left: 369, top: bandTop + 15, width: 160, height: 2, page: 1,
    },
    {
      element_id: `b${n}`, category: "textarea", flowRole: "content", autoHeight: true,
      left: 102, top: bandTop + 44, width: 427, height: 14,
      fontSize: 9, lineHeight: 14, content: "Body", page: 1,
    },
  ];
}

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

  it("starts a Monument section at the badge/frame band, not the title baseline", () => {
    // Badge square and title frame sit 8px above the heading. Boundaries must
    // use that band start so the next section's chrome is not stolen.
    const elements = [
      ...monumentSection(1, "PODSUMOWANIE", 168),
      ...monumentSection(2, "DOŚWIADCZENIE", 250),
    ];
    const sections = listDocumentSections(elements);
    assert.equal(sections[0].startAbs, 168);
    assert.equal(sections[1].startAbs, 250);
  });
});

describe("sectionElementIds", () => {
  it("rehomes a body trapped under a stacked continuation heading", () => {
    // Continuation-page corruption: Obsługa chrome, then Języki chrome, then
    // Obsługa body. Y-interval membership used to give both bodies to Języki
    // and packing emitted heading → heading → body → body.
    const elements = [
      {
        element_id: "h1",
        category: "text",
        flowRole: "section-chrome",
        content: "OBSŁUGA KOMPUTERA",
        page: 2,
        top: 66,
        left: 66,
        fontSize: 8.6,
        height: 12,
      },
      {
        element_id: "i1",
        category: "image",
        flowRole: "section-chrome",
        alignWithText: true,
        src: "/template-assets/iconic/nova/skills.png",
        page: 2,
        top: 66,
        left: 48,
        width: 14,
        height: 14,
      },
      {
        element_id: "r1",
        category: "line",
        flowRole: "section-chrome",
        page: 2,
        top: 83,
        left: 66,
        width: 481,
        height: 1,
      },
      {
        element_id: "h2",
        category: "text",
        flowRole: "section-chrome",
        content: "JĘZYKI",
        page: 2,
        top: 94,
        left: 66,
        fontSize: 8.6,
        height: 12,
      },
      {
        element_id: "i2",
        category: "image",
        flowRole: "section-chrome",
        alignWithText: true,
        src: "/template-assets/iconic/nova/languages.png",
        page: 2,
        top: 94,
        left: 48,
        width: 14,
        height: 14,
      },
      {
        element_id: "r2",
        category: "line",
        flowRole: "section-chrome",
        page: 2,
        top: 111,
        left: 66,
        width: 481,
        height: 1,
      },
      {
        element_id: "b1",
        category: "textarea",
        flowRole: "content",
        autoHeight: true,
        content: "biegła znajomość MS Office",
        page: 2,
        top: 120,
        left: 66,
        height: 24,
      },
      {
        element_id: "b2",
        category: "textarea",
        flowRole: "content",
        autoHeight: true,
        bulletList: true,
        content: "• angielski",
        page: 2,
        top: 154,
        left: 66,
        height: 40,
      },
    ];

    const skillsIds = sectionElementIds(elements, "h1", 842);
    const langIds = sectionElementIds(elements, "h2", 842);
    assert.equal(skillsIds.has("b1"), true, "Obsługa keeps its body");
    assert.equal(skillsIds.has("r1"), true, "Obsługa keeps its underline");
    assert.equal(skillsIds.has("h2"), false, "Języki heading stays out of Obsługa");
    assert.equal(langIds.has("b2"), true, "Języki keeps its body");
    assert.equal(langIds.has("b1"), false, "Obsługa body is not stolen by Języki");
    assert.equal(langIds.has("r1"), false, "previous underline is not stolen");

    const packed = applyFlowSpacing(elements, {
      stack: 4,
      record: 10,
      section: 11,
      after_rule: 8,
    }, 842);
    const abs = (element) => (element.page - 1) * 842 + element.top;
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));
    assert.ok(abs(byId.h1) < abs(byId.r1));
    assert.ok(abs(byId.r1) < abs(byId.b1));
    assert.ok(abs(byId.b1) < abs(byId.h2));
    assert.ok(abs(byId.h2) < abs(byId.b2));
  });

  it("does not absorb the next Monument badge/frame into the previous section", () => {
    // Regression: previous section end was the next heading baseline, so the
    // next badge/frame at heading−8 fell into [start, end) and packing rebuilt
    // chrome — titles left their decorative frames.
    const elements = [
      ...monumentSection(1, "PODSUMOWANIE", 168),
      ...monumentSection(2, "DOŚWIADCZENIE", 250),
      ...monumentSection(3, "WYKSZTAŁCENIE", 360),
    ];
    const ids1 = sectionElementIds(elements, "h1");
    const ids2 = sectionElementIds(elements, "h2");
    assert.equal(ids1.has("sq1"), true);
    assert.equal(ids1.has("frame1"), true);
    assert.equal(ids1.has("sq2"), false, "next badge must not belong to section 1");
    assert.equal(ids1.has("frame2"), false, "next frame must not belong to section 1");
    assert.equal(ids2.has("sq2"), true);
    assert.equal(ids2.has("sq3"), false);
  });

  it("excludes the sidebar rail from a two-column template's main-section membership", () => {
    // Regression: Tessera/Slate sidebar headings carry flowRole "content" (not
    // "section-chrome"), so they were structurally invisible as headings but
    // still swept into the nearest main-column section by Y alone — dragging
    // the sidebar into the main flow on every repack.
    const elements = twoColumnFixture();
    const summaryIds = sectionElementIds(elements, "m-summary-head");
    const expIds = sectionElementIds(elements, "m-exp-head");
    for (const sidebarId of ["sb-kontakt-head", "sb-kontakt-rule", "sb-phone", "sb-email"]) {
      assert.equal(summaryIds.has(sidebarId), false, `${sidebarId} must not join PODSUMOWANIE`);
    }
    for (const sidebarId of ["sb-edu-head", "sb-edu-rule", "sb-edu-body"]) {
      assert.equal(expIds.has(sidebarId), false, `${sidebarId} must not join DOŚWIADCZENIE`);
    }
    // Main-column members are still captured correctly.
    assert.equal(expIds.has("m-exp-title"), true);
    assert.equal(expIds.has("m-exp-meta"), true);
    assert.equal(expIds.has("m-exp-body"), true);
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

describe("removeSection", () => {
  it("deletes a middle section and re-packs the following section upward", () => {
    const elements = [
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "A", page: 1, top: 100, height: 14 },
      { element_id: "a1", category: "textarea", flowRole: "content", autoHeight: true, page: 1, top: 122, height: 40 },
      { element_id: "h2", category: "text", flowRole: "section-chrome", content: "B", page: 1, top: 183, height: 14 },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true, page: 1, top: 205, height: 80 },
      { element_id: "h3", category: "text", flowRole: "section-chrome", content: "C", page: 1, top: 306, height: 14 },
      { element_id: "c1", category: "textarea", flowRole: "content", autoHeight: true, page: 1, top: 328, height: 30 },
    ];
    const beforeC = elements.find((element) => element.element_id === "h3").top;
    const result = removeSection(elements, "h2", 842, {
      spacing: { stack: 4, record: 10, section: 21, after_rule: 8 },
    });
    assert.ok(result);
    const ids = new Set(result.elements.map((element) => element.element_id));
    assert.equal(ids.has("h2"), false);
    assert.equal(ids.has("b1"), false);
    assert.ok(ids.has("h1"));
    assert.ok(ids.has("h3"));
    assert.ok(result.removedIds.has("h2"));
    assert.ok(result.removedIds.has("b1"));
    const afterC = result.elements.find((element) => element.element_id === "h3");
    assert.ok(afterC.top < beforeC, "section C must close the hole left by B");
  });

  it("returns null for an unknown heading", () => {
    assert.equal(removeSection([], "missing"), null);
  });
});

describe("applyFlowSpacing", () => {
  it("keeps Nova icon-row contacts aligned when rhythm changes", () => {
    // Untagged phone text used to match "short label + rule below" and become
    // a fake first section — icons stayed put (masthead) while labels drifted.
    const elements = [
      { element_id: "name", category: "text", content: "Anna", left: 48, top: 42, fontSize: 34, height: 40, page: 1 },
      {
        element_id: "i1",
        category: "image",
        src: "/template-assets/iconic/nova/phone.png",
        left: 50,
        top: 118,
        width: 14,
        height: 14,
        page: 1,
        flowRole: "masthead",
        alignWithText: true,
      },
      {
        element_id: "t1",
        category: "text",
        content: "684 732 543",
        left: 66,
        top: 118,
        fontSize: 8.4,
        height: 11,
        page: 1,
      },
      {
        element_id: "i2",
        category: "image",
        src: "/template-assets/iconic/nova/email.png",
        left: 137,
        top: 118,
        width: 14,
        height: 14,
        page: 1,
        flowRole: "masthead",
        alignWithText: true,
      },
      {
        element_id: "t2",
        category: "text",
        content: "annarojek87@wp.pl",
        left: 153,
        top: 118,
        fontSize: 8.4,
        height: 11,
        page: 1,
      },
      {
        element_id: "rule",
        category: "line",
        left: 48,
        top: 144,
        width: 499,
        height: 1,
        page: 1,
      },
      {
        element_id: "h1",
        category: "text",
        content: "DOŚWIADCZENIE ZAWODOWE",
        left: 68,
        top: 169,
        fontSize: 8.5,
        height: 12,
        page: 1,
        flowRole: "section-chrome",
        letterSpacing: 1.45,
      },
      {
        element_id: "hi1",
        category: "image",
        src: "/template-assets/iconic/nova/experience.png",
        left: 48,
        top: 169,
        width: 14,
        height: 14,
        page: 1,
        flowRole: "section-chrome",
        alignWithText: true,
      },
      {
        element_id: "hr1",
        category: "line",
        left: 68,
        top: 186,
        width: 481,
        height: 1,
        page: 1,
        flowRole: "section-chrome",
      },
      {
        element_id: "b1",
        category: "text",
        content: "Job title",
        left: 68,
        top: 200,
        fontSize: 11,
        height: 14,
        page: 1,
        flowRole: "content",
      },
      {
        element_id: "h2",
        category: "text",
        content: "WYKSZTAŁCENIE",
        left: 68,
        top: 300,
        fontSize: 8.5,
        height: 12,
        page: 1,
        flowRole: "section-chrome",
        letterSpacing: 1.45,
      },
      {
        element_id: "b2",
        category: "text",
        content: "Degree",
        left: 68,
        top: 330,
        fontSize: 10,
        height: 13,
        page: 1,
        flowRole: "content",
      },
    ];
    const packed = applyFlowSpacing(elements, {
      section: 40,
      record: 20,
      stack: 8,
      after_rule: 12,
    }, 842);
    const phoneIcon = packed.find((element) => element.element_id === "i1");
    const phoneText = packed.find((element) => element.element_id === "t1");
    const emailIcon = packed.find((element) => element.element_id === "i2");
    const emailText = packed.find((element) => element.element_id === "t2");
    assert.equal(phoneText.top, phoneIcon.top);
    assert.equal(emailText.top, emailIcon.top);
    assert.equal(phoneText.left, 66);
    assert.equal(emailText.left, 153);
  });

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

  it("keeps section chrome with the full first flowGroup record, not only the first line", () => {
    // Tall page-1 section leaves ~90px before contentBottom (770). Chrome +
    // degree would "fit", but school/meta/description would spill — structural
    // packing must bump the whole heading band with the education record.
    const elements = [
      {
        element_id: "h1", category: "text", flowRole: "section-chrome",
        content: "Summary", page: 1, top: 100, height: 14, left: 76,
      },
      {
        element_id: "r1", category: "line", flowRole: "section-chrome",
        page: 1, top: 114, height: 1, width: 466, left: 76,
      },
      {
        element_id: "s1", category: "textarea", flowRole: "content", autoHeight: true,
        page: 1, top: 122, height: 560, left: 76,
      },
      {
        element_id: "h2", category: "text", flowRole: "section-chrome",
        content: "Education", page: 1, top: 700, height: 14, left: 76,
      },
      {
        element_id: "r2", category: "line", flowRole: "section-chrome",
        page: 1, top: 714, height: 1, width: 466, left: 76,
      },
      {
        element_id: "deg", category: "textarea", flowRole: "content", autoHeight: true,
        flowGroup: "record-edu-1", bold: true,
        page: 1, top: 722, height: 16, left: 76,
      },
      {
        element_id: "sch", category: "textarea", flowRole: "content", autoHeight: true,
        flowGroup: "record-edu-1",
        page: 1, top: 742, height: 14, left: 76,
      },
      {
        element_id: "meta", category: "textarea", flowRole: "content", autoHeight: true,
        flowGroup: "record-edu-1",
        page: 1, top: 760, height: 12, left: 76,
      },
      {
        element_id: "desc", category: "textarea", flowRole: "content", autoHeight: true,
        flowGroup: "record-edu-1", bulletList: true,
        page: 1, top: 776, height: 40, left: 76,
      },
    ];
    const packed = applyFlowSpacing(elements, {
      stack: 4, record: 10, section: 21, after_rule: 8,
    }, 842, { pageTop: 66, bottomMargin: 72 });
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));

    assert.equal(byId.h2.page, byId.deg.page);
    assert.equal(byId.deg.page, byId.sch.page);
    assert.equal(byId.deg.page, byId.meta.page);
    assert.equal(byId.deg.page, byId.desc.page);
    assert.equal(byId.h2.page, 2, "full record forces the section onto page 2");
  });

  it("does not split a later experience flowGroup across a page break while packing", () => {
    // First experience record fills most of page 1. The second record's title
    // would fit in the footer leftover while company/description jumped —
    // placeStrip must keep the whole second flowGroup together.
    const elements = [
      {
        element_id: "h1", category: "text", flowRole: "section-chrome",
        content: "Experience", page: 1, top: 100, height: 14, left: 76,
      },
      {
        element_id: "r1", category: "line", flowRole: "section-chrome",
        page: 1, top: 114, height: 1, width: 466, left: 76,
      },
      {
        element_id: "t1", category: "textarea", flowRole: "content", autoHeight: true,
        flowGroup: "record-job-1", bold: true,
        page: 1, top: 122, height: 16, left: 76,
      },
      {
        element_id: "c1", category: "textarea", flowRole: "content", autoHeight: true,
        flowGroup: "record-job-1",
        page: 1, top: 142, height: 14, left: 76,
      },
      {
        element_id: "d1", category: "textarea", flowRole: "content", autoHeight: true,
        flowGroup: "record-job-1", bulletList: true,
        page: 1, top: 160, height: 520, left: 76,
      },
      {
        element_id: "t2", category: "textarea", flowRole: "content", autoHeight: true,
        flowGroup: "record-job-2", bold: true,
        page: 1, top: 690, height: 16, left: 76,
      },
      {
        element_id: "c2", category: "textarea", flowRole: "content", autoHeight: true,
        flowGroup: "record-job-2",
        page: 1, top: 710, height: 14, left: 76,
      },
      {
        element_id: "d2", category: "textarea", flowRole: "content", autoHeight: true,
        flowGroup: "record-job-2", bulletList: true,
        page: 1, top: 728, height: 60, left: 76,
      },
    ];
    const packed = applyFlowSpacing(elements, {
      stack: 4, record: 10, section: 21, after_rule: 8,
    }, 842, { pageTop: 66, bottomMargin: 72 });
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));

    assert.equal(byId.t2.page, byId.c2.page, "title and company stay together");
    assert.equal(byId.t2.page, byId.d2.page, "title and description stay together");
    assert.equal(byId.t1.page, 1);
    assert.equal(byId.t2.page, 2, "second record moves as a unit onto page 2");
  });

  it("heals a Monument accent rule that was built flush under the label", () => {
    // Legacy add-section placed the accent at title+fs*1.35 (~17) instead of
    // the authored mid-band title+7. The cluster still "looks healthy" (overlap
    // with the tall badge), so packing must snap the rule back to badge+15.
    const elements = [
      {
        element_id: "sq1", category: "line", flowRole: "section-chrome",
        left: 66, top: 200, width: 32, height: 32, page: 1,
      },
      {
        element_id: "num1", category: "text", flowRole: "section-chrome",
        isDecorativeChromeText: true, content: "01",
        left: 74, top: 208, fontSize: 11, page: 1,
      },
      {
        element_id: "frame1", category: "rectangle", flowRole: "section-chrome",
        left: 106, top: 200, width: 251, height: 32, page: 1,
      },
      {
        element_id: "h1", category: "text", flowRole: "section-chrome", content: "NOWA",
        left: 118, top: 208, fontSize: 12.5, bold: true, page: 1,
      },
      {
        element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 369, top: 208 + 12.5 * 1.35, width: 160, height: 2, page: 1,
      },
      {
        element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true,
        left: 102, top: 250, width: 427, height: 14, fontSize: 9, lineHeight: 14,
        content: "Body", page: 1,
      },
    ];
    const packed = applyFlowSpacing(elements, {
      stack: 4, record: 10, section: 21, after_rule: 8,
    }, 842);
    const square = packed.find((element) => element.element_id === "sq1");
    const rule = packed.find((element) => element.element_id === "r1");
    assert.equal(+(rule.top - square.top).toFixed(2), 15);
  });

  it("preserves Monument title-inside-frame offsets across every section after pack", () => {
    // Authored: square/frame at T, title/ordinal at T+8, offset rule at T+15.
    // A full-document force-pack must keep that geometry on sections 1..n-1,
    // not only on the last section (which never had a following band to steal).
    const elements = [
      {
        element_id: "name", category: "text", flowRole: "masthead",
        content: "Kamil", left: 74, top: 59, fontSize: 33, height: 40, page: 1,
      },
      ...monumentSection(1, "PODSUMOWANIE", 168),
      ...monumentSection(2, "DOŚWIADCZENIE", 250),
      ...monumentSection(3, "WYKSZTAŁCENIE", 360),
      ...monumentSection(4, "UMIEJĘTNOŚCI", 470),
      ...monumentSection(5, "JĘZYKI", 580),
    ];
    const packed = applyFlowSpacing(elements, {
      stack: 4, record: 10, section: 21, after_rule: 8,
    }, 842);
    for (const n of [1, 2, 3, 4, 5]) {
      const title = packed.find((element) => element.element_id === `h${n}`);
      const frame = packed.find((element) => element.element_id === `frame${n}`);
      const square = packed.find((element) => element.element_id === `sq${n}`);
      const rule = packed.find((element) => element.element_id === `r${n}`);
      assert.ok(title && frame && square && rule, `section ${n} chrome present`);
      assert.equal(
        +(title.top - frame.top).toFixed(2),
        8,
        `section ${n}: title must stay 8px below frame top (inside the frame)`,
      );
      assert.equal(+(title.top - square.top).toFixed(2), 8, `section ${n}: title vs badge`);
      assert.equal(+(rule.top - square.top).toFixed(2), 15, `section ${n}: authored rule offset`);
    }
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

  it("treats explicitly tagged decorative chrome as a rigid composition", () => {
    const elements = [
      {
        element_id: "masthead", category: "text", flowRole: "masthead",
        content: "NAME", page: 1, top: 60, height: 30, left: 48,
      },
      {
        element_id: "frame", category: "rectangle", flowRole: "section-chrome",
        page: 1, top: 180, height: 18, width: 220, left: 48,
      },
      {
        element_id: "heading", category: "text", flowRole: "section-chrome",
        content: "EXPERIENCE", page: 1, top: 203, height: 10, left: 66,
      },
      {
        element_id: "rule", category: "line", flowRole: "section-chrome",
        page: 1, top: 224, height: 1, width: 481, left: 66,
      },
      {
        element_id: "body", category: "textarea", flowRole: "content",
        autoHeight: true, page: 1, top: 238, height: 40, left: 66,
      },
    ];

    const packed = applyFlowSpacing(elements, {
      stack: 1, record: 30, section: 40, after_rule: 12,
    }, 842);
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));

    assert.equal(byId.heading.top - byId.frame.top, 23);
    assert.equal(byId.rule.top - byId.frame.top, 44);
    assert.equal(byId.heading.left, 66);
    assert.equal(byId.rule.left, 66);
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

  it("heals an iconic CV that a prior pack forced to the 36px Regent clearance", () => {
    const elements = [
      {
        element_id: "rule",
        category: "line",
        flowRole: "masthead",
        page: 1,
        top: 160,
        left: 48,
        width: 499,
        height: 1,
      },
      {
        element_id: "mail-icon",
        category: "image",
        flowRole: "masthead",
        alignWithText: true,
        src: "/template-assets/iconic/nova/email.png",
        page: 1,
        top: 134,
        left: 50,
        width: 14,
        height: 14,
      },
      {
        element_id: "h1",
        category: "text",
        flowRole: "section-chrome",
        content: "PODSUMOWANIE ZAWODOWE",
        page: 1,
        top: 197, // 161 + 36 — classic forced-clearance corruption
        left: 66,
        fontSize: 8.6,
        height: 12,
      },
      {
        element_id: "r1",
        category: "line",
        flowRole: "section-chrome",
        page: 1,
        top: 214,
        left: 66,
        width: 481,
        height: 1,
      },
      {
        element_id: "a1",
        category: "textarea",
        flowRole: "content",
        autoHeight: true,
        page: 1,
        top: 222,
        height: 40,
        left: 66,
      },
    ];
    const packed = applyFlowSpacing(elements, {
      stack: 4,
      record: 10,
      section: 21,
      after_rule: 8,
    }, 842);
    const heading = packed.find((element) => element.element_id === "h1");
    assert.ok(
      heading.top >= 168 && heading.top <= 176,
      `iconic first section should heal under the masthead, got top=${heading.top}`,
    );
  });

  it("preserves tight iconic masthead→section gaps instead of forcing 36px", () => {
    // Nova authors ~8px under the divider; an older MIN gap of 20px treated that
    // as corruption and shoved every section down by ~28px (Cardinal/Volt too).
    for (const [name, template] of [
      ["nova", novaTemplate],
      ["cardinal", cardinalTemplate],
      ["volt", voltTemplate],
    ]) {
      const source = template.map((element, index) => ({
        ...element,
        element_id: `${name}-${index}`,
        page: 1,
      }));
      const before = listDocumentSections(source, 842);
      const firstBefore = source.find((element) => (
        element.element_id === before[0]?.headingId
      ));
      const packed = applyFlowSpacing(source, {
        stack: 4,
        record: 8,
        section: 0,
        after_rule: 8,
      }, 842);
      const after = listDocumentSections(packed, 842);
      const firstAfter = packed.find((element) => (
        element.element_id === after[0]?.headingId
      ));
      assert.ok(firstBefore, `${name}: expected a first section before pack`);
      assert.equal(
        firstAfter?.top,
        firstBefore.top,
        `${name}: first section must keep authored top ${firstBefore.top}, got ${firstAfter?.top}`,
      );
      // Band start (icons / rules above the label) must not jump either.
      assert.ok(
        Math.abs((after[0]?.startAbs ?? 0) - (before[0]?.startAbs ?? 0)) < 0.5,
        `${name}: chrome band start shifted from ${before[0]?.startAbs} to ${after[0]?.startAbs}`,
      );
      assert.deepEqual(
        after.map((section) => section.title),
        before.map((section) => section.title),
        `${name}: packing must not invent phantom section headings`,
      );
    }
  });

  it("keeps a centered iconic masthead's authored clearance on reorder (Portico)", () => {
    // Portico is icon-tagged but authors a deliberate ~36px "Ivy League"
    // masthead clearance (SPACE_AFTER_HEADER_RULE) under its centered name /
    // title / contact block. The iconic heal-back that collapses Nova/Cardinal's
    // over-authored 36px down to a tight 10px must NOT fire here — otherwise
    // reordering sections yanks the whole document up by ~26px.
    const source = porticoTemplate.map((element, index) => ({
      ...element,
      element_id: `p-${index}`,
      page: 1,
    }));
    const before = listDocumentSections(source, 842);
    const firstBefore = source.find((element) => (
      element.element_id === before[0]?.headingId
    ));
    assert.ok(firstBefore, "expected a first Portico section before reorder");

    const packed = reorderSection(source, before[1].headingId, "up", 842, {
      spacing: { stack: 4, record: 10, section: 21, after_rule: 8 },
    });
    const after = listDocumentSections(packed, 842);
    const firstAfter = packed.find((element) => (
      element.element_id === after[0]?.headingId
    ));
    // The reorder swaps which section is first, but whichever heading lands at
    // the top must keep the authored masthead clearance (~36px), i.e. the same
    // absolute top the original first section occupied — not a collapsed 10px.
    assert.equal(
      firstAfter?.top,
      firstBefore.top,
      `Portico first section must keep its ${firstBefore.top}px masthead `
      + `clearance after reorder, got ${firstAfter?.top}`,
    );
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

  it("leaves a two-column template's sidebar rail untouched when repacking rhythm (Sections panel Odstępy)", () => {
    // Regression: this is the exact call the Sections panel's spacing knobs
    // trigger. Before the column fix, sidebar elements got vacuumed into
    // whichever main section shared their Y band, then linearly restacked
    // into the main flow — scrambling the two-column layout on every knob
    // change (reported live on the Tessera template).
    const elements = twoColumnFixture();
    const before = new Map(elements.map((element) => [element.element_id, { left: element.left, top: element.top }]));
    const packed = applyFlowSpacing(elements, {
      stack: 4, record: 10, section: 21, after_rule: 8,
    }, 842);
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));

    for (const sidebarId of [
      "sb-kontakt-head", "sb-kontakt-rule", "sb-phone", "sb-email",
      "sb-edu-head", "sb-edu-rule", "sb-edu-body",
    ]) {
      const original = before.get(sidebarId);
      assert.equal(byId[sidebarId].left, original.left, `${sidebarId} left must be untouched`);
      assert.equal(byId[sidebarId].top, original.top, `${sidebarId} top must be untouched`);
    }
    // The main column is still genuinely repacked (not a no-op fix).
    assert.notEqual(byId["m-exp-head"].top, before.get("m-exp-head").top);
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
    // Accent rule at frame/badge top+15, title at +8 → relTop from title = 7.
    assert.equal(style.rule.relTop, 515 - 508);
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

  it("appends after the main column's own content, ignoring a deeper sidebar rail", () => {
    // Regression: appendSectionAtEnd used to take the deepest non-fixed
    // element in the WHOLE document as the flow bottom. On Tessera/Slate the
    // sidebar rail (education/skills fit into the rail) commonly extends
    // deeper than a short main column, so a new section landed far below the
    // real main-column content instead of right after it.
    const doc = twoColumnFixture();
    const mainBottomBefore = Math.max(
      doc.find((e) => e.element_id === "m-exp-body").top + doc.find((e) => e.element_id === "m-exp-body").height,
    );
    const sidebarBottomBefore = doc.find((e) => e.element_id === "sb-edu-body").top
      + doc.find((e) => e.element_id === "sb-edu-body").height; // 365 + 120 = 485, deeper than main
    assert.ok(sidebarBottomBefore > mainBottomBefore, "fixture must actually exercise the deeper-sidebar case");

    const result = appendSectionAtEnd(doc, newSection(), pageHeight, {
      spacing: { stack: 4, record: 10, section: 21, after_rule: 8 },
    });
    const h2 = result.find((element) => element.element_id === "h2");
    assert.ok(
      h2.top < sidebarBottomBefore,
      `new section (top=${h2.top}) should follow the main column (bottom=${mainBottomBefore}), not the deeper sidebar (bottom=${sidebarBottomBefore})`,
    );
  });
});

describe("insertSectionAfter", () => {
  const pageHeight = 842;
  const rhythm = { stack: 4, record: 10, section: 21, after_rule: 8 };

  function twoSectionDoc() {
    return [
      { element_id: "name", category: "text", flowRole: "masthead", content: "Jan Kowalski", left: 76, top: 60, fontSize: 20, height: 24, page: 1 },
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "Doświadczenie", left: 76, top: 120, fontSize: 8.7, height: 12, page: 1 },
      { element_id: "r1", category: "line", flowRole: "section-chrome", left: 76, top: 132, width: 466, height: 1, page: 1 },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true, left: 76, top: 140, width: 466, height: 60, fontSize: 9.3, page: 1 },
      { element_id: "h2", category: "text", flowRole: "section-chrome", content: "Umiejętności", left: 76, top: 221, fontSize: 8.7, height: 12, page: 1 },
      { element_id: "r2", category: "line", flowRole: "section-chrome", left: 76, top: 233, width: 466, height: 1, page: 1 },
      { element_id: "b2", category: "textarea", flowRole: "content", autoHeight: true, left: 76, top: 241, width: 466, height: 40, fontSize: 9.3, page: 1 },
    ];
  }

  function middleSection() {
    return [
      { element_id: "h3", category: "text", flowRole: "section-chrome", content: "Projekty", left: 76, top: 0, fontSize: 8.7, height: 12, page: 1 },
      { element_id: "r3", category: "line", flowRole: "section-chrome", left: 76, top: 12, width: 466, height: 1, page: 1 },
      { element_id: "b3", category: "textarea", flowRole: "content", autoHeight: true, left: 76, top: 30, width: 466, height: 40, fontSize: 9.3, page: 1 },
    ];
  }

  it("places the new section between the anchor and the following section", () => {
    const result = insertSectionAfter(
      twoSectionDoc(),
      middleSection(),
      "h1",
      pageHeight,
      { spacing: rhythm },
    );
    const titles = listDocumentSections(result, pageHeight).map((section) => section.title);
    assert.deepEqual(titles, ["Doświadczenie", "Projekty", "Umiejętności"]);

    const byId = Object.fromEntries(result.map((element) => [element.element_id, element]));
    const abs = (element) => (element.page - 1) * pageHeight + element.top;
    assert.ok(abs(byId.h3) > abs(byId.b1), "new heading below experience body");
    assert.ok(abs(byId.h2) > abs(byId.b3), "skills heading below new body");
  });

  it("falls back to append when the anchor heading is missing", () => {
    const result = insertSectionAfter(
      twoSectionDoc(),
      middleSection(),
      "missing-heading",
      pageHeight,
      { spacing: rhythm },
    );
    const titles = listDocumentSections(result, pageHeight).map((section) => section.title);
    assert.deepEqual(titles, ["Doświadczenie", "Umiejętności", "Projekty"]);
  });

  it("samples style from the anchor section when deriveSectionStyle is given its id", () => {
    const doc = [
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "A", left: 76, top: 100, fontSize: 10, height: 12, color: "#111111", page: 1 },
      { element_id: "r1", category: "line", flowRole: "section-chrome", left: 76, top: 112, width: 400, height: 1, page: 1 },
      { element_id: "b1", category: "textarea", flowRole: "content", autoHeight: true, left: 76, top: 120, width: 400, height: 40, fontSize: 9, color: "#222222", page: 1 },
      { element_id: "h2", category: "text", flowRole: "section-chrome", content: "B", left: 90, top: 200, fontSize: 14, height: 16, color: "#abcdef", page: 1 },
      { element_id: "r2", category: "line", flowRole: "section-chrome", left: 90, top: 216, width: 300, height: 1, page: 1 },
      { element_id: "b2", category: "textarea", flowRole: "content", autoHeight: true, left: 90, top: 224, width: 300, height: 40, fontSize: 11, color: "#fedcba", page: 1 },
    ];
    const fromFirst = deriveSectionStyle(doc, pageHeight, "h1");
    const fromLast = deriveSectionStyle(doc, pageHeight);
    assert.equal(fromFirst.heading.fontSize, 10);
    assert.equal(fromFirst.heading.color, "#111111");
    assert.equal(fromLast.heading.fontSize, 14);
    assert.equal(fromLast.heading.color, "#abcdef");
  });
});
