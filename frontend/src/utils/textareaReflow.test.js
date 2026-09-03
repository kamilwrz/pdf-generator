import test from "node:test";
import assert from "node:assert/strict";
import { iconicDrawTop } from "./iconAlignment.js";
import { reflowTextareaHeight } from "./textareaReflow.js";

const textarea = (overrides = {}) => ({
  element_id: "textarea",
  category: "textarea",
  autoHeight: true,
  left: 40,
  top: 100,
  width: 180,
  height: 20,
  page: 1,
  ...overrides,
});

test("preserves the established Iconic cap offset outside Harbor", () => {
  assert.equal(iconicDrawTop(100, 11), 95.5);
});

test("reflows elements below the resized textarea in its horizontal lane", () => {
  const result = reflowTextareaHeight([
    textarea(),
    { element_id: "rule", category: "line", left: 40, top: 132, width: 180, height: 2, page: 1 },
    { element_id: "next", category: "text", left: 40, top: 144, width: 180, fontSize: 12, page: 1 },
    { element_id: "other-column", category: "text", left: 280, top: 144, width: 180, fontSize: 12, page: 1 },
  ], "textarea", 44, 842);

  assert.equal(result.changed, true);
  assert.equal(result.elements.find((element) => element.element_id === "textarea").height, 44);
  assert.equal(result.elements.find((element) => element.element_id === "rule").top, 156);
  assert.equal(result.elements.find((element) => element.element_id === "next").top, 168);
  assert.equal(result.elements.find((element) => element.element_id === "other-column").top, 144);
});

test("shrinking content preserves gaps while pulling only following lane elements upward", () => {
  const result = reflowTextareaHeight([
    textarea({ height: 48 }),
    { element_id: "next", category: "text", left: 40, top: 164, width: 180, fontSize: 12, page: 1 },
    { element_id: "connector", category: "connector", source_id: "textarea", target_id: "next", page: 1 },
  ], "textarea", 24, 842);

  assert.equal(result.elements.find((element) => element.element_id === "next").top, 140);
  assert.equal(result.elements.find((element) => element.element_id === "connector").top, undefined);
});

test("collapses an intentionally cleared AI textarea and reclaims its gap", () => {
  const result = reflowTextareaHeight([
    textarea({ content: "", height: 48 }),
    { element_id: "next", category: "text", left: 40, top: 164, width: 180, fontSize: 12, page: 1 },
  ], "textarea", 0, 842);

  assert.equal(result.changed, true);
  assert.equal(result.elements.find((element) => element.element_id === "textarea").height, 0);
  assert.equal(result.elements.find((element) => element.element_id === "next").top, 116);
});

test("shrinking page-one content reclaims the page-break hole for following blocks", () => {
  const result = reflowTextareaHeight([
    textarea({ top: 620, height: 80 }),
    { element_id: "page-two-heading", category: "text", left: 40, top: 66, width: 180, fontSize: 12, page: 2 },
    { element_id: "page-two-body", category: "textarea", left: 40, top: 90, width: 180, height: 20, page: 2 },
  ], "textarea", 40, 842, { pageTop: 66, bottomMargin: 72 });

  const heading = result.elements.find((element) => element.element_id === "page-two-heading");
  const body = result.elements.find((element) => element.element_id === "page-two-body");
  // 660 + SPACE_SECTION (21) → heading; preserve the original same-page gap to body.
  // Using the page-top inset (0) or SPACE_RECORD (10) crushed education headings.
  assert.deepEqual({ page: heading.page, top: heading.top }, { page: 1, top: 681 });
  assert.equal(body.page, 1);
  assert.ok(body.top + body.height <= 770);
  assert.equal(result.pageCount, 1);
});

test("pulls a keep-together experience record back when its body shrinks on page 2", () => {
  // Generators park job 4 on page 2 when ReportLab overshoots earlier bullets.
  // After the parked record's own body shrinks, the whole flowGroup must return
  // to page 1 into the freed band — not stay under a large empty gap.
  const result = reflowTextareaHeight([
    {
      element_id: "job3-bullets",
      category: "textarea",
      autoHeight: true,
      flowGroup: "record-job3",
      flowRole: "content",
      left: 220,
      top: 580,
      width: 326,
      height: 52,
      page: 1,
    },
    {
      element_id: "job4-title",
      category: "textarea",
      autoHeight: true,
      flowGroup: "record-job4",
      flowRole: "content",
      left: 220,
      top: 56,
      width: 326,
      height: 15,
      page: 2,
    },
    {
      element_id: "job4-meta",
      category: "textarea",
      autoHeight: true,
      flowGroup: "record-job4",
      flowRole: "content",
      left: 220,
      top: 75,
      width: 326,
      height: 12,
      page: 2,
    },
    {
      element_id: "job4-bullets",
      category: "textarea",
      autoHeight: true,
      flowGroup: "record-job4",
      flowRole: "content",
      left: 220,
      top: 91,
      width: 326,
      height: 93,
      page: 2,
    },
  ], "job4-bullets", 55, 842, { pageTop: 66, bottomMargin: 72 });

  const title = result.elements.find((element) => element.element_id === "job4-title");
  const meta = result.elements.find((element) => element.element_id === "job4-meta");
  const bullets = result.elements.find((element) => element.element_id === "job4-bullets");
  assert.equal(title.page, 1);
  assert.equal(meta.page, 1);
  assert.equal(bullets.page, 1);
  assert.equal(bullets.height, 55);
  assert.ok(title.top >= 580 + 52 + 10 - 0.5);
  assert.ok(bullets.top + bullets.height <= 770);
});

test("Harbor right-column rules do not block main-column record reclaim", () => {
  // Harbor's gutter is 28px (main ends at x=336, sidebar starts at x=364).
  // A generic 32px decoration tolerance previously classified the sidebar
  // rule as main-lane content and left job 4 stranded on an almost empty page 2.
  const result = reflowTextareaHeight([
    {
      element_id: "job3-bullets",
      category: "textarea",
      autoHeight: true,
      flowGroup: "record-job3",
      flowRole: "content",
      left: 44,
      top: 500,
      width: 292,
      height: 52,
      page: 1,
    },
    {
      element_id: "sidebar-rule",
      category: "line",
      flowRole: "section-chrome",
      left: 364,
      top: 700,
      width: 187,
      height: 1,
      page: 1,
    },
    {
      element_id: "job4-title",
      category: "textarea",
      autoHeight: true,
      flowGroup: "record-job4",
      flowRole: "content",
      left: 44,
      top: 66,
      width: 292,
      height: 15,
      page: 2,
    },
    {
      element_id: "job4-meta",
      category: "textarea",
      autoHeight: true,
      flowGroup: "record-job4",
      flowRole: "content",
      left: 44,
      top: 85,
      width: 142,
      height: 12,
      page: 2,
    },
    {
      element_id: "job4-calendar",
      category: "image",
      flowGroup: "record-job4",
      flowRole: "record-overlay",
      alignWithText: false,
      left: 210,
      top: 86.5,
      width: 9,
      height: 9,
      page: 2,
    },
    {
      element_id: "job4-period",
      category: "textarea",
      autoHeight: false,
      flowGroup: "record-job4",
      flowRole: "record-overlay",
      left: 223,
      top: 85,
      width: 48,
      height: 12,
      lineHeight: 12,
      page: 2,
    },
    {
      element_id: "job4-location",
      category: "image",
      flowGroup: "record-job4",
      flowRole: "content",
      alignWithText: true,
      left: 278,
      top: 85,
      width: 11,
      height: 11,
      page: 2,
    },
    {
      element_id: "job4-city",
      category: "text",
      flowGroup: "record-job4",
      left: 291,
      top: 85,
      width: 45,
      height: 9,
      page: 2,
    },
    {
      element_id: "job4-bullets",
      category: "textarea",
      autoHeight: true,
      flowGroup: "record-job4",
      flowRole: "content",
      left: 44,
      top: 101,
      width: 292,
      height: 55,
      page: 2,
    },
  ], "job4-bullets", 55, 842, { pageTop: 66, bottomMargin: 72 });

  const title = result.elements.find((element) => element.element_id === "job4-title");
  const meta = result.elements.find((element) => element.element_id === "job4-meta");
  const bullets = result.elements.find((element) => element.element_id === "job4-bullets");
  const calendar = result.elements.find((element) => element.element_id === "job4-calendar");
  const period = result.elements.find((element) => element.element_id === "job4-period");
  const location = result.elements.find((element) => element.element_id === "job4-location");
  const city = result.elements.find((element) => element.element_id === "job4-city");
  const sidebarRule = result.elements.find((element) => element.element_id === "sidebar-rule");
  assert.equal(title.page, 1);
  assert.equal(bullets.page, 1);
  assert.ok(bullets.top + bullets.height <= 770);
  assert.deepEqual(
    { page: calendar.page, top: calendar.top },
    { page: meta.page, top: meta.top + 1.5 },
  );
  assert.deepEqual(
    { page: period.page, top: period.top },
    { page: meta.page, top: meta.top },
  );
  assert.deepEqual(
    [location, city].map((overlay) => ({ page: overlay.page, top: overlay.top })),
    Array(2).fill({ page: meta.page, top: meta.top }),
  );
  assert.deepEqual(
    { page: sidebarRule.page, top: sidebarRule.top },
    { page: 1, top: 700 },
  );
});

