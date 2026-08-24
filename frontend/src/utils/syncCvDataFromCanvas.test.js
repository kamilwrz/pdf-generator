import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { syncCvDataFromCanvas } from "./syncCvDataFromCanvas";

const profile = {
  name: "Anna Kowalska",
  summary: "Projektuję czytelne interfejsy.",
  skills: ["Figma", "React"],
  experience: [],
};

function text(element_id, content) {
  return { element_id, category: "textarea", content };
}

describe("syncCvDataFromCanvas", () => {
  it("preserves a uniquely mapped manual text edit for later template fills", () => {
    const updated = syncCvDataFromCanvas(
      profile,
      [text("summary", "Projektuję czytelne interfejsy.")],
      [text("summary", "Projektuję dostępne interfejsy.")],
    );

    assert.equal(updated.summary, "Projektuję dostępne interfejsy.");
    assert.equal(profile.summary, "Projektuję czytelne interfejsy.");
  });

  it("does not overwrite ambiguous duplicated profile text", () => {
    const duplicated = { ...profile, summary: "Figma" };
    const updated = syncCvDataFromCanvas(
      duplicated,
      [text("summary", "Figma")],
      [text("summary", "Sketch")],
    );

    assert.equal(updated, duplicated);
  });
});
