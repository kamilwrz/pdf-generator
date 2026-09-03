import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  syncCvDataFromCanvas,
  syncGeneratedLanguagesForTemplateSwitch,
  syncGeneratedSkillsForTemplateSwitch,
} from "./syncCvDataFromCanvas.js";

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
  it("writes the first starter value to an explicitly bound empty profile field", () => {
    const source = { ...profile, name: "", starter_structure: { version: 1 } };
    const before = [{
      ...text("name", ""),
      mastheadRole: "name",
      starterPlaceholder: true,
      cvDataBindings: [{ path: ["name"], placeholder: "Imię i nazwisko" }],
    }];
    const after = [{ ...before[0], content: "Ada Lovelace", starterPlaceholder: false }];

    const updated = syncCvDataFromCanvas(source, before, after);
    assert.equal(updated.name, "Ada Lovelace");
    assert.equal(source.name, "");
  });

  it("splits a composite starter row across its cv_data bindings", () => {
    const source = {
      ...profile,
      experience: [{ company: "", city: "", period: "", title: "", bullets: [] }],
      starter_structure: { version: 1 },
    };
    const before = [{
      ...text("experience-meta", ""),
      starterPlaceholder: true,
      cvDataBindings: [
        { path: ["experience", 0, "company"] },
        { path: ["experience", 0, "city"] },
        { path: ["experience", 0, "period"] },
      ],
    }];
    const after = [{ ...before[0], content: "Analytical Engines · Londyn · 1842–1843" }];

    const updated = syncCvDataFromCanvas(source, before, after);
    assert.deepEqual(updated.experience[0], {
      company: "Analytical Engines",
      city: "Londyn",
      period: "1842–1843",
      title: "",
      bullets: [],
    });
  });

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

  it("treats a repeated Skills category tombstone as an idempotent no-op", () => {
    const grouped = {
      ...profile,
      skills: [
        { category: "Narzędzia", items: ["Figma", "Miro"] },
        { category: "Technologie", items: ["React", "TypeScript"] },
      ],
    };
    const remainingCanvas = [text("technologies-category", "Technologie")];
    const tombstones = [
      { ...text("tools-category", "Narzędzia"), deletedRecord: true },
      { ...text("tools-items", "Figma, Miro"), deletedRecord: true },
    ];

    const once = syncCvDataFromCanvas(
      grouped,
      [text("tools-category", "Narzędzia"), ...remainingCanvas],
      remainingCanvas,
      tombstones,
    );
    const twice = syncCvDataFromCanvas(
      once,
      remainingCanvas,
      remainingCanvas,
      tombstones,
    );

    assert.deepEqual(once.skills, [
      { category: "Technologie", items: ["React", "TypeScript"] },
    ]);
    assert.equal(twice, once);
  });

  it("keeps a re-added Skills category stable while its old tombstone awaits save", () => {
    const grouped = {
      ...profile,
      skills: [
        { category: "Narzędzia", items: ["Figma", "Miro"] },
        { category: "Technologie", items: ["React", "TypeScript"] },
      ],
      labels: { skills: "UMIEJĘTNOŚCI" },
    };
    const heading = sectionHeading("skills-heading", "UMIEJĘTNOŚCI");
    const tools = [
      { ...text("tools-category", "Narzędzia"), flowRole: "content", flowGroup: "tools" },
      { ...text("tools-items", "Figma, Miro"), flowRole: "content", flowGroup: "tools" },
    ];
    const technologies = [
      {
        ...text("technologies-category", "Technologie"),
        flowRole: "content",
        flowGroup: "technologies",
        top: 130,
        left: 60,
        page: 1,
      },
    ];
    const tombstones = tools.map((element) => ({ ...element, deletedRecord: true }));
    const canvasAfterDeletion = [heading, ...technologies];
    const afterDeletion = syncCvDataFromCanvas(
      grouped,
      [heading, ...tools, ...technologies],
      canvasAfterDeletion,
      tombstones,
    );
    const restoredRecord = [
      addedRecordField("restored-category", "Narzędzia", "title", {
        flowGroup: "record-restored",
        editorRecordLayout: "cc-sub",
        top: 160,
      }),
      addedRecordField("restored-items", "Figma, Miro", "body", {
        flowGroup: "record-restored",
        editorRecordLayout: "cc-sub",
        top: 175,
      }),
    ];
    const restoredCanvas = [...canvasAfterDeletion, ...restoredRecord];

    const restored = syncCvDataFromCanvas(
      afterDeletion,
      canvasAfterDeletion,
      restoredCanvas,
      tombstones,
    );
    const repeated = syncCvDataFromCanvas(
      restored,
      restoredCanvas,
      restoredCanvas,
      tombstones,
    );

    assert.deepEqual(restored.skills.map(({ category }) => category), [
      "Technologie",
      "Narzędzia",
    ]);
    assert.equal(repeated, restored);
  });

  it("keeps a restored Skills group stable while its semantic tombstone remains queued", () => {
    const heading = sectionHeading("skills-heading", "UMIEJĘTNOŚCI");
    const restoredRecord = [
      addedRecordField("restored-category", "Narzędzia", "title", {
        flowGroup: "record-restored",
        editorRecordLayout: "cc-sub",
        top: 130,
      }),
      addedRecordField("restored-items", "Figma, Miro", "body", {
        flowGroup: "record-restored",
        editorRecordLayout: "cc-sub",
        top: 145,
      }),
    ];
    const canvas = [heading, ...restoredRecord];
    const restoredProfile = {
      ...profile,
      labels: { skills: "UMIEJĘTNOŚCI" },
      custom_sections: [],
      skills: [{
        category: "Narzędzia",
        items: ["Figma, Miro"],
        __canvasGroup: "record-restored",
      }],
    };
    const tombstones = restoredRecord.map((element) => ({
      ...element,
      deletedRecord: true,
    }));

    const repeated = syncCvDataFromCanvas(
      restoredProfile,
      canvas,
      canvas,
      tombstones,
    );

    assert.equal(repeated, restoredProfile);
  });

  it("protects a re-added custom section until that live section is deleted again", () => {
    const heading = sectionHeading("restored-heading", "OSIĄGNIĘCIA", {
      editorAddedSection: true,
      editorSectionId: "restored-heading",
      editorSectionLayout: "aa",
    });
    const body = {
      ...text("restored-body", "Nagroda branżowa 2026"),
      flowRole: "content",
      top: 130,
      left: 60,
      page: 1,
      editorAddedSection: true,
      editorSectionId: "restored-heading",
    };
    const canvas = [heading, body];
    const source = { ...profile, custom_sections: [] };
    const legacyTombstones = [
      { ...text("old-heading", "OSIĄGNIĘCIA"), deletedRecord: true },
      { ...text("old-body", "Nagroda branżowa 2026"), deletedRecord: true },
    ];

    const restored = syncCvDataFromCanvas(
      source,
      [],
      canvas,
      legacyTombstones,
    );
    const repeated = syncCvDataFromCanvas(
      restored,
      canvas,
      canvas,
      legacyTombstones,
    );

    assert.deepEqual(restored.custom_sections, [{
      title: "OSIĄGNIĘCIA",
      items: ["Nagroda branżowa 2026"],
      kind: "other",
      placement: "after_skills",
      __canvasHeadingId: "restored-heading",
    }]);
    assert.equal(repeated, restored);

    const semanticTombstones = canvas.map((element) => ({
      ...element,
      deletedRecord: true,
    }));
    const removedAgain = syncCvDataFromCanvas(
      repeated,
      canvas,
      [],
      [...legacyTombstones, ...semanticTombstones],
    );

    assert.deepEqual(removedAgain.custom_sections, []);
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

  it("persists a user-added grid as one semantic item per cell", () => {
    const heading = sectionHeading("grid-heading", "LINKI", {
      editorAddedSection: true,
      editorSectionId: "grid-heading",
      editorSectionLayout: "grid",
    });
    const cell = (element_id, content, left) => ({
      ...text(element_id, content),
      flowRole: "grid-member",
      flowGroup: "grid-row",
      top: 130,
      left,
      width: 120,
      page: 1,
      editorAddedSection: true,
      editorSectionId: "grid-heading",
      editorGridEntry: true,
      gridKind: "entries",
    });
    const source = { ...profile, custom_sections: [] };

    const updated = syncCvDataFromCanvas(source, [], [
      heading,
      cell("portfolio", "Portfolio\nproduktowe", 60),
      cell("github", "GitHub", 188),
    ]);

    assert.deepEqual(updated.custom_sections, [{
      title: "LINKI",
      items: ["Portfolio\nproduktowe", "GitHub"],
      kind: "other",
      placement: "after_skills",
      layout: "grid",
      __canvasHeadingId: "grid-heading",
    }]);
  });

  it("keeps a restored custom grid compacted in cv_data after a template fill", () => {
    const heading = sectionHeading("generated-grid-heading", "LINKI", {
      editorSectionLayout: "grid",
      editorGridColumns: 4,
    });
    const cell = (element_id, content, left) => ({
      ...text(element_id, content),
      flowRole: "grid-member",
      flowGroup: "generated-grid-row",
      gridKind: "entries",
      top: 130,
      left,
      width: 100,
      page: 1,
    });
    const portfolio = cell("portfolio", "Portfolio", 60);
    const website = cell("website", "WWW", 168);
    const source = {
      ...profile,
      custom_sections: [{
        title: "LINKI",
        items: ["Portfolio", "WWW"],
        kind: "other",
        placement: "after_skills",
        layout: "grid",
      }],
    };
    const github = cell("github", "GitHub", 168);
    const compactedWebsite = { ...website, left: 276 };

    const inserted = syncCvDataFromCanvas(
      source,
      [heading, portfolio, website],
      [heading, portfolio, github, compactedWebsite],
    );
    assert.deepEqual(inserted.custom_sections[0].items, ["Portfolio", "GitHub", "WWW"]);

    const removed = syncCvDataFromCanvas(
      inserted,
      [heading, portfolio, github, compactedWebsite],
      [heading, portfolio, { ...compactedWebsite, left: 168 }],
    );
    assert.deepEqual(removed.custom_sections[0].items, ["Portfolio", "WWW"]);
    assert.equal(removed.custom_sections[0].layout, "grid");
  });

  it("does not let a restored custom JĘZYKI entries grid overwrite canonical languages", () => {
    const heading = sectionHeading("custom-languages-heading", "JĘZYKI", {
      editorSectionLayout: "grid",
      gridKind: "entries",
    });
    const cell = (element_id, content, left) => ({
      ...text(element_id, content),
      flowRole: "grid-member",
      flowGroup: "custom-languages-row",
      gridKind: "entries",
      top: 130,
      left,
      width: 100,
      page: 1,
    });
    const portfolio = cell("portfolio", "Portfolio", 60);
    const github = cell("github", "GitHub", 168);
    const source = {
      ...profile,
      languages: [{ name: "Polski", level: "C2" }],
      custom_sections: [{
        title: "JĘZYKI",
        items: ["Portfolio"],
        kind: "other",
        placement: "after_skills",
        layout: "grid",
      }],
    };

    const updated = syncCvDataFromCanvas(
      source,
      [heading, portfolio],
      [heading, portfolio, github],
    );

    assert.deepEqual(updated.languages, [{ name: "Polski", level: "C2" }]);
    assert.deepEqual(updated.custom_sections[0].items, ["Portfolio", "GitHub"]);
  });

  it("persists insertion and compaction in a generated Languages grid after its heading is renamed", () => {
    const heading = sectionHeading("languages-heading", "KOMPETENCJE GLOBALNE");
    const cell = (element_id, content, left) => ({
      ...text(element_id, content),
      flowRole: "grid-member",
      flowGroup: "languages-grid",
      gridKind: "languages",
      top: 130,
      left,
      width: 100,
      page: 1,
      autoHeight: true,
    });
    const polish = cell("language-pl", "Polski — C2", 60);
    const german = cell("language-de", "Niemiecki — B2", 168);
    const english = cell("language-en", "Angielski — C1", 276);
    const source = {
      ...profile,
      languages: [
        { name: "Polski", level: "C2" },
        { name: "Angielski", level: "C1" },
      ],
    };

    const inserted = syncCvDataFromCanvas(
      source,
      [heading, polish, english],
      [heading, polish, german, english],
    );
    assert.deepEqual(inserted.languages, [
      { name: "Polski", level: "C2" },
      { name: "Niemiecki", level: "B2" },
      { name: "Angielski", level: "C1" },
    ]);

    const compactedEnglish = { ...english, left: 168 };
    const removed = syncCvDataFromCanvas(
      inserted,
      [heading, polish, german, english],
      [heading, polish, compactedEnglish],
    );
    assert.deepEqual(removed.languages, [
      { name: "Polski", level: "C2" },
      { name: "Angielski", level: "C1" },
    ]);
  });

  it("snapshots exact Languages cell count and reading order for a template switch", () => {
    const heading = sectionHeading("languages-heading", "KOMPETENCJE GLOBALNE", {
      gridKind: "languages",
    });
    const cell = (element_id, content, left, top) => ({
      ...text(element_id, content),
      flowRole: "grid-member",
      flowGroup: top === 130 ? "languages-row-1" : "languages-row-2",
      gridKind: "languages",
      top,
      left,
      width: 92,
      page: 1,
      autoHeight: true,
    });
    const polish = cell("language-pl", "Polski — C2", 60, 130);
    const placeholderOne = cell("placeholder-1", "Język — poziom", 160, 130);
    const placeholderTwo = cell("placeholder-2", "Język — poziom", 260, 130);
    const activelyEdited = {
      ...cell("active-language", "Hiszpański — A2", 60, 150),
      isEditing: true,
    };
    const source = {
      ...profile,
      languages: [{ name: "Polski", level: "C2" }],
    };

    // Deliberately scramble array order: the refill snapshot must follow the
    // visual grid (row, then column), not incidental element storage order.
    const updated = syncGeneratedLanguagesForTemplateSwitch(
      source,
      [heading, placeholderTwo, activelyEdited, polish, placeholderOne],
    );

    assert.deepEqual(updated.languages, [
      { name: "Polski", level: "C2" },
      { name: "Język", level: "poziom" },
      { name: "Język", level: "poziom" },
      { name: "Hiszpański", level: "A2" },
    ]);
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
    const repeated = syncCvDataFromCanvas(updated, [], [], [tombstone]);

    assert.equal(updated.experience.length, 1);
    assert.equal(updated.experience[0].__canvasGroup, "record-second");
    assert.equal(repeated, updated);
    assert.equal(repeated.experience[0].__canvasGroup, "record-second");
  });
});