test("does not reclaim a page-2 section when chrome plus grown body do not fit", () => {
  // A newly added section is packed onto page 2 because heading+rule+body do
  // not fit under the last page-1 job. Growing the body with empty lines must
  // not pull it back: reclaim used to measure body-only height (and SPACE_RECORD
  // instead of SPACE_SECTION), so a medium grow still "fit" the footer hole.
  const result = reflowTextareaHeight([
    {
      element_id: "job",
      category: "textarea",
      autoHeight: true,
      flowRole: "content",
      left: 76,
      top: 640,
      width: 460,
      height: 40,
      page: 1,
    },
    {
      element_id: "new-heading",
      category: "text",
      content: "Nowa sekcja",
      flowRole: "section-chrome",
      left: 76,
      top: 66,
      width: 200,
      fontSize: 10,
      height: 12,
      page: 2,
    },
    {
      element_id: "new-rule",
      category: "line",
      flowRole: "section-chrome",
      left: 76,
      top: 80,
      width: 460,
      height: 1,
      page: 2,
    },
    {
      element_id: "new-body",
      category: "textarea",
      autoHeight: true,
      flowRole: "content",
      left: 76,
      top: 96,
      width: 460,
      height: 40,
      page: 2,
    },
  ], "new-body", 50, 842, { pageTop: 66, bottomMargin: 72 });

  const heading = result.elements.find((element) => element.element_id === "new-heading");
  const rule = result.elements.find((element) => element.element_id === "new-rule");
  const body = result.elements.find((element) => element.element_id === "new-body");
  assert.equal(heading.page, 2);
  assert.equal(rule.page, 2);
  assert.equal(body.page, 2);
  assert.equal(body.height, 50);
});

test("locked section-chrome rules reflow with their heading across a reclaimed page break", () => {
  // Decorative rules stay locked so users cannot drag them.
  // Reflow must still move those rules with the heading — otherwise
  // WYKSZTAŁCENIE lands on page 1 without its underline.
  const result = reflowTextareaHeight([
    textarea({ top: 600, height: 100 }),
    {
      element_id: "edu-heading",
      category: "text",
      content: "WYKSZTAŁCENIE",
      flowRole: "section-chrome",
      left: 76,
      top: 72,
      width: 180,
      fontSize: 8.5,
      page: 2,
    },
    {
      element_id: "edu-rule",
      category: "line",
      flowRole: "section-chrome",
      locked: true,
      left: 76,
      top: 83.5,
      width: 400,
      height: 1,
      page: 2,
    },
    {
      element_id: "edu-body",
      category: "textarea",
      left: 76,
      top: 100,
      width: 400,
      height: 20,
      page: 2,
    },
  ], "textarea", 40, 842, { pageTop: 66, bottomMargin: 72 });

  const heading = result.elements.find((element) => element.element_id === "edu-heading");
  const rule = result.elements.find((element) => element.element_id === "edu-rule");
  const body = result.elements.find((element) => element.element_id === "edu-body");
  assert.equal(heading.page, 1);
  assert.equal(heading.top, 640 + 21); // shrunk bottom 640 + SPACE_SECTION
  assert.equal(rule.page, 1);
  // Authored rule sat 11.5 px below the heading — keep that rhythm.
  assert.equal(rule.top, heading.top + 11.5);
  assert.equal(body.page, 1);
  assert.ok(body.top > rule.top);
});

test("cross-page pack does not use the tiny page-top inset for section chrome", () => {
  // Education often starts at y=72 on page 2 while canvas pageTop is 66.
  // min(DEFAULT_PACK_GAP, 72-66) used to yield 6 px → ~5 px on ink guides.
  const result = reflowTextareaHeight([
    textarea({ top: 620, height: 80 }),
    {
      element_id: "edu-heading",
      category: "text",
      content: "WYKSZTAŁCENIE",
      flowRole: "section-chrome",
      left: 76,
      top: 72,
      width: 180,
      fontSize: 8.5,
      page: 2,
    },
  ], "textarea", 40, 842, { pageTop: 66, bottomMargin: 72 });

  const heading = result.elements.find((element) => element.element_id === "edu-heading");
  assert.deepEqual({ page: heading.page, top: heading.top }, { page: 1, top: 681 });
});

test("overflowed blocks land on continuation inset, not page top 0", () => {
  const result = reflowTextareaHeight([
    textarea({ top: 700, height: 20 }),
    { element_id: "next", category: "textarea", left: 40, top: 730, width: 180, height: 100, page: 1 },
  ], "textarea", 40, 842, { pageTop: 66, bottomMargin: 72 });

  const next = result.elements.find((element) => element.element_id === "next");
  assert.equal(next.page, 2);
  assert.equal(next.top, 66);
});

test("same-page reflow keeps nearby section decorations aligned with content", () => {
  const result = reflowTextareaHeight([
    textarea({ height: 48 }),
    { element_id: "rail", category: "line", left: 12, top: 154, width: 2, height: 200, page: 1 },
    { element_id: "marker", category: "rectangle", left: 18, top: 164, width: 16, height: 16, page: 1 },
    { element_id: "next-heading", category: "text", left: 40, top: 164, width: 180, fontSize: 12, page: 1 },
  ], "textarea", 24, 842);

  assert.equal(result.elements.find((element) => element.element_id === "rail").top, 130);
  assert.equal(result.elements.find((element) => element.element_id === "marker").top, 140);
  assert.equal(result.elements.find((element) => element.element_id === "next-heading").top, 140);
});

test("keeps an Iconic section icon grouped with its heading during reflow", () => {
  const result = reflowTextareaHeight([
    textarea({ left: 66, top: 200, width: 481, height: 44 }),
    {
      element_id: "section-icon",
      category: "image",
      src: "http://localhost:8000/template-assets/iconic/nova/experience.png",
      alignWithText: true,
      left: 48,
      top: 269,
      width: 11,
      height: 11,
      page: 1,
    },
    {
      element_id: "section-heading",
      category: "text",
      content: "DOŚWIADCZENIE ZAWODOWE",
      left: 66,
      top: 269,
      fontSize: 8.6,
      page: 1,
    },
    {
      element_id: "section-rule",
      category: "line",
      left: 66,
      top: 286,
      width: 481,
      height: 1,
      page: 1,
    },
  ], "textarea", 60, 842);

  const icon = result.elements.find((element) => element.element_id === "section-icon");
  const heading = result.elements.find((element) => element.element_id === "section-heading");
  const rule = result.elements.find((element) => element.element_id === "section-rule");

  assert.equal(icon.top, 285);
  assert.equal(heading.top, 285);
  assert.equal(rule.top, 302);
  assert.equal(icon.page, heading.page);
});

test("keeps a left-hanging section icon in the main text lane", () => {
  // Icon sits ~48px left of the text column (within TEXT_ALIGNED_IMAGE_LANE_TOLERANCE).
  const result = reflowTextareaHeight([
    textarea({ left: 56, top: 222, width: 483, height: 42 }),
    {
      element_id: "rail-icon",
      category: "image",
      src: "/template-assets/iconic/nova/experience.png",
      alignWithText: true,
      left: 8,
      top: 290,
      width: 12,
      height: 12,
      page: 1,
    },
    {
      element_id: "section-heading",
      category: "text",
      left: 56,
      top: 290,
      fontSize: 8.5,
      page: 1,
    },
  ], "textarea", 58, 842);

  const icon = result.elements.find((element) => element.element_id === "rail-icon");
  const heading = result.elements.find((element) => element.element_id === "section-heading");
  assert.equal(icon.top, 306);
  assert.equal(heading.top, 306);
});

