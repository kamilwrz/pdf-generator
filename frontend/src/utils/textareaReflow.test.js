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

