import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  moveSidebarSectionsToMain,
  resolveSectionLaneTransfer,
  transferSectionLane,
} from "./transferSectionLane.js";
import {
  listDocumentSections,
  listSidebarSections,
  sectionElementIds,
  sidebarSectionElementIds,
} from "./sectionStructure.js";

const PAGE_HEIGHT = 842;
const SPACING = { stack: 4, record: 10, section: 21, after_rule: 8 };

/**
 * Compact Sterling-like two-column fixture: Summary + Skills on the rail,
 * Experience + Education in main. Heights fit page 1 so transfers are stable.
 */
function sterlingLikeFixture() {
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
      content: "Transaction monitoring.",
      flowRole: "content", flowGroup: "job-0", autoHeight: true,
      left: 218, top: 240, width: 329, height: 80,
      fontSize: 9, lineHeight: 13, page: 1 },

    { element_id: "m-edu-head", category: "text", content: "WYKSZTAŁCENIE",
      flowRole: "section-chrome", left: 218, top: 360, fontSize: 10, height: 14, page: 1, bold: true },
    { element_id: "m-edu-rule", category: "line", flowRole: "section-chrome",
      left: 218, top: 378, width: 329, height: 1, page: 1 },
    { element_id: "m-edu-degree", category: "text", content: "Bachelor of Laws (LL.B.)",
      flowRole: "content", flowGroup: "edu-0",
      left: 218, top: 390, fontSize: 10.4, height: 14, page: 1, bold: true },
    { element_id: "m-edu-body", category: "textarea",
      content: "University of Warsaw",
      flowRole: "content", flowGroup: "edu-0", autoHeight: true,
      left: 218, top: 408, width: 329, height: 40,
      fontSize: 9, lineHeight: 13, page: 1 },
  ];
}

/**
 * Icon-styled two-column fixture (Tessera/Slate shape): every section heading
 * carries a decorative chrome cluster (tile square + outline rect + iconic
 * image glyph) in addition to the plain heading + rule Sterling uses. Used to
 * cover the "transfer must rebuild the destination lane's icon chrome"
 * regression — dropping these markers wholesale (the pre-fix behaviour) left
 * a transferred heading with no icon on Tessera/Slate, even though every
 * sibling heading in both lanes has one.
 */
