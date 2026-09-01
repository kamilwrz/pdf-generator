import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aureliaTemplate } from "../templates/aurelia.js";
import { cadenzaTemplate } from "../templates/cadenza.js";
import { meridianTemplate } from "../templates/meridian.js";
import { vellumTemplate } from "../templates/vellum.js";
import { buildSectionElements, SECTION_LAYOUTS } from "./sectionBuilder.js";
import {
  findRecordTemplateForLayout,
  replaceBuiltSectionRecord,
} from "./sectionRecord.js";
import { appendSectionAtEnd, deriveSectionStyle } from "./sectionStructure.js";

const PAGE_HEIGHT = 842;
const TEMPLATES = [
  ["Cadenza", cadenzaTemplate],
  ["Meridian", meridianTemplate],
  ["Aurelia", aureliaTemplate],
  ["Vellum", vellumTemplate],
];

function withStableIds(elements, prefix) {
  return elements.map((element, index) => ({
    ...element,
    element_id: element.element_id || `${prefix}-${index}`,
  }));
}

function makeIdFactory(prefix) {
  let index = 0;
  return () => `${prefix}-new-${(index += 1)}`;
}

function absoluteTop(element) {
  return (Math.max(1, Number(element?.page) || 1) - 1) * PAGE_HEIGHT
    + (Number(element?.top) || 0);
}

function buildTemplatedSection(documentElements, layout, prefix) {
  const template = findRecordTemplateForLayout(
    documentElements,
    layout,
    PAGE_HEIGHT,
    { lane: "main" },
  );
  assert.ok(template, `${prefix} must expose a source record for ${layout}`);

  const idFactory = makeIdFactory(`${prefix}-${layout}`);
  const built = buildSectionElements({
    name: "Certyfikaty",
    layout,
    style: deriveSectionStyle(documentElements, PAGE_HEIGHT),
    idFactory,
  });
  return {
    template,
    result: replaceBuiltSectionRecord(built, template, layout, {
      idFactory,
      pageHeight: PAGE_HEIGHT,
      lane: "main",
    }),
  };
}

describe("Add section inherits exact template record structure", () => {
  for (const [templateName, rawTemplate] of TEMPLATES) {
    for (const [layout, expectedFields] of [
      [
        SECTION_LAYOUTS.RECORD_EDUCATION,
        ["degree", "school", "period", "city", "description"],
      ],
      [
        SECTION_LAYOUTS.RECORD_EXPERIENCE,
        ["title", "organization", "period", "city", "description"],
      ],
    ]) {
      it(`${templateName} reuses its ${layout} rows and right-hand metadata rail`, () => {
        const documentElements = withStableIds(rawTemplate, templateName.toLowerCase());
        const { template, result } = buildTemplatedSection(
          documentElements,
          layout,
          templateName.toLowerCase(),
        );
        const body = result.elements.filter((element) => (
          element.editorAddedSection
          && element.editorSectionId === result.headingId
          && element.element_id !== result.headingId
        ));
        const overlays = body.filter((element) => element.flowRole === "record-overlay");
        const sourceOverlays = template.members.filter((element) => (
          element.flowRole === "record-overlay"
        ));

        assert.equal(body.length, template.members.length);
        assert.equal(overlays.length, 2);
        assert.equal(sourceOverlays.length, 2);
        assert.deepEqual(
          [...new Set(body.map((element) => element.editorRecordField))].sort(),
          [...expectedFields].sort(),
        );
        assert.deepEqual(
          overlays.map((element) => element.content).sort(),
          ["Lokalizacja", "Okres"],
        );
        assert.deepEqual(
          overlays.map((element) => [element.left, element.width, element.align]),
          sourceOverlays.map((element) => [element.left, element.width, element.align]),
        );
        assert.equal(
          body.find((element) => element.element_id === result.firstBodyId)?.flowRole,
          "content",
        );

        const packed = appendSectionAtEnd(
          documentElements,
          result.elements,
          PAGE_HEIGHT,
          {},
        );
        const packedBody = packed.filter((element) => (
          element.editorAddedSection
          && element.editorSectionId === result.headingId
          && element.element_id !== result.headingId
        ));
        const field = (role) => packedBody.find((element) => (
          element.editorRecordField === role
        ));
        const titleRole = layout === SECTION_LAYOUTS.RECORD_EDUCATION ? "degree" : "title";
        const organisationRole = layout === SECTION_LAYOUTS.RECORD_EDUCATION
          ? "school"
          : "organization";
        assert.ok(Math.abs(absoluteTop(field("period")) - absoluteTop(field(titleRole))) <= 3);
        assert.ok(Math.abs(absoluteTop(field("city")) - absoluteTop(field(organisationRole))) <= 3);
      });
    }
  }

  it("keeps the generic builder result when the document has no matching record", () => {
    const built = buildSectionElements({
      name: "Profil",
      layout: SECTION_LAYOUTS.TEXTAREA,
      style: deriveSectionStyle([], PAGE_HEIGHT),
      idFactory: makeIdFactory("fallback"),
    });
    assert.equal(
      findRecordTemplateForLayout([], SECTION_LAYOUTS.TEXTAREA, PAGE_HEIGHT),
      null,
    );
    assert.equal(
      replaceBuiltSectionRecord(built, null, SECTION_LAYOUTS.TEXTAREA),
      built,
    );
  });
});
