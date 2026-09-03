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

  it("restores and rebinds blank fields in every repeated record", () => {
    const { cvData } = buildStarterDocument(createDefaultStarterConfig());
    cvData.experience = [
      { title: "1", company: "", city: "", period: "", bullets: [""] },
      { title: "2", company: "", city: "", period: "", bullets: [""] },
    ];
    cvData.education = [
      { degree: "1", school: "", city: "", period: "", description: "" },
      { degree: "2", school: "", city: "", period: "", description: "" },
    ];
    cvData.skills = ["", "React"];
    cvData.languages = [{ name: "", level: "" }];
    cvData.custom_sections = [{
      title: "Kursy",
      items: ["", "TypeScript"],
      kind: "other",
      placement: "after_skills",
    }];

    const fillProfile = prepareStarterProfileForTemplate(cvData);
    assert.equal(cvData.experience[1].company, "", "the persisted profile must stay marker-free");
    assert.match(fillProfile.experience[1].company, /DYNAMIC_EXPERIENCE_1_COMPANY/);
    assert.match(fillProfile.experience[1].bullets[0], /DYNAMIC_EXPERIENCE_1_BULLETS_0/);
    assert.match(fillProfile.education[1].school, /DYNAMIC_EDUCATION_1_SCHOOL/);
    assert.match(fillProfile.skills[0], /DYNAMIC_SKILLS_0_VALUE/);
    assert.match(fillProfile.languages[0].level, /DYNAMIC_LANGUAGES_0_LEVEL/);
    assert.match(fillProfile.custom_sections[0].items[0], /DYNAMIC_CUSTOM_0_ITEMS_0/);

    const [
      experienceMeta,
      experienceBullet,
      educationMeta,
      skill,
      language,
      customItem,
    ] = finalizeStarterElements([
      {
        category: "text",
        content: [
          fillProfile.experience[1].company,
          fillProfile.experience[1].city,
          fillProfile.experience[1].period,
        ].join(" · "),
      },
      {
        category: "textarea",
        bulletList: true,
        content: `• ${fillProfile.experience[1].bullets[0]}`,
      },
      {
        category: "text",
        content: [
          fillProfile.education[1].city,
          fillProfile.education[1].period,
        ].join(" · "),
      },
      { category: "text", content: fillProfile.skills[0] },
      {
        category: "text",
        content: [
          fillProfile.languages[0].name,
          fillProfile.languages[0].level,
        ].join(" — "),
      },
      { category: "textarea", content: fillProfile.custom_sections[0].items[0] },
    ]);

    assert.equal(experienceMeta.content, "");
    assert.deepEqual(experienceMeta.cvDataBindings.map((binding) => binding.path), [
      ["experience", 1, "company"],
      ["experience", 1, "city"],
      ["experience", 1, "period"],
    ]);
    assert.equal(experienceBullet.content, "");
    assert.equal(experienceBullet.starterPlaceholder, true);
    assert.deepEqual(experienceBullet.cvDataBindings[0].path, ["experience", 1, "bullets", 0]);
    assert.deepEqual(educationMeta.cvDataBindings.map((binding) => binding.path), [
      ["education", 1, "city"],
      ["education", 1, "period"],
    ]);
    assert.deepEqual(skill.cvDataBindings[0].path, ["skills", 0]);
    assert.deepEqual(language.cvDataBindings.map((binding) => binding.path), [
      ["languages", 0, "name"],
      ["languages", 0, "level"],
    ]);
    assert.deepEqual(customItem.cvDataBindings[0].path, ["custom_sections", 0, "items", 0]);
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