function iconicSidebarFixture() {
  const iconMarker = (id, headingId, flowLane, left, top, name) => ([
    { element_id: `${id}-tile`, category: "line",
      flowRole: flowLane ? "sidebar-chrome" : "section-chrome", flowLane,
      left, top: top - 2, width: 18, height: 18, backgroundColor: "#FFFFFF", page: 1 },
    { element_id: `${id}-rect`, category: "rectangle",
      flowRole: flowLane ? "sidebar-chrome" : "section-chrome", flowLane,
      left: left + 2, top, width: 18, height: 18, borderWidth: 0.8,
      backgroundColor: "#E15D4F", filled: false, page: 1 },
    { element_id: `${id}-icon`, category: "image",
      flowRole: flowLane ? "sidebar-chrome" : "section-chrome", flowLane,
      left: left + 4, top: top + 2, width: 12, height: 12,
      src: `/template-assets/iconic/tessera/${name}.png`, alignWithText: false, page: 1 },
  ]);

  return [
    ...iconMarker("sb-sum", "sb-sum-head", "sidebar", 34, 188, "summary"),
    { element_id: "sb-sum-head", category: "text", content: "PODSUMOWANIE ZAWODOWE",
      flowRole: "sidebar-chrome", flowLane: "sidebar",
      left: 60, top: 191, fontSize: 7.6, height: 12, page: 1, bold: true },
    { element_id: "sb-sum-rule", category: "line",
      flowRole: "sidebar-chrome", flowLane: "sidebar",
      left: 60, top: 204, width: 50, height: 1, page: 1 },
    { element_id: "sb-sum-body", category: "textarea", content: "AML analyst.",
      flowRole: "content", flowLane: "sidebar", autoHeight: true,
      left: 34, top: 216, width: 152, height: 40, fontSize: 6.6, lineHeight: 9, page: 1 },

    ...iconMarker("sb-sk", "sb-sk-head", "sidebar", 34, 280, "skills"),
    { element_id: "sb-sk-head", category: "text", content: "UMIEJĘTNOŚCI",
      flowRole: "sidebar-chrome", flowLane: "sidebar",
      left: 60, top: 283, fontSize: 7.6, height: 12, page: 1, bold: true },
    { element_id: "sb-sk-rule", category: "line",
      flowRole: "sidebar-chrome", flowLane: "sidebar",
      left: 60, top: 296, width: 50, height: 1, page: 1 },
    { element_id: "sb-sk-body", category: "textarea", content: "AML\nKYC\nSQL",
      flowRole: "content", flowLane: "sidebar", autoHeight: true, bulletList: true,
      left: 34, top: 308, width: 152, height: 50, fontSize: 6.6, lineHeight: 9, page: 1 },

    ...iconMarker("m-exp", "m-exp-head", null, 218, 188, "experience"),
    { element_id: "m-exp-head", category: "text", content: "DOŚWIADCZENIE ZAWODOWE",
      flowRole: "section-chrome", left: 248, top: 191, fontSize: 8.1, height: 14, page: 1, bold: true },
    { element_id: "m-exp-rule", category: "line", flowRole: "section-chrome",
      left: 248, top: 209, width: 299, height: 1, page: 1 },
    { element_id: "m-exp-title", category: "text", content: "AML Analyst",
      flowRole: "content", flowGroup: "job-0",
      left: 218, top: 220, fontSize: 10.4, height: 14, page: 1, bold: true },
    { element_id: "m-exp-body", category: "textarea",
      content: "Transaction monitoring.",
      flowRole: "content", flowGroup: "job-0", autoHeight: true,
      left: 218, top: 240, width: 329, height: 80,
      fontSize: 9, lineHeight: 13, page: 1 },

    ...iconMarker("m-edu", "m-edu-head", null, 218, 360, "education"),
    { element_id: "m-edu-head", category: "text", content: "WYKSZTAŁCENIE",
      flowRole: "section-chrome", left: 248, top: 363, fontSize: 8.1, height: 14, page: 1, bold: true },
    { element_id: "m-edu-rule", category: "line", flowRole: "section-chrome",
      left: 248, top: 381, width: 299, height: 1, page: 1 },
    { element_id: "m-edu-degree", category: "text", content: "Bachelor of Laws (LL.B.)",
      flowRole: "content", flowGroup: "edu-0",
      left: 218, top: 390, fontSize: 10.4, height: 14, page: 1, bold: true },
    { element_id: "m-edu-body", category: "textarea",
      content: "University of Warsaw",
      flowRole: "content", flowGroup: "edu-0", autoHeight: true,
      left: 218, top: 408, width: 329, height: 40,
      fontSize: 9, lineHeight: 13, page: 1 },
  ];
}

describe("resolveSectionLaneTransfer", () => {
  it("offers main leftovers to the rail and rail kickers to main", () => {
    const elements = sterlingLikeFixture();
    assert.equal(resolveSectionLaneTransfer(elements, "m-edu-head", PAGE_HEIGHT), "to-sidebar");
    assert.equal(resolveSectionLaneTransfer(elements, "sb-sk-head", PAGE_HEIGHT), "to-main");
  });

  it("never offers Experience to the rail", () => {
    const elements = sterlingLikeFixture();
    assert.equal(resolveSectionLaneTransfer(elements, "m-exp-head", PAGE_HEIGHT), null);
  });

  it("is a no-op for main headings when the document has no rail", () => {
    const elements = [
      { element_id: "h1", category: "text", content: "Wykształcenie",
        flowRole: "section-chrome", left: 66, top: 120, fontSize: 10, height: 14, page: 1 },
      { element_id: "b1", category: "textarea", content: "Body",
        flowRole: "content", left: 66, top: 140, width: 400, height: 40, fontSize: 9, page: 1 },
    ];
    assert.equal(resolveSectionLaneTransfer(elements, "h1", PAGE_HEIGHT), null);
  });
});

