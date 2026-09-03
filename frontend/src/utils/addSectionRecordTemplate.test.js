import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aureliaTemplate } from "../templates/aurelia.js";
import { cadenzaTemplate } from "../templates/cadenza.js";
import { meridianTemplate } from "../templates/meridian.js";
import { vellumTemplate } from "../templates/vellum.js";
import {
  buildSectionElements,
  SECTION_LAYOUTS,
  SECTION_TYPES,
} from "./sectionBuilder.js";
import {
  findRecordTemplateForLayout,
  replaceBuiltSectionRecord,
} from "./sectionRecord.js";
import {
  appendSectionAtEnd,
  deriveSectionStyle,
  listDocumentSections,
  sectionElementIds,
} from "./sectionStructure.js";

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

  it("Meridian gives the first added Education section its native metadata rail", () => {
    const completeTemplate = withStableIds(meridianTemplate, "meridian-first");
    const educationSection = listDocumentSections(completeTemplate, PAGE_HEIGHT)
      .find((section) => section.title.toLocaleLowerCase("pl-PL").includes("wykształcenie"));
    assert.ok(educationSection);
    const educationIds = sectionElementIds(
      completeTemplate,
      educationSection.headingId,
      PAGE_HEIGHT,
    );
    const liveWithoutEducation = completeTemplate.filter((element) => (
      !educationIds.has(element.element_id)
    ));

    const template = findRecordTemplateForLayout(
      liveWithoutEducation,
      SECTION_LAYOUTS.RECORD_EDUCATION,
      PAGE_HEIGHT,
      { lane: "main" },
    );
    assert.ok(template, "the live Experience rail must be reusable for Education");

    const idFactory = makeIdFactory("meridian-first-education");
    const built = buildSectionElements({
      sectionType: SECTION_TYPES.EDUCATION,
      style: deriveSectionStyle(liveWithoutEducation, PAGE_HEIGHT),
      idFactory,
    });
    const result = replaceBuiltSectionRecord(
      built,
      template,
      SECTION_LAYOUTS.RECORD_EDUCATION,
      { idFactory, pageHeight: PAGE_HEIGHT, lane: "main" },
    );
    const body = result.elements.filter((element) => (
      element.editorAddedSection
      && element.editorSectionId === result.headingId
      && element.element_id !== result.headingId
    ));
    const byRole = Object.fromEntries(body.map((element) => [
      element.editorRecordField,
      element,
    ]));

    assert.deepEqual(
      [...new Set(body.map((element) => element.editorRecordField))].sort(),
      ["city", "degree", "description", "period", "school"],
    );
    assert.equal(byRole.degree.placeholder, "Kierunek lub dyplom");
    assert.equal(byRole.school.placeholder, "Nazwa uczelni lub szkoły");
    assert.equal(byRole.period.placeholder, "RRRR – RRRR");
    assert.equal(byRole.city.placeholder, "Miasto");
    assert.equal(byRole.description.placeholder, "Specjalizacja, wyróżnienia lub istotne zajęcia.");
    assert.ok(body.every((element) => element.content === ""));
    assert.equal(byRole.period.flowRole, "record-overlay");
    assert.equal(byRole.city.flowRole, "record-overlay");
    assert.ok(Math.abs(absoluteTop(byRole.period) - absoluteTop(byRole.degree)) <= 3);
    assert.ok(Math.abs(absoluteTop(byRole.city) - absoluteTop(byRole.school)) <= 3);
  });

  it("uses Meridian's authored fallback when the live CV has no record sections", () => {
    const completeTemplate = withStableIds(meridianTemplate, "meridian-fallback");
    const recordSectionIds = new Set();
    for (const section of listDocumentSections(completeTemplate, PAGE_HEIGHT)) {
      const normalizedTitle = section.title.toLocaleLowerCase("pl-PL");
      if (normalizedTitle.includes("doświadczenie") || normalizedTitle.includes("wykształcenie")) {
        for (const id of sectionElementIds(completeTemplate, section.headingId, PAGE_HEIGHT)) {
          recordSectionIds.add(id);
        }
      }
    }
    const liveWithoutRecords = completeTemplate.filter((element) => (
      !recordSectionIds.has(element.element_id)
    ));

    const template = findRecordTemplateForLayout(
      liveWithoutRecords,
      SECTION_LAYOUTS.RECORD_EDUCATION,
      PAGE_HEIGHT,
      { lane: "main", fallbackElements: completeTemplate },
    );

    assert.ok(template);
    assert.equal(
      template.members.filter((element) => element.flowRole === "record-overlay").length,
      2,
    );
  });

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
