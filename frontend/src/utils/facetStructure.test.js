import assert from "node:assert/strict";
import test from "node:test";
import { facetTemplate } from "../templates/facet.js";
import { materializeElementSpecs } from "./materializeElementSpecs.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import { reflowTextareaHeight } from "./textareaReflow.js";
import { applyFacetPalette, applyFacetTextSizeLayout } from "./facetAppearance.js";
import { applyFlowSpacing, deriveSectionStyle, sectionElementIds, sidebarSectionElementIds } from "./sectionStructure.js";
import { resolveSectionLaneTransfer, transferSectionLane } from "./transferSectionLane.js";
import { normalizeCommittedDocumentSnapshot } from "./documentSnapshotCommit.js";
import { buildSectionElements } from "./sectionBuilder.js";

const PAGE_HEIGHT = 842;
const spacing = DEFAULT_FLOW_SPACING;
let serial = 0;
const createId = () => `facet-structure-${++serial}`;
const fixture = () => materializeElementSpecs(structuredClone(facetTemplate), createId);
const absoluteTop = (element) => (element.page - 1) * PAGE_HEIGHT + element.top;

function chrome(elements, headingId) {
  const heading = elements.find((element) => element.element_id === headingId);
  const ids = heading.flowLane === "sidebar"
    ? sidebarSectionElementIds(elements, headingId, PAGE_HEIGHT)
    : sectionElementIds(elements, headingId, PAGE_HEIGHT);
  const members = elements.filter((element) => ids.has(element.element_id));
  return {
    rule: members.find((element) => element.category === "line"),
    accent: members.find((element) => element.category === "polygon"),
  };
}

function assertAligned(elements, headingId) {
  const { rule, accent } = chrome(elements, headingId);
  assert.ok(rule && accent, "the section retains both parts of its underline");
  assert.equal(absoluteTop(accent), absoluteTop(rule), "tapered accent stays on the underline");
  assert.equal(accent.left, rule.left);
  assert.deepEqual(accent.points, [[0, 0], [1, 0], [.82, 1], [0, 1]]);
  assert.equal(accent.filled, true);
}

test("Facet education underline follows live text growth, shrink and a page break", () => {
  const source = fixture();
  const heading = source.find((element) => element.content === "WYKSZTAŁCENIE");
  const precedingBody = source.filter((element) => element.flowRole === "content"
    && element.category === "textarea" && element.flowLane !== "sidebar"
    && element.top < heading.top).at(-1);
  let elements = applyFacetPalette(source, "plum");
  elements = applyFacetTextSizeLayout(elements, "S", { spacing, createId });
  let reachedContinuation = false;
  for (const height of [precedingBody.height + 6, 310, precedingBody.height]) {
    elements = reflowTextareaHeight(elements, precedingBody.element_id, height, PAGE_HEIGHT,
      { pageTop: 66, bottomMargin: 72, spacing }).elements;
    assertAligned(elements, heading.element_id);
    reachedContinuation ||= elements.find((element) => element.element_id === heading.element_id).page > 1;
  }
  assert.ok(reachedContinuation, "the regression exercises a real page boundary");
});

test("Facet repairs a saved separated accent before establishing the clean snapshot", () => {
  const source = fixture();
  const heading = source.find((element) => element.content === "WYKSZTAŁCENIE");
  const { accent } = chrome(source, heading.element_id);
  const broken = source.map((element) => element === accent ? { ...element, top: element.top - 6 } : element);
  const snapshot = normalizeCommittedDocumentSnapshot({ pdfId: 41, templateId: "facet", elements: broken });
  assertAligned(snapshot.elements, heading.element_id);
  assertAligned(applyFlowSpacing(broken, spacing), heading.element_id);
  assert.deepEqual(normalizeCommittedDocumentSnapshot(snapshot), snapshot);
  assert.equal(broken.find((element) => element.element_id === accent.element_id).top, accent.top - 6,
    "repair does not mutate the saved input");
  for (const corner of source.filter((element) => element.fixedToPage && element.category === "polygon")) {
    assert.deepEqual(snapshot.elements.find((element) => element.element_id === corner.element_id), corner);
  }
});

test("Facet transfers a sidebar section to main and back in a dark palette", () => {
  let elements = applyFacetPalette(fixture(), "midnight");
  const heading = elements.find((element) => element.content === "PODSUMOWANIE ZAWODOWE");
  const memberIds = sidebarSectionElementIds(elements, heading.element_id);
  const body = elements.find((element) => memberIds.has(element.element_id) && element.category === "textarea");
  for (const lane of [undefined, "sidebar"]) {
    elements = transferSectionLane(elements, heading.element_id, PAGE_HEIGHT, spacing);
    assert.equal(elements.find((element) => element.element_id === heading.element_id).flowLane, lane);
    assertAligned(elements, heading.element_id);
    assert.equal(elements.find((element) => element.element_id === body.element_id).content, body.content);
    assert.equal(chrome(elements, heading.element_id).accent.backgroundColor, "#8FC8F2");
  }
});

test("Facet transfers Education to the rail and back with its content and polygon geometry", () => {
  let elements = applyFacetPalette(fixture(), "carbon");
  const heading = elements.find((element) => element.content === "WYKSZTAŁCENIE");
  const experience = elements.find((element) => element.content === "DOŚWIADCZENIE ZAWODOWE");
  assert.equal(resolveSectionLaneTransfer(elements, experience.element_id), null);
  assert.equal(resolveSectionLaneTransfer(elements, heading.element_id), "to-sidebar");
  const original = elements.filter((element) => sectionElementIds(elements, heading.element_id).has(element.element_id)
    && element.flowRole === "content").map((element) => [element.element_id, element.content]);
  for (const lane of ["sidebar", undefined]) {
    elements = transferSectionLane(elements, heading.element_id, PAGE_HEIGHT, spacing);
    assert.ok(elements);
    assert.equal(elements.find((element) => element.element_id === heading.element_id).flowLane, lane);
    assertAligned(elements, heading.element_id);
    for (const [id, content] of original) assert.equal(elements.find((element) => element.element_id === id)?.content, content);
  }
});

test("Facet section builders copy polygon points without sharing mutable vertices", () => {
  const source = fixture();
  const style = deriveSectionStyle(source, PAGE_HEIGHT);
  const marker = style.markers.find((shape) => shape.category === "polygon");
  assert.ok(marker);
  const built = buildSectionElements({ name: "Projekty", style, idFactory: createId });
  const accent = built.elements.find((element) => element.category === "polygon");
  assert.deepEqual(accent.points, marker.points);
  assert.notEqual(accent.points, marker.points);
  assert.equal(accent.filled, true);
});
