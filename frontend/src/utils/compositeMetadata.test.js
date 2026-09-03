import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compactCompositeMetadata, compositeMetadataHints, compositeMetadataParts } from "./compositeMetadata.js";
import { syncCvDataFromCanvas } from "./syncCvDataFromCanvas.js";
import { prepareStarterElementsForRender } from "./starterElementStructure.js";

const row = {
  element_id: "experience-meta", category: "textarea", content: "", starterPlaceholder: true,
  cvDataBindings: ["company", "city", "period"].map((field) => ({ path: ["experience", 0, field] })),
};

describe("Composite metadata", () => {
  it("opts in only matching rows, excluding rails and incompatible bindings", () => {
    assert.equal(compositeMetadataHints(row).length, 3);
    assert.equal(compositeMetadataHints({ ...row, flowRole: "record-overlay" }), null);
    assert.equal(compositeMetadataHints({ ...row, cvDataBindings: [row.cvDataBindings[0]] }), null);
    assert.equal(compositeMetadataHints({ ...row, cvDataBindings: row.cvDataBindings.map((b) => ({ path: ["education", ...b.path.slice(1)] })) }), null);
    assert.equal(compositeMetadataHints({ category: "textarea", editorSectionType: "experience", placeholder: "Nazwa firmy · Miasto · Okres" }).length, 3);
  });

  it("keeps empty slots through profile synchronization and a reload", () => {
    const source = { experience: [{ title: "Developer", company: "", city: "", period: "", bullets: [] }] };
    const changed = { ...row, content: " ·  · 2020–2024", starterPlaceholder: false };
    const profile = syncCvDataFromCanvas(source, [row], [changed]);
    assert.equal(profile.experience[0].company, "");
    assert.equal(profile.experience[0].city, "");
    assert.equal(profile.experience[0].period, "2020–2024");
    assert.deepEqual(compositeMetadataParts(JSON.parse(JSON.stringify(changed)).content).map((p) => p.text), ["", "", "2020–2024"]);
  });

  it("compacts only the PDF copy and rebases inline marks", () => {
    const changed = { ...row, content: " ·  · 2024", runs: [{ start: 6, end: 10, bold: true }], starterPlaceholder: false };
    const compact = compactCompositeMetadata(changed);
    assert.equal(compact.content, "2024");
    assert.deepEqual(compact.runs, [{ start: 0, end: 4, bold: true }]);
    assert.equal(prepareStarterElementsForRender([changed])[0].content, "2024");
    assert.equal(changed.content, " ·  · 2024");
    assert.deepEqual(prepareStarterElementsForRender([row]), []);
  });
});

const educationRow = {
  ...row, element_id: "education-meta",
  cvDataBindings: ["city", "period"].map((field) => ({ path: ["education", 0, field] })),
};

describe("Education metadata", () => {
  it("uses exactly two hints for generated and newly added combined rows", () => {
    assert.deepEqual(compositeMetadataHints(educationRow), ["Miasto", "RRRR – RRRR"]);
    assert.deepEqual(compositeMetadataHints({
      category: "textarea", editorSectionType: "education", placeholder: "Miasto · RRRR – RRRR",
    }), ["Miasto", "RRRR – RRRR"]);
    for (const field of ["school", "degree", "city", "period"]) {
      assert.equal(compositeMetadataHints({ ...educationRow, cvDataBindings: [{ path: ["education", 0, field] }] }), null);
    }
    assert.equal(compositeMetadataHints({ ...educationRow, flowRole: "record-overlay" }), null);
    assert.equal(compositeMetadataHints({ ...educationRow, cvDataBindings: [{ path: ["languages", 0, "name"] }, { path: ["languages", 0, "level"] }] }), null);
  });

  it("keeps a period-only value attached to the period after save/reload", () => {
    const source = { education: [{ degree: "Informatyka", school: "Uczelnia", city: "", period: "", description: "" }] };
    const changed = { ...educationRow, content: " · 2019–2022", starterPlaceholder: false };
    const profile = syncCvDataFromCanvas(source, [educationRow], [changed]);
    assert.deepEqual(profile.education[0], { ...source.education[0], period: "2019–2022" });
    assert.deepEqual(compositeMetadataParts(JSON.parse(JSON.stringify(changed)).content, 2).map((p) => p.text), ["", "2019–2022"]);
    const cleared = syncCvDataFromCanvas(profile, [changed], [educationRow]);
    assert.equal(cleared.education[0].period, "");
  });

  it("synchronizes the same empty-city position for a user-added Education record", () => {
    const shared = {
      category: "textarea", flowRole: "content", editorAddedRecord: true, editorSectionType: "education",
      editorRecordLayout: "cc-edu", flowGroup: "education-added", top: 100, left: 60, page: 1,
    };
    const added = [
      { ...shared, element_id: "degree", editorRecordField: "degree", content: "Informatyka" },
      { ...shared, element_id: "school", editorRecordField: "school", content: "Uczelnia", top: 115 },
      { ...shared, element_id: "meta", editorRecordField: "meta", placeholder: "Miasto · RRRR – RRRR", content: " · 2024", top: 130 },
    ];
    const heading = { element_id: "education-heading", category: "text", content: "WYKSZTAŁCENIE", flowRole: "section-chrome", left: 60, top: 70, page: 1 };
    const profile = syncCvDataFromCanvas({ education: [], labels: { education: "WYKSZTAŁCENIE" } }, [heading], [heading, ...added]);
    assert.equal(profile.education[0].city, "");
    assert.equal(profile.education[0].period, "2024");
  });

  it("omits guidance and unused dots only in the rendered PDF copy", () => {
    const changed = { ...educationRow, content: " · 2024", runs: [{ start: 3, end: 7, italic: true }] };
    const compact = prepareStarterElementsForRender([changed])[0];
    assert.equal(compact.content, "2024");
    assert.deepEqual(compact.runs, [{ start: 0, end: 4, italic: true }]);
    assert.equal(changed.content, " · 2024");
    assert.deepEqual(prepareStarterElementsForRender([educationRow]), []);
    assert.equal(compactCompositeMetadata({ ...educationRow, content: "Wrocław · " }).content, "Wrocław");
  });
});