test("keeps a Monument ordinal badge with its square when chrome jumps to page 2", () => {
  // The "04" digits sit at x=74 inside a 32px square at x=66, while the body
  // column starts at x=102. That text neither overlaps the textarea nor counts
  // as a line/rect decoration, so reflow used to move the square and title to
  // page 2 and leave the number behind (or 8px too low after a later clamp).
  const result = reflowTextareaHeight([
    {
      element_id: "job",
      category: "textarea",
      autoHeight: true,
      flowRole: "content",
      left: 102,
      top: 600,
      width: 427,
      height: 50,
      page: 1,
    },
    {
      element_id: "sq4",
      category: "line",
      flowRole: "section-chrome",
      left: 66,
      top: 670,
      width: 32,
      height: 32,
      page: 1,
    },
    {
      element_id: "num4",
      category: "text",
      flowRole: "section-chrome",
      isDecorativeChromeText: true,
      content: "04",
      left: 74,
      top: 678,
      fontSize: 11,
      page: 1,
    },
    {
      element_id: "frame4",
      category: "rectangle",
      flowRole: "section-chrome",
      left: 106,
      top: 670,
      width: 251,
      height: 32,
      page: 1,
    },
    {
      element_id: "h4",
      category: "text",
      flowRole: "section-chrome",
      content: "AWARDS",
      left: 118,
      top: 678,
      fontSize: 12.5,
      page: 1,
    },
    {
      element_id: "b4",
      category: "textarea",
      autoHeight: true,
      flowRole: "content",
      left: 102,
      top: 714,
      width: 427,
      height: 40,
      page: 1,
    },
  ], "job", 160, 842, { pageTop: 66, bottomMargin: 72 });

  const square = result.elements.find((element) => element.element_id === "sq4");
  const ordinal = result.elements.find((element) => element.element_id === "num4");
  const title = result.elements.find((element) => element.element_id === "h4");
  assert.equal(square.page, 2);
  assert.equal(ordinal.page, 2);
  assert.equal(title.page, 2);
  assert.equal(+(ordinal.top - square.top).toFixed(2), 8);
  assert.equal(ordinal.top, title.top);
});

test("keeps a Monument ordinal aligned after a continuation-page clamp", () => {
  // Generator page-2 chrome starts at continuation_top 72; canvas packing uses
  // pageTop 66. Growing an earlier body must move the digits with the square,
  // not leave them at the authored 80 while the square clamps to 66.
  const result = reflowTextareaHeight([
    {
      element_id: "job",
      category: "textarea",
      autoHeight: true,
      flowRole: "content",
      left: 102,
      top: 600,
      width: 427,
      height: 140,
      page: 1,
    },
    {
      element_id: "sq4",
      category: "line",
      flowRole: "section-chrome",
      left: 66,
      top: 72,
      width: 32,
      height: 32,
      page: 2,
    },
    {
      element_id: "num4",
      category: "text",
      flowRole: "section-chrome",
      isDecorativeChromeText: true,
      content: "04",
      left: 74,
      top: 80,
      fontSize: 11,
      page: 2,
    },
    {
      element_id: "h4",
      category: "text",
      flowRole: "section-chrome",
      content: "AWARDS",
      left: 118,
      top: 80,
      fontSize: 12.5,
      page: 2,
    },
    {
      element_id: "b4",
      category: "textarea",
      autoHeight: true,
      flowRole: "content",
      left: 102,
      top: 116,
      width: 427,
      height: 40,
      page: 2,
    },
  ], "job", 155, 842, { pageTop: 66, bottomMargin: 72 });

  const square = result.elements.find((element) => element.element_id === "sq4");
  const ordinal = result.elements.find((element) => element.element_id === "num4");
  const title = result.elements.find((element) => element.element_id === "h4");
  assert.equal(square.page, 2);
  assert.equal(ordinal.page, 2);
  assert.equal(+(ordinal.top - square.top).toFixed(2), 8);
  assert.equal(ordinal.top, title.top);
});

test("sidebar reflow does not drag main-column section icons", () => {
  // Narrow sidebar ends at x=156; main icons sit at x=204 (gap 48). Those icons
  // sit below the sidebar skills block, so a naive lane check previously moved
  // them while leaving the main headings behind.
  const result = reflowTextareaHeight([
    {
      element_id: "sidebar-skills",
      category: "textarea",
      autoHeight: true,
      left: 24,
      top: 274,
      width: 132,
      height: 40,
      page: 1,
    },
    {
      element_id: "main-icon",
      category: "image",
      src: "/template-assets/iconic/nova/education.png",
      alignWithText: true,
      left: 204,
      top: 401,
      width: 11,
      height: 11,
      page: 1,
    },
    {
      element_id: "main-heading",
      category: "text",
      content: "WYKSZTAŁCENIE",
      left: 222,
      top: 401,
      fontSize: 8.4,
      page: 1,
    },
    {
      element_id: "main-body",
      category: "textarea",
      left: 222,
      top: 436,
      width: 325,
      height: 40,
      page: 1,
    },
  ], "sidebar-skills", 90, 842);

  const icon = result.elements.find((element) => element.element_id === "main-icon");
  const heading = result.elements.find((element) => element.element_id === "main-heading");
  const body = result.elements.find((element) => element.element_id === "main-body");

  assert.equal(icon.top, 401);
  assert.equal(heading.top, 401);
  assert.equal(body.top, 436);
});

test("main-column reflow keeps section icon with its heading", () => {
  const result = reflowTextareaHeight([
    {
      element_id: "summary",
      category: "textarea",
      autoHeight: true,
      left: 222,
      top: 80,
      width: 325,
      height: 30,
      page: 1,
    },
    {
      element_id: "main-icon",
      category: "image",
      src: "/template-assets/iconic/nova/experience.png",
      alignWithText: true,
      left: 204,
      top: 153,
      width: 11,
      height: 11,
      page: 1,
    },
    {
      element_id: "main-heading",
      category: "text",
      content: "DOŚWIADCZENIE ZAWODOWE",
      left: 222,
      top: 153,
      fontSize: 8.4,
      page: 1,
    },
    {
      element_id: "main-rule",
      category: "line",
      left: 222,
      top: 170,
      width: 325,
      height: 1,
      page: 1,
    },
  ], "summary", 60, 842);

  const icon = result.elements.find((element) => element.element_id === "main-icon");
  const heading = result.elements.find((element) => element.element_id === "main-heading");
  const rule = result.elements.find((element) => element.element_id === "main-rule");

  assert.equal(icon.top, 183);
  assert.equal(heading.top, 183);
  assert.equal(rule.top, 200);
});

test("moves a reflowed element onto the next page when it no longer fits", () => {
  const result = reflowTextareaHeight([
    textarea({ top: 700 }),
    { element_id: "footer", category: "line", left: 40, top: 760, width: 180, height: 50, page: 1 },
  ], "textarea", 60, 842);

  const footer = result.elements.find((element) => element.element_id === "footer");
  assert.deepEqual({ page: footer.page, top: footer.top }, { page: 2, top: 0 });
  assert.equal(result.pageCount, 2);
});

test("moves a textarea itself to the next page before its new height overflows", () => {
  const result = reflowTextareaHeight([
    textarea({ top: 800 }),
    { element_id: "next", category: "text", left: 40, top: 830, width: 180, fontSize: 12, page: 1 },
  ], "textarea", 100, 842);

  const target = result.elements.find((element) => element.element_id === "textarea");
  const next = result.elements.find((element) => element.element_id === "next");
  assert.deepEqual({ page: target.page, top: target.top }, { page: 2, top: 0 });
  assert.deepEqual({ page: next.page, top: next.top }, { page: 2, top: 110 });
});

