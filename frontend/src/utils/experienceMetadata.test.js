import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compactExperienceMetadata, experienceMetadataHints, experienceMetadataParts } from "./experienceMetadata.js";
import { syncCvDataFromCanvas } from "./syncCvDataFromCanvas.js";
import { prepareStarterElementsForRender } from "./starterElementStructure.js";

const row = {
  element_id: "experience-meta", category: "textarea", content: "", starterPlaceholder: true,
  cvDataBindings: ["company", "city", "period"].map((field) => ({ path: ["experience", 0, field] })),
};

describe("Experience metadata", () => {
  it("opts in only combined Experience rows, excluding Meridian rails and Education", () => {
    assert.equal(experienceMetadataHints(row).length, 3);
    assert.equal(experienceMetadataHints({ ...row, flowRole: "record-overlay" }), null);
    assert.equal(experienceMetadataHints({ ...row, cvDataBindings: [row.cvDataBindings[0]] }), null);
    assert.equal(experienceMetadataHints({ ...row, cvDataBindings: row.cvDataBindings.map((b) => ({ path: ["education", ...b.path.slice(1)] })) }), null);
    assert.equal(experienceMetadataHints({ category: "textarea", editorSectionType: "experience", placeholder: "Nazwa firmy · Miasto · Okres" }).length, 3);
  });

  it("keeps empty slots through profile synchronization and a reload", () => {
    const source = { experience: [{ title: "Developer", company: "", city: "", period: "", bullets: [] }] };
    const changed = { ...row, content: " ·  · 2020–2024", starterPlaceholder: false };
    const profile = syncCvDataFromCanvas(source, [row], [changed]);
    assert.equal(profile.experience[0].company, "");
    assert.equal(profile.experience[0].city, "");
    assert.equal(profile.experience[0].period, "2020–2024");
    assert.deepEqual(experienceMetadataParts(JSON.parse(JSON.stringify(changed)).content).map((p) => p.text), ["", "", "2020–2024"]);
  });

  it("compacts only the PDF copy and rebases inline marks", () => {
    const changed = { ...row, content: " ·  · 2024", runs: [{ start: 6, end: 10, bold: true }], starterPlaceholder: false };
    const compact = compactExperienceMetadata(changed);
    assert.equal(compact.content, "2024");
    assert.deepEqual(compact.runs, [{ start: 0, end: 4, bold: true }]);
    assert.equal(prepareStarterElementsForRender([changed])[0].content, "2024");
    assert.equal(changed.content, " ·  · 2024");
    assert.deepEqual(prepareStarterElementsForRender([row]), []);
  });
});
