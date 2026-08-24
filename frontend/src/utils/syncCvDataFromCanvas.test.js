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

  it("maps an AI translation of a rendered bullet to its profile sentence", () => {
    const experience = { ...profile, experience: [{ description: "Teamwork" }] };
    const updated = syncCvDataFromCanvas(
      experience,
      [{ ...text("description", "• Teamwork"), bulletList: true }],
      [{ ...text("description", "• Praca zespołowa"), bulletList: true }],
    );

    assert.equal(updated.experience[0].description, "Praca zespołowa");
  });

  it("persists an AI correction that intentionally clears a field", () => {
    const updated = syncCvDataFromCanvas(
      profile,
      [text("summary", "Projektuję czytelne interfejsy.")],
      [text("summary", "")],
    );

    assert.equal(updated.summary, "");
  });

  it("removes a structurally deleted record from the next template fill", () => {
    const experience = {
      ...profile,
      experience: [
        { company: "Acme", position: "Designer", description: "Built products." },
        { company: "Beta", position: "Lead", description: "Managed a team." },
      ],
    };
    const updated = syncCvDataFromCanvas(
      experience,
      [
        text("acme-company", "Acme"),
        text("acme-position", "Designer"),
        text("acme-description", "Built products."),
        text("beta-company", "Beta"),
      ],
      [text("beta-company", "Beta")],
      [
        { ...text("acme-company", "Acme"), deletedRecord: true },
        { ...text("acme-position", "Designer"), deletedRecord: true },
        { ...text("acme-description", "Built products."), deletedRecord: true },
      ],
    );

    assert.equal(updated.experience.length, 1);
    assert.equal(updated.experience[0].company, "Beta");
  });
});