test("reclaim packing keeps a flowGroup education record whole", () => {
  // Backend keep_together placed the education record on page 2. Shrinking an
  // earlier page-1 box reclaims the footer hole — without flowGroup awareness
  // the degree/meta returned to page 1 while the description stayed on page 2.
  // A tall description ensures chrome+record cannot fit under the shrunk box.
  const result = reflowTextareaHeight([
    textarea({ element_id: "summary", top: 600, height: 120 }),
    {
      element_id: "edu-heading",
      category: "text",
      content: "WYKSZTAŁCENIE",
      flowRole: "section-chrome",
      left: 76,
      top: 66,
      width: 400,
      fontSize: 8.6,
      page: 2,
    },
    {
      element_id: "edu-degree",
      category: "textarea",
      content: "Bachelor of Laws (LL.B.)",
      flowGroup: "record-edu-1",
      autoHeight: true,
      left: 76,
      top: 90,
      width: 400,
      height: 13,
      page: 2,
    },
    {
      element_id: "edu-meta",
      category: "textarea",
      content: "EU Viadrina · 2014 – 2018",
      flowGroup: "record-edu-1",
      autoHeight: true,
      left: 76,
      top: 107,
      width: 400,
      height: 12,
      page: 2,
    },
    {
      element_id: "edu-desc",
      category: "textarea",
      content: "Uzyskanie tytułu Bachelor of Laws z zakresu prawa niemieckiego.",
      flowGroup: "record-edu-1",
      autoHeight: true,
      left: 76,
      top: 123,
      width: 400,
      height: 80,
      page: 2,
    },
  ], "summary", 40, 842, { pageTop: 66, bottomMargin: 72 });

  const heading = result.elements.find((element) => element.element_id === "edu-heading");
  const degree = result.elements.find((element) => element.element_id === "edu-degree");
  const meta = result.elements.find((element) => element.element_id === "edu-meta");
  const desc = result.elements.find((element) => element.element_id === "edu-desc");
  assert.equal(degree.page, meta.page);
  assert.equal(degree.page, desc.page);
  assert.equal(heading.page, degree.page);
  assert.equal(degree.page, 2);
  assert.ok(desc.top > meta.top);
  assert.ok(meta.top > degree.top);
});

test("section-chip chrome on the degree line does not split a flowGroup record", () => {
  // Regression: a template that places a section chip at the same Y as the
  // degree once made Y-sorted reflow treat school/meta as a new record, leaving
  // only "Bachelor…" on page 1 after reclaim.
  const result = reflowTextareaHeight([
    {
      element_id: "job-bullets",
      category: "textarea",
      autoHeight: true,
      left: 80,
      top: 500,
      width: 462,
      height: 120,
      page: 1,
    },
    {
      element_id: "edu-heading",
      category: "text",
      content: "WYKSZTAŁCENIE",
      flowRole: "section-chrome",
      left: 80,
      top: 66,
      width: 200,
      fontSize: 8.7,
      page: 2,
    },
    {
      element_id: "edu-rule",
      category: "line",
      flowRole: "section-chrome",
      left: 80,
      top: 78,
      width: 462,
      height: 1,
      page: 2,
    },
    {
      element_id: "edu-degree",
      category: "textarea",
      content: "Bachelor of Laws (LL.B.)",
      flowGroup: "record-edu-1",
      flowRole: "content",
      autoHeight: true,
      left: 80,
      top: 86,
      width: 462,
      height: 13,
      page: 2,
    },
    {
      element_id: "edu-chip",
      category: "rectangle",
      flowRole: "section-chrome",
      left: 45,
      top: 86.3,
      width: 16,
      height: 16,
      page: 2,
    },
    {
      element_id: "edu-school",
      category: "textarea",
      content: "European University Viadrina",
      flowGroup: "record-edu-1",
      flowRole: "content",
      autoHeight: true,
      left: 80,
      top: 103,
      width: 462,
      height: 13,
      page: 2,
    },
    {
      element_id: "edu-meta",
      category: "textarea",
      content: "Frankfurt (Oder)   ·   2014 – 2018",
      flowGroup: "record-edu-1",
      flowRole: "content",
      autoHeight: true,
      left: 80,
      top: 120,
      width: 462,
      height: 12,
      page: 2,
    },
    {
      element_id: "edu-desc",
      category: "textarea",
      content: "Uzyskanie tytułu Bachelor of Laws z zakresu prawa niemieckiego.",
      flowGroup: "record-edu-1",
      flowRole: "content",
      autoHeight: true,
      left: 80,
      top: 136,
      width: 462,
      height: 24,
      page: 2,
    },
  ], "job-bullets", 40, 842, { pageTop: 66, bottomMargin: 72 });

  const degree = result.elements.find((element) => element.element_id === "edu-degree");
  const school = result.elements.find((element) => element.element_id === "edu-school");
  const meta = result.elements.find((element) => element.element_id === "edu-meta");
  const desc = result.elements.find((element) => element.element_id === "edu-desc");
  const heading = result.elements.find((element) => element.element_id === "edu-heading");
  assert.equal(degree.page, school.page);
  assert.equal(degree.page, meta.page);
  assert.equal(degree.page, desc.page);
  assert.equal(heading.page, degree.page);
  assert.ok(school.top > degree.top);
  assert.ok(meta.top > school.top);
  assert.ok(desc.top > meta.top);
});

test("growing a record body moves title/meta siblings with the same flowGroup", () => {
  const result = reflowTextareaHeight([
    {
      element_id: "edu-degree",
      category: "textarea",
      content: "Bachelor of Laws (LL.B.)",
      flowGroup: "record-edu-1",
      autoHeight: true,
      left: 76,
      top: 700,
      width: 400,
      height: 13,
      page: 1,
    },
    {
      element_id: "edu-meta",
      category: "textarea",
      content: "EU Viadrina · 2014 – 2018",
      flowGroup: "record-edu-1",
      autoHeight: true,
      left: 76,
      top: 717,
      width: 400,
      height: 12,
      page: 1,
    },
    {
      element_id: "edu-desc",
      category: "textarea",
      content: "Uzyskanie tytułu Bachelor of Laws z zakresu prawa niemieckiego.",
      flowGroup: "record-edu-1",
      autoHeight: true,
      left: 76,
      top: 733,
      width: 400,
      height: 12,
      page: 1,
    },
  ], "edu-desc", 40, 842, { pageTop: 66, bottomMargin: 72 });

  const degree = result.elements.find((element) => element.element_id === "edu-degree");
  const meta = result.elements.find((element) => element.element_id === "edu-meta");
  const desc = result.elements.find((element) => element.element_id === "edu-desc");
  assert.equal(degree.page, 2);
  assert.equal(meta.page, 2);
  assert.equal(desc.page, 2);
  assert.ok(meta.top > degree.top);
  assert.ok(desc.top > meta.top);
});

test("freeform mode can disable reclaim packing", () => {
  const result = reflowTextareaHeight([
    {
      element_id: "job",
      category: "textarea",
      autoHeight: true,
      left: 40,
      top: 640,
      width: 200,
      height: 40,
      page: 1,
    },
    {
      element_id: "parked",
      category: "textarea",
      autoHeight: true,
      flowGroup: "record-x",
      flowRole: "content",
      left: 40,
      top: 66,
      width: 200,
      height: 80,
      page: 2,
    },
  ], "parked", 40, 842, { pageTop: 66, bottomMargin: 72, allowReclaim: false });

  const parked = result.elements.find((element) => element.element_id === "parked");
  assert.equal(parked.page, 2);
  assert.equal(parked.height, 40);
});