describe("transferSectionLane", () => {
  it("moves education onto the rail as the last sidebar section", () => {
    const source = sterlingLikeFixture();
    const next = transferSectionLane(source, "m-edu-head", PAGE_HEIGHT, SPACING);
    assert.ok(next);
    const railTitles = listSidebarSections(next, PAGE_HEIGHT).map((section) => section.title);
    assert.deepEqual(railTitles.slice(-1), ["WYKSZTAŁCENIE"]);
    assert.equal(
      listDocumentSections(next, PAGE_HEIGHT).some((section) => section.headingId === "m-edu-head"),
      false,
    );
    const eduHead = next.find((element) => element.element_id === "m-edu-head");
    assert.equal(eduHead.flowLane, "sidebar");
    assert.equal(eduHead.flowRole, "sidebar-chrome");
    const eduBody = next.find((element) => element.element_id === "m-edu-body");
    assert.ok((Number(eduBody.width) || 0) < 200);
  });

  it("moves a sidebar section into main as the last main section", () => {
    const source = sterlingLikeFixture();
    const next = transferSectionLane(source, "sb-sk-head", PAGE_HEIGHT, SPACING);
    assert.ok(next);
    const mainTitles = listDocumentSections(next, PAGE_HEIGHT).map((section) => section.title);
    assert.deepEqual(mainTitles.slice(-1), ["UMIEJĘTNOŚCI"]);
    assert.equal(
      listSidebarSections(next, PAGE_HEIGHT).some((section) => section.headingId === "sb-sk-head"),
      false,
    );
    const skillsHead = next.find((element) => element.element_id === "sb-sk-head");
    assert.equal(skillsHead.flowRole, "section-chrome");
    assert.equal(skillsHead.flowLane, undefined);
    // Flat rail skills expand into main bodies (new ids); width must be main-column.
    const skillsMemberIds = sectionElementIds(next, "sb-sk-head", PAGE_HEIGHT);
    const skillsBodies = next.filter((element) => (
      skillsMemberIds.has(element.element_id)
      && element.flowRole === "content"
    ));
    assert.ok(skillsBodies.length >= 1);
    assert.ok(
      skillsBodies.every((element) => (Number(element.width) || 0) > 250),
      `expected main widths, got ${skillsBodies.map((element) => element.width)}`,
    );
    assert.ok(skillsBodies.some((element) => /AML|KYC|SQL/i.test(String(element.content || ""))));
  });

  it("moves summary into main at full column width even when languages grid is last", () => {
    // Regression from the live Sterling bug: last main section was Języki cells
    // (~70px). Summary inherited that width and wrapped into a vertical ribbon
    // with a huge empty band above it on page 2.
    const source = [
      { element_id: "sb-sum-head", category: "text", content: "PODSUMOWANIE ZAWODOWE",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 188, fontSize: 9.4, height: 12, page: 1, bold: true, color: "#33517A" },
      { element_id: "sb-sum-rule", category: "line",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 204, width: 22, height: 1.4, page: 1, backgroundColor: "#4A6FA5" },
      { element_id: "sb-sum-body", category: "textarea",
        content: "Doświadczony analityk AML z praktyką w bankowości i doradztwie. "
          + "Specjalizacja w monitorowaniu transakcji, KYC oraz raportowaniu SAR.",
        flowRole: "content", flowLane: "sidebar", autoHeight: true, preserveInitialLayout: true,
        left: 34, top: 216, width: 152, height: 90, fontSize: 8.3, lineHeight: 12, page: 1,
        color: "#26313F", fontFamily: "Montserrat" },

      { element_id: "m-exp-head", category: "text", content: "DOŚWIADCZENIE ZAWODOWE",
        flowRole: "section-chrome", left: 245, top: 188, fontSize: 14, height: 16, page: 1,
        bold: true, color: "#26313F", letterSpacing: 0.8, fontFamily: "Montserrat" },
      { element_id: "m-exp-rule", category: "line", flowRole: "section-chrome",
        left: 245, top: 208, width: 300, height: 1, page: 1, backgroundColor: "#C7CFDA" },
      { element_id: "m-exp-title", category: "text", content: "AML Analyst",
        flowRole: "content", flowGroup: "job-0",
        left: 245, top: 220, fontSize: 11.2, height: 14, page: 1, bold: true },
      { element_id: "m-exp-body", category: "textarea",
        content: "Transaction monitoring across case queues.",
        flowRole: "content", flowGroup: "job-0", autoHeight: true,
        left: 245, top: 240, width: 300, height: 120, fontSize: 9, lineHeight: 13, page: 1,
        color: "#26313F", fontFamily: "Montserrat" },

      { element_id: "m-lang-head", category: "text", content: "JĘZYKI",
        flowRole: "section-chrome", left: 245, top: 520, fontSize: 14, height: 16, page: 1, bold: true },
      { element_id: "m-lang-rule", category: "line", flowRole: "section-chrome",
        left: 245, top: 540, width: 300, height: 1, page: 1, backgroundColor: "#4A6FA5" },
      { element_id: "m-lang-c1", category: "textarea", content: "Polski — A2",
        flowRole: "grid-member", flowGroup: "lang-grid",
        left: 245, top: 554, width: 67, height: 14, fontSize: 9, lineHeight: 13, page: 1 },
      { element_id: "m-lang-c2", category: "textarea", content: "Niemiecki — C1",
        flowRole: "grid-member", flowGroup: "lang-grid",
        left: 320, top: 554, width: 67, height: 14, fontSize: 9, lineHeight: 13, page: 1 },
    ];
    const next = transferSectionLane(source, "sb-sum-head", PAGE_HEIGHT, SPACING);
    assert.ok(next);
    const body = next.find((element) => element.element_id === "sb-sum-body");
    const heading = next.find((element) => element.element_id === "sb-sum-head");
    assert.ok(body);
    assert.ok(heading);
    assert.equal(body.flowLane, undefined);
    assert.ok((Number(body.width) || 0) >= 280, `expected main width, got ${body.width}`);
    assert.equal(Number(body.left) || 0, 245);
    assert.equal(Number(heading.left) || 0, 245);
    assert.equal(Number(body.fontSize), 9, "description body size, not job-title 11");
    assert.equal(Number(heading.fontSize), 14, "main heading size from Experience");
    assert.equal(heading.color, "#26313F");
    assert.equal(body.preserveInitialLayout, false);
    // First content on its page must sit on the content band — not mid-page.
    if ((Number(heading.page) || 1) >= 2) {
      assert.ok((Number(heading.top) || 0) <= 80, `expected page-top start, got top=${heading.top}`);
    }
  });

  it("pulls remaining sidebar sections up after Summary moves to main", () => {
    const source = [
      { element_id: "sb-sum-head", category: "text", content: "PODSUMOWANIE ZAWODOWE",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 188, fontSize: 9.4, height: 12, page: 1, bold: true, color: "#33517A" },
      { element_id: "sb-sum-rule", category: "line",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 204, width: 22, height: 1.4, page: 1, backgroundColor: "#4A6FA5" },
      { element_id: "sb-sum-body", category: "textarea", content: "Summary copy.",
        flowRole: "content", flowLane: "sidebar", autoHeight: true,
        left: 34, top: 216, width: 152, height: 50, fontSize: 8.3, lineHeight: 12, page: 1 },
      { element_id: "sb-edu-head", category: "text", content: "WYKSZTAŁCENIE",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 300, fontSize: 9.4, height: 12, page: 1, bold: true, color: "#33517A" },
      { element_id: "sb-edu-rule", category: "line",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 316, width: 22, height: 1.4, page: 1 },
      { element_id: "sb-edu-body", category: "textarea", content: "LL.B.",
        flowRole: "content", flowLane: "sidebar", autoHeight: true,
        left: 34, top: 330, width: 152, height: 30, fontSize: 8.3, page: 1 },

      { element_id: "m-exp-head", category: "text", content: "DOŚWIADCZENIE ZAWODOWE",
        flowRole: "section-chrome", left: 245, top: 188, fontSize: 14, height: 16, page: 1,
        bold: true, color: "#26313F", letterSpacing: 0.8, fontFamily: "Montserrat" },
      { element_id: "m-exp-rule", category: "line", flowRole: "section-chrome",
        left: 245, top: 208, width: 300, height: 1, page: 1, backgroundColor: "#C7CFDA" },
      { element_id: "m-exp-title", category: "text", content: "AML Analyst",
        flowRole: "content", flowGroup: "job-0",
        left: 245, top: 220, fontSize: 11.2, height: 14, page: 1, bold: true },
      { element_id: "m-exp-body", category: "textarea",
        content: "Transaction monitoring.",
        flowRole: "content", flowGroup: "job-0", autoHeight: true,
        left: 245, top: 240, width: 300, height: 40, fontSize: 9.5, lineHeight: 13.8, page: 1 },
    ];
    const next = transferSectionLane(source, "sb-sum-head", PAGE_HEIGHT, SPACING);
    assert.ok(next);
    const edu = next.find((element) => element.element_id === "sb-edu-head");
    assert.ok(edu);
    assert.ok(
      Math.abs((Number(edu.top) || 0) - 188) <= 2,
      `education should pack to content top after summary leaves, got ${edu.top}`,
    );
  });

  it("expands sidebar skills with subcategories into main category + body records", () => {
    const source = [
      ...sterlingLikeFixture().filter((element) => !String(element.element_id).startsWith("sb-sk")),
      { element_id: "sb-sk-head", category: "text", content: "UMIEJĘTNOŚCI",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 280, fontSize: 9.4, height: 12, page: 1, bold: true, color: "#33517A" },
      { element_id: "sb-sk-rule", category: "line",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 296, width: 22, height: 1.4, page: 1, backgroundColor: "#4A6FA5" },
      { element_id: "sb-sk-body", category: "textarea",
        content: "Python\n• Backend development\n• REST APIs\nC++\n• OOP\n• basic STL",
        flowRole: "content", flowLane: "sidebar", autoHeight: true, bulletList: true,
        left: 34, top: 308, width: 152, height: 180, fontSize: 8.3, lineHeight: 12, page: 1 },
    ];
    // Experience heading must carry main type so skills inherit 14 / 9.5 / ink.
    const withTypedExp = source.map((element) => (
      element.element_id === "m-exp-head"
        ? {
          ...element,
          fontSize: 14,
          color: "#26313F",
          letterSpacing: 0.8,
          fontFamily: "Montserrat",
        }
        : element.element_id === "m-exp-body"
          ? { ...element, fontSize: 9.5, lineHeight: 13.8, color: "#26313F", width: 329 }
          : element
    ));
    const next = transferSectionLane(withTypedExp, "sb-sk-head", PAGE_HEIGHT, SPACING);
    assert.ok(next);
    const heading = next.find((element) => element.element_id === "sb-sk-head");
    assert.equal(Number(heading.fontSize), 14);
    assert.equal(heading.color, "#26313F");
    assert.equal(heading.flowLane, undefined);
    const categories = next.filter((element) => (
      element.flowRole === "content"
      && element.bold
      && (element.content === "Python" || element.content === "C++")
    ));
    assert.equal(categories.length, 2);
    assert.ok(categories.every((element) => (Number(element.width) || 0) > 250));
    assert.ok(categories.every((element) => (Number(element.left) || 0) >= 218));
    const chipBodies = next.filter((element) => (
      element.flowRole === "content"
      && !element.bold
      && String(element.content || "").includes("·")
    ));
    assert.equal(chipBodies.length, 2);
    assert.ok(chipBodies.every((element) => Number(element.fontSize) === 9.5));
    // Heading and first category share a page — no orphaned chrome alone.
    assert.equal(Number(heading.page) || 1, Number(categories[0].page) || 1);
  });

  it("expands sidebar languages into a main-column accent grid", () => {
    const source = [
      ...sterlingLikeFixture(),
      { element_id: "sb-lang-head", category: "text", content: "JĘZYKI",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 400, fontSize: 9.4, height: 12, page: 1, bold: true, color: "#33517A" },
      { element_id: "sb-lang-rule", category: "line",
        flowRole: "sidebar-chrome", flowLane: "sidebar",
        left: 34, top: 416, width: 22, height: 1.4, page: 1, backgroundColor: "#4A6FA5" },
      { element_id: "sb-lang-body", category: "textarea",
        content: "Polski - A2\nNiemiecki - C1\nAngielski - B2",
        flowRole: "content", flowLane: "sidebar", autoHeight: true,
        left: 34, top: 428, width: 152, height: 40, fontSize: 8.3, lineHeight: 12, page: 1 },
    ];
    const next = transferSectionLane(source, "sb-lang-head", PAGE_HEIGHT, SPACING);
    assert.ok(next);
    assert.equal(
      listDocumentSections(next, PAGE_HEIGHT).some((section) => section.headingId === "sb-lang-head"),
      true,
    );
    const cells = next.filter((element) => (
      element.flowRole === "grid-member" && String(element.content || "").includes("—")
    ));
    assert.equal(cells.length, 3);
    assert.ok(cells.every((cell) => !cell.flowLane));
    assert.ok(cells.every((cell) => cell.preserveInitialLayout === false));
    assert.ok(cells[0].runs?.some((run) => run.color === "#4A6FA5" && run.italic));
    assert.ok((Number(cells[0].width) || 0) < 120);
    assert.ok(cells[1].left > cells[0].left);
    const langHead = next.find((element) => element.element_id === "sb-lang-head");
    assert.equal(Number(langHead.fontSize), 10, "main heading size from Experience sample");
    assert.ok(cells.every((cell) => Number(cell.fontSize) === 9));
  });

  it("refuses to move Experience onto the rail", () => {
    const source = sterlingLikeFixture();
    assert.equal(transferSectionLane(source, "m-exp-head", PAGE_HEIGHT, SPACING), null);
  });

  // Regression: a transferred section used to park its rule at
  // `headingHeight + 2` (main) / `headingHeight - 1` (rail) instead of the
  // destination lane's sampled offset, so the moved section's heading->rule gap
  // differed from every other section in that lane.
  function headingToRuleGaps(elements, lane) {
    const abs = (element) => ((Number(element.page) || 1) - 1) * PAGE_HEIGHT + (Number(element.top) || 0);
    const height = (element) => Number(element.height) || 0;
    const sections = lane === "sidebar"
      ? listSidebarSections(elements, PAGE_HEIGHT)
      : listDocumentSections(elements, PAGE_HEIGHT);
    return sections.map((section) => {
      const ids = lane === "sidebar"
        ? sidebarSectionElementIds(elements, section.headingId, PAGE_HEIGHT)
        : sectionElementIds(elements, section.headingId, PAGE_HEIGHT);
      const members = elements.filter((element) => ids.has(element.element_id));
      const head = members.find((element) => element.element_id === section.headingId);
      const rule = members
        .filter((element) => element.category === "line" && height(element) <= 4)
        .sort((a, b) => abs(a) - abs(b))[0];
      return rule ? Number((abs(rule) - abs(head)).toFixed(2)) : null;
    });
  }

  it("keeps one heading->rule gap for every main section after a sidebar->main transfer", () => {
    const next = transferSectionLane(sterlingLikeFixture(), "sb-sk-head", PAGE_HEIGHT, SPACING);
    assert.ok(next);
    const gaps = headingToRuleGaps(next, "main").filter((gap) => gap != null);
    assert.ok(gaps.length >= 3, `expected >=3 main sections, got ${gaps.length}`);
    assert.equal(new Set(gaps).size, 1, `main heading->rule gaps must all match, got ${gaps}`);
  });

  it("keeps one heading->rule gap for every rail section after a main->sidebar transfer", () => {
    const next = transferSectionLane(sterlingLikeFixture(), "m-edu-head", PAGE_HEIGHT, SPACING);
    assert.ok(next);
    const gaps = headingToRuleGaps(next, "sidebar").filter((gap) => gap != null);
    assert.ok(gaps.length >= 3, `expected >=3 rail sections, got ${gaps.length}`);
    assert.equal(new Set(gaps).size, 1, `rail heading->rule gaps must all match, got ${gaps}`);
  });
});

