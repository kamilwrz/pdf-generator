import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collapseSpilledMainIntoSidebar,
  isAnchoredMainSectionTitle,
  moveMainSectionsToSidebar,
} from "./collapseMainIntoSidebar.js";
import {
  listDocumentSections,
  listSidebarSections,
  sidebarSectionElementIds,
} from "./sectionStructure.js";
import { contentMaxPage } from "./structureOperation.js";

const PAGE_HEIGHT = 842;
const SPACING = { stack: 4, record: 10, section: 21, after_rule: 8 };

/**
 * Two-page sidebar CV: Experience fills page 1; Education spills onto page 2.
 * The page-1 rail has room under Skills, matching the live Sterling case
 * after AI / spacing has shortened leftover copy.
 */
function spilledEducationFixture({
  // Fits page 1 alone (~704px band from top 188) but leaves no room for
  // Education, so the leftover starts on page 2 until it is railed.
  experienceBodyHeight = 500,
  educationBodyHeight = 140,
  educationContent = "Bachelor of Laws (LL.B.)\nUniversity of Warsaw",
} = {}) {
  return [
    { element_id: "sb-sum-head", category: "text", content: "PODSUMOWANIE ZAWODOWE",
      flowRole: "sidebar-chrome", flowLane: "sidebar",
      left: 34, top: 188, fontSize: 9.4, height: 12, page: 1, bold: true },
    { element_id: "sb-sum-rule", category: "line",
      flowRole: "sidebar-chrome", flowLane: "sidebar",
      left: 34, top: 204, width: 22, height: 1.4, page: 1 },
    { element_id: "sb-sum-body", category: "textarea", content: "AML analyst.",
      flowRole: "content", flowLane: "sidebar", autoHeight: true,
      left: 34, top: 216, width: 152, height: 40, fontSize: 8.3, lineHeight: 12, page: 1 },
    { element_id: "sb-sk-head", category: "text", content: "UMIEJĘTNOŚCI",
      flowRole: "sidebar-chrome", flowLane: "sidebar",
      left: 34, top: 280, fontSize: 9.4, height: 12, page: 1, bold: true },
    { element_id: "sb-sk-rule", category: "line",
      flowRole: "sidebar-chrome", flowLane: "sidebar",
      left: 34, top: 296, width: 22, height: 1.4, page: 1 },
    { element_id: "sb-sk-body", category: "textarea", content: "AML\nKYC\nSQL",
      flowRole: "content", flowLane: "sidebar", autoHeight: true, bulletList: true,
      left: 34, top: 308, width: 152, height: 50, fontSize: 8.3, lineHeight: 12, page: 1 },

    { element_id: "m-exp-head", category: "text", content: "DOŚWIADCZENIE ZAWODOWE",
      flowRole: "section-chrome", left: 218, top: 188, fontSize: 10, height: 14, page: 1, bold: true },
    { element_id: "m-exp-rule", category: "line", flowRole: "section-chrome",
      left: 218, top: 206, width: 329, height: 1, page: 1 },
    { element_id: "m-exp-title", category: "text", content: "AML Analyst",
      flowRole: "content", flowGroup: "job-0",
      left: 218, top: 220, fontSize: 10.4, height: 14, page: 1, bold: true },
    { element_id: "m-exp-body", category: "textarea",
      content: "Transaction monitoring and SAR drafting across multiple case queues.",
      flowRole: "content", flowGroup: "job-0", autoHeight: true,
      left: 218, top: 240, width: 329, height: experienceBodyHeight,
      fontSize: 9, lineHeight: 13, page: 1 },

    { element_id: "m-edu-head", category: "text", content: "WYKSZTAŁCENIE",
      flowRole: "section-chrome", left: 218, top: 100, fontSize: 10, height: 14, page: 2, bold: true },
    { element_id: "m-edu-rule", category: "line", flowRole: "section-chrome",
      left: 218, top: 118, width: 329, height: 1, page: 2 },
    { element_id: "m-edu-degree", category: "text", content: "Bachelor of Laws (LL.B.)",
      flowRole: "content", flowGroup: "edu-0",
      left: 218, top: 130, fontSize: 10.4, height: 14, page: 2, bold: true },
    { element_id: "m-edu-body", category: "textarea", content: educationContent,
      flowRole: "content", flowGroup: "edu-0", autoHeight: true,
      left: 218, top: 148, width: 329, height: educationBodyHeight,
      fontSize: 9, lineHeight: 13, page: 2 },
  ];
}