test("page-2 education survives sequential font-measurement grows", () => {
  // Canvas measures each textarea independently after load. Reclaim used to
  // reserve only the grown degree line, pull it onto page 1 under the last
  // experience job, and leave school/meta/body + WYKSZTAŁCENIE crushed on
  // page 2 (continuation inset at y=72).
  let elements = [
    {
      element_id: "job-last",
      category: "textarea",
      flowRole: "content",
      flowGroup: "record-job",
      autoHeight: true,
      left: 167,
      top: 640,
      width: 355,
      height: 80,
      page: 1,
    },
    {
      element_id: "edu-heading",
      category: "text",
      content: "WYKSZTAŁCENIE",
      flowRole: "section-chrome",
      left: 167,
      top: 72,
      width: 200,
      fontSize: 8.5,
      page: 2,
    },
    {
      element_id: "edu-marker",
      category: "circle",
      flowRole: "section-chrome",
      locked: true,
      left: 143,
      top: 74,
      width: 12,
      height: 12,
      page: 2,
    },
    {
      element_id: "edu-rule",
      category: "line",
      flowRole: "section-chrome",
      locked: true,
      left: 167,
      top: 83.5,
      width: 355,
      height: 1,
      page: 2,
    },
    {
      element_id: "edu1-degree",
      category: "textarea",
      flowRole: "content",
      flowGroup: "record-edu1",
      autoHeight: true,
      left: 167,
      top: 91.5,
      width: 355,
      height: 13,
      page: 2,
    },
    {
      element_id: "edu1-school",
      category: "textarea",
      flowRole: "content",
      flowGroup: "record-edu1",
      autoHeight: true,
      left: 167,
      top: 108.5,
      width: 355,
      height: 13,
      page: 2,
    },
    {
      element_id: "edu1-meta",
      category: "textarea",
      flowRole: "content",
      flowGroup: "record-edu1",
      autoHeight: true,
      left: 167,
      top: 125.5,
      width: 355,
      height: 12,
      page: 2,
    },
    {
      element_id: "edu1-body",
      category: "textarea",
      flowRole: "content",
      flowGroup: "record-edu1",
      autoHeight: true,
      left: 167,
      top: 141.5,
      width: 355,
      height: 12,
      page: 2,
    },
    {
      element_id: "edu2-degree",
      category: "textarea",
      flowRole: "content",
      flowGroup: "record-edu2",
      autoHeight: true,
      left: 167,
      top: 163.5,
      width: 355,
      height: 13,
      page: 2,
    },
    {
      element_id: "edu2-school",
      category: "textarea",
      flowRole: "content",
      flowGroup: "record-edu2",
      autoHeight: true,
      left: 167,
      top: 180.5,
      width: 355,
      height: 13,
      page: 2,
    },
    {
      element_id: "skills-heading",
      category: "text",
      content: "UMIEJĘTNOŚCI",
      flowRole: "section-chrome",
      left: 167,
      top: 220,
      width: 200,
      fontSize: 8.5,
      page: 2,
    },
    {
      element_id: "skills-body",
      category: "textarea",
      flowRole: "content",
      autoHeight: true,
      left: 167,
      top: 240,
      width: 355,
      height: 14,
      page: 2,
    },
  ];

  for (const [id, height] of [
    ["edu1-degree", 36],
    ["edu1-school", 36],
    ["edu1-meta", 28],
    ["edu1-body", 48],
    ["edu2-degree", 36],
    ["edu2-school", 48],
    ["skills-body", 40],
  ]) {
    elements = reflowTextareaHeight(elements, id, height, 842, {
      pageTop: 66,
      bottomMargin: 72,
    }).elements;
  }

  const byId = Object.fromEntries(elements.map((element) => [element.element_id, element]));
  assert.equal(byId["edu1-degree"].page, 2);
  assert.equal(byId["edu1-school"].page, 2);
  assert.equal(byId["edu2-degree"].page, 2);
  assert.equal(byId["skills-body"].page, 2);
  assert.ok(byId["edu-heading"].top < byId["edu1-degree"].top);
  assert.ok(byId["edu1-school"].top >= byId["edu1-degree"].top + byId["edu1-degree"].height - 0.5);
  assert.ok(byId["edu1-meta"].top >= byId["edu1-school"].top + byId["edu1-school"].height - 0.5);
  assert.ok(byId["edu1-body"].top >= byId["edu1-meta"].top + byId["edu1-meta"].height - 0.5);
  assert.ok(byId["edu2-degree"].top >= byId["edu1-body"].top + byId["edu1-body"].height - 0.5);
  assert.ok(byId["skills-heading"].top > byId["edu2-school"].top);
  assert.ok(byId["skills-body"].top > byId["skills-heading"].top);
});

test("does not change ordinary manually sized textareas", () => {
  const result = reflowTextareaHeight([
    textarea({ autoHeight: false }),
    { element_id: "next", category: "text", left: 40, top: 144, width: 180, fontSize: 12, page: 1 },
  ], "textarea", 44, 842);

  assert.equal(result.changed, false);
  assert.equal(result.elements[0].height, 20);
  assert.equal(result.elements[1].top, 144);
});

test("keeps page decorations fixed while text content reflows", () => {
  const result = reflowTextareaHeight([
    textarea(),
    {
      element_id: "page-two-background",
      category: "line",
      left: 0,
      top: 0,
      width: 595,
      height: 842,
      page: 2,
      fixedToPage: true,
    },
    {
      element_id: "next-section",
      category: "text",
      left: 40,
      top: 80,
      width: 180,
      fontSize: 12,
      page: 2,
    },
  ], "textarea", 44, 842);

  const background = result.elements.find((element) => element.element_id === "page-two-background");
  const section = result.elements.find((element) => element.element_id === "next-section");
  assert.deepEqual({ page: background.page, top: background.top }, { page: 2, top: 0 });
  // Cross-page dead space is reclaimed; section chrome packs with SPACE_SECTION (21).
  assert.deepEqual({ page: section.page, top: section.top }, { page: 1, top: 165 });
});

test("does not shift a position-locked element during textarea reflow", () => {
  const result = reflowTextareaHeight([
    textarea(),
    {
      element_id: "locked-heading",
      category: "text",
      left: 40,
      top: 144,
      width: 180,
      fontSize: 12,
      page: 1,
      locked: true,
    },
  ], "textarea", 44, 842);

  const heading = result.elements.find((element) => element.element_id === "locked-heading");
  assert.equal(heading.top, 144);
});

test("uses explicit flow roles instead of treating record text as section chrome", () => {
  const result = reflowTextareaHeight([
    textarea({ top: 620, height: 40 }),
    {
      element_id: "record-title",
      category: "text",
      content: "Customer Service Specialist with German",
      flowRole: "content",
      left: 40,
      top: 700,
      width: 180,
      fontSize: 11,
      page: 1,
    },
    {
      element_id: "record-body",
      category: "textarea",
      autoHeight: true,
      flowRole: "content",
      left: 40,
      top: 720,
      width: 180,
      height: 40,
      page: 1,
    },
  ], "textarea", 44, 842, { pageTop: 66, bottomMargin: 72 });

  const title = result.elements.find((element) => element.element_id === "record-title");
  assert.equal(title.page, 1);
  assert.equal(title.top, 704);
});

test("keeps section heading with following body across a page break", () => {
  const result = reflowTextareaHeight([
    {
      element_id: "job",
      category: "textarea",
      left: 76,
      top: 620,
      width: 460,
      height: 40,
      page: 1,
      autoHeight: true,
    },
    {
      element_id: "edu-mark",
      category: "circle",
      left: 525,
      top: 678,
      width: 12,
      height: 12,
      page: 1,
    },
    {
      element_id: "edu-heading",
      category: "text",
      content: "WYKSZTAŁCENIE",
      left: 76,
      top: 680,
      fontSize: 8.6,
      page: 1,
    },
    {
      element_id: "edu-rule",
      category: "line",
      left: 76,
      top: 692,
      width: 460,
      height: 1,
      page: 1,
    },
    {
      element_id: "edu-body",
      category: "textarea",
      left: 76,
      top: 704,
      width: 460,
      height: 90,
      page: 1,
      autoHeight: true,
    },
  ], "job", 90, 842, { pageTop: 66, bottomMargin: 72 });

  const heading = result.elements.find((element) => element.element_id === "edu-heading");
  const mark = result.elements.find((element) => element.element_id === "edu-mark");
  const rule = result.elements.find((element) => element.element_id === "edu-rule");
  const body = result.elements.find((element) => element.element_id === "edu-body");

  assert.equal(heading.page, 2);
  assert.equal(body.page, 2);
  assert.equal(mark.page, 2);
  assert.equal(rule.page, 2);
  assert.ok(heading.top >= 66);
  assert.ok(body.top > heading.top);
});

test("pulls preceding section chrome when the body textarea itself jumps page", () => {
  // Skills body sits near the footer. Measuring it taller than the remaining
  // space used to move only the textarea to page 2, orphaning UMIEJĘTNOŚCI.
  const result = reflowTextareaHeight([
    {
      element_id: "skills-icon",
      category: "image",
      src: "/template-assets/iconic/nova/skills.png",
      alignWithText: true,
      left: 48,
      top: 700,
      width: 11,
      height: 11,
      page: 1,
    },
    {
      element_id: "skills-heading",
      category: "text",
      content: "UMIEJĘTNOŚCI",
      left: 66,
      top: 700,
      fontSize: 8.6,
      page: 1,
    },
    {
      element_id: "skills-rule",
      category: "line",
      left: 66,
      top: 717,
      width: 481,
      height: 1,
      page: 1,
    },
    {
      element_id: "skills-body",
      category: "textarea",
      autoHeight: true,
      left: 66,
      top: 732,
      width: 481,
      height: 20,
      page: 1,
    },
  ], "skills-body", 48, 842, { pageTop: 66, bottomMargin: 72 });

  const icon = result.elements.find((element) => element.element_id === "skills-icon");
  const heading = result.elements.find((element) => element.element_id === "skills-heading");
  const rule = result.elements.find((element) => element.element_id === "skills-rule");
  const body = result.elements.find((element) => element.element_id === "skills-body");

  assert.equal(body.page, 2);
  assert.equal(heading.page, 2);
  assert.equal(icon.page, 2);
  assert.equal(rule.page, 2);
  assert.equal(heading.top, 66);
  assert.equal(body.top, 98);
  assert.ok(body.top > heading.top);
});