describe("generated Skills synchronization", () => {
  function flatSkills(items) {
    return [
      { element_id: "skills-heading", category: "text", content: "UMIEJĘTNOŚCI",
        flowRole: "section-chrome", left: 60, top: 100, width: 460, height: 16, page: 1 },
      { element_id: "skills-rule", category: "line", flowRole: "section-chrome",
        left: 60, top: 121, width: 460, height: 1, page: 1 },
      { element_id: "skills-body", category: "textarea", content: items.join("  ·  "),
        flowRole: "content", left: 60, top: 136, width: 460, height: 14,
        fontSize: 9.5, lineHeight: 13, page: 1, bulletList: false },
    ];
  }

  function groupedSkills(extra = []) {
    return [
      { element_id: "skills-heading", category: "text", content: "UMIEJĘTNOŚCI",
        flowRole: "section-chrome", left: 60, top: 100, width: 460, height: 16, page: 1 },
      { element_id: "skills-rule", category: "line", flowRole: "section-chrome",
        left: 60, top: 121, width: 460, height: 1, page: 1 },
      { element_id: "skills-category", category: "textarea", content: "Narzędzia",
        flowRole: "content", flowGroup: "tools", left: 60, top: 136, width: 460,
        height: 14, fontSize: 10, page: 1, bold: true },
      { element_id: "skills-body", category: "textarea", content: ["Figma", ...extra].join("  ·  "),
        flowRole: "content", flowGroup: "tools", left: 60, top: 154, width: 460,
        height: 14, fontSize: 9.5, page: 1, bulletList: false },
    ];
  }

  it("keeps category-free skills as a flat string array", () => {
    const source = { ...profile, skills: ["Figma", "React"] };
    const previous = flatSkills(["Figma", "React"]);
    const next = flatSkills(["Figma", "React", "Accessibility"]);
    const updated = syncCvDataFromCanvas(source, previous, next);

    assert.deepEqual(updated.skills, ["Figma", "React", "Accessibility"]);
  });

  it("keeps categorized skills structured and preserves existing metadata", () => {
    const source = {
      ...profile,
      skills: [{ category: "Narzędzia", items: ["Figma"], source: "import" }],
    };
    const updated = syncCvDataFromCanvas(source, groupedSkills(), groupedSkills(["Miro"]));

    assert.deepEqual(updated.skills, [{
      category: "Narzędzia",
      items: ["Figma", "Miro"],
      source: "import",
    }]);
  });

  it("captures a just-added skill before immediate template replacement", () => {
    const source = { ...profile, skills: ["Figma", "React"] };
    const updated = syncGeneratedSkillsForTemplateSwitch(
      source,
      flatSkills(["Figma", "React", "TypeScript"]),
    );

    assert.deepEqual(updated.skills, ["Figma", "React", "TypeScript"]);
  });
});
