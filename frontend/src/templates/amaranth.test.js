import assert from "node:assert/strict";
import test from "node:test";

import { amaranthTemplate } from "./amaranth.js";
import {
  applyFlowSpacing,
  listDocumentSections,
} from "../utils/sectionStructure.js";
import { reflowTextareaHeight } from "../utils/textareaReflow.js";

const PAGE_HEIGHT = 842;
const SUMMARY_PREFIX = "Managerka strategii i operacji";

function withElementIds(elements) {
  return elements.map((element, index) => ({
    ...element,
    element_id: `amaranth-${index}`,
  }));
}

function absoluteTop(element) {
  return ((Number(element?.page) || 1) - 1) * PAGE_HEIGHT + (Number(element?.top) || 0);
}

// The rounded summary field is a non-flowing mate of the summary textarea. It
// must sit slightly above the copy (top padding) and extend past its bottom
// (bottom padding) so the tint always frames the whole paragraph, at rest and
// after the spacing/reflow passes grow the textarea.
function assertSummaryFieldCovers(elements) {
  const summary = elements.find((element) => element.content?.startsWith(SUMMARY_PREFIX));
  const field = elements.find((element) => element.flowRole === "section-background");
  assert.ok(summary, "summary copy present");
  assert.ok(field, "summary field present");
  assert.equal(field.page, summary.page);
  assert.ok(absoluteTop(field) <= absoluteTop(summary), "field top padding covers the copy top");
  assert.ok(
    absoluteTop(field) + Number(field.height) >= absoluteTop(summary) + Number(summary.height) + 8,
    "field bottom padding covers the copy bottom",
  );
}

test("Amaranth renders its rounded claret chrome and exact date rail", () => {
  const pageSurface = amaranthTemplate.find(
    (element) => element.fixedToPage && element.width === 595 && element.height === 842,
  );
  assert.equal(pageSurface?.backgroundColor, "#FFFFFF");
  assert.equal(pageSurface?.appearanceTemplateId, "amaranth");
  assert.deepEqual(pageSurface?.appearanceSettings, { palette: "claret", textSize: "M" });

  // Name uses the rarely-used Playfair Display face in title case (no uppercase
  // transform), the deliberate contrast with the tracked uppercase role line.
  const name = amaranthTemplate.find((element) => element.mastheadRole === "name");
  assert.equal(name?.fontFamily, "PlayfairDisplay");
  assert.equal(name?.align, "left");
  assert.notEqual(name?.textTransform, "uppercase");

  // Rounded-rectangle photo slot: a rect frame with a real corner radius, its
  // portrait glyph drawn from the reused burgundy icon set, and every member
  // tagged as fixed, non-repeating photo chrome.
  const frame = amaranthTemplate.find((element) => element.id === "amaranth-photo-frame");
  const glyph = amaranthTemplate.find((element) => element.id === "amaranth-photo-glyph");
  assert.equal(frame?.category, "rectangle");
  assert.equal(frame?.photoShape, "rect");
  assert.equal(frame?.borderRadius, 14);
  assert.equal(frame?.appearanceColorRole, "photo");
  assert.equal(glyph?.photoSlot, "glyph");
  assert.match(glyph?.src, /\/vellum-burgundy\/portrait\.png$/);
  const photoCluster = amaranthTemplate.filter((element) => element.photoSlot);
  assert.equal(photoCluster.length, 3);
  assert.ok(photoCluster.every((element) => (
    element.fixedToPage === true && element.repeatOnContinuation === false
  )));

  // Rounded claret section chips: filled rectangles with a shared radius and a
  // white label sitting on top.
  const chips = amaranthTemplate.filter(
    (element) => element.flowRole === "section-chrome"
      && element.category === "rectangle"
      && element.filled === true,
  );
  assert.ok(chips.length >= 4, "one rounded chip per section");
  assert.ok(chips.every((chip) => chip.borderRadius === 6 && chip.backgroundColor === "#78304A"));

  // Rounded summary field bound to the summary textarea's keep-together group.
  const summary = amaranthTemplate.find((element) => element.content?.startsWith(SUMMARY_PREFIX));
  const summaryField = amaranthTemplate.find((element) => element.flowRole === "section-background");
  assert.ok(summary);
  assert.equal(summaryField?.id, "amaranth-summary-field");
  assert.equal(summaryField?.category, "rectangle");
  assert.equal(summaryField?.borderRadius, 12);
  assert.equal(summaryField?.appearanceColorRole, "field");
  assert.equal(summaryField?.flowGroup, summary.flowGroup);
  assert.ok(summaryField.top < summary.top, "field starts above the copy for top padding");

  // Skills precede the experience history, matching the authored order.
  const headings = listDocumentSections(withElementIds(amaranthTemplate), PAGE_HEIGHT);
  assert.ok(
    headings.findIndex((section) => section.title === "UMIEJĘTNOŚCI")
      < headings.findIndex((section) => section.title === "DOŚWIADCZENIE ZAWODOWE"),
  );

  // Date rail: the period is a right-aligned, non-flowing overlay pinned to the
  // exact top of the record title it annotates (not the masthead title with the
  // same text).
  const jobTitle = amaranthTemplate.find(
    (element) => element.content === "Strategy & Operations Manager" && !element.mastheadRole,
  );
  const period = amaranthTemplate.find((element) => element.content === "01/2023 – obecnie");
  assert.ok(jobTitle);
  assert.ok(period);
  assert.equal(period.top, jobTitle.top);
  assert.equal(period.flowRole, "record-overlay");
  assert.equal(period.align, "right");
  assert.equal(period.autoHeight, false);

  assertSummaryFieldCovers(amaranthTemplate);
});

test("Amaranth keeps the summary field framing the copy through spacing and reflow", () => {
  const source = withElementIds(amaranthTemplate);
  const rhythm = { stack: 6, record: 16, section: 28, after_rule: 10 };
  const packed = applyFlowSpacing(source, rhythm, PAGE_HEIGHT);
  assertSummaryFieldCovers(packed);

  // The period overlay stays pinned to its record title after repacking.
  const jobTitle = packed.find(
    (element) => element.content === "Strategy & Operations Manager" && !element.mastheadRole,
  );
  const period = packed.find((element) => element.content === "01/2023 – obecnie");
  assert.equal(period?.page, jobTitle?.page);
  assert.equal(period?.top, jobTitle?.top);

  // Growing the summary textarea must grow the field with it, not leave a gap.
  const summary = packed.find((element) => element.content?.startsWith(SUMMARY_PREFIX));
  const grown = reflowTextareaHeight(
    packed,
    summary.element_id,
    Number(summary.height) + 22,
    PAGE_HEIGHT,
    { pageTop: 66, bottomMargin: 72, spacing: rhythm },
  ).elements;
  assertSummaryFieldCovers(grown);
});
