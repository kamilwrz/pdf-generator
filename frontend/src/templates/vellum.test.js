import assert from "node:assert/strict";
import test from "node:test";

import { vellumTemplate } from "./vellum.js";
import {
  applyFlowSpacing,
  listDocumentSections,
  reorderSection,
} from "../utils/sectionStructure.js";
import { reflowTextareaHeight } from "../utils/textareaReflow.js";

const PAGE_HEIGHT = 842;

function withElementIds(elements) {
  return elements.map((element, index) => ({
    ...element,
    element_id: `vellum-${index}`,
  }));
}

function absoluteTop(element) {
  return ((Number(element?.page) || 1) - 1) * PAGE_HEIGHT + (Number(element?.top) || 0);
}

function assertSummaryBandIsContinuous(elements) {
  const summary = elements.find(
    (element) => element.content?.startsWith("Analityczka AML łącząca"),
  );
  const headingBand = elements.find(
    (element) => element.flowRole === "section-chrome"
      && element.backgroundColor === "#E7ECE8"
      && element.width === 595,
  );
  const summaryBackground = elements.find(
    (element) => element.flowRole === "section-background",
  );
  assert.ok(summary);
  assert.ok(headingBand);
  assert.ok(summaryBackground);
  assert.equal(summaryBackground.page, summary.page);
  assert.equal(
    absoluteTop(summaryBackground),
    absoluteTop(headingBand) + Number(headingBand.height),
    "the title band and summary fill must meet without a white seam",
  );
  assert.ok(
    absoluteTop(summaryBackground) + Number(summaryBackground.height)
      >= absoluteTop(summary) + Number(summary.height) + 8,
    "the fill must cover the active top gap, summary copy, and lower padding",
  );
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
  const photoCluster = vellumTemplate.filter((element) => element.photoSlot);
  assert.equal(photoCluster.length, 3);
  assert.ok(photoCluster.every((element) => (
    element.fixedToPage === true && element.repeatOnContinuation === false
  )));

  const summary = vellumTemplate.find(
    (element) => element.content?.startsWith("Analityczka AML łącząca"),
  );
  const summaryBackground = vellumTemplate.find(
    (element) => element.flowRole === "section-background",
  );
  assert.ok(summary);
  assert.equal(summaryBackground?.top, summary.top);
  assert.equal(summaryBackground?.flowGroup, summary.flowGroup);
  assert.equal(summaryBackground?.id, "vellum-summary-background");

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

test("Vellum keeps one continuous summary field through spacing, reorder, and live reflow", () => {
  const source = withElementIds(vellumTemplate);
  const rhythm = { stack: 6, record: 16, section: 28, after_rule: 10 };
  const packed = applyFlowSpacing(
    source,
    rhythm,
    PAGE_HEIGHT,
  );
  assertSummaryBandIsContinuous(packed);

  const repacked = applyFlowSpacing(packed, rhythm, PAGE_HEIGHT);
  const packedBackground = packed.find(
    (element) => element.flowRole === "section-background",
  );
  const repackedBackground = repacked.find(
    (element) => element.flowRole === "section-background",
  );
  assert.equal(repackedBackground?.top, packedBackground?.top);
  assert.equal(repackedBackground?.height, packedBackground?.height);

  const jobTitle = packed.find((element) => element.content === "Analityczka AML");
  const period = packed.find((element) => element.content === "2022 – obecnie");
  assert.equal(period?.page, jobTitle?.page);
  assert.equal(period?.top, jobTitle?.top);

  const summarySection = listDocumentSections(repacked, PAGE_HEIGHT).find(
    (section) => section.title === "PODSUMOWANIE ZAWODOWE",
  );
  const reordered = reorderSection(
    repacked,
    summarySection.headingId,
    "down",
    PAGE_HEIGHT,
    { spacing: rhythm },
  );
  assert.ok(reordered);
  assertSummaryBandIsContinuous(reordered);

  const reorderedSummary = reordered.find(
    (element) => element.content?.startsWith("Analityczka AML łącząca"),
  );
  const grown = reflowTextareaHeight(
    reordered,
    reorderedSummary.element_id,
    Number(reorderedSummary.height) + 22,
    PAGE_HEIGHT,
    { pageTop: 66, bottomMargin: 72, spacing: rhythm },
  ).elements;
  assertSummaryBandIsContinuous(grown);
});