test("pulls preceding sidebar-chrome when the rail body jumps page", () => {
  // Sterling tags kickers `sidebar-chrome`, not `section-chrome`. Treating
  // only the latter as chrome left UMIEJĘTNOŚCI in the page-1 footer while
  // the skills list started the page-2 rail.
  const result = reflowTextareaHeight([
    {
      element_id: "skills-heading",
      category: "text",
      content: "UMIEJĘTNOŚCI",
      flowRole: "sidebar-chrome",
      flowLane: "sidebar",
      left: 34,
      top: 740,
      width: 120,
      fontSize: 9.4,
      height: 12,
      page: 1,
    },
    {
      element_id: "skills-tick",
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
      element_id: "skills-body",
      category: "textarea",
      autoHeight: true,
      flowRole: "content",
      flowLane: "sidebar",
      left: 34,
      top: 761,
      width: 152,
      height: 20,
      page: 1,
    },
  ], "skills-body", 80, 842, { pageTop: 66, bottomMargin: 72 });

  const heading = result.elements.find((element) => element.element_id === "skills-heading");
  const tick = result.elements.find((element) => element.element_id === "skills-tick");
  const body = result.elements.find((element) => element.element_id === "skills-body");

  assert.equal(body.page, 2);
  assert.equal(heading.page, 2);
  assert.equal(tick.page, 2);
  assert.ok(heading.top >= 66);
  assert.ok(body.top > heading.top);
});

test("preserves a small same-record gap even if a lane element's stored page went stale", () => {
  // Each auto-height textarea measures and settles independently (once
  // immediately, once again after webfonts finish loading), so a record's
  // meta line can end up with a `page` number written by an earlier,
  // now-superseded reflow pass while its title is still catching up. That
  // page mismatch alone must not make the title/meta gap (~4px, SPACE_STACK)
  // fall back to the much larger generic page-break pack gap (14px,
  // SPACE_RECORD) — see the "Bachelor of Laws" education-record report.
  const result = reflowTextareaHeight([
    textarea({ top: 100, height: 20 }),
    {
      element_id: "meta",
      category: "textarea",
      left: 40,
      top: 124, // 100 + 20 + 4 (SPACE_STACK), authored on the same page as "textarea"
      width: 180,
      height: 12,
      page: 2, // stale — a prior, now-superseded pass already bumped this one
    },
  ], "textarea", 24, 842);

  const target = result.elements.find((element) => element.element_id === "textarea");
  const meta = result.elements.find((element) => element.element_id === "meta");
  assert.equal(meta.top - (target.top + target.height), 4);
});

test("keeps SPACE_RECORD between meta and the next record title", () => {
  const result = reflowTextareaHeight([
    textarea({ element_id: "above", top: 50, height: 30 }),
    {
      element_id: "meta",
      category: "textarea",
      autoHeight: true,
      left: 40,
      top: 100,
      width: 180,
      height: 12,
      fontSize: 8.5,
      page: 1,
    },
    {
      element_id: "next-degree",
      category: "textarea",
      autoHeight: true,
      left: 40,
      top: 122, // 100 + 12 + 10 (SPACE_RECORD)
      width: 180,
      height: 13,
      fontSize: 10.4,
      bold: true,
      page: 1,
    },
  ], "above", 20, 842);

  const meta = result.elements.find((element) => element.element_id === "meta");
  const nextDegree = result.elements.find((element) => element.element_id === "next-degree");
  assert.equal(nextDegree.top - (meta.top + meta.height), 10);
});

test("keeps section chrome top-to-top when an upstream textarea shrinks", () => {
  // Bottom-gap packing against estimated text line-boxes used to crush the
  // label→rule→body band after load reflow. Chrome pairs must keep authored
  // top deltas.
  const result = reflowTextareaHeight([
    {
      element_id: "summary",
      category: "textarea",
      autoHeight: true,
      left: 55,
      top: 200,
      width: 485,
      height: 60,
      fontSize: 10.5,
      page: 1,
    },
    {
      element_id: "exp-icon",
      category: "rectangle",
      left: 55,
      top: 278,
      width: 9,
      height: 9,
      page: 1,
    },
    {
      element_id: "exp-heading",
      category: "text",
      content: "DOŚWIADCZENIE",
      left: 72,
      top: 276,
      fontSize: 11.5,
      page: 1,
    },
    {
      element_id: "exp-rule",
      category: "line",
      left: 55,
      top: 290,
      width: 485,
      height: 1,
      page: 1,
    },
    {
      element_id: "exp-title",
      category: "textarea",
      autoHeight: true,
      left: 55,
      top: 306,
      width: 485,
      height: 16,
      fontSize: 11,
      bold: true,
      page: 1,
    },
  ], "summary", 40, 842, { pageTop: 66, bottomMargin: 72 });

  const heading = result.elements.find((element) => element.element_id === "exp-heading");
  const rule = result.elements.find((element) => element.element_id === "exp-rule");
  const title = result.elements.find((element) => element.element_id === "exp-title");
  assert.equal(rule.top - heading.top, 14);
  assert.equal(title.top - rule.top, 16);
});

test("does not stack a section heading under a grown textarea body", () => {
  // Some templates build job lines as category "text". If those (or following
  // section labels) keep top-to-top rhythm after a bullet textarea grows,
  // headings land inside the taller body and overlap on page 2.
  const result = reflowTextareaHeight([
    {
      element_id: "bullets",
      category: "textarea",
      autoHeight: true,
      left: 55,
      top: 500,
      width: 485,
      height: 40,
      fontSize: 10,
      page: 1,
    },
    {
      element_id: "edu-heading",
      category: "text",
      content: "WYKSZTAŁCENIE",
      left: 72,
      top: 558,
      fontSize: 11.5,
      page: 1,
    },
    {
      element_id: "edu-rule",
      category: "line",
      left: 55,
      top: 572,
      width: 485,
      height: 1,
      page: 1,
    },
  ], "bullets", 100, 842, { pageTop: 66, bottomMargin: 72 });

  const bullets = result.elements.find((element) => element.element_id === "bullets");
  const heading = result.elements.find((element) => element.element_id === "edu-heading");
  assert.ok(heading.top >= bullets.top + bullets.height + 4);
});

test("does not collapse SPACE_RECORD between consecutive bold titles", () => {
  // A previous bold&&same-size heuristic forced SPACE_STACK between every bold
  // textarea and the next line — that piled whole CV sections on top of each
  // other during load reflow. Bold job titles separated by SPACE_RECORD must
  // keep 10px.
  const result = reflowTextareaHeight([
    {
      element_id: "title-a",
      category: "textarea",
      autoHeight: true,
      left: 40,
      top: 100,
      width: 180,
      height: 20,
      fontSize: 11,
      bold: true,
      page: 1,
    },
    {
      element_id: "title-b",
      category: "textarea",
      autoHeight: true,
      left: 40,
      top: 130, // 100 + 20 + 10
      width: 180,
      height: 20,
      fontSize: 11,
      bold: true,
      page: 1,
    },
  ], "title-a", 24, 842);

  const a = result.elements.find((element) => element.element_id === "title-a");
  const b = result.elements.find((element) => element.element_id === "title-b");
  assert.equal(b.top - (a.top + a.height), 10);
});

test("moves a heading when the full following body cannot fit beneath it", () => {
  // A short keep-with-next window previously kept the heading while the full
  // skills block overflowed alone.
  const result = reflowTextareaHeight([
    {
      element_id: "projects",
      category: "textarea",
      autoHeight: true,
      left: 66,
      top: 560,
      width: 481,
      height: 40,
      page: 1,
    },
    {
      element_id: "skills-heading",
      category: "text",
      content: "UMIEJĘTNOŚCI",
      left: 66,
      top: 620,
      fontSize: 8.6,
      page: 1,
    },
    {
      element_id: "skills-rule",
      category: "line",
      left: 66,
      top: 637,
      width: 481,
      height: 1,
      page: 1,
    },
    {
      element_id: "skills-body",
      category: "textarea",
      left: 66,
      top: 652,
      width: 481,
      height: 80,
      page: 1,
    },
  ], "projects", 70, 842, { pageTop: 66, bottomMargin: 72 });

  const heading = result.elements.find((element) => element.element_id === "skills-heading");
  const body = result.elements.find((element) => element.element_id === "skills-body");

  assert.equal(heading.page, body.page);
  assert.ok(body.top > heading.top);
  if (heading.page === 1) {
    assert.ok(body.top + body.height <= 770);
  } else {
    assert.equal(heading.page, 2);
  }
});