describe("isAnchoredMainSectionTitle", () => {
  it("treats Polish and English experience headings as anchored", () => {
    assert.equal(isAnchoredMainSectionTitle("DOŚWIADCZENIE ZAWODOWE"), true);
    assert.equal(isAnchoredMainSectionTitle("Doświadczenie"), true);
    assert.equal(isAnchoredMainSectionTitle("Experience"), true);
    assert.equal(isAnchoredMainSectionTitle("Work Experience"), true);
  });

  it("does not anchor education or other leftovers", () => {
    assert.equal(isAnchoredMainSectionTitle("WYKSZTAŁCENIE"), false);
    assert.equal(isAnchoredMainSectionTitle("Education"), false);
    assert.equal(isAnchoredMainSectionTitle("Projekty"), false);
    assert.equal(isAnchoredMainSectionTitle("Certifications"), false);
  });
});

describe("collapseSpilledMainIntoSidebar", () => {
  it("is a no-op without a sidebar rail", () => {
    const elements = [
      { element_id: "h1", category: "text", content: "Doświadczenie",
        flowRole: "section-chrome", left: 66, top: 120, fontSize: 10, height: 14, page: 1 },
      { element_id: "b1", category: "textarea", content: "Body",
        flowRole: "content", left: 66, top: 140, width: 400, height: 40, fontSize: 9, page: 1 },
    ];
    assert.equal(collapseSpilledMainIntoSidebar(elements, { pageHeight: PAGE_HEIGHT, spacing: SPACING }), elements);
  });

  it("moves spilled education onto the rail and drops the extra page", () => {
    const source = spilledEducationFixture();
    assert.equal(contentMaxPage(source), 2);
    assert.ok(listDocumentSections(source, PAGE_HEIGHT).some((section) => section.title === "WYKSZTAŁCENIE"));

    const next = collapseSpilledMainIntoSidebar(source, {
      pageHeight: PAGE_HEIGHT,
      spacing: SPACING,
    });

    assert.notEqual(next, source);
    assert.equal(contentMaxPage(next), 1);
    assert.deepEqual(
      listDocumentSections(next, PAGE_HEIGHT).map((section) => section.title),
      ["DOŚWIADCZENIE ZAWODOWE"],
    );
    assert.ok(
      listSidebarSections(next, PAGE_HEIGHT).some((section) => section.title === "WYKSZTAŁCENIE"),
    );
    const eduBody = next.find((element) => element.element_id === "m-edu-body");
    assert.equal(eduBody.flowLane, "sidebar");
    assert.ok(eduBody.width < 200, "education body must be measured at rail width");
    assert.equal(
      next.find((element) => element.element_id === "m-exp-head").flowRole,
      "section-chrome",
    );
  });

  it("never moves experience onto the rail", () => {
    const source = spilledEducationFixture({
      experienceBodyHeight: 680,
      educationBodyHeight: 40,
    });
    const next = collapseSpilledMainIntoSidebar(source, {
      pageHeight: PAGE_HEIGHT,
      spacing: SPACING,
    });
    const experience = next.find((element) => element.element_id === "m-exp-head");
    assert.equal(experience.flowLane, undefined);
    assert.equal(experience.flowRole, "section-chrome");
    assert.ok(
      listDocumentSections(next, PAGE_HEIGHT).some((section) => (
        section.title === "DOŚWIADCZENIE ZAWODOWE"
      )),
    );
  });

  it("keeps a leftover in main when moving it would not drop a page", () => {
    // Experience itself already occupies page 2, so railing Education cannot
    // collapse the document — the survival/page-drop rule must refuse.
    const source = spilledEducationFixture({ experienceBodyHeight: 680 });
    const next = collapseSpilledMainIntoSidebar(source, {
      pageHeight: PAGE_HEIGHT,
      spacing: SPACING,
    });
    assert.ok(
      listDocumentSections(next, PAGE_HEIGHT).some((section) => section.title === "WYKSZTAŁCENIE"),
      "education must stay in main when the extra page is held by experience",
    );
  });

  it("moves the last two leftovers together when only both drop a page", () => {
    const source = [
      ...spilledEducationFixture({ educationBodyHeight: 80 }).filter(
        (element) => !String(element.element_id).startsWith("m-edu"),
      ),
      { element_id: "m-edu-head", category: "text", content: "WYKSZTAŁCENIE",
        flowRole: "section-chrome", left: 218, top: 80, fontSize: 10, height: 14, page: 2, bold: true },
      { element_id: "m-edu-rule", category: "line", flowRole: "section-chrome",
        left: 218, top: 98, width: 329, height: 1, page: 2 },
      { element_id: "m-edu-body", category: "textarea", content: "LL.B.",
        flowRole: "content", autoHeight: true,
        left: 218, top: 110, width: 329, height: 80, fontSize: 9, lineHeight: 13, page: 2 },
      { element_id: "m-aw-head", category: "text", content: "NAGRODY",
        flowRole: "section-chrome", left: 218, top: 210, fontSize: 10, height: 14, page: 2, bold: true },
      { element_id: "m-aw-rule", category: "line", flowRole: "section-chrome",
        left: 218, top: 228, width: 329, height: 1, page: 2 },
      { element_id: "m-aw-body", category: "textarea", content: "Dean's list",
        flowRole: "content", autoHeight: true,
        left: 218, top: 240, width: 329, height: 40, fontSize: 9, lineHeight: 13, page: 2 },
    ];
    assert.equal(contentMaxPage(source), 2);

    const next = collapseSpilledMainIntoSidebar(source, {
      pageHeight: PAGE_HEIGHT,
      spacing: SPACING,
    });
    const sidebarTitles = listSidebarSections(next, PAGE_HEIGHT).map((section) => section.title);
    assert.ok(sidebarTitles.includes("WYKSZTAŁCENIE"));
    assert.ok(sidebarTitles.includes("NAGRODY"));
    assert.equal(contentMaxPage(next), 1);
    assert.deepEqual(
      listDocumentSections(next, PAGE_HEIGHT).map((section) => section.title),
      ["DOŚWIADCZENIE ZAWODOWE"],
    );
  });
});

