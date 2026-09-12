import assert from "node:assert/strict";
import test from "node:test";
import { cadenzaTemplate } from "../templates/cadenza.js";
import { hydratePersistedCanvasElement } from "./persistedCanvasElement.js";
import { preserveSavedTextLayouts, hasUnchangedSavedTextLayout } from "./savedTextLayout.js";
import { applyFlowSpacing, listDocumentSections, normalizeFilledBandSectionMetadata } from "./sectionStructure.js";
import { normalizeCommittedDocumentSnapshot } from "./documentSnapshotCommit.js";
import { reflowTextareaHeight } from "./textareaReflow.js";
import { COMPACT_FLOW_SPACING, DEFAULT_FLOW_SPACING } from "./flowSpacing.js";

const COLUMNS = new Set([
  "element_id", "category", "page", "left", "top", "width", "height", "content",
  "fontFamily", "fontSize", "color", "src", "backgroundColor", "img_id",
]);

// Model the API's nullable columns separately from its editor metadata. JSON
// must drop undefined fields just as a real save/reopen round trip does.
function reopen(elements) {
  return preserveSavedTextLayouts(elements.map((element, index) => {
    const row = { id: index + 1, extra_properties: {} };
    for (const [key, value] of Object.entries(element)) {
      (COLUMNS.has(key) ? row : row.extra_properties)[key] = value;
    }
    for (const key of COLUMNS) row[key] ??= null;
    return hydratePersistedCanvasElement(JSON.parse(JSON.stringify(row)));
  }));
}

for (const missingRole of [undefined, null]) {
  test(`density keeps saved filled bands with their headings when decorative flowRole is ${missingRole}`, () => {
    const source = cadenzaTemplate.map((element, index) => ({
      ...element, element_id: `band-${index}`,
    }));
    let restored = reopen(source.map((element) => element.category === "line"
      && element.flowRole === "section-chrome" ? { ...element, flowRole: missingRole } : element));
    let expected = source;
    for (const spacing of [DEFAULT_FLOW_SPACING, COMPACT_FLOW_SPACING, DEFAULT_FLOW_SPACING]) {
      expected = applyFlowSpacing(expected, spacing, 842);
      restored = applyFlowSpacing(restored, spacing, 842);
      assert.deepEqual(restored.map((element) => [element.element_id, element.page, element.top]),
        expected.map((element) => [element.element_id, element.page, element.top]));
      restored = reopen(restored);
    }
  });
}

test("load repairs only unambiguous legacy band metadata before preserving saved geometry", () => {
  const band = { element_id: "band", category: "line", left: 58, top: 160, width: 479, height: 18, page: 1 };
  const accent = { ...band, element_id: "accent", width: 3 };
  const heading = { element_id: "heading", category: "text", left: 260, top: 165, fontSize: 8,
    content: "Skills", page: 1, flowRole: "section-chrome" };
  const body = { element_id: "body", category: "textarea", left: 58, top: 186, width: 479, height: 25,
    content: "Authored text", page: 1, autoHeight: true, flowRole: "content" };
  const source = [band, accent, heading, body];
  const { elements } = normalizeCommittedDocumentSnapshot({ pdfId: 41, templateId: "cadenza", elements: source });
  assert.deepEqual(elements.map((element) => [element.top, element.height]), source.map((element) => [element.top, element.height]));
  assert.equal(elements[0].flowRole, "section-chrome");
  assert.equal(elements[1].flowRole, "section-chrome");
  assert.ok(hasUnchangedSavedTextLayout(elements[3]));
  assert.equal(normalizeFilledBandSectionMetadata(elements), elements, "normalization is idempotent");

  for (const excluded of [
    [band, heading],
    [{ ...band, fixedToPage: true }, accent, heading],
    [{ ...band, flowRole: "section-background" }, accent, heading],
    [{ ...band, flowLane: "sidebar" }, accent, heading],
    [band, accent, heading, { ...heading, element_id: "other-heading" }],
  ]) {
    assert.equal(normalizeFilledBandSectionMetadata(excluded), excluded);
  }
});

function assertLanguageRow(elements) {
  const cells = elements.filter((element) => element.gridKind === "languages");
  assert.equal(cells.length, 4);
  assert.equal(new Set(cells.map((element) => element.page)).size, 1, "all language cells share a page");
  assert.equal(new Set(cells.map((element) => element.top)).size, 1, "all language cells share a row");
}

for (const saved of [false, true]) {
  test(`${saved ? "saved" : "fresh"} Cadenza keeps the complete language row after a narrow record edit and density changes`, () => {
    const source = cadenzaTemplate.map((element, index) => ({
      ...element, element_id: `cadenza-${index}`,
    }));
    const title = source.find((element) => element.category === "textarea"
      && element.flowRole === "content" && element.bold);
    const originalHeadings = listDocumentSections(source).map((section) => section.headingId);
    let elements = saved ? reopen(source) : source;
    const beforeCells = elements.filter((element) => element.gridKind === "languages");
    assert.ok(title.width < beforeCells.at(-1).left - title.left, "the date rail makes the title narrower than the grid");
    elements = reflowTextareaHeight(elements, title.element_id, title.height + 5, 842, {
      pageTop: 66, bottomMargin: 72,
    }).elements;
    assertLanguageRow(elements);
    assert.equal(elements.find((element) => element.element_id === beforeCells[0].element_id).top,
      beforeCells[0].top + 5, "the complete following grid moves by the edit delta");
    for (const spacing of [COMPACT_FLOW_SPACING, DEFAULT_FLOW_SPACING, COMPACT_FLOW_SPACING]) {
      elements = applyFlowSpacing(reopen(elements), spacing, 842);
      assertLanguageRow(elements);
      assert.deepEqual(listDocumentSections(elements).map((section) => section.headingId), originalHeadings);
    }
  });
}