test("un-crushes same-top skill category and chips after a page-break pack", () => {
  // A continuation page can park a named skill group with category + chips on
  // the same Y. Reflow must restack them with SPACE_STACK instead of treating
  // equal tops as "no mates".
  const result = reflowTextareaHeight([
    {
      element_id: "prev-chips",
      category: "textarea",
      autoHeight: true,
      flowRole: "content",
      flowGroup: "skills-lang",
      left: 48,
      top: 720,
      width: 480,
      height: 28,
      page: 1,
    },
    {
      element_id: "db-category",
      category: "textarea",
      autoHeight: true,
      flowRole: "content",
      flowGroup: "skills-db",
      left: 48,
      top: 66,
      width: 480,
      height: 12,
      page: 2,
      content: "Databases & Storage",
      bold: true,
    },
    {
      element_id: "db-chips",
      category: "textarea",
      autoHeight: true,
      flowRole: "content",
      flowGroup: "skills-db",
      left: 48,
      top: 66,
      width: 480,
      height: 28,
      page: 2,
      content: "PostgreSQL · Redis · S3-compatible storage (MinIO)",
    },
    {
      element_id: "devops-category",
      category: "textarea",
      autoHeight: true,
      flowRole: "content",
      flowGroup: "skills-devops",
      left: 48,
      top: 110,
      width: 480,
      height: 12,
      page: 2,
    },
  ], "db-chips", 28, 842, { pageTop: 66, bottomMargin: 72 });

  const category = result.elements.find((element) => element.element_id === "db-category");
  const chips = result.elements.find((element) => element.element_id === "db-chips");
  const devops = result.elements.find((element) => element.element_id === "devops-category");

  assert.equal(category.page, 2);
  assert.equal(chips.page, 2);
  assert.ok(
    chips.top >= category.top + category.height + 3.5,
    `expected stack gap under category, got category=${category.top} chips=${chips.top}`,
  );
  assert.ok(devops.top >= chips.top + chips.height - 0.5);
});

test("cascading reflow across several autoHeight textareas keeps a skill-chip grid's rows aligned", () => {
  // Mirrors a real page mount: several autoHeight textareas above the skills
  // section each independently measure a slightly different scrollHeight than
  // the generator estimated and call reflowTextareaHeight in sequence. Every
  // chip rect+text pair shares one flowGroup (Builder.keep_together) and is
  // tagged flowRole: "grid-member" — the bottom-plus-gap stacking used for
  // ordinary title/meta/body records must not apply to them, or two rows of
  // chips collapse onto one column after the second textarea's reflow.
  const group = "record-skills-cascade";
  let elements = [
    textarea({ element_id: "summary", top: 100, height: 20 }),
    textarea({ element_id: "meta", top: 130, height: 14 }),
    { element_id: "rect-a", category: "rectangle", flowRole: "grid-member", flowGroup: group, left: 40, top: 200, width: 80, height: 20, page: 1 },
    { element_id: "text-a", category: "text", flowRole: "grid-member", flowGroup: group, content: "Python", left: 50, top: 205, fontSize: 9, page: 1 },
    { element_id: "rect-b", category: "rectangle", flowRole: "grid-member", flowGroup: group, left: 128, top: 200, width: 80, height: 20, page: 1 },
    { element_id: "text-b", category: "text", flowRole: "grid-member", flowGroup: group, content: "SQL", left: 138, top: 205, fontSize: 9, page: 1 },
  ];

  elements = reflowTextareaHeight(elements, "summary", 24, 842, { pageTop: 66, bottomMargin: 72 }).elements;
  elements = reflowTextareaHeight(elements, "meta", 18, 842, { pageTop: 66, bottomMargin: 72 }).elements;

  const byId = Object.fromEntries(elements.map((element) => [element.element_id, element]));
  assert.equal(byId["rect-b"].top, byId["rect-a"].top, "both chips must stay on the same row");
  assert.ok(
    byId["text-a"].top >= byId["rect-a"].top && byId["text-a"].top <= byId["rect-a"].top + byId["rect-a"].height,
    "chip A's label must stay inside its own pill",
  );
  assert.ok(
    byId["text-b"].top >= byId["rect-b"].top && byId["text-b"].top <= byId["rect-b"].top + byId["rect-b"].height,
    "chip B's label must stay inside its own pill",
  );
});

test("a chip row that already jumped to page 2 stays aligned when an earlier textarea reflows next (crossedPage)", () => {
  // Two-call sequence that reproduces a genuine `crossedPage` seam:
  // call 1 grows a textarea enough to push the (still page-1) chip row past
  // the footer onto page 2; call 2 then grows a DIFFERENT, earlier textarea
  // that itself stays on page 1. Walking call 2's lane, the chip row's
  // stored page (2) is now genuinely ahead of that earlier textarea's page
  // (1) — the exact "page fields went out of sync across independent reflow
  // passes" case `crossedPage` exists to absorb. That branch used to apply
  // bottom-plus-gap stacking even to grid members, breaking row alignment;
  // the top-to-top delta chain used everywhere else in this function must
  // apply here too.
  const group = "record-skills-crossed-page";
  let elements = [
    textarea({ element_id: "a", top: 100, height: 20 }),
    textarea({ element_id: "b", top: 140, height: 20 }),
    {
      element_id: "rect-a", category: "rectangle", flowRole: "grid-member", flowGroup: group,
      left: 40, top: 740, width: 80, height: 20, page: 1,
    },
    {
      element_id: "text-a", category: "text", flowRole: "grid-member", flowGroup: group,
      content: "Python", left: 50, top: 745, fontSize: 9, page: 1,
    },
    {
      element_id: "rect-b", category: "rectangle", flowRole: "grid-member", flowGroup: group,
      left: 128, top: 740, width: 80, height: 20, page: 1,
    },
    {
      element_id: "text-b", category: "text", flowRole: "grid-member", flowGroup: group,
      content: "SQL", left: 138, top: 745, fontSize: 9, page: 1,
    },
  ];

  // Call 1: grow "a" by 70px — big enough to push the chip row past the
  // page-1 footer (740 + 70 = 810 > contentBottom 770) onto page 2.
  elements = reflowTextareaHeight(elements, "a", 90, 842, { pageTop: 66, bottomMargin: 72 }).elements;
  const afterCall1 = Object.fromEntries(elements.map((element) => [element.element_id, element]));
  assert.equal(afterCall1["rect-a"].page, 2, "sanity: chip row moved to page 2 after call 1");
  assert.equal(afterCall1["b"].page, 1, "sanity: \"b\" stayed on page 1 after call 1");

  // Call 2: grow "b" — its lane walk now finds page-1 "b" immediately
  // followed by the already-page-2 chip row, the crossedPage condition.
  elements = reflowTextareaHeight(elements, "b", 55, 842, { pageTop: 66, bottomMargin: 72 }).elements;
  const byId = Object.fromEntries(elements.map((element) => [element.element_id, element]));

  assert.equal(byId["rect-b"].page, byId["rect-a"].page, "both chips must end up on the same page");
  assert.equal(byId["rect-b"].top, byId["rect-a"].top, "both chips must stay on the same row");
  assert.ok(
    byId["text-a"].top >= byId["rect-a"].top && byId["text-a"].top <= byId["rect-a"].top + byId["rect-a"].height,
    "chip A's label must stay inside its own pill",
  );
  assert.ok(
    byId["text-b"].top >= byId["rect-b"].top && byId["text-b"].top <= byId["rect-b"].top + byId["rect-b"].height,
    "chip B's label must stay inside its own pill",
  );
});

