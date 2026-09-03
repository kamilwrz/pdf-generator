import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildStarterDocument,
  createDefaultStarterConfig,
  finalizeStarterElements,
  prepareStarterProfileForTemplate,
} from "./cvStarter.js";

describe("CV starter adapter", () => {
  it("creates the agreed default setup with an empty persisted profile", () => {
    const config = createDefaultStarterConfig();
    const { cvData, fillProfile } = buildStarterDocument(config);
    assert.equal(config.templateId, "meridian");
    assert.deepEqual(cvData.starter_structure.contacts, ["phone", "email", "location"]);
    assert.deepEqual(cvData.starter_structure.sections.map((section) => section.key), [
      "summary", "experience", "education", "skills",
    ]);
    assert.equal(cvData.name, "");
    assert.match(fillProfile.name, /CVSTART_NAME/);
    assert.equal(fillProfile.email, "cvstart-email@example.invalid");
    assert.match(fillProfile.email, /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });

  it("uses a validator-safe e-mail sentinel and removes it from the canvas", () => {
    const { fillProfile } = buildStarterDocument(createDefaultStarterConfig());
    const [email] = finalizeStarterElements([{
      category: "text",
      content: fillProfile.email,
    }]);
    assert.equal(email.content, "");
    assert.equal(email.placeholder, "imie.nazwisko@email.com");
    assert.deepEqual(email.cvDataBindings, [{
      path: ["email"],
      placeholder: "imie.nazwisko@email.com",
    }]);
  });

  it("removes markers and persists composite bindings", () => {
    const elements = finalizeStarterElements([{
      category: "text",
      content: "__CVSTART_EXPERIENCE_COMPANY__ · __CVSTART_EXPERIENCE_CITY__ · __CVSTART_EXPERIENCE_PERIOD__",
    }]);
    assert.equal(elements[0].content, "");
    assert.equal(elements[0].starterPlaceholder, true);
    assert.equal(elements[0].cvDataBindings.length, 3);
    assert.match(elements[0].placeholder, /Nazwa firmy/);
  });

  it("restores markers only for fields that remain empty", () => {
    const { cvData } = buildStarterDocument(createDefaultStarterConfig());
    cvData.name = "Ada Lovelace";
    const fillProfile = prepareStarterProfileForTemplate(cvData);
    assert.equal(fillProfile.name, "Ada Lovelace");
    assert.match(fillProfile.summary, /CVSTART_SUMMARY/);
  });

  it("builds the same semantic starter contract for all ten template ids", () => {
    const templateIds = [
      "monument", "slate", "atrium", "sterling", "regent",
      "meridian", "linden", "cadenza", "vellum", "aurelia",
    ];
    for (const templateId of templateIds) {
      const config = { ...createDefaultStarterConfig(), templateId };
      const { cvData, fillProfile } = buildStarterDocument(config);
      assert.equal(cvData.starter_structure.sections.length, 4);
      assert.match(fillProfile.experience[0].company, /CVSTART_EXPERIENCE_COMPANY/);
      assert.match(fillProfile.education[0].degree, /CVSTART_EDUCATION_DEGREE/);
    }
  });

  it("supports multiple custom sections without sharing bindings", () => {
    const config = createDefaultStarterConfig();
    config.sections.push(
      { key: "custom-one", label: "Konferencje", selected: true, custom: true },
      { key: "custom-two", label: "Nagrody branżowe", selected: true, custom: true },
    );
    const { cvData, fillProfile } = buildStarterDocument(config);
    assert.equal(cvData.custom_sections.at(-2).title, "Konferencje");
    assert.equal(cvData.custom_sections.at(-1).title, "Nagrody branżowe");
    assert.notEqual(fillProfile.custom_sections.at(-2).items[0], fillProfile.custom_sections.at(-1).items[0]);
  });
});
