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

test("shrinking page-one content preserves the generated continuation-page boundary", () => {
  const result = reflowTextareaHeight([
    textarea({ top: 700, height: 80 }),
    { element_id: "page-two-heading", category: "text", left: 40, top: 36, width: 180, fontSize: 12, page: 2 },
    { element_id: "page-two-body", category: "textarea", left: 40, top: 60, width: 180, height: 40, page: 2 },
  ], "textarea", 40, 842);

  const heading = result.elements.find((element) => element.element_id === "page-two-heading");
  const body = result.elements.find((element) => element.element_id === "page-two-body");
  assert.deepEqual({ page: heading.page, top: heading.top }, { page: 2, top: 36 });
  assert.deepEqual({ page: body.page, top: body.top }, { page: 2, top: 60 });
  assert.equal(result.pageCount, 2);
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
  assert.deepEqual({ page: section.page, top: section.top }, { page: 2, top: 104 });
});

test("reflows generated single-line text without a stored width", () => {
  const result = reflowTextareaHeight([
    textarea(),
    {
      element_id: "generated-heading",
      category: "text",
      content: "WYKSZTAŁCENIE",
      left: 40,
      top: 144,
      fontSize: 9,
      page: 1,
    },
  ], "textarea", 44, 842);

  const heading = result.elements.find((element) => element.element_id === "generated-heading");
  assert.equal(heading.top, 168);
});