describe("moveMainSectionsToSidebar", () => {
  it("recomputes wrapped height at sidebar width instead of copying the main box", () => {
    const source = spilledEducationFixture({ educationBodyHeight: 400 });
    const next = moveMainSectionsToSidebar(source, ["m-edu-head"], PAGE_HEIGHT, SPACING);
    assert.ok(next);
    const eduBody = next.find((element) => element.element_id === "m-edu-body");
    assert.equal(eduBody.flowLane, "sidebar");
    assert.ok(
      eduBody.height < 400,
      `sidebar-measured height (${eduBody.height}) must be smaller than the main-column box`,
    );
  });

  it("keeps Languages and Skills as separate sidebar sections when both move together", () => {
    const source = [
      { element_id: "sb-contact-head", category: "text", content: "DANE KONTAKTOWE",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 120, fontSize: 8, height: 11, page: 1, bold: true },
      { element_id: "sb-contact-rule", category: "line",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 134, width: 22, height: 1, page: 1 },
      { element_id: "sb-contact-body", category: "textarea", content: "k@example.com",
        flowRole: "content", flowLane: "sidebar", autoHeight: true,
        left: 34, top: 144, width: 152, height: 12, fontSize: 7, lineHeight: 10, page: 1 },

      { element_id: "m-lang-head", category: "text", content: "JĘZYKI",
        flowRole: "section-chrome", left: 218, top: 200, fontSize: 10, height: 14, page: 1, bold: true },
      { element_id: "m-lang-rule", category: "line", flowRole: "section-chrome",
        left: 218, top: 218, width: 329, height: 1, page: 1 },
      { element_id: "m-lang-body", category: "textarea",
        content: "Angielski — B2\nPolski — Native", flowRole: "content", autoHeight: true,
        left: 218, top: 230, width: 329, height: 28, fontSize: 9, lineHeight: 13, page: 1 },

      { element_id: "m-skills-head", category: "text", content: "UMIEJĘTNOŚCI",
        flowRole: "section-chrome", left: 218, top: 290, fontSize: 10, height: 14, page: 1, bold: true },
      { element_id: "m-skills-rule", category: "line", flowRole: "section-chrome",
        left: 218, top: 308, width: 329, height: 1, page: 1 },
      { element_id: "m-skills-body", category: "textarea",
        content: "React · SQL · Python", flowRole: "content", autoHeight: true,
        left: 218, top: 320, width: 329, height: 18, fontSize: 9, lineHeight: 13, page: 1 },
    ];

    const next = moveMainSectionsToSidebar(
      source,
      ["m-lang-head", "m-skills-head"],
      PAGE_HEIGHT,
      SPACING,
    );
    assert.ok(next);
    assert.deepEqual(
      listSidebarSections(next, PAGE_HEIGHT).map((section) => section.title),
      ["DANE KONTAKTOWE", "JĘZYKI", "UMIEJĘTNOŚCI"],
    );

    const languageIds = sidebarSectionElementIds(next, "m-lang-head", PAGE_HEIGHT);
    const skillsIds = sidebarSectionElementIds(next, "m-skills-head", PAGE_HEIGHT);
    const languageBodyId = "m-lang-head-languages-sidebar-composite";
    const skillsBodyId = "m-skills-head-skills-sidebar-composite";

    assert.ok(languageIds.has(languageBodyId), "Languages keeps its aggregate body");
    assert.ok(!languageIds.has(skillsBodyId), "Languages must not absorb the Skills body");
    assert.ok(skillsIds.has(skillsBodyId), "Skills keeps its aggregate body");
    assert.ok(!skillsIds.has(languageBodyId), "Skills must not absorb the Languages body");
  });

  it("keeps any batch of moved sections separate and in document order", () => {
    const source = [
      { element_id: "rail-head", category: "text", content: "KONTAKT",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 100, fontSize: 8, height: 11, page: 1, bold: true },
      { element_id: "rail-rule", category: "line",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 114, width: 24, height: 1, page: 1 },
      { element_id: "rail-body", category: "textarea", content: "mail@example.com",
        flowRole: "content", flowLane: "sidebar", autoHeight: true,
        left: 34, top: 124, width: 152, height: 12, fontSize: 7, lineHeight: 10, page: 1 },
      ...["PROJEKTY", "WOLONTARIAT", "PUBLIKACJE"].flatMap((title, index) => {
        const top = 200 + index * 100;
        const prefix = `custom-${index + 1}`;
        return [
          { element_id: `${prefix}-head`, category: "text", content: title,
            flowRole: "section-chrome", left: 218, top, fontSize: 10, height: 14, page: 1, bold: true },
          { element_id: `${prefix}-rule`, category: "line", flowRole: "section-chrome",
            left: 218, top: top + 18, width: 329, height: 1, page: 1 },
          { element_id: `${prefix}-body`, category: "textarea", content: `${title} — treść`,
            flowRole: "content", autoHeight: true,
            left: 218, top: top + 30, width: 329, height: 24, fontSize: 9, lineHeight: 13, page: 1 },
        ];
      }),
    ];

    // Callers do not need to pre-sort IDs. The transfer derives the canonical
    // order from the source document before staging any of the sections.
    const next = moveMainSectionsToSidebar(
      source,
      ["custom-3-head", "custom-1-head", "custom-2-head"],
      PAGE_HEIGHT,
      SPACING,
    );
    assert.ok(next);
    assert.deepEqual(
      listSidebarSections(next, PAGE_HEIGHT).map((section) => section.title),
      ["KONTAKT", "PROJEKTY", "WOLONTARIAT", "PUBLIKACJE"],
    );

    for (let index = 1; index <= 3; index += 1) {
      const ids = sidebarSectionElementIds(next, `custom-${index}-head`, PAGE_HEIGHT);
      assert.ok(ids.has(`custom-${index}-body`), `section ${index} keeps its body`);
      for (let other = 1; other <= 3; other += 1) {
        if (other === index) continue;
        assert.ok(
          !ids.has(`custom-${other}-body`),
          `section ${index} must not absorb section ${other}`,
        );
      }
    }
  });
});
