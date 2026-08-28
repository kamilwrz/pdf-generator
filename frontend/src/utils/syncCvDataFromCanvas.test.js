import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { syncCvDataFromCanvas } from "./syncCvDataFromCanvas";

const profile = {
  name: "Anna Kowalska",
  title: "",
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

  it("does not write a lane-transfer composite into a Skills category", () => {
    const grouped = {
      ...profile,
      skills: [
        { category: "Research and IT", items: ["AI", "UX"] },
        { category: "Soft Skills", items: ["Communication", "Teamwork"] },
      ],
    };
    const combined = [
      "Research and IT",
      "• AI",
      "• UX",
      "Soft Skills",
      "• Communication",
      "• Teamwork",
    ].join("\n");
    const updated = syncCvDataFromCanvas(
      grouped,
      [{
        ...text("research-category", "Research and IT"),
        flowRole: "content",
        flowGroup: "skills-research",
        bulletList: false,
      }],
      [{
        ...text("research-category", combined),
        flowRole: "content",
        flowLane: "sidebar",
        bulletList: true,
      }],
    );

    assert.equal(updated, grouped);
    assert.deepEqual(updated.skills, grouped.skills);
  });

  it("persists an AI correction that intentionally clears a field", () => {
    const updated = syncCvDataFromCanvas(
      profile,
      [text("summary", "Projektuję czytelne interfejsy.")],
      [text("summary", "")],
    );

    assert.equal(updated.summary, "");
  });

  it("persists a masthead title typed into a newly added empty field", () => {
    const emptyTitle = {
      ...text("masthead-title", ""),
      mastheadRole: "title",
      mastheadBandId: "masthead-main",
    };
    const updated = syncCvDataFromCanvas(
      profile,
      [emptyTitle],
      [{ ...emptyTitle, content: "Product Manager" }],
    );

    assert.equal(updated.title, "Product Manager");
    assert.equal(profile.title, "");
  });

  it("persists a populated masthead title added with a fresh element id", () => {
    const hiddenAnchor = {
      element_id: "masthead-anchor",
      category: "text",
      flowRole: "masthead-anchor",
      mastheadBandId: "masthead-main",
      mastheadIdentity: { title: { present: false } },
    };
    const updated = syncCvDataFromCanvas(
      profile,
      [hiddenAnchor],
      [
        {
          ...hiddenAnchor,
          mastheadIdentity: { title: { present: true } },
        },
        {
          ...text("new-masthead-title", "Product Manager"),
          mastheadRole: "title",
          mastheadBandId: "masthead-main",
        },
      ],
    );

    assert.equal(updated.title, "Product Manager");
  });

  it("does not persist a generator-truncated title during template replacement", () => {
    const longTitle = "Senior International Product Strategy and Operations Manager";
    const titledProfile = { ...profile, title: longTitle };
    const oldAnchor = {
      element_id: "old-anchor",
      category: "text",
      flowRole: "masthead-anchor",
      mastheadBandId: "masthead-main",
      mastheadIdentity: { title: { present: true } },
    };
    const newAnchor = { ...oldAnchor, element_id: "new-anchor" };
    const updated = syncCvDataFromCanvas(
      titledProfile,
      [
        oldAnchor,
        {
          ...text("old-title", longTitle),
          mastheadRole: "title",
          mastheadBandId: "masthead-main",
        },
      ],
      [
        newAnchor,
        {
          ...text("new-title", "Senior International Product Strategy…"),
          mastheadRole: "title",
          mastheadBandId: "masthead-main",
        },
      ],
    );

    assert.equal(updated, titledProfile);
    assert.equal(updated.title, longTitle);
  });

  it("keeps the semantic profile title when the canvas title is only hidden", () => {
    const titledProfile = { ...profile, title: "Product Manager" };
    const titleElement = {
      ...text("masthead-title", "Product Manager"),
      mastheadRole: "title",
      mastheadBandId: "masthead-main",
    };
    const updated = syncCvDataFromCanvas(titledProfile, [titleElement], []);

    assert.equal(updated, titledProfile);
    assert.equal(updated.title, "Product Manager");
  });

  it("does not rewrite another field that duplicates the previous title", () => {
    const duplicated = {
      ...profile,
      title: "Project Manager",
      summary: "Project Manager",
    };
    const titleElement = {
      ...text("masthead-title", "Project Manager"),
      mastheadRole: "title",
      mastheadBandId: "masthead-main",
    };
    const updated = syncCvDataFromCanvas(
      duplicated,
      [titleElement],
      [{ ...titleElement, content: "Product Director" }],
    );

    assert.equal(updated.title, "Product Director");
    assert.equal(updated.summary, "Project Manager");
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