test("a wrapped chip grid's reserved height is its 2D extent, not the sum of every cell", () => {
  // A skills chip grid shares one flowGroup across many rect+text cells laid
  // out in rows. `remainingRecordHeight` (used for the page-fit reservation
  // when a record is placed) used to SUM every cell's height as if they were
  // a vertical stack, hugely over-estimating the block — 8 cells here would
  // reserve far more than the real two-row extent. That over-estimate made
  // the fit check believe the grid could not stay on the current page, so
  // the whole skills section jumped to the next page even when its true
  // extent had ample room, leaving a near-empty page behind it.
  //
  // Setup: a body textarea whose growth pushes the chip grid's top down to
  // ~690 on page 1. The grid is two rows (~48px extent) ending near ~738,
  // comfortably above the 770 footer. With the correct extent-based reserve
  // the grid stays on page 1; with the old summed reserve it would be
  // stranded on page 2.
  const group = "record-skills-extent";
  const elements = [
    { element_id: "chrome-h", category: "text", flowRole: "section-chrome", left: 72, top: 80, width: 300, fontSize: 11, height: 13, page: 1 },
    { element_id: "body", category: "textarea", autoHeight: true, flowRole: "content", left: 72, top: 100, width: 473, height: 200, page: 1 },
    { element_id: "sk-h", category: "text", flowRole: "section-chrome", left: 72, top: 600, width: 300, fontSize: 11, height: 13, page: 1 },
    { element_id: "sk-r", category: "line", flowRole: "section-chrome", left: 72, top: 614, width: 473, height: 1, page: 1 },
  ];
  const chips = ["AML", "KYC", "SQL", "Python", "SAR", "PEP", "CDD", "EDD"];
  let cx = 72;
  let row = 0;
  let inRow = 0;
  chips.forEach((label, i) => {
    if (inRow >= 4) { row += 1; inRow = 0; cx = 72; }
    const top = 640 + row * 28;
    elements.push({ element_id: `rect${i}`, category: "rectangle", flowRole: "grid-member", flowGroup: group, left: cx, top, width: 100, height: 20, page: 1 });
    elements.push({ element_id: `text${i}`, category: "text", flowRole: "grid-member", flowGroup: group, content: label, left: cx + 8, top: top + 5, fontSize: 9, page: 1 });
    cx += 108;
    inRow += 1;
  });

  const result = reflowTextareaHeight(elements, "body", 250, 842, { pageTop: 66, bottomMargin: 72 });
  const byId = Object.fromEntries(result.elements.map((element) => [element.element_id, element]));

  const chipPages = new Set(chips.map((_, i) => byId[`rect${i}`].page));
  assert.equal(chipPages.size, 1, "every chip must be on the same page");
  assert.equal(byId["rect0"].page, 1, "grid's true extent fits on page 1 — must not be stranded on page 2");
  // Rows stay aligned: first four chips share a top, second row sits below.
  assert.equal(byId["rect3"].top, byId["rect0"].top, "row 1 chips aligned");
  assert.equal(byId["rect4"].top, byId["rect7"].top, "row 2 chips aligned");
  assert.ok(byId["rect4"].top > byId["rect0"].top, "row 2 sits below row 1");
});

test("remeasuring an Experience description keeps a category-led chip grid on page 1", () => {
  // Categorised Skills records begin with a textarea label and continue with
  // rectangle/text grid members in the same flowGroup. Clicking an earlier
  // Experience description remeasures that textarea; the subsequent page-fit
  // walk must reserve the category plus the grid's 2D extent, not sum each
  // horizontal pill as another row.
  const group = "skills-category-with-chips";
  const elements = [
    {
      element_id: "experience-description",
      category: "textarea",
      autoHeight: true,
      flowRole: "content",
      flowGroup: "experience-record",
      content: "Opis najważniejszego osiągnięcia lub odpowiedzialności.",
      left: 72,
      top: 420,
      width: 473,
      height: 18,
      page: 1,
    },
    { element_id: "skills-heading", category: "text", flowRole: "section-chrome", content: "UMIEJĘTNOŚCI (KATEGORIE)", left: 72, top: 600, width: 473, height: 14, page: 1 },
    { element_id: "skills-rule", category: "line", flowRole: "section-chrome", left: 72, top: 616, width: 473, height: 1, page: 1 },
    {
      element_id: "skills-category",
      category: "textarea",
      autoHeight: true,
      flowRole: "content",
      flowGroup: group,
      content: "Kategoria umiejętności",
      left: 72,
      top: 632,
      width: 473,
      height: 14,
      page: 1,
    },
  ];

  for (let index = 0; index < 11; index += 1) {
    const left = 72 + index * 38;
    elements.push({
      element_id: `skill-shape-${index}`,
      category: "rectangle",
      flowRole: "grid-member",
      flowGroup: group,
      left,
      top: 652,
      width: 30,
      height: 18,
      page: 1,
    });
    elements.push({
      element_id: `skill-label-${index}`,
      category: "text",
      flowRole: "grid-member",
      flowGroup: group,
      content: String(index + 1),
      left: left + 8,
      top: 656,
      width: 14,
      height: 10,
      page: 1,
    });
  }

  const result = reflowTextareaHeight(elements, "experience-description", 22, 842, {
    pageTop: 66,
    bottomMargin: 72,
  });
  const skills = result.elements.filter((element) => (
    element.element_id.startsWith("skills-")
    || element.flowGroup === group
  ));

  assert.ok(skills.length > 0);
  assert.ok(skills.every((element) => element.page === 1));
  const category = skills.find((element) => element.element_id === "skills-category");
  const firstShape = skills.find((element) => element.element_id === "skill-shape-0");
  assert.ok(firstShape.top >= category.top + category.height);
  assert.ok(firstShape.top + firstShape.height <= 770);
});

test("a languages grid row measured cell-by-cell never splits across a page break", () => {
  // Sterling's main-column languages grid is a row of textarea cells sharing one
  // flowGroup, sitting side by side in ADJACENT (non-overlapping) columns. Each
  // cell is autoHeight, so on mount each one measures and fires its OWN reflow
  // pass. Because grid siblings do not horizontally overlap, `belongsToFlowLane`
  // used to reject them as record mates — so when a single cell's own pass
  // pushed it past the page-1 footer, it jumped to page 2 alone and left its
  // row-mates behind (the reported bug: "Polski" stayed on page 1 while
  // "Niemiecki"/"Angielski" floated onto page 2). The whole row must move as a
  // unit and keep its shared top.
  const group = "lang-grid-row";
  const base = () => ([
    { element_id: "lang-head", category: "text", flowRole: "section-chrome", content: "JĘZYKI", left: 245, top: 730, width: 300, height: 14, page: 1 },
    { element_id: "lang-rule", category: "line", flowRole: "section-chrome", left: 245, top: 745, width: 300, height: 1, page: 1 },
    { element_id: "lang-0", category: "textarea", flowRole: "grid-member", flowGroup: group, content: "Polski — A2", left: 245, top: 750, width: 67, height: 14, page: 1, autoHeight: true },
    { element_id: "lang-1", category: "textarea", flowRole: "grid-member", flowGroup: group, content: "Niemiecki — C1", left: 320, top: 750, width: 67, height: 14, page: 1, autoHeight: true },
    { element_id: "lang-2", category: "textarea", flowRole: "grid-member", flowGroup: group, content: "Angielski — B2", left: 395, top: 750, width: 67, height: 14, page: 1, autoHeight: true },
  ]);
  const opts = { pageTop: 66, bottomMargin: 72 };

  // The middle cell measures tall enough (its level label wrapped) to push the
  // row past the page-1 footer — the exact single-cell trigger that split it.
  let els = reflowTextareaHeight(base(), "lang-1", 30, 842, opts).elements;
  let byId = Object.fromEntries(els.map((e) => [e.element_id, e]));
  assert.equal(byId["lang-0"].page, byId["lang-1"].page, "the row must not split across pages");
  assert.equal(byId["lang-1"].page, byId["lang-2"].page, "the row must not split across pages");
  assert.equal(byId["lang-0"].top, byId["lang-1"].top, "row cells keep their shared top");
  assert.equal(byId["lang-1"].top, byId["lang-2"].top, "row cells keep their shared top");
  assert.ok(byId["lang-head"].top < byId["lang-0"].top, "heading stays above its grid");

  // Cascade: each cell measures on mount, in document order.
  els = base();
  for (const id of ["lang-0", "lang-1", "lang-2"]) {
    els = reflowTextareaHeight(els, id, 15, 842, opts).elements;
  }
  byId = Object.fromEntries(els.map((e) => [e.element_id, e]));
  const pages = new Set(["lang-0", "lang-1", "lang-2"].map((id) => byId[id].page));
  assert.equal(pages.size, 1, "the whole row shares one page after the mount cascade");
  assert.equal(byId["lang-0"].top, byId["lang-2"].top, "row stays aligned after the cascade");
});
