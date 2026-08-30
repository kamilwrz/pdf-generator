import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { syncCvDataFromCanvas } from "./syncCvDataFromCanvas.js";

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

function sectionHeading(element_id, content, extra = {}) {
  return {
    element_id,
    category: "text",
    content,
    flowRole: "section-chrome",
    top: 100,
    left: 60,
    page: 1,
    ...extra,
  };
}

function addedRecordField(element_id, content, field, extra = {}) {
  return {
    element_id,
    category: "textarea",
    content,
    flowRole: "content",
    flowGroup: "record-added",
    editorAddedRecord: true,
    editorRecordLayout: "cc-exp",
    editorRecordField: field,
    top: 130,
    left: 60,
    page: 1,
    ...extra,
  };
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

  it("persists a user-added experience record for a later template fill", () => {
    const heading = sectionHeading("experience-heading", "DOŚWIADCZENIE ZAWODOWE");
    const added = [
      addedRecordField("added-title", "Product Designer", "title", { bold: true }),
      addedRecordField("added-company", "Acme · Warszawa · 2024 – obecnie", "meta", { top: 145 }),
      addedRecordField("added-description", "• Projektuję produkty.", "description", {
        top: 160,
        bulletList: true,
      }),
    ];
    const source = {
      ...profile,
      labels: { experience: "DOŚWIADCZENIE ZAWODOWE" },
    };

    const updated = syncCvDataFromCanvas(source, [heading], [heading, ...added]);

    assert.equal(updated.experience.length, 1);
    assert.deepEqual(updated.experience[0], {
      title: "Product Designer",
      company: "Acme",
      city: "Warszawa",
      period: "2024 – obecnie",
      bullets: ["Projektuję produkty."],
      __canvasGroup: "record-added",
    });
  });

  it("persists right-column education period and location as separate fields", () => {
    const heading = sectionHeading("education-heading", "WYKSZTAŁCENIE");
    const field = (id, content, role, extra = {}) => ({
      ...addedRecordField(id, content, role, extra),
      editorRecordLayout: "cc-edu",
    });
    const added = [
      field("degree", "Informatyka", "degree", { bold: true }),
      field("school", "Politechnika", "school", { top: 145 }),
      field("period", "2021 – 2026", "period", { top: 130, flowRole: "record-overlay" }),
      field("city", "Warszawa", "city", { top: 145, flowRole: "record-overlay" }),
      field("description", "• Specjalizacja AI", "description", {
        top: 160,
        bulletList: true,
      }),
    ];
    const source = {
      ...profile,
      education: [],
      labels: { education: "WYKSZTAŁCENIE" },
    };

    const updated = syncCvDataFromCanvas(source, [heading], [heading, ...added]);

    assert.deepEqual(updated.education[0], {
      degree: "Informatyka",
      school: "Politechnika",
      city: "Warszawa",
      period: "2021 – 2026",
      description: "Specjalizacja AI",
      __canvasGroup: "record-added",
    });
  });

  it("updates an added record by semantic group without duplicating placeholder copy", () => {
    const heading = sectionHeading("experience-heading", "DOŚWIADCZENIE ZAWODOWE");
    const placeholders = [
      addedRecordField("added-title", "Nazwa wpisu", "title", { bold: true }),
      addedRecordField("added-company", "Organizacja · lokalizacja · okres", "meta", { top: 145 }),
    ];
    const source = syncCvDataFromCanvas(
      { ...profile, labels: { experience: "DOŚWIADCZENIE ZAWODOWE" } },
      [heading],
      [heading, ...placeholders],
    );
    const edited = placeholders.map((element) => (
      element.editorRecordField === "title"
        ? { ...element, content: "Engineering Manager" }
        : element
    ));

    const updated = syncCvDataFromCanvas(source, [heading, ...placeholders], [heading, ...edited]);

    assert.equal(updated.experience.length, 1);
    assert.equal(updated.experience[0].title, "Engineering Manager");
  });

  it("keeps the canvas insertion order when a record is added between existing entries", () => {
    const heading = sectionHeading("experience-heading", "DOŚWIADCZENIE ZAWODOWE");
    const existing = (id, content, top) => ({
      ...text(id, content),
      flowRole: "content",
      flowGroup: id,
      bold: true,
      top,
      left: 60,
      page: 1,
    });
    const first = existing("record-first", "Pierwszy", 130);
    const last = existing("record-last", "Ostatni", 190);
    const inserted = addedRecordField("record-middle", "Środkowy", "title", {
      bold: true,
      top: 160,
    });
    const source = {
      ...profile,
      labels: { experience: "DOŚWIADCZENIE ZAWODOWE" },
      experience: [
        { title: "Pierwszy", company: "A" },
        { title: "Ostatni", company: "B" },
      ],
    };

    const updated = syncCvDataFromCanvas(
      source,
      [heading, first, last],
      [heading, first, inserted, last],
    );

    assert.deepEqual(updated.experience.map((entry) => entry.title), [
      "Pierwszy",
      "Środkowy",
      "Ostatni",
    ]);
  });

  it("persists a complete user-added section with its current title and body", () => {
    const heading = sectionHeading("custom-heading", "OSIĄGNIĘCIA", {
      editorAddedSection: true,
      editorSectionId: "custom-heading",
      editorSectionLayout: "aa",
    });
    const body = {
      ...text("custom-body", "Nagroda branżowa 2026"),
      flowRole: "content",
      top: 130,
      left: 60,
      page: 1,
      editorAddedSection: true,
      editorSectionId: "custom-heading",
    };
    const source = { ...profile, custom_sections: [] };

    const updated = syncCvDataFromCanvas(source, [], [heading, body]);

    assert.deepEqual(updated.custom_sections, [{
      title: "OSIĄGNIĘCIA",
      items: ["Nagroda branżowa 2026"],
      kind: "other",
      placement: "after_skills",
      __canvasHeadingId: "custom-heading",
    }]);
  });

  it("does not duplicate profile records when a template replacement has fresh unmarked ids", () => {
    const source = {
      ...profile,
      experience: [{
        title: "Product Designer",
        company: "Acme",
        city: "Warszawa",
        period: "2024 – obecnie",
        bullets: [],
        __canvasGroup: "record-added",
      }],
    };
    const previous = [sectionHeading("old-heading", "DOŚWIADCZENIE ZAWODOWE")];
    const replacement = [
      sectionHeading("new-heading", "DOŚWIADCZENIE ZAWODOWE"),
      { ...text("new-title", "Product Designer"), flowRole: "content", top: 130, page: 1 },
    ];

    const updated = syncCvDataFromCanvas(source, previous, replacement);

    assert.equal(updated, source);
    assert.equal(updated.experience.length, 1);
  });

  it("deletes only the identified added record when placeholder text is duplicated", () => {
    const source = {
      ...profile,
      experience: [
        { title: "Nazwa wpisu", company: "Organizacja", __canvasGroup: "record-first" },
        { title: "Nazwa wpisu", company: "Organizacja", __canvasGroup: "record-second" },
      ],
    };
    const tombstone = {
      ...addedRecordField("first-title", "Nazwa wpisu", "title"),
      flowGroup: "record-first",
      deletedRecord: true,
    };

    const updated = syncCvDataFromCanvas(source, [], [], [tombstone]);

    assert.equal(updated.experience.length, 1);
    assert.equal(updated.experience[0].__canvasGroup, "record-second");
  });
});
