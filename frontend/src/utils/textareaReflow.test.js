import test from "node:test";
import assert from "node:assert/strict";
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

test("shrinking page-one content reclaims the page-break hole for following blocks", () => {
  const result = reflowTextareaHeight([
    textarea({ top: 620, height: 80 }),
    { element_id: "page-two-heading", category: "text", left: 40, top: 66, width: 180, fontSize: 12, page: 2 },
    { element_id: "page-two-body", category: "textarea", left: 40, top: 90, width: 180, height: 20, page: 2 },
  ], "textarea", 40, 842, { pageTop: 66, bottomMargin: 96 });

  const heading = result.elements.find((element) => element.element_id === "page-two-heading");
  const body = result.elements.find((element) => element.element_id === "page-two-body");
  // 660 + pack gap 10 → heading; preserve the original same-page gap to body.
  assert.deepEqual({ page: heading.page, top: heading.top }, { page: 1, top: 670 });
  assert.equal(body.page, 1);
  assert.ok(body.top + body.height <= 746);
  assert.equal(result.pageCount, 1);
});

test("overflowed blocks land on continuation inset, not page top 0", () => {
  const result = reflowTextareaHeight([
    textarea({ top: 700, height: 20 }),
    { element_id: "next", category: "textarea", left: 40, top: 730, width: 180, height: 100, page: 1 },
  ], "textarea", 40, 842, { pageTop: 66, bottomMargin: 96 });

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

test("keeps a Ridge rail icon in the main text lane", () => {
  const result = reflowTextareaHeight([
    textarea({ left: 56, top: 222, width: 483, height: 42 }),
    {
      element_id: "rail-icon",
      category: "image",
      src: "/template-assets/iconic/ridge/experience.png",
      alignWithText: true,
      left: 8,
      top: 290,
      width: 12,
      height: 12,
      page: 1,
    },
    {
      element_id: "ridge-heading",
      category: "text",
      left: 56,
      top: 290,
      fontSize: 8.5,
      page: 1,
    },
  ], "textarea", 58, 842);

  const icon = result.elements.find((element) => element.element_id === "rail-icon");
  const heading = result.elements.find((element) => element.element_id === "ridge-heading");
  assert.equal(icon.top, 306);
  assert.equal(heading.top, 306);
});

test("Loom sidebar reflow does not drag main-column section icons", () => {
  // Loom sidebar ends at x=156; main icons sit at x=204 (gap 48). Those icons
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
      src: "/template-assets/iconic/loom/education.png",
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

test("Loom main-column reflow keeps section icon with its heading", () => {
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
      src: "/template-assets/iconic/loom/experience.png",
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
  // Cross-page dead space is reclaimed; the section packs under the taller box.
  assert.deepEqual({ page: section.page, top: section.top }, { page: 1, top: 154 });
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

test("uses explicit flow roles instead of treating Onyx record text as section chrome", () => {
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
  ], "textarea", 44, 842, { pageTop: 66, bottomMargin: 96 });

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
  ], "job", 90, 842, { pageTop: 66, bottomMargin: 96 });

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
  ], "skills-body", 48, 842, { pageTop: 66, bottomMargin: 96 });

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

test("keeps Onyx section chrome top-to-top when an upstream textarea shrinks", () => {
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
  ], "summary", 40, 842, { pageTop: 66, bottomMargin: 96 });

  const heading = result.elements.find((element) => element.element_id === "exp-heading");
  const rule = result.elements.find((element) => element.element_id === "exp-rule");
  const title = result.elements.find((element) => element.element_id === "exp-title");
  assert.equal(rule.top - heading.top, 14);
  assert.equal(title.top - rule.top, 16);
});

test("does not stack a section heading under a grown textarea body", () => {
  // Onyx builds job lines as category "text". If those (or following section
  // labels) keep top-to-top rhythm after a bullet textarea grows, headings
  // land inside the taller body — the page-2 overlap in CV Onyx.
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
  ], "bullets", 100, 842, { pageTop: 66, bottomMargin: 96 });

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
  ], "projects", 70, 842, { pageTop: 66, bottomMargin: 96 });

  const heading = result.elements.find((element) => element.element_id === "skills-heading");
  const body = result.elements.find((element) => element.element_id === "skills-body");

  assert.equal(heading.page, body.page);
  assert.ok(body.top > heading.top);
  if (heading.page === 1) {
    assert.ok(body.top + body.height <= 746);
  } else {
    assert.equal(heading.page, 2);
  }
});
