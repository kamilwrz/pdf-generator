import assert from "node:assert/strict";
import test from "node:test";

import { vellumTemplate } from "./vellum.js";
import { applyFlowSpacing, listDocumentSections } from "../utils/sectionStructure.js";

const PAGE_HEIGHT = 842;

function withElementIds(elements) {
  return elements.map((element, index) => ({
    ...element,
    element_id: `vellum-${index}`,
  }));
}

test("Vellum preserves its portrait-led hierarchy and exact date rail", () => {
  const pageSurface = vellumTemplate.find(
    (element) => element.fixedToPage && element.width === 595 && element.height === 842,
  );
  assert.equal(pageSurface?.backgroundColor, "#FFFEFA");

  const name = vellumTemplate.find((element) => element.mastheadRole === "name");
  assert.equal(name?.fontFamily, "CormorantGaramond");
  assert.equal(name?.align, "left");
  assert.equal(name?.textTransform, "uppercase");

  const frame = vellumTemplate.find((element) => element.id === "vellum-photo-frame");
  const glyph = vellumTemplate.find((element) => element.id === "vellum-photo-glyph");
  assert.equal(frame?.category, "circle");
  assert.equal(frame?.photoShape, "circle");
  assert.equal(frame?.width, 104);
  assert.equal(glyph?.photoSlot, "glyph");

  const summary = vellumTemplate.find(
    (element) => element.content?.startsWith("Analityczka AML łącząca"),
  );
  const summaryBackground = vellumTemplate.find(
    (element) => element.flowRole === "record-overlay"
      && element.backgroundColor === "#E7ECE8"
      && element.width === 595,
  );
  assert.ok(summary);
  assert.equal(summaryBackground?.top, summary.top);
  assert.equal(summaryBackground?.flowGroup, summary.flowGroup);

  const headings = listDocumentSections(withElementIds(vellumTemplate), PAGE_HEIGHT);
  assert.ok(
    headings.findIndex((section) => section.title === "UMIEJĘTNOŚCI")
      < headings.findIndex((section) => section.title === "DOŚWIADCZENIE ZAWODOWE"),
  );

  const jobTitle = vellumTemplate.find((element) => element.content === "Analityczka AML");
  const period = vellumTemplate.find((element) => element.content === "2022 – obecnie");
  assert.ok(jobTitle);
  assert.ok(period);
  assert.equal(period.top, jobTitle.top);
  assert.equal(period.flowRole, "record-overlay");
  assert.equal(period.align, "right");
  assert.equal(period.autoHeight, false);
});

test("Vellum flow packing keeps the summary tint and period anchored", () => {
  const source = withElementIds(vellumTemplate);
  const packed = applyFlowSpacing(
    source,
    { stack: 6, record: 16, section: 28, after_rule: 10 },
    PAGE_HEIGHT,
  );
  const summary = packed.find(
    (element) => element.content?.startsWith("Analityczka AML łącząca"),
  );
  const summaryBackground = packed.find(
    (element) => element.flowRole === "record-overlay"
      && element.backgroundColor === "#E7ECE8"
      && element.width === 595,
  );
  const jobTitle = packed.find((element) => element.content === "Analityczka AML");
  const period = packed.find((element) => element.content === "2022 – obecnie");

  assert.equal(summaryBackground?.page, summary?.page);
  assert.equal(summaryBackground?.top, summary?.top);
  assert.equal(period?.page, jobTitle?.page);
  assert.equal(period?.top, jobTitle?.top);
});