describe("moveSidebarSectionsToMain", () => {
  it("recomputes wrapped height at main width instead of copying the rail box", () => {
    const source = sterlingLikeFixture();
    const before = source.find((element) => element.element_id === "sb-sum-body");
    const next = moveSidebarSectionsToMain(source, ["sb-sum-head"], PAGE_HEIGHT, SPACING);
    assert.ok(next);
    const after = next.find((element) => element.element_id === "sb-sum-body");
    assert.notEqual(Number(after.width), Number(before.width));
    assert.ok((Number(after.width) || 0) > (Number(before.width) || 0));
  });
});

describe("section-rule gap stays consistent after transfer (Tessera icon cluster)", () => {
  // Tessera-style geometry: main sections have a 20px tile + rect + icon + a
  // wide underline; sidebar sections have an 18px tile cluster + a short coral
  // keyline. A transferred section used to keep a different heading→rule gap
  // than its neighbours because it routed through a different compactChromeCluster
  // branch during packing (the wide-rule + tall-tile pair triggers a Monument
  // accent-rule flatten on authored sections but not on freshly rebuilt ones).
  const tesseraFixture = () => {
    const sb = (id, top, name, title) => ([
      { element_id: `${id}-tile`, category: "line", flowRole: "sidebar-chrome", flowLane: "sidebar", left: 34, top: top - 2, width: 18, height: 18, backgroundColor: "#FFF", page: 1 },
      { element_id: `${id}-rect`, category: "rectangle", flowRole: "sidebar-chrome", flowLane: "sidebar", left: 36, top, width: 18, height: 18, borderWidth: 0.8, filled: false, backgroundColor: "#E15D4F", page: 1 },
      { element_id: `${id}-icon`, category: "image", flowRole: "sidebar-chrome", flowLane: "sidebar", left: 38, top: top + 2, width: 12, height: 12, src: `/template-assets/iconic/tessera/${name}.png`, alignWithText: false, page: 1 },
      { element_id: `${id}-head`, category: "text", content: title, flowRole: "sidebar-chrome", flowLane: "sidebar", left: 60, top: top + 3, fontSize: 7.6, height: 12, page: 1, bold: true },
      { element_id: `${id}-rule`, category: "line", flowRole: "sidebar-chrome", flowLane: "sidebar", left: 60, top: top + 16, width: 50, height: 1, backgroundColor: "#E15D4F", page: 1 },
      { element_id: `${id}-body`, category: "textarea", content: "A\nB", flowRole: "content", flowLane: "sidebar", autoHeight: true, bulletList: true, left: 34, top: top + 28, width: 152, height: 30, fontSize: 6.6, lineHeight: 9, page: 1 },
    ]);
    const mn = (id, top, name, title) => ([
      { element_id: `${id}-tile`, category: "line", flowRole: "section-chrome", left: 218, top: top - 2, width: 20, height: 20, backgroundColor: "#F7E9DF", page: 1 },
      { element_id: `${id}-rect`, category: "rectangle", flowRole: "section-chrome", left: 220, top, width: 20, height: 20, borderWidth: 0.8, filled: false, backgroundColor: "#E15D4F", page: 1 },
      { element_id: `${id}-icon`, category: "image", flowRole: "section-chrome", left: 224, top: top + 4, width: 12, height: 12, src: `/template-assets/iconic/tessera/${name}.png`, alignWithText: false, page: 1 },
      { element_id: `${id}-head`, category: "text", content: title, flowRole: "section-chrome", left: 248, top: top + 3, fontSize: 8.1, height: 14, page: 1, bold: true },
      { element_id: `${id}-rule`, category: "line", flowRole: "section-chrome", left: 248, top: top + 21, width: 299, height: 1, backgroundColor: "#D8C5C7", page: 1 },
      { element_id: `${id}-body`, category: "textarea", content: "Body copy.", flowRole: "content", autoHeight: true, left: 218, top: top + 30, width: 329, height: 40, fontSize: 9, lineHeight: 13, page: 1 },
    ]);
    return [
      ...sb("sb-edu", 200, "education", "WYKSZTAŁCENIE"),
      ...sb("sb-sk", 300, "skills", "UMIEJĘTNOŚCI"),
      ...mn("m-exp", 190, "experience", "DOŚWIADCZENIE"),
      ...mn("m-sum", 300, "summary", "PODSUMOWANIE"),
    ];
  };

  const headingRuleGap = (list, headingId) => {
    const head = list.find((element) => element.element_id === headingId);
    const thinLines = list.filter((element) => (
      element.category === "line" && (Number(element.height) || 0) <= 4
      && Math.abs((Number(element.top) || 0) - head.top) < 40
      && Math.abs((Number(element.left) || 0) - head.left) < 40
    ));
    const rule = thinLines.reduce((widest, element) => (
      (Number(element.width) || 0) > (Number(widest.width) || 0) ? element : widest
    ), thinLines[0]);
    return rule ? Number((rule.top - head.top).toFixed(1)) : null;
  };

  it("keeps a section transferred to the sidebar at the same rule gap as its rail neighbours", () => {
    const next = transferSectionLane(tesseraFixture(), "m-sum-head", PAGE_HEIGHT, SPACING);
    const moved = next.find((element) => element.content === "PODSUMOWANIE");
    const sibling = headingRuleGap(next, "sb-edu-head");
    assert.equal(headingRuleGap(next, moved.element_id), sibling,
      "moved section's underline must match the sidebar majority gap");
  });

  it("keeps a section transferred to the main column at the same rule gap as its main neighbours", () => {
    const next = transferSectionLane(tesseraFixture(), "sb-edu-head", PAGE_HEIGHT, SPACING);
    const moved = next.find((element) => element.content === "WYKSZTAŁCENIE");
    const sibling = headingRuleGap(next, "m-exp-head");
    assert.equal(headingRuleGap(next, moved.element_id), sibling,
      "moved section's underline must match the main-column majority gap");
  });
});

