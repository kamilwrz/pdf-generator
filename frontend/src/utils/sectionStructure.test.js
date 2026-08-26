import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendSectionAtEnd,
  insertSectionAfter,
  applyFlowSpacing,
  deriveSectionStyle,
  findProfilePhotoSlot,
  healDecorativeOrdinalBaselines,
  healSimpleChromeRuleGaps,
  healSkillChipLabelBaselines,
  listDocumentSections,
  listFlatSectionAnchors,
  listSidebarSections,
  packDocumentSections,
  packSidebarLane,
  removeSection,
  reorderSection,
  sectionElementIds,
  sidebarSectionElementIds,
} from "./sectionStructure.js";
import { regentTemplate } from "../templates/regent.js";
import { porticoTemplate } from "../templates/portico.js";
import { changeSkillsDisplayMode } from "./skillsDisplayMode.js";

/**
 * Two-column sidebar fixture modeled on Tessera/Slate's real geometry
 * (`side_left=25`, `main_left=218`). Sidebar kickers use `sidebar-chrome` +
 * `flowLane: "sidebar"` so they pack on an independent lane cursor and stay
 * invisible to `listDocumentSections`.
 */
function twoColumnFixture() {
  return [
    // --- sidebar rail (left 25/51) ---
    { element_id: "sb-kontakt-head", category: "text", content: "KONTAKT",
      flowRole: "sidebar-chrome", flowLane: "sidebar",
      left: 51, top: 194, fontSize: 7.6 },
    { element_id: "sb-kontakt-rule", category: "line",
      flowRole: "sidebar-chrome", flowLane: "sidebar",
      left: 51, top: 207, width: 50, height: 1 },
    { element_id: "sb-phone", category: "text", content: "+48792575970",
      flowRole: "content", flowLane: "sidebar",
      left: 25, top: 222, fontSize: 7.3 },
    { element_id: "sb-email", category: "text", content: "kwrzochalski@gmail.com",
      flowRole: "content", flowLane: "sidebar",
      left: 25, top: 241, fontSize: 7.3 },
    { element_id: "sb-edu-head", category: "text", content: "WYKSZTAŁCENIE",
      flowRole: "sidebar-chrome", flowLane: "sidebar",
      left: 51, top: 340, fontSize: 7.6 },
    { element_id: "sb-edu-rule", category: "line",
      flowRole: "sidebar-chrome", flowLane: "sidebar",
      left: 51, top: 353, width: 50, height: 1 },
    { element_id: "sb-edu-body", category: "textarea", content: "Bachelor of Laws (LL.B.)",
      flowRole: "content", flowLane: "sidebar",
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

/** Legacy untagged rail — still must never be vacuumed into the main column. */
function legacyUntaggedSidebarFixture() {
  return twoColumnFixture().map((element) => {
    if (!String(element.element_id).startsWith("sb-")) return element;
    const { flowLane: _flowLane, ...rest } = element;
    return { ...rest, flowRole: "content" };
  });
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
    // Regression: sidebar kickers use sidebar-chrome + flowLane and stay out of
    // listDocumentSections. The lane + column checks must still keep their
    // Y-overlapping bodies out of main sections — otherwise
    // packDocumentSections's single shared cursor folds the sidebar into the
    // main flow on every repack.
    const elements = twoColumnFixture();
    const summaryIds = sectionElementIds(elements, "m-summary-head");
    const expIds = sectionElementIds(elements, "m-exp-head");
    for (const sidebarId of ["sb-kontakt-head", "sb-kontakt-rule", "sb-phone", "sb-email"]) {
      assert.equal(summaryIds.has(sidebarId), false, `${sidebarId} must not join PODSUMOWANIE`);
    }
    for (const sidebarId of ["sb-edu-head", "sb-edu-rule", "sb-edu-body"]) {
      assert.equal(expIds.has(sidebarId), false, `${sidebarId} must not join DOŚWIADCZENIE`);
    }
    assert.deepEqual(
      listSidebarSections(elements).map((section) => section.title),
      ["KONTAKT", "WYKSZTAŁCENIE"],
    );
    assert.equal(
      listDocumentSections(elements).some((section) => section.title === "KONTAKT"),
      false,
    );
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

  it("swaps sidebar sections without moving the main column", () => {
    const elements = twoColumnFixture();
    const beforeMain = elements.find((element) => element.element_id === "m-exp-head").top;
    const next = reorderSection(elements, "sb-edu-head", "up", 842, {
      spacing: { stack: 4, record: 10, section: 21, after_rule: 8 },
    });
    assert.ok(next);
    const byId = Object.fromEntries(next.map((element) => [element.element_id, element]));
    assert.ok(
      byId["sb-edu-head"].top < byId["sb-kontakt-head"].top,
      "WYKSZTAŁCENIE must move above KONTAKT in the rail",
    );
    assert.ok(
      byId["sb-edu-body"].top < byId["sb-phone"].top,
      "edu body must travel with its kicker",
    );
    assert.equal(
      byId["m-exp-head"].top,
      beforeMain,
      "main-column headings must stay put during a sidebar reorder",
    );
    assert.deepEqual(
      listSidebarSections(next).map((section) => section.title),
      ["WYKSZTAŁCENIE", "KONTAKT"],
    );
  });

  it("moves rail body with kickers even when flowLane was stripped (saved docs)", () => {
    // Older create/update packs dropped flowLane from extra_properties. After
    // reload, only sidebar-chrome kickers stay lane-tagged — membership must
    // still recover rail textareas / skill chips by column so reorder does not
    // leave body copy stranded while titles pile up.
    const elements = twoColumnFixture().map((element) => {
      if (!String(element.element_id).startsWith("sb-")) return element;
      if (element.flowRole === "sidebar-chrome") return element;
      const { flowLane: _flowLane, ...rest } = element;
      return rest;
    });
    assert.equal(
      elements.find((element) => element.element_id === "sb-edu-body").flowLane,
      undefined,
    );
    const next = reorderSection(elements, "sb-edu-head", "up", 842, {
      spacing: { stack: 4, record: 10, section: 21, after_rule: 8 },
    });
    assert.ok(next);
    const byId = Object.fromEntries(next.map((element) => [element.element_id, element]));
    assert.ok(
      byId["sb-edu-head"].top < byId["sb-kontakt-head"].top,
      "edu kicker moves above kontakt",
    );
    assert.ok(
      byId["sb-edu-body"].top < byId["sb-phone"].top,
      "orphaned edu body must still travel with its kicker",
    );
    assert.ok(
      byId["sb-edu-body"].top > byId["sb-edu-head"].top,
      "edu body stays under its own heading after reorder",
    );
    // Main column must not be vacuumed into the rail pack.
    assert.equal(byId["m-exp-body"].top, elements.find((el) => el.element_id === "m-exp-body").top);
  });

  it("moves sidebar skill chips that lack flowLane with their kicker", () => {
    const group = "record-skills-rail";
    const elements = [
      {
        element_id: "edu-h", category: "text", content: "WYKSZTAŁCENIE",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 51, top: 200, fontSize: 7.6, page: 1,
      },
      {
        element_id: "edu-body", category: "textarea", content: "LL.B.",
        flowRole: "content", flowLane: "sidebar",
        left: 25, top: 220, width: 128, height: 40, autoHeight: true, page: 1,
      },
      {
        element_id: "sk-h", category: "text", content: "UMIEJĘTNOŚCI",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 51, top: 280, fontSize: 7.6, page: 1,
      },
      {
        element_id: "chip-r", category: "rectangle", flowRole: "grid-member",
        flowGroup: group, left: 25, top: 300, width: 90, height: 18,
        filled: true, borderRadius: 9, page: 1,
      },
      {
        element_id: "chip-t", category: "text", flowRole: "grid-member",
        flowGroup: group, content: "SQL", left: 35, top: 305, fontSize: 8, page: 1,
      },
    ];
    const next = reorderSection(elements, "sk-h", "up", 842, {
      spacing: { stack: 4, record: 10, section: 21, after_rule: 8 },
    });
    assert.ok(next);
    const byId = Object.fromEntries(next.map((element) => [element.element_id, element]));
    assert.ok(byId["sk-h"].top < byId["edu-h"].top, "skills kicker moves up");
    assert.ok(byId["chip-r"].top < byId["edu-body"].top, "chip rect travels with skills");
    assert.ok(byId["chip-t"].top < byId["edu-body"].top, "chip label travels with skills");
    assert.ok(
      Math.abs(byId["chip-t"].top - byId["chip-r"].top) < 12,
      "chip label stays inside its pill after pack",
    );
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

  it("removes a sidebar section without touching the main column", () => {
    const elements = twoColumnFixture();
    const beforeExp = elements.find((element) => element.element_id === "m-exp-head").top;
    const result = removeSection(elements, "sb-kontakt-head", 842, {
      spacing: { stack: 4, record: 10, section: 21, after_rule: 8 },
    });
    assert.ok(result);
    const ids = new Set(result.elements.map((element) => element.element_id));
    assert.equal(ids.has("sb-kontakt-head"), false);
    assert.equal(ids.has("sb-phone"), false);
    assert.ok(ids.has("sb-edu-head"));
    assert.ok(ids.has("m-summary-head"));
    assert.ok(result.removedIds.has("sb-kontakt-head"));
    assert.ok(result.removedIds.has("sb-email"));
    const afterExp = result.elements.find((element) => element.element_id === "m-exp-head");
    assert.equal(afterExp.top, beforeExp, "main column must not shift when a rail section is removed");
    assert.deepEqual(
      listSidebarSections(result.elements).map((section) => section.title),
      ["WYKSZTAŁCENIE"],
    );
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

  it("does not let a record-overlay date/location rail inflate a record's packed height", () => {
    // Regression: Meridian (and any future single-column template with a
    // right-hand date/location rail) pins `period`/`city` beside the
    // title/company lines via `flowRole: "record-overlay"` + `autoHeight:
    // false`, sharing the record's `flowGroup`. Before the fix, the packer's
    // sequential stacker treated these overlay lines as ordinary extra rows
    // ("previous.relTop + elementHeight(previous) + gap"), inflating every
    // later line's position — which showed up in the live app as scrambled,
    // interleaved records after a density-preset change or reorder.
    const record = (id, top, bulletsHeight) => ([
      {
        element_id: `${id}-title`, category: "textarea", flowRole: "content",
        autoHeight: true, flowGroup: id, content: "Title", bold: true,
        page: 1, top, left: 62, width: 300, height: 13,
      },
      {
        element_id: `${id}-period`, category: "textarea", flowRole: "record-overlay",
        autoHeight: false, flowGroup: id, content: "2021 – 2022", align: "right",
        page: 1, top, left: 374, width: 130, height: 11,
      },
      {
        element_id: `${id}-company`, category: "textarea", flowRole: "content",
        autoHeight: true, flowGroup: id, content: "Company",
        page: 1, top: top + 17, left: 62, width: 300, height: 11,
      },
      {
        element_id: `${id}-city`, category: "textarea", flowRole: "record-overlay",
        autoHeight: false, flowGroup: id, content: "Warszawa", align: "right",
        page: 1, top: top + 17, left: 374, width: 130, height: 11,
      },
      {
        element_id: `${id}-bullets`, category: "textarea", flowRole: "content",
        autoHeight: true, flowGroup: id, content: "• one\n• two",
        page: 1, top: top + 32, left: 62, width: 471, height: bulletsHeight,
      },
    ]);
    const elements = [
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "DOŚWIADCZENIE", page: 1, top: 100, left: 62, height: 14 },
      ...record("recA", 122, 24),
      ...record("recB", 200, 24),
    ];

    const packed = applyFlowSpacing(elements, {
      stack: 4, record: 10, section: 21, after_rule: 8,
    }, 842);
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));
    const abs = (element) => (element.page - 1) * 842 + element.top;
    const bottom = (element) => abs(element) + (element.height || 0);

    // recB's title must sit immediately after recA's true bottom (bullets) +
    // one record gap — not after some inflated height counting the overlay
    // lines as extra stacked rows.
    const expectedRecBTitleAbs = bottom(byId["recA-bullets"]) + 10;
    assert.equal(abs(byId["recB-title"]), expectedRecBTitleAbs);

    // Every overlay stays pinned exactly beside its real anchor line, in
    // both records, after repacking.
    assert.equal(byId["recA-period"].top, byId["recA-title"].top);
    assert.equal(byId["recA-city"].top, byId["recA-company"].top);
    assert.equal(byId["recB-period"].top, byId["recB-title"].top);
    assert.equal(byId["recB-city"].top, byId["recB-company"].top);

    // Nothing from recA lands after recB's title, and nothing from recB
    // lands before recA's bullets — i.e. no interleaving.
    for (const id of ["recA-title", "recA-period", "recA-company", "recA-city", "recA-bullets"]) {
      assert.ok(abs(byId[id]) < abs(byId["recB-title"]), `${id} must stay before recB`);
    }
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
      const ordinal = packed.find((element) => element.element_id === `num${n}`);
      assert.ok(title && frame && square && rule && ordinal, `section ${n} chrome present`);
      assert.equal(
        +(title.top - frame.top).toFixed(2),
        8,
        `section ${n}: title must stay 8px below frame top (inside the frame)`,
      );
      assert.equal(+(title.top - square.top).toFixed(2), 8, `section ${n}: title vs badge`);
      assert.equal(+(ordinal.top - square.top).toFixed(2), 8, `section ${n}: ordinal vs badge`);
      assert.equal(ordinal.top, title.top, `section ${n}: ordinal shares title baseline`);
      assert.equal(+(rule.top - square.top).toFixed(2), 15, `section ${n}: authored rule offset`);
    }
  });

  it("heals a Monument ordinal that drifted below the title inside the badge", () => {
    // Regression: legacy badgeNumber.relTop=8 (square inset) + markers at −8
    // normalised digits to square+16 while the title stayed at square+8.
    const elements = [
      ...monumentSection(1, "PODSUMOWANIE", 168),
      ...monumentSection(2, "DOŚWIADCZENIE", 250),
      ...monumentSection(3, "WYKSZTAŁCENIE", 360),
      ...monumentSection(4, "PROJEKTY", 470),
    ];
    const corrupted = elements.map((element) => (
      element.element_id === "num4"
        ? { ...element, top: element.top + 8 }
        : element
    ));
    assert.equal(
      corrupted.find((element) => element.element_id === "num4").top
        - corrupted.find((element) => element.element_id === "sq4").top,
      16,
    );

    const healed = healDecorativeOrdinalBaselines(corrupted);
    assert.equal(
      healed.find((element) => element.element_id === "num4").top,
      healed.find((element) => element.element_id === "h4").top,
    );
    assert.equal(
      healed.find((element) => element.element_id === "num4").top
        - healed.find((element) => element.element_id === "sq4").top,
      8,
    );

    const packed = applyFlowSpacing(corrupted, {
      stack: 4, record: 10, section: 21, after_rule: 8,
    }, 842);
    const title = packed.find((element) => element.element_id === "h4");
    const ordinal = packed.find((element) => element.element_id === "num4");
    const square = packed.find((element) => element.element_id === "sq4");
    assert.equal(ordinal.top, title.top);
    assert.equal(+(ordinal.top - square.top).toFixed(2), 8);
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

  it("preserves an iconic masthead's authored 36px clearance on pack", () => {
    // The Python generators author ~36px under the divider for iconic templates
    // (SPACE_AFTER_HEADER_RULE). An earlier heal-back collapsed that to ~10px on
    // every pack, so a single reorder yanked the whole document up ~26px. Packing
    // must now KEEP the authored 36px clearance (masthead rule bottom 161 → 197).
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
        top: 197, // 161 + 36 — the generator's authored clearance
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
    assert.equal(
      heading.top,
      197,
      `iconic first section must keep its authored 36px clearance, got top=${heading.top}`,
    );
  });

  it("preserves Regent's tight iconic masthead→section gap instead of forcing 36px", () => {
    // Regent authors ~8px under the divider; an older MIN gap of 20px treated
    // that as corruption and shoved every section down by ~28px.
    for (const [name, template] of [["regent", regentTemplate]]) {
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

  it("keeps authored masthead clearance when packing after a corrupted heading gap", () => {
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

  it("keeps a legacy untagged sidebar rail out of the main flow when repacking rhythm", () => {
    // Regression: before the column fix, untagged sidebar elements got vacuumed
    // into whichever main section shared their Y band, then linearly restacked
    // into the main flow (reported live on Tessera). Untagged rails still must
    // not scramble; tagged rails are covered by the lane-spacing test below.
    const elements = legacyUntaggedSidebarFixture();
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
    assert.notEqual(byId["m-exp-head"].top, before.get("m-exp-head").top);
  });

  it("retargets a tagged sidebar lane to the same rhythm without folding it into the main column", () => {
    const elements = twoColumnFixture();
    const before = new Map(elements.map((element) => [element.element_id, { left: element.left, top: element.top }]));
    const packed = applyFlowSpacing(elements, {
      stack: 4, record: 10, section: 40, after_rule: 8,
    }, 842);
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));

    // Left edge of the rail never moves into the main column.
    for (const sidebarId of [
      "sb-kontakt-head", "sb-kontakt-rule", "sb-phone", "sb-email",
      "sb-edu-head", "sb-edu-rule", "sb-edu-body",
    ]) {
      assert.equal(byId[sidebarId].left, before.get(sidebarId).left, `${sidebarId} left stays in the rail`);
    }

    // First kicker stays anchored at its authored top; later kicker moves with
    // the section gap (authored gap was ~133px; target section=40 is tighter).
    assert.equal(byId["sb-kontakt-head"].top, before.get("sb-kontakt-head").top);
    assert.ok(
      byId["sb-edu-head"].top < before.get("sb-edu-head").top,
      "sidebar section gap should tighten under a smaller section rhythm",
    );

    // after_rule between edu rule and body.
    const eduRuleBottom = byId["sb-edu-rule"].top + (byId["sb-edu-rule"].height || 1);
    assert.ok(
      Math.abs(byId["sb-edu-body"].top - eduRuleBottom - 8) <= 1.5,
      `sidebar after_rule should be ~8, got ${byId["sb-edu-body"].top - eduRuleBottom}`,
    );

    // Main column still packs independently.
    assert.notEqual(byId["m-exp-head"].top, before.get("m-exp-head").top);
    assert.ok(byId["m-exp-head"].left >= 218);

    // Membership stays lane-scoped.
    const kontaktIds = sidebarSectionElementIds(packed, "sb-kontakt-head");
    assert.equal(kontaktIds.has("m-summary-body"), false);
    assert.equal(kontaktIds.has("sb-phone"), true);
  });

  it("packSidebarLane is a no-op when the document has no sidebar-chrome kickers", () => {
    const elements = [
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "A", left: 66, top: 100 },
      { element_id: "b1", category: "textarea", flowRole: "content", left: 66, top: 120, height: 20, autoHeight: true },
    ];
    const packed = packSidebarLane(elements, 842, { spacing: { section: 40 } });
    assert.equal(packed[0].top, 100);
    assert.equal(listSidebarSections(packed).length, 0);
  });

  it("closes the sidebar hole up to the main-column content top after a top rail section leaves", () => {
    // Sterling live bug: Summary moved to main, Education stayed at the old
    // mid-rail Y instead of packing up under the letterhead band.
    const elements = [
      { element_id: "m-exp-head", category: "text", content: "DOŚWIADCZENIE",
        flowRole: "section-chrome", left: 245, top: 188, fontSize: 14, height: 16, page: 1 },
      { element_id: "m-exp-rule", category: "line", flowRole: "section-chrome",
        left: 245, top: 208, width: 300, height: 1, page: 1 },
      { element_id: "m-exp-body", category: "textarea", flowRole: "content",
        left: 245, top: 220, width: 300, height: 80, fontSize: 9, page: 1 },

      { element_id: "sb-edu-head", category: "text", content: "WYKSZTAŁCENIE",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 360, fontSize: 9.4, height: 12, page: 1 },
      { element_id: "sb-edu-rule", category: "line",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 376, width: 22, height: 1.4, page: 1 },
      { element_id: "sb-edu-body", category: "textarea", content: "LL.B.",
        flowRole: "content", flowLane: "sidebar",
        left: 34, top: 390, width: 152, height: 40, fontSize: 8.3, page: 1 },
      { element_id: "sb-sk-head", category: "text", content: "UMIEJĘTNOŚCI",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 460, fontSize: 9.4, height: 12, page: 1 },
      { element_id: "sb-sk-rule", category: "line",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 476, width: 22, height: 1.4, page: 1 },
      { element_id: "sb-sk-body", category: "textarea", content: "SQL",
        flowRole: "content", flowLane: "sidebar",
        left: 34, top: 490, width: 152, height: 30, fontSize: 8.3, page: 1 },
    ];
    const packed = packSidebarLane(elements, 842, {
      spacing: { stack: 4, record: 10, section: 21, after_rule: 8 },
    });
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));
    assert.ok(
      Math.abs(byId["sb-edu-head"].top - 188) <= 2,
      `education should rise to main content top, got ${byId["sb-edu-head"].top}`,
    );
    assert.ok(
      byId["sb-sk-head"].top > byId["sb-edu-head"].top,
      "skills stays below education after the hole closes",
    );
    assert.equal(byId["m-exp-head"].top, 188, "main column must stay untouched");
  });

  it("does not let the promoted first sidebar section crowd a fixed-to-page photo well (Slate)", () => {
    // Slate live bug: main content starts at y=119 (short masthead), but the
    // sidebar rail sits under a much taller photo well ending at y=166. When
    // the section that used to sit right under the photo is transferred to
    // main, the next section becomes the new first rail item — still at its
    // old (far-down) stored top. Closing that hole must clamp to the photo's
    // own bottom edge, not the main column's shorter masthead.
    //
    // The fixtures below deliberately include the two full-height fixedToPage
    // panels every sidebar template paints (page paper + sidebar band). The
    // floor must IGNORE those (they span to y=842) and key only off the real
    // photo-slot elements, or the whole rail is shoved off page 1.
    const elements = [
      { element_id: "bg-paper", category: "line", fixedToPage: true,
        left: 0, top: 0, width: 595, height: 842, page: 1 },
      { element_id: "bg-sidebar", category: "line", fixedToPage: true,
        left: 0, top: 0, width: 178, height: 842, page: 1 },
      { element_id: "sb-photo-frame", category: "rectangle", fixedToPage: true,
        photoSlot: "frame", left: 33, top: 40, width: 112, height: 126, page: 1 },
      { element_id: "sb-photo-glyph", category: "image", fixedToPage: true,
        photoSlot: "glyph", left: 73, top: 80, width: 32, height: 46, page: 1 },

      { element_id: "m-exp-head", category: "text", content: "DOŚWIADCZENIE",
        flowRole: "section-chrome", left: 245, top: 119, fontSize: 14, height: 16, page: 1 },
      { element_id: "m-exp-rule", category: "line", flowRole: "section-chrome",
        left: 245, top: 139, width: 300, height: 1, page: 1 },
      { element_id: "m-exp-body", category: "textarea", flowRole: "content",
        left: 245, top: 151, width: 300, height: 80, fontSize: 9, page: 1 },

      // Old stored position: this was the SECOND sidebar section before the
      // first ("WYKSZTAŁCENIE") transferred out to main, so its top is still
      // far below the photo.
      { element_id: "sb-sk-head", category: "text", content: "UMIEJĘTNOŚCI",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 460, fontSize: 9.4, height: 12, page: 1 },
      { element_id: "sb-sk-rule", category: "line",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 476, width: 22, height: 1.4, page: 1 },
      { element_id: "sb-sk-body", category: "textarea", content: "SQL",
        flowRole: "content", flowLane: "sidebar",
        left: 34, top: 490, width: 152, height: 30, fontSize: 8.3, page: 1 },
    ];
    const packed = packSidebarLane(elements, 842, {
      spacing: { stack: 4, record: 10, section: 21, after_rule: 8 },
    });
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));
    const photoBottom = 40 + 126; // frame bottom = 166
    assert.ok(
      byId["sb-sk-head"].top >= photoBottom,
      `promoted section must clear the photo (bottom ${photoBottom}), got ${byId["sb-sk-head"].top}`,
    );
    assert.equal(
      byId["sb-sk-head"].top, photoBottom + 28,
      "clamps to the photo bottom plus the authored photo→section gap (matches slate.py sidebar_sections_start), not the main column's shorter masthead nor the tighter inter-section rhythm",
    );
    assert.equal(byId["m-exp-head"].top, 119, "main column must stay untouched");
  });

  it("keeps the hidden-photo contact boundary after sidebar packing and reorder (Slate/Tessera)", () => {
    const contactBand = "contact-main";
    const elements = [
      { element_id: "hidden-photo", category: "rectangle", fixedToPage: true,
        photoSlot: "frame", photoSlotHidden: true,
        left: 33, top: 40, width: 112, height: 126, page: 1 },
      { element_id: "contact-anchor", category: "line", flowRole: "masthead-anchor",
        contactBandId: contactBand, page: 1, top: 0, left: 0, width: 0, height: 0,
        profilePhotoMainContactBand: { mode: "wrapping" },
        contactBand: { mode: "stacked", anchor: { startX: 33, startY: 42, rightLimit: 174 } } },
      ...[42, 58, 74, 90, 106, 122].flatMap((top, index) => ([
        { element_id: `contact-icon-${index}`, category: "image",
          contactBandId: contactBand, contactChannel: `channel-${index}`,
          left: 33, top, width: 8, height: 8, page: 1 },
        { element_id: `contact-label-${index}`, category: "text", content: `Contact ${index}`,
          contactBandId: contactBand, contactChannel: `channel-${index}`,
          left: 45, top, fontSize: 8, page: 1 },
      ])),
      { element_id: "m-exp-head", category: "text", content: "DOŚWIADCZENIE",
        flowRole: "section-chrome", left: 245, top: 119, fontSize: 14, height: 16, page: 1 },
      { element_id: "m-exp-body", category: "textarea", flowRole: "content",
        left: 245, top: 143, width: 300, height: 80, fontSize: 9, page: 1 },
      { element_id: "sb-sk-head", category: "text", content: "UMIEJĘTNOŚCI",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 170, fontSize: 9.4, height: 12, page: 1 },
      { element_id: "sb-sk-rule", category: "line",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 186, width: 22, height: 1.4, page: 1 },
      { element_id: "sb-sk-body", category: "textarea", content: "SQL",
        flowRole: "content", flowLane: "sidebar",
        left: 34, top: 200, width: 152, height: 30, fontSize: 8.3, page: 1 },
      { element_id: "sb-lang-head", category: "text", content: "JĘZYKI",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 260, fontSize: 9.4, height: 12, page: 1 },
      { element_id: "sb-lang-rule", category: "line",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 276, width: 22, height: 1.4, page: 1 },
      { element_id: "sb-lang-body", category: "textarea", content: "Polski",
        flowRole: "content", flowLane: "sidebar",
        left: 34, top: 290, width: 152, height: 30, fontSize: 8.3, page: 1 },
    ];
    const rhythm = { stack: 4, record: 10, section: 21, after_rule: 8 };
    const expectedFloor = 122 + 8 + 40;

    const packed = applyFlowSpacing(elements, rhythm, 842);
    const packedById = Object.fromEntries(packed.map((element) => [element.element_id, element]));
    assert.equal(
      packedById["sb-sk-head"].top,
      expectedFloor,
      "autofit must keep the first section exactly 40 pt below the final contact",
    );

    const reordered = reorderSection(packed, "sb-lang-head", "up", 842, { spacing: rhythm });
    assert.ok(reordered);
    const reorderedById = Object.fromEntries(
      reordered.map((element) => [element.element_id, element]),
    );
    assert.equal(
      reorderedById["sb-lang-head"].top,
      expectedFloor,
      "the promoted section must inherit the same contact boundary",
    );
  });

  it("ignores full-height fixedToPage background panels when there is no photo well", () => {
    // Cinder / any sidebar template without a rail photo: the only fixedToPage
    // elements are the page paper and sidebar band, both spanning to y=842.
    // The photo floor must return nothing so the rail packs to its authored
    // top, not off the page. Regression for the over-broad fixedToPage match.
    const elements = [
      { element_id: "bg-paper", category: "line", fixedToPage: true,
        left: 0, top: 0, width: 595, height: 842, page: 1 },
      { element_id: "bg-sidebar", category: "line", fixedToPage: true,
        left: 300, top: 0, width: 295, height: 842, page: 1 },

      { element_id: "m-exp-head", category: "text", content: "DOŚWIADCZENIE",
        flowRole: "section-chrome", left: 60, top: 200, fontSize: 14, height: 16, page: 1 },
      { element_id: "m-exp-body", category: "textarea", flowRole: "content",
        left: 60, top: 224, width: 210, height: 80, fontSize: 9, page: 1 },

      { element_id: "sb-edu-head", category: "text", content: "WYKSZTAŁCENIE",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 330, top: 200, fontSize: 9.4, height: 12, page: 1 },
      { element_id: "sb-edu-body", category: "textarea", content: "LL.B.",
        flowRole: "content", flowLane: "sidebar",
        left: 330, top: 220, width: 200, height: 40, fontSize: 8.3, page: 1 },
    ];
    const packed = packSidebarLane(elements, 842, {
      spacing: { stack: 4, record: 10, section: 21, after_rule: 8 },
    });
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));
    assert.ok(
      byId["sb-edu-head"].top <= 210,
      `sidebar must stay near its authored top, not be pushed down by a full-page panel, got ${byId["sb-edu-head"].top}`,
    );
    assert.equal(byId["sb-edu-head"].page, 1, "sidebar heading stays on page 1");
  });

  it("ignores a masthead photo slot in the main column, not just the sidebar's own rail photo", () => {
    // Regression: Vestige's masthead photo slot sits in the MAIN column
    // (left=505, far right of the narrow sidebar rail), unlike Slate/Tessera
    // whose photo well is physically inside the rail. `sameColumnAsHeading`
    // is deliberately biased to treat anything at/right of a heading as
    // "same column" (needed for single-column templates), so without an
    // explicit rail-width bound this main-column photo was wrongly read as
    // "the rail's own photo" and could push the sidebar's first section down
    // to clear it.
    const elements = [
      { element_id: "photo-well", category: "rectangle", photoSlot: "ornament",
        left: 505, top: 25, width: 60, height: 74.4, page: 1 },
      { element_id: "photo-frame", category: "rectangle", photoSlot: "frame",
        left: 505, top: 25, width: 60, height: 74.4, page: 1 },
      { element_id: "photo-glyph", category: "image", photoSlot: "glyph",
        left: 520, top: 40, width: 24, height: 24, page: 1 },

      { element_id: "m-exp-head", category: "text", content: "DOŚWIADCZENIE",
        flowRole: "section-chrome", left: 210, top: 174.5, fontSize: 13, height: 16, page: 1 },

      { element_id: "sb-sum-head", category: "text", content: "PODSUMOWANIE",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 27, top: 174.5, fontSize: 8.4, height: 10, page: 1 },
      { element_id: "sb-sum-rule", category: "line",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 27, top: 190, width: 16, height: 1, page: 1 },
      { element_id: "sb-sum-body", category: "textarea", content: "Summary",
        flowRole: "content", flowLane: "sidebar",
        left: 27, top: 202, width: 122, height: 60, fontSize: 8.3, page: 1 },
    ];
    const packed = packSidebarLane(elements, 842, {
      spacing: { stack: 4, record: 10, section: 21, after_rule: 8 },
    });
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));
    assert.equal(
      byId["sb-sum-head"].top, 174.5,
      `sidebar's first section must align with the main column's first section (174.5), not be pushed down to clear a main-column photo, got ${byId["sb-sum-head"].top}`,
    );
  });

  it("moves a sidebar kicker with its body instead of orphaning it in the page-1 footer", () => {
    // Education fills the rail to ~720. Skills chrome would "fit" in the
    // leftover band while the list needs ~120px — pack must bump the whole
    // strip to page 2, matching textareaReflow.avoidOrphanChrome.
    const elements = [
      {
        element_id: "sb-edu-head",
        category: "text",
        content: "WYKSZTAŁCENIE",
        flowRole: "sidebar-chrome",
        flowLane: "sidebar",
        left: 34,
        top: 200,
        height: 12,
        page: 1,
      },
      {
        element_id: "sb-edu-tick",
        category: "line",
        flowRole: "sidebar-chrome",
        flowLane: "sidebar",
        left: 34,
        top: 216,
        width: 22,
        height: 1.4,
        page: 1,
      },
      {
        element_id: "sb-edu-body",
        category: "textarea",
        flowRole: "content",
        flowLane: "sidebar",
        left: 34,
        top: 222,
        width: 152,
        height: 500,
        autoHeight: true,
        page: 1,
      },
      {
        element_id: "sb-skills-head",
        category: "text",
        content: "UMIEJĘTNOŚCI",
        flowRole: "sidebar-chrome",
        flowLane: "sidebar",
        left: 34,
        top: 740,
        height: 12,
        page: 1,
      },
      {
        element_id: "sb-skills-tick",
        category: "line",
        flowRole: "sidebar-chrome",
        flowLane: "sidebar",
        left: 34,
        top: 756,
        width: 22,
        height: 1.4,
        page: 1,
      },
      {
        element_id: "sb-skills-body",
        category: "textarea",
        flowRole: "content",
        flowLane: "sidebar",
        left: 34,
        top: 761,
        width: 152,
        height: 120,
        autoHeight: true,
        page: 1,
      },
    ];
    const packed = packSidebarLane(elements, 842, {
      spacing: { stack: 4, record: 10, section: 21, after_rule: 8 },
      pageTop: 66,
      bottomMargin: 72,
    });
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));

    assert.equal(byId["sb-skills-head"].page, 2);
    assert.equal(byId["sb-skills-tick"].page, 2);
    assert.equal(byId["sb-skills-body"].page, 2);
    assert.ok(byId["sb-skills-body"].top > byId["sb-skills-head"].top);
    assert.equal(byId["sb-edu-head"].page, 1);
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

  it("samples Experience description type, not the bold job-title line", () => {
    // Regression: transfers inherited ~11px title metrics because the first
    // linear body in an Experience strip is the job title, not the bullets.
    const elements = [
      { element_id: "h1", category: "text", flowRole: "section-chrome", content: "DOŚWIADCZENIE",
        left: 245, top: 188, fontSize: 14, fontFamily: "Montserrat", color: "#26313F",
        letterSpacing: 0.8, bold: true, page: 1 },
      { element_id: "r1", category: "line", flowRole: "section-chrome",
        left: 245, top: 208, width: 300, height: 1, backgroundColor: "#C7CFDA", page: 1 },
      { element_id: "title", category: "text", flowRole: "content", flowGroup: "job-0",
        left: 245, top: 220, width: 300, height: 14, fontSize: 11.2, bold: true,
        fontFamily: "Montserrat", color: "#26313F", page: 1 },
      { element_id: "meta", category: "text", flowRole: "content", flowGroup: "job-0",
        left: 245, top: 236, width: 300, height: 12, fontSize: 8.6,
        fontFamily: "Montserrat", color: "#6B7280", page: 1 },
      { element_id: "body", category: "textarea", flowRole: "content", flowGroup: "job-0",
        left: 245, top: 252, width: 300, height: 60, fontSize: 9.5, lineHeight: 13.8,
        fontFamily: "Montserrat", color: "#26313F", content: "Monitoring.", page: 1 },
    ];
    const style = deriveSectionStyle(elements, 842, "h1", { lane: "main" });
    assert.equal(style.body.fontSize, 9.5);
    assert.equal(style.body.lineHeight, 13.8);
    assert.equal(style.heading.fontSize, 14);
    assert.equal(style.heading.color, "#26313F");
    assert.equal(style.recordWidth, 300);
    assert.equal(style.mutedColor, "#6B7280");
  });

  it("does not inherit a languages-grid cell width as the column recordWidth", () => {
    // Regression: transferring Summary after Języki is last in main used the
    // first ~70px CEFR cell as recordWidth and crushed the body into a ribbon.
    const elements = [
      { element_id: "h-exp", category: "text", flowRole: "section-chrome", content: "Doświadczenie",
        left: 245, top: 188, fontSize: 14, fontFamily: "Montserrat", color: "#26313F", page: 1 },
      { element_id: "r-exp", category: "line", flowRole: "section-chrome",
        left: 245, top: 208, width: 300, height: 1, backgroundColor: "#C7CFDA", page: 1 },
      { element_id: "b-exp", category: "textarea", flowRole: "content",
        left: 245, top: 220, width: 300, height: 80, fontSize: 9, lineHeight: 13, page: 1 },
      { element_id: "h-lang", category: "text", flowRole: "section-chrome", content: "JĘZYKI",
        left: 245, top: 600, fontSize: 14, fontFamily: "Montserrat", color: "#26313F", page: 1 },
      { element_id: "r-lang", category: "line", flowRole: "section-chrome",
        left: 245, top: 620, width: 300, height: 1, backgroundColor: "#4A6FA5", page: 1 },
      { element_id: "c1", category: "textarea", flowRole: "grid-member", flowGroup: "lang",
        content: "Polski — A2", left: 245, top: 634, width: 67, height: 14, fontSize: 9, page: 1 },
      { element_id: "c2", category: "textarea", flowRole: "grid-member", flowGroup: "lang",
        content: "Niemiecki — C1", left: 320, top: 634, width: 67, height: 14, fontSize: 9, page: 1 },
    ];
    const style = deriveSectionStyle(elements);
    assert.equal(style.recordWidth, 300, "must use the section rule / column width, not a grid cell");
    assert.equal(style.bodyLeft, 245);
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

  it("captures every decorative shape, not just one (circle + accent line)", () => {
    // A section() helper may push TWO decorative shapes per heading: a filled
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
    // Offset from the heading baseline (both at top 508), not the square inset.
    assert.equal(style.badgeNumber.relTop, 0);
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

  it("appends a sidebar-chrome strip into the rail when lane is sidebar", () => {
    const rhythm = { stack: 4, record: 10, section: 21, after_rule: 8 };
    const doc = twoColumnFixture();
    const addition = [
      {
        element_id: "sb-new-head", category: "text", content: "JĘZYKI",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 51, top: 0, fontSize: 7.6, height: 12, page: 1,
      },
      {
        element_id: "sb-new-rule", category: "line",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 51, top: 12, width: 50, height: 1, page: 1,
      },
      {
        element_id: "sb-new-body", category: "textarea", content: "Polski",
        flowRole: "content", flowLane: "sidebar",
        autoHeight: true, left: 25, top: 30, width: 128, height: 20, fontSize: 6.6, page: 1,
      },
    ];
    const result = appendSectionAtEnd(doc, addition, pageHeight, {
      spacing: rhythm,
      lane: "sidebar",
    });
    const byId = Object.fromEntries(result.map((element) => [element.element_id, element]));
    assert.ok(byId["sb-new-head"]);
    assert.equal(byId["sb-new-head"].flowRole, "sidebar-chrome");
    assert.equal(byId["sb-new-head"].flowLane, "sidebar");
    assert.ok(
      byId["sb-new-head"].top > byId["sb-edu-head"].top,
      "new rail section should land below WYKSZTAŁCENIE",
    );
    // applyFlowSpacing may retarget main Y, but order and column must remain.
    assert.deepEqual(
      listDocumentSections(result).map((section) => section.title),
      ["PODSUMOWANIE ZAWODOWE", "DOŚWIADCZENIE ZAWODOWE"],
    );
    assert.ok(byId["m-exp-head"].left >= 218, "main heading stays in the main column");
    assert.deepEqual(
      listSidebarSections(result).map((section) => section.title),
      ["KONTAKT", "WYKSZTAŁCENIE", "JĘZYKI"],
    );
  });
});

describe("listFlatSectionAnchors", () => {
  // A chip-rendered UMIEJĘTNOŚCI (`grid-member`) is not a single flat textarea,
  // so chips sections must NOT get the list/layout toggle. A synthetic mid-dot
  // skills textarea still must. The base fixture is a real single-column icon
  // starter; the chips variant is produced with the skills display-mode util.
  const source = porticoTemplate.map((element, index) => ({
    ...element,
    element_id: `p-${index}`,
    page: 1,
  }));

  function withFlatSkillsTextarea(elements) {
    // Replace the skills members under UMIEJĘTNOŚCI with one mid-dot textarea so
    // the flat-anchor contract stays covered regardless of the starter's shape.
    const sections = listDocumentSections(elements, 842);
    const skills = sections.find((section) => section.title === "UMIEJĘTNOŚCI");
    assert.ok(skills, "expected UMIEJĘTNOŚCI in the starter");
    const memberIds = sectionElementIds(elements, skills.headingId, 842);
    const withoutChips = elements.filter((element) => (
      !memberIds.has(element.element_id)
      || element.element_id === skills.headingId
      || element.flowRole === "section-chrome"
    ));
    const heading = elements.find((element) => element.element_id === skills.headingId);
    return [
      ...withoutChips,
      {
        element_id: "flat-skills-body",
        category: "textarea",
        flowRole: "content",
        content: "Strategia  ·  Leadership  ·  P&L  ·  Negocjacje",
        left: Number(heading?.left) || 72,
        top: (Number(heading?.top) || 200) + 24,
        width: 400,
        height: 40,
        fontSize: 9.6,
        autoHeight: true,
        page: 1,
      },
    ];
  }

  it("includes a mid-dot Skills textarea (and Languages when still flat)", () => {
    const flatSource = withFlatSkillsTextarea(source);
    const anchors = listFlatSectionAnchors(flatSource, 842);
    const sections = listDocumentSections(flatSource, 842);
    const anchoredHeadings = new Set(anchors.map((anchor) => anchor.headingId));
    const skills = sections.find((section) => section.title === "UMIEJĘTNOŚCI");
    assert.ok(skills, "expected a UMIEJĘTNOŚCI section");
    assert.ok(anchoredHeadings.has(skills.headingId), "flat Skills textarea should be an anchor");
    const languages = sections.find((section) => section.title === "JĘZYKI");
    if (languages) {
      // Languages may be a CEFR grid or still a flat textarea depending on starter.
      const langAnchor = anchors.find((anchor) => anchor.headingId === languages.headingId);
      if (langAnchor) {
        const body = flatSource.find((el) => el.element_id === langAnchor.contentElementId);
        assert.equal(body?.category, "textarea");
      }
    }
  });

  it("excludes chip-rendered Skills from flat anchors", () => {
    const flatSkills = listDocumentSections(source, 842)
      .find((section) => section.title === "UMIEJĘTNOŚCI");
    assert.ok(flatSkills, "expected a UMIEJĘTNOŚCI section in the fixture");
    // Convert the flat skills body into chip pills (`grid-member`) via the same
    // display-mode util the canvas editor uses.
    const chipSource = changeSkillsDisplayMode(
      source,
      flatSkills.headingId,
      "chips",
      842,
      undefined,
      "portico",
    );
    const anchors = listFlatSectionAnchors(chipSource, 842);
    const sections = listDocumentSections(chipSource, 842);
    const skills = sections.find((section) => section.title === "UMIEJĘTNOŚCI");
    assert.ok(skills, "expected a UMIEJĘTNOŚCI section in the chip fixture");
    assert.ok(
      !anchors.some((anchor) => anchor.headingId === skills.headingId),
      "grid-member skill chips must not get the flat-list layout toggle",
    );
  });

  it("excludes the Summary paragraph even though it is also one textarea", () => {
    const anchors = listFlatSectionAnchors(source, 842);
    const sections = listDocumentSections(source, 842);
    const summary = sections.find((section) => section.title === "PODSUMOWANIE ZAWODOWE");
    assert.ok(summary, "expected a PODSUMOWANIE ZAWODOWE section in the fixture");
    assert.ok(
      !anchors.some((anchor) => anchor.headingId === summary.headingId),
      "a single-paragraph section must not get the layout toggle",
    );
  });

  it("excludes record-style sections with multiple body blocks per entry", () => {
    const anchors = listFlatSectionAnchors(source, 842);
    const sections = listDocumentSections(source, 842);
    const experience = sections.find((section) => section.title === "DOŚWIADCZENIE ZAWODOWE");
    assert.ok(experience, "expected a DOŚWIADCZENIE ZAWODOWE section in the fixture");
    assert.ok(
      !anchors.some((anchor) => anchor.headingId === experience.headingId),
      "a multi-record section must not get the layout toggle",
    );
  });

  it("points each flat Skills anchor at the section's own body textarea", () => {
    const flatSource = withFlatSkillsTextarea(source);
    const anchors = listFlatSectionAnchors(flatSource, 842);
    const sections = listDocumentSections(flatSource, 842);
    const skills = sections.find((section) => section.title === "UMIEJĘTNOŚCI");
    const anchor = anchors.find((entry) => entry.headingId === skills.headingId);
    assert.ok(anchor, "expected a flat Skills anchor");
    const contentElement = flatSource.find((element) => element.element_id === anchor.contentElementId);
    assert.equal(contentElement.category, "textarea");
    assert.ok(
      String(contentElement.content || "").includes("Strategia"),
      "anchor should resolve to the Skills body textarea, not an unrelated element",
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

  it("inserts a sidebar strip after a rail kicker without moving the main column", () => {
    const doc = twoColumnFixture();
    const addition = [
      {
        element_id: "sb-mid-head", category: "text", content: "NARZĘDZIA",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 51, top: 0, fontSize: 7.6, height: 12, page: 1,
      },
      {
        element_id: "sb-mid-body", category: "textarea", content: "Excel",
        flowRole: "content", flowLane: "sidebar",
        autoHeight: true, left: 25, top: 20, width: 128, height: 20, fontSize: 6.6, page: 1,
      },
    ];
    const result = insertSectionAfter(doc, addition, "sb-kontakt-head", pageHeight, {
      spacing: rhythm,
    });
    const titles = listSidebarSections(result).map((section) => section.title);
    assert.deepEqual(titles, ["KONTAKT", "NARZĘDZIA", "WYKSZTAŁCENIE"]);
    const byId = Object.fromEntries(result.map((element) => [element.element_id, element]));
    assert.ok(byId["sb-mid-head"].top > byId["sb-kontakt-head"].top);
    assert.ok(byId["sb-edu-head"].top > byId["sb-mid-head"].top);
    assert.deepEqual(
      listDocumentSections(result).map((section) => section.title),
      ["PODSUMOWANIE ZAWODOWE", "DOŚWIADCZENIE ZAWODOWE"],
    );
    assert.ok(byId["m-exp-head"].left >= 218);
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

describe("applyFlowSpacing — skill chip grid (flowRole: grid-member)", () => {
  /**
   * A skills section shaped exactly like the backend's `_place_skill_chips_row`
   * output: one heading, then two wrapped rows of `rectangle` + `text` pairs
   * sharing one `flowGroup`, each pair tagged `flowRole: "grid-member"`. One
   * chip ("SQL") is intentionally narrower than 40px — the decorative-badge
   * size heuristic in `isChromeLike` used to misclassify it as chrome.
   */
  function chipSectionFixture() {
    const group = "record-skills-test";
    const row1 = ["Analiza AML/KYC", "Transaction Monitoring", "CDD / EDD"];
    const row2 = ["Screening PEP", "SQL"];
    const elements = [
      { element_id: "above-head", category: "text", content: "PODSUMOWANIE", flowRole: "section-chrome", left: 72, top: 100, fontSize: 11, height: 13, page: 1 },
      { element_id: "above-rule", category: "line", flowRole: "section-chrome", left: 72, top: 116, width: 473, height: 1, page: 1 },
      { element_id: "above-body", category: "textarea", flowRole: "content", autoHeight: true, content: "Short summary.", left: 72, top: 130, width: 473, height: 30, fontSize: 9.6, page: 1 },
      { element_id: "skills-head", category: "text", content: "UMIEJĘTNOŚCI", flowRole: "section-chrome", left: 72, top: 200, fontSize: 11, height: 13, page: 1 },
      { element_id: "skills-rule", category: "line", flowRole: "section-chrome", left: 72, top: 216, width: 473, height: 1, page: 1 },
    ];
    let x = 72;
    const rowTop = [230, 253.6];
    [row1, row2].forEach((row, rowIndex) => {
      x = 72;
      row.forEach((label, colIndex) => {
        const width = 40 + label.length * 4; // last chip ("SQL") stays <40px wide
        const chipWidth = label === "SQL" ? 30 : width;
        const top = rowTop[rowIndex];
        elements.push({
          element_id: `chip-rect-${rowIndex}-${colIndex}`,
          category: "rectangle", flowRole: "grid-member", flowGroup: group,
          left: x, top, width: chipWidth, height: 19.6,
          filled: true, borderRadius: 9.8, backgroundColor: "#9E2532", page: 1,
        });
        elements.push({
          element_id: `chip-text-${rowIndex}-${colIndex}`,
          category: "text", flowRole: "grid-member", flowGroup: group,
          content: label, left: x + 10, top: top + 9.8, fontSize: 9.6, height: 12, page: 1,
        });
        x += chipWidth + 8;
      });
    });
    return elements;
  }

  it("keeps every chip row aligned and each label inside its own pill after a full repack", () => {
    const elements = chipSectionFixture();
    const packed = applyFlowSpacing(elements, {
      section: 21, record: 10, stack: 4, after_rule: 8,
    }, 842, { pageTop: 66, bottomMargin: 72 });
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));

    // Row 1: three chips must still share one top.
    const row1Tops = ["chip-rect-0-0", "chip-rect-0-1", "chip-rect-0-2"].map((id) => byId[id].top);
    assert.equal(row1Tops[1], row1Tops[0]);
    assert.equal(row1Tops[2], row1Tops[0]);

    // Row 2 (includes the narrow "SQL" pill) must also stay one row.
    const row2Tops = ["chip-rect-1-0", "chip-rect-1-1"].map((id) => byId[id].top);
    assert.equal(row2Tops[1], row2Tops[0]);

    // Row 2 must sit strictly below row 1 (rows did not collapse onto each other).
    assert.ok(row2Tops[0] > row1Tops[0]);

    // `left` (never touched by the packer) still identifies each chip's column.
    assert.equal(byId["chip-rect-0-0"].left, 72);

    // Every label stays on its own pill's optical midline (not stacked below it).
    for (const id of Object.keys(byId)) {
      if (!id.startsWith("chip-rect-")) continue;
      const rect = byId[id];
      const text = byId[id.replace("chip-rect-", "chip-text-")];
      assert.ok(
        Math.abs(text.top - (rect.top + rect.height / 2)) < 0.51,
        `expected ${id}'s label on the pill midline (rect.top=${rect.top}, text.top=${text.top})`,
      );
    }
  });

  it("heals labels saved at the legacy CHIP_PAD_Y inset onto the pill midline", () => {
    const elements = chipSectionFixture().map((element) => (
      element.element_id?.startsWith("chip-text-")
        ? { ...element, top: element.top - 4.8 }
        : element
    ));
    const healed = healSkillChipLabelBaselines(elements);
    for (const element of healed) {
      if (!element.element_id?.startsWith("chip-text-")) continue;
      const rect = healed.find((other) => (
        other.element_id === element.element_id.replace("chip-text-", "chip-rect-")
      ));
      assert.equal(element.top, rect.top + rect.height / 2);
    }
    // Language-grid textareas in the same document must not move.
    const languages = [
      { element_id: "lang", category: "textarea", flowRole: "grid-member",
        flowGroup: "record-lang", left: 72, top: 400, width: 110, height: 14, page: 1 },
    ];
    assert.equal(healSkillChipLabelBaselines(languages), languages);
  });

  it("does not misclassify a narrow (<40px) chip as decorative chrome", () => {
    const elements = chipSectionFixture();
    const packed = applyFlowSpacing(elements, {
      section: 21, record: 10, stack: 4, after_rule: 8,
    }, 842, { pageTop: 66, bottomMargin: 72 });
    const byId = Object.fromEntries(packed.map((element) => [element.element_id, element]));
    // The narrow "SQL" pill (row 2, col 1) must land in row 2 with its row-mate,
    // not get pulled into a separate chrome cluster near the section heading.
    assert.equal(byId["chip-rect-1-1"].top, byId["chip-rect-1-0"].top);
  });

  it("keeps a chip grid intact across a section reorder even without flowGroup", () => {
    // Regression: a chip grid whose pills never got a shared `flowGroup`
    // (stale save, or an origin other than the Python generator's
    // `keep_together`) used to fall through to per-item linear stacking on
    // reorder — `left` is never touched by the packer, so each pill kept its
    // original column while getting stacked into an arbitrary vertical order,
    // visually scattering the grid.
    const elements = chipSectionFixture().map((element) => (
      element.flowRole === "grid-member" ? { ...element, flowGroup: undefined } : element
    ));
    const reordered = reorderSection(elements, "skills-head", "up", 842, {
      spacing: { section: 21, record: 10, stack: 4, after_rule: 8 },
    });
    assert.ok(reordered);
    const byId = Object.fromEntries(reordered.map((element) => [element.element_id, element]));

    const row1Tops = ["chip-rect-0-0", "chip-rect-0-1", "chip-rect-0-2"].map((id) => byId[id].top);
    assert.equal(row1Tops[1], row1Tops[0], "row 1 chips must share one top after reorder");
    assert.equal(row1Tops[2], row1Tops[0]);

    const row2Tops = ["chip-rect-1-0", "chip-rect-1-1"].map((id) => byId[id].top);
    assert.equal(row2Tops[1], row2Tops[0], "row 2 chips must share one top after reorder");
    assert.ok(row2Tops[0] > row1Tops[0], "row 2 must stay strictly below row 1");

    for (const id of Object.keys(byId)) {
      if (!id.startsWith("chip-rect-")) continue;
      const rect = byId[id];
      const text = byId[id.replace("chip-rect-", "chip-text-")];
      assert.ok(
        Math.abs(text.top - (rect.top + rect.height / 2)) < 0.51,
        `expected ${id}'s label on the pill midline after reorder (rect.top=${rect.top}, text.top=${text.top})`,
      );
    }
  });
});

describe("healSimpleChromeRuleGaps", () => {
  const PAGE_HEIGHT = 842;

  /**
   * Two native Sterling-style main sections (heading→rule = 20.7, the real
   * `HEADING_FS * 1.05 + 6.0` builder offset) plus a third section whose rule
   * sits at a stale 12px gap — as if it were transferred by an older, now
   * fixed, bug and the document was saved before this heal existed.
   */
  function staleGapFixture() {
    return [
      { element_id: "m-exp-head", category: "text", content: "DOŚWIADCZENIE ZAWODOWE",
        flowRole: "section-chrome", left: 245, top: 188, fontSize: 14, height: 16, page: 1, bold: true },
      { element_id: "m-exp-rule", category: "line", flowRole: "section-chrome",
        left: 245, top: 208.7, width: 300, height: 1, page: 1 },
      { element_id: "m-exp-body", category: "textarea", content: "Body one.",
        flowRole: "content", flowGroup: "job-0", autoHeight: true,
        left: 245, top: 240, width: 300, height: 60, fontSize: 9, lineHeight: 13, page: 1 },

      { element_id: "m-edu-head", category: "text", content: "WYKSZTAŁCENIE",
        flowRole: "section-chrome", left: 245, top: 340, fontSize: 14, height: 16, page: 1, bold: true },
      { element_id: "m-edu-rule", category: "line", flowRole: "section-chrome",
        left: 245, top: 360.7, width: 300, height: 1, page: 1 },
      { element_id: "m-edu-body", category: "textarea", content: "Body two.",
        flowRole: "content", flowGroup: "edu-0", autoHeight: true,
        left: 245, top: 390, width: 300, height: 40, fontSize: 9, lineHeight: 13, page: 1 },

      { element_id: "m-lang-head", category: "text", content: "JĘZYKI",
        flowRole: "section-chrome", left: 245, top: 460, fontSize: 14, height: 16, page: 1, bold: true },
      { element_id: "m-lang-rule", category: "line", flowRole: "section-chrome",
        left: 245, top: 472, width: 300, height: 1, page: 1 },
      { element_id: "m-lang-c1", category: "textarea", content: "Polski — A2",
        flowRole: "grid-member", flowGroup: "lang-grid",
        left: 245, top: 486, width: 67, height: 14, fontSize: 9, lineHeight: 13, page: 1 },
    ];
  }

  function headingToRuleGap(elements, headingId) {
    const ids = sectionElementIds(elements, headingId, PAGE_HEIGHT);
    const members = elements.filter((element) => ids.has(element.element_id));
    const head = members.find((element) => element.element_id === headingId);
    const rule = members.find((element) => element.category === "line");
    return Number((rule.top - head.top).toFixed(2));
  }

  it("snaps an outlier section's heading->rule gap onto the majority", () => {
    const healed = healSimpleChromeRuleGaps(staleGapFixture(), PAGE_HEIGHT);
    assert.equal(headingToRuleGap(healed, "m-exp-head"), 20.7);
    assert.equal(headingToRuleGap(healed, "m-edu-head"), 20.7);
    assert.equal(headingToRuleGap(healed, "m-lang-head"), 20.7);
  });

  it("is a no-op when every section already agrees", () => {
    const uniform = staleGapFixture().map((element) => (
      element.element_id === "m-lang-rule" ? { ...element, top: 480.7 } : element
    ));
    const healed = healSimpleChromeRuleGaps(uniform, PAGE_HEIGHT);
    assert.equal(healed, uniform);
  });

  it("heals an outlier rule gap in a richer cluster but leaves the decorative mark in place", () => {
    // A section with a marker + rule (a "rich" cluster) whose rule sits at a
    // stale 6px gap while every other section is at 20.7. The rule underline
    // must snap onto the lane majority (matching its neighbours), but the
    // decorative circle mark keeps its own offset — only the rule moves. This
    // is the icon-template case (Tessera / Slate / Monument) where a transferred
    // section's rule otherwise reads as an outlier beside its siblings.
    const elements = [
      ...staleGapFixture(),
      { element_id: "m-cert-head", category: "text", content: "CERTYFIKATY",
        flowRole: "section-chrome", left: 245, top: 560, fontSize: 14, height: 16, page: 1, bold: true },
      { element_id: "m-cert-mark", category: "circle", flowRole: "section-chrome",
        left: 240, top: 562, width: 6, height: 6, page: 1 },
      { element_id: "m-cert-rule", category: "line", flowRole: "section-chrome",
        left: 245, top: 566, width: 300, height: 1, page: 1 },
      { element_id: "m-cert-body", category: "textarea", content: "Body three.",
        flowRole: "content", autoHeight: true,
        left: 245, top: 590, width: 300, height: 30, fontSize: 9, lineHeight: 13, page: 1 },
    ];
    const healed = healSimpleChromeRuleGaps(elements, PAGE_HEIGHT);
    const certHead = healed.find((element) => element.element_id === "m-cert-head");
    const certRule = healed.find((element) => element.element_id === "m-cert-rule");
    const certMark = healed.find((element) => element.element_id === "m-cert-mark");
    assert.equal(
      Number((certRule.top - certHead.top).toFixed(2)), 20.7,
      "the rule underline must snap onto the lane majority gap",
    );
    assert.equal(certMark.top, 562, "the decorative mark keeps its own offset — only the rule moves");
  });

  it("applyFlowSpacing heals stale transferred-section gaps on every pack", () => {
    const source = staleGapFixture();
    const packed = applyFlowSpacing(source, {
      stack: 4, record: 10, section: 21, after_rule: 8,
    }, PAGE_HEIGHT);
    assert.equal(headingToRuleGap(packed, "m-lang-head"), headingToRuleGap(packed, "m-exp-head"));
    assert.equal(headingToRuleGap(packed, "m-lang-head"), headingToRuleGap(packed, "m-edu-head"));
  });
});
