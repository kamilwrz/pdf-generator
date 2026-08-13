import test from "node:test";
import assert from "node:assert/strict";
import {
  cloneFixedPageDecorations,
  contentMaxPage,
  formatContinuationPageNumber,
  previewStructureOperation,
  reconcileDocumentPages,
} from "./structureOperation.js";

test("preview replaces the source and renders proposed movement without mutating canvas state", () => {
  const current = [
    { element_id: "source", category: "textarea", content: "Original", left: 20, top: 80, page: 1 },
    { element_id: "later", category: "text", content: "Later", left: 20, top: 140, page: 1 },
  ];
  const result = previewStructureOperation(current, {
    remove_element_ids: ["source"],
    patches: [{ element_id: "later", left: 20, top: 180, page: 1 }],
    add_elements: [{ element_id: "heading", category: "text", content: "Heading", left: 20, top: 80, page: 1 }],
  });

  assert.deepEqual(current.map((element) => element.element_id), ["source", "later"]);
  assert.deepEqual(result.map((element) => element.element_id), ["later", "heading"]);
  assert.equal(result.find((element) => element.element_id === "later").top, 180);
  assert.equal(result.find((element) => element.element_id === "heading").locked, false);
});

test("new continuation pages receive cloned fixed artwork and refreshed page numbers", () => {
  let count = 0;
  const clones = cloneFixedPageDecorations([
    { element_id: "background", category: "image", fixedToPage: true, page: 1, src: "/art.png" },
    {
      element_id: "masthead-rail",
      category: "line",
      fixedToPage: true,
      repeatOnContinuation: false,
      page: 1,
    },
    { element_id: "page-number", category: "text", fixedToPage: true, page: 1, content: "1" },
  ], 2, 3, () => `clone-${++count}`);

  assert.equal(clones.length, 4);
  assert.ok(clones.every((element) => element.category !== "line"));
  assert.deepEqual(clones.filter((element) => element.page === 2).map((element) => element.content), [undefined, "2"]);
  assert.deepEqual(clones.filter((element) => element.page === 3).map((element) => element.content), [undefined, "3"]);
  assert.equal(new Set(clones.map((element) => element.element_id)).size, 4);
});

test("zero-padded page numbers keep their width on continuation pages", () => {
  assert.equal(formatContinuationPageNumber("01", 2), "02");
  assert.equal(formatContinuationPageNumber("1", 2), "2");

  let count = 0;
  const clones = cloneFixedPageDecorations([
    { element_id: "bg", category: "line", fixedToPage: true, page: 1, width: 595, height: 842 },
    { element_id: "num", category: "text", fixedToPage: true, page: 1, content: "01" },
  ], 2, 2, () => `id-${++count}`);

  const number = clones.find((element) => element.category === "text");
  assert.equal(number.content, "02");
  assert.equal(number.page, 2);
});

test("Sterling continuation clones keep a full-height vertical rail without the letterhead band", () => {
  let count = 0;
  const clones = cloneFixedPageDecorations([
    { element_id: "paper", category: "line", fixedToPage: true, page: 1,
      left: 0, top: 0, width: 595, height: 842, backgroundColor: "#F7F8FA" },
    { element_id: "rail", category: "line", fixedToPage: true, page: 1,
      left: 0, top: 158, width: 210, height: 684, backgroundColor: "#EDF1F6" },
    { element_id: "divider", category: "line", fixedToPage: true, page: 1,
      left: 210, top: 158, width: 1, height: 684, backgroundColor: "#C7CFDA" },
    { element_id: "band", category: "line", fixedToPage: true, page: 1,
      left: 0, top: 0, width: 595, height: 158, backgroundColor: "#EDF1F6" },
    { element_id: "num", category: "text", fixedToPage: true, page: 1, content: "01" },
  ], 2, 2, () => `id-${++count}`);

  assert.equal(clones.some((element) => element.element_id?.startsWith("id-") && element.width === 595 && element.height === 158), false);
  const rail = clones.find((element) => element.width === 210);
  const divider = clones.find((element) => element.width === 1);
  assert.ok(rail);
  assert.ok(divider);
  assert.equal(rail.top, 0);
  assert.equal(rail.height, 842);
  assert.equal(divider.top, 0);
  assert.equal(divider.height, 842);
  assert.equal(rail.page, 2);
});

test("reconcileDocumentPages clones chrome onto overflow pages and collapses empty trailing pages", () => {
  let count = 0;
  const createId = () => `n-${++count}`;
  const body = { element_id: "body", category: "textarea", page: 1, content: "Hello", left: 66, top: 200 };
  const base = [
    { element_id: "bg1", category: "line", fixedToPage: true, page: 1, width: 595, height: 842 },
    { element_id: "num1", category: "text", fixedToPage: true, page: 1, content: "01" },
    body,
    // Orphan chrome left after content was packed back to page 1.
    { element_id: "bg2", category: "line", fixedToPage: true, page: 2, width: 595, height: 842 },
    { element_id: "num2", category: "text", fixedToPage: true, page: 2, content: "02" },
  ];

  const collapsed = reconcileDocumentPages(base, createId, { collapseEmpty: true });
  assert.equal(collapsed.pageCount, 1);
  assert.equal(contentMaxPage(collapsed.elements), 1);
  assert.ok(collapsed.elements.every((element) => (element.page ?? 1) === 1));
  // Content geometry and object identity must survive chrome sync.
  const collapsedBody = collapsed.elements.find((element) => element.element_id === "body");
  assert.equal(collapsedBody.top, 200);
  assert.equal(collapsedBody, body);

  const overflow = { element_id: "overflow", category: "textarea", page: 2, content: "More", left: 66, top: 80 };
  const withOverflow = [...collapsed.elements, overflow];
  const expanded = reconcileDocumentPages(withOverflow, createId, { collapseEmpty: true });
  assert.equal(expanded.pageCount, 2);
  assert.equal(
    expanded.elements.find((element) => element.element_id === "overflow"),
    overflow,
  );
  assert.equal(overflow.top, 80);
  const page2Chrome = expanded.elements.filter((element) => (
    element.fixedToPage && (element.page ?? 1) === 2
  ));
  assert.ok(page2Chrome.length >= 2);
  assert.equal(
    page2Chrome.find((element) => element.category === "text")?.content,
    "02",
  );

  const blank = reconcileDocumentPages(collapsed.elements, createId, {
    minPageCount: 2,
    collapseEmpty: false,
  });
  assert.equal(blank.pageCount, 2);
  assert.ok(blank.elements.some((element) => (
    element.fixedToPage && (element.page ?? 1) === 2 && element.category === "text"
    && element.content === "02"
  )));
});

test("reconcileDocumentPages is a no-op for content when chrome is already in sync", () => {
  const elements = [
    { element_id: "bg1", category: "line", fixedToPage: true, page: 1, width: 595, height: 842 },
    { element_id: "num1", category: "text", fixedToPage: true, page: 1, content: "01" },
    { element_id: "body", category: "textarea", page: 1, content: "Hello", left: 66, top: 200 },
  ];
  const result = reconcileDocumentPages(elements, () => "x", { collapseEmpty: true });
  assert.equal(result.elements, elements);
  assert.equal(result.pageCount, 1);
});