describe("icon chrome rebuilt on transfer (Tessera/Slate-style templates)", () => {
  it("gives a sidebar section its own icon glyph after moving to main, not the sampled sibling's", () => {
    const next = moveSidebarSectionsToMain(
      iconicSidebarFixture(), ["sb-sk-head"], PAGE_HEIGHT, SPACING,
    );
    assert.ok(next);
    const headingId = "sb-sk-head";
    const icon = next.find((element) => (
      element.category === "image" && element.flowRole === "section-chrome"
      && Math.abs((Number(element.top) || 0) - (Number(next.find((e) => e.element_id === headingId).top) || 0)) < 30
    ));
    assert.ok(icon, "expected a new section-chrome icon marker near the moved heading");
    assert.match(icon.src, /\/skills\.png$/, `expected the Skills icon, got ${icon.src}`);
    // The rebuilt cluster (tile + rect + icon) must not still be tagged sidebar.
    assert.notEqual(icon.flowLane, "sidebar");
  });

  it("gives a main section its own icon glyph after moving to sidebar, not the sampled sibling's", () => {
    const next = transferSectionLane(
      iconicSidebarFixture(), "m-edu-head", PAGE_HEIGHT, SPACING,
    );
    assert.ok(next);
    const headingId = "m-edu-head";
    const movedHeading = next.find((e) => e.element_id === headingId);
    const icon = next.find((element) => (
      element.category === "image" && element.flowRole === "sidebar-chrome"
      && Math.abs((Number(element.top) || 0) - (Number(movedHeading.top) || 0)) < 30
    ));
    assert.ok(icon, "expected a new sidebar-chrome icon marker near the moved heading");
    assert.match(icon.src, /\/education\.png$/, `expected the Education icon, got ${icon.src}`);
    assert.equal(icon.flowLane, "sidebar");
  });

  it("does not add icon markers for non-icon templates (Sterling-style fixture)", () => {
    const next = moveSidebarSectionsToMain(
      sterlingLikeFixture(), ["sb-sk-head"], PAGE_HEIGHT, SPACING,
    );
    assert.ok(next);
    const hasImageMarker = next.some((element) => element.category === "image");
    assert.equal(hasImageMarker, false);
  });

  it("preserves an explicit alignWithText:false on the rebuilt icon so it is not optically shifted out of its box", () => {
    // Regression: the fixture's sidebar/main icons are geometrically placed
    // (alignWithText:false — matches Tessera `sidebar_icon` / Slate `fixed_icon`).
    // `decorativeShapeElement` used to copy only a truthy flag, dropping the
    // explicit `false` to `undefined`; `isTextAlignedIcon` then fell back to its
    // iconic-src heuristic, treated the glyph as text-aligned, and shifted it ~half
    // its height up — the transferred section's icon "fell apart" from its tile.
    // Both directions rebuild the icon and must keep the flag verbatim.
    const toMain = moveSidebarSectionsToMain(
      iconicSidebarFixture(), ["sb-sk-head"], PAGE_HEIGHT, SPACING,
    );
    const mainIcon = toMain.find((element) => (
      element.category === "image" && /\/skills\.png$/.test(String(element.src || ""))
    ));
    assert.ok(mainIcon, "expected a rebuilt skills icon after moving to main");
    assert.strictEqual(
      mainIcon.alignWithText, false,
      `rebuilt icon must keep alignWithText:false, got ${mainIcon.alignWithText}`,
    );

    const toSidebar = transferSectionLane(
      iconicSidebarFixture(), "m-edu-head", PAGE_HEIGHT, SPACING,
    );
    const sidebarIcon = toSidebar.find((element) => (
      element.category === "image" && /\/education\.png$/.test(String(element.src || ""))
    ));
    assert.ok(sidebarIcon, "expected a rebuilt education icon after moving to sidebar");
    assert.strictEqual(
      sidebarIcon.alignWithText, false,
      `rebuilt icon must keep alignWithText:false, got ${sidebarIcon.alignWithText}`,
    );
  });
});
