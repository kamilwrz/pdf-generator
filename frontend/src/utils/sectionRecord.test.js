import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSectionElements, SECTION_LAYOUTS } from "./sectionBuilder.js";
import {
  appendSectionAtEnd,
  deriveSectionStyle,
  listDocumentSections,
} from "./sectionStructure.js";
import {
  addRecordDescription,
  appendRecordToSection,
  buildRecordClone,
  elementSupportsRecordBlockAdd,
  ensureCanonicalRecordTemplate,
  getRecordDescriptionAction,
  inferRecordLayout,
  insertRecordBlockAfterRecord,
  listRecordBlockAddAnchors,
  listRecordBlockAddElementIds,
  listSectionContentElements,
  listUpperRecordMembers,
  partitionSectionRecords,
  pickRecordTemplateGroup,
  placeholderContentsForRecord,
  removeRecordDescription,
  removeRecordBlock,
  reorderRecordBlock,
  sectionSupportsRecordAdd,
} from "./sectionRecord.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";

const style = {
  left: 66,
  bodyLeft: 66,
  recordWidth: 466,
  heading: {
    fontSize: 8.5, fontFamily: "Inter", color: "#24201E", letterSpacing: 1.4, bold: false,
  },
  rule: { width: 466, height: 1, backgroundColor: "#BFB4AA", relLeft: 0 },
  markers: [],
  badgeNumber: null,
  body: { fontSize: 9.3, fontFamily: "Inter", lineHeight: 13, color: "#24201E" },
  mutedColor: "#756F6B",
};

function makeIdFactory(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

describe("sectionSupportsRecordAdd", () => {
  it("rejects aa (single textarea) sections", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Podsumowanie",
      layout: SECTION_LAYOUTS.TEXTAREA,
      style,
      idFactory: makeIdFactory(),
    });
    assert.equal(sectionSupportsRecordAdd(elements, headingId), false);
  });

  it("accepts cc-edu (multi-line record) sections", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Wykształcenie",
      layout: SECTION_LAYOUTS.RECORD_EDUCATION,
      style,
      idFactory: makeIdFactory(),
    });
    assert.equal(sectionSupportsRecordAdd(elements, headingId), true);
    assert.equal(listSectionContentElements(elements, headingId).length, 4);
  });

  it("accepts cc-exp sections", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Doświadczenie",
      layout: SECTION_LAYOUTS.RECORD_EXPERIENCE,
      style,
      idFactory: makeIdFactory(),
    });
    assert.equal(sectionSupportsRecordAdd(elements, headingId), true);
  });

  it("rejects a chips-mode Skills section (wrapped grid-member chip pills)", () => {
    // Regression: a chip category is [bold label, rectangle pill background,
    // text label] x N, tagged `flowRole: "grid-member"`. The generic clone
    // model (`buildRecordClone`) drops the rectangle pill as decorative
    // chrome and stacks each chip's bare text label as a full-width line at
    // its own x-offset inside the wrapped row — producing scattered,
    // unstyled placeholder text instead of a new pill. See
    // `appendRecordToSection` reproduction below.
    const headingId = "sk-head";
    const elements = [
      { element_id: headingId, category: "text", content: "UMIEJĘTNOŚCI",
        flowRole: "section-chrome", left: 66, top: 100, fontSize: 12, height: 16, page: 1, bold: true },
      { element_id: "sk-rule", category: "line", flowRole: "section-chrome",
        left: 66, top: 120.7, width: 460, height: 1, page: 1 },
      { element_id: "sk-cat", category: "textarea", content: "Narzędzia",
        flowRole: "content", flowGroup: "sk-g1", left: 66, top: 140, width: 460, height: 14, fontSize: 10, page: 1, bold: true },
      { element_id: "sk-pill-1-bg", category: "rectangle", flowRole: "grid-member", flowGroup: "sk-g1",
        left: 66, top: 158, width: 60, height: 20, page: 1 },
      { element_id: "sk-pill-1-text", category: "text", flowRole: "grid-member", flowGroup: "sk-g1",
        content: "SQL", left: 76, top: 168, fontSize: 9.3, page: 1 },
      { element_id: "sk-pill-2-bg", category: "rectangle", flowRole: "grid-member", flowGroup: "sk-g1",
        left: 134, top: 158, width: 70, height: 20, page: 1 },
      { element_id: "sk-pill-2-text", category: "text", flowRole: "grid-member", flowGroup: "sk-g1",
        content: "Python", left: 144, top: 168, fontSize: 9.3, page: 1 },
    ];

    assert.equal(sectionSupportsRecordAdd(elements, headingId), false);
    assert.equal(appendRecordToSection(elements, headingId), null);
  });
});

describe("placeholderContentsForRecord / inferRecordLayout", () => {
  it("maps 4-line records to generic detailed-entry placeholders", () => {
    assert.equal(inferRecordLayout([{}, {}, {}, {}]), SECTION_LAYOUTS.RECORD_EDUCATION);
    assert.deepEqual(placeholderContentsForRecord([{}, {}, {}, {}]), [
      "Nazwa wpisu",
      "Organizacja",
      "Lokalizacja · okres",
      "Opis…",
    ]);
  });

  it("maps 3-line records with bullets to generic entry placeholders", () => {
    const exp = [{ bold: true }, {}, { bulletList: true }];
    assert.equal(inferRecordLayout(exp), SECTION_LAYOUTS.RECORD_EXPERIENCE);
    assert.deepEqual(placeholderContentsForRecord(exp), [
      "Nazwa wpisu",
      "Organizacja · lokalizacja · okres",
      "Opis…",
    ]);
  });

  it("maps 3-line records without bullets to detailed-entry placeholders", () => {
    const edu = [{ bold: true }, {}, {}];
    assert.equal(inferRecordLayout(edu), SECTION_LAYOUTS.RECORD_EDUCATION);
    assert.deepEqual(placeholderContentsForRecord(edu), [
      "Nazwa wpisu",
      "Organizacja",
      "Lokalizacja · okres",
      "Opis…",
    ]);
  });
});

describe("appendRecordToSection", () => {
  it("appends a second education record with a new flowGroup and placeholders", () => {
    const pageHeight = 842;
    const { elements: built, headingId } = buildSectionElements({
      name: "Wykształcenie",
      layout: SECTION_LAYOUTS.RECORD_EDUCATION,
      style,
      idFactory: makeIdFactory("edu"),
    });
    const doc = appendSectionAtEnd([], built, pageHeight, {});
    const before = listSectionContentElements(doc, headingId, pageHeight);
    assert.equal(before.length, 4);
    const firstGroup = before[0].flowGroup;

    let seq = 0;
    const result = appendRecordToSection(doc, headingId, pageHeight, {
      idFactory: () => `new-${++seq}`,
    });
    assert.ok(result);
    const after = listSectionContentElements(result.elements, headingId, pageHeight);
    assert.equal(after.length, 8);
    const groups = partitionSectionRecords(after);
    assert.equal(groups.length, 2);
    assert.equal(groups[0][0].flowGroup, firstGroup);
    assert.notEqual(groups[1][0].flowGroup, firstGroup);
    assert.equal(groups[1][0].content, "Nazwa wpisu");
    assert.equal(groups[1][1].content, "Organizacja");
    assert.equal(groups[1][2].content, "Lokalizacja · okres");
    assert.equal(groups[1][3].content, "Opis…");
    assert.equal(groups[1][3].bulletList, true);
    assert.equal(result.firstBodyId, groups[1][0].element_id);
  });

  it("preserves a right-column metadata rail and assigns field-specific placeholders", () => {
    const pageHeight = 842;
    const heading = {
      element_id: "rail-heading",
      category: "text",
      content: "WYKSZTAŁCENIE",
      flowRole: "section-chrome",
      left: 62,
      top: 100,
      height: 13,
      page: 1,
    };
    const group = "rail-education";
    const elements = [
      heading,
      {
        element_id: "rail-degree", category: "textarea", content: "Magister informatyki",
        flowRole: "content", flowGroup: group, bold: true, autoHeight: true,
        left: 62, top: 125, width: 329, height: 13, fontSize: 9.8, lineHeight: 12.5, page: 1,
      },
      {
        element_id: "rail-period", category: "textarea", content: "2018 – 2023",
        flowRole: "record-overlay", flowGroup: group, align: "right", autoHeight: false,
        left: 403, top: 125, width: 130, height: 11, fontSize: 7.9, lineHeight: 10.8, page: 1,
      },
      {
        element_id: "rail-school", category: "textarea", content: "Politechnika Warszawska",
        flowRole: "content", flowGroup: group, autoHeight: true,
        left: 62, top: 142, width: 329, height: 13, fontSize: 9.8, lineHeight: 12.5, page: 1,
      },
      {
        element_id: "rail-location", category: "textarea", content: "Warszawa",
        flowRole: "record-overlay", flowGroup: group, align: "right", autoHeight: false,
        left: 403, top: 142, width: 130, height: 11, fontSize: 7.9, lineHeight: 10.8, page: 1,
      },
    ];

    const result = appendRecordToSection(elements, heading.element_id, pageHeight, {
      idFactory: makeIdFactory("rail-new"),
    });
    assert.ok(result);

    const records = partitionSectionRecords(
      listSectionContentElements(result.elements, heading.element_id, pageHeight),
    );
    assert.equal(records.length, 2);
    const added = records[1];
    assert.equal(added.length, 4, "the clone keeps the authored two-row/two-overlay shape");

    const degree = added.find((element) => element.content === "Nazwa wpisu");
    const school = added.find((element) => element.content === "Organizacja");
    const period = added.find((element) => element.content === "Okres");
    const location = added.find((element) => element.content === "Lokalizacja");
    assert.ok(degree);
    assert.ok(school);
    assert.ok(period);
    assert.ok(location);
    assert.equal(degree.left, 62);
    assert.equal(school.left, 62);
    assert.equal(period.left, 403);
    assert.equal(location.left, 403);
    assert.equal(period.align, "right");
    assert.equal(location.align, "right");
    assert.equal(period.autoHeight, false);
    assert.equal(location.autoHeight, false);
    assert.equal(period.top, degree.top, "period stays level with the degree/title row");
    assert.equal(location.top, school.top, "location stays level with the school row");
  });

  it("keeps an experience period on the title row without inventing a vertical period field", () => {
    const pageHeight = 842;
    const heading = {
      element_id: "exp-rail-heading", category: "text", content: "DOŚWIADCZENIE ZAWODOWE",
      flowRole: "section-chrome", left: 62, top: 100, height: 13, page: 1,
    };
    const group = "rail-experience";
    const elements = [
      heading,
      {
        element_id: "exp-rail-title", category: "textarea", content: "Analityk",
        flowRole: "content", flowGroup: group, bold: true, autoHeight: true,
        left: 62, top: 125, width: 329, height: 13, fontSize: 10.3, lineHeight: 13, page: 1,
      },
      {
        element_id: "exp-rail-period", category: "textarea", content: "2023 – obecnie",
        flowRole: "record-overlay", flowGroup: group, align: "right", autoHeight: false,
        left: 403, top: 125, width: 130, height: 11, fontSize: 7.9, lineHeight: 10.8, page: 1,
      },
      {
        element_id: "exp-rail-company", category: "textarea", content: "Firma",
        flowRole: "content", flowGroup: group, autoHeight: true,
        left: 62, top: 142, width: 329, height: 11, fontSize: 7.9, lineHeight: 10.8, page: 1,
      },
      {
        element_id: "exp-rail-description", category: "textarea", content: "• Osiągnięcie",
        flowRole: "content", flowGroup: group, bulletList: true, autoHeight: true,
        left: 62, top: 157, width: 471, height: 11, fontSize: 8.6, lineHeight: 11, page: 1,
      },
    ];

    const result = appendRecordToSection(elements, heading.element_id, pageHeight, {
      idFactory: makeIdFactory("exp-rail-new"),
    });
    assert.ok(result);
    const added = partitionSectionRecords(
      listSectionContentElements(result.elements, heading.element_id, pageHeight),
    )[1];
    const title = added.find((element) => element.content === "Nazwa wpisu");
    const period = added.find((element) => element.content === "Okres");
    assert.equal(added.length, 4);
    assert.ok(title);
    assert.ok(period);
    assert.equal(period.left, 403);
    assert.equal(period.top, title.top);
    assert.ok(added.some((element) => element.content === "Organizacja · lokalizacja"));
    assert.ok(added.some((element) => element.content === "Opis…"));
  });

  it("appends a skills subcategory as heading + body, not an education record", () => {
    const pageHeight = 842;
    const groupId = "skills-lang";
    const heading = {
      element_id: "skills-h",
      category: "text",
      content: "UMIEJĘTNOŚCI",
      flowRole: "section-chrome",
      left: 48,
      top: 100,
      width: 200,
      fontSize: 9,
      page: 1,
    };
    const rule = {
      element_id: "skills-r",
      category: "line",
      flowRole: "section-chrome",
      left: 48,
      top: 112,
      width: 480,
      height: 2,
      page: 1,
    };
    const cat = {
      element_id: "skills-cat",
      category: "textarea",
      content: "Languages & Frameworks",
      flowRole: "content",
      flowGroup: groupId,
      autoHeight: true,
      bold: true,
      left: 48,
      top: 122,
      width: 480,
      height: 12,
      fontSize: 9.5,
      lineHeight: 11.5,
      page: 1,
    };
    const chips = {
      element_id: "skills-chips",
      category: "textarea",
      content: "C#  ·  .NET",
      flowRole: "content",
      flowGroup: groupId,
      autoHeight: true,
      bold: false,
      bulletList: false,
      left: 48,
      top: 138,
      width: 480,
      height: 14,
      fontSize: 9.4,
      lineHeight: 13.5,
      page: 1,
    };
    const doc = [heading, rule, cat, chips];

    assert.equal(
      inferRecordLayout([cat, chips], { sectionTitle: "UMIEJĘTNOŚCI" }),
      SECTION_LAYOUTS.RECORD_SUBCATEGORY,
    );
    assert.deepEqual(
      placeholderContentsForRecord([cat, chips], { sectionTitle: "UMIEJĘTNOŚCI" }),
      [
        "Nazwa kategorii",
        "Treść…",
      ],
    );
    // Without a section title, keep legacy expand behaviour.
    assert.equal(inferRecordLayout([cat, chips]), null);
    // User-added category sections (not named UMIEJĘTNOŚCI) still stay heading+body.
    assert.equal(
      inferRecordLayout([cat, chips], { sectionTitle: "Narzędzia" }),
      SECTION_LAYOUTS.RECORD_SUBCATEGORY,
    );
    // Education titles must not be treated as subcategory.
    assert.equal(
      inferRecordLayout([cat, chips], { sectionTitle: "Wykształcenie" }),
      null,
    );

    let seq = 0;
    const result = appendRecordToSection(doc, heading.element_id, pageHeight, {
      idFactory: () => `new-${++seq}`,
    });
    assert.ok(result);
    const after = listSectionContentElements(result.elements, heading.element_id, pageHeight);
    const groups = partitionSectionRecords(after);
    assert.equal(groups.length, 2);
    assert.equal(groups[1].length, 2, "must stay heading+body, not expand to education");
    assert.equal(groups[1][0].content, "Nazwa kategorii");
    assert.equal(groups[1][0].bold, true);
    assert.equal(groups[1][1].content, "Treść…");
    assert.equal(groups[1][1].bold, false);
    assert.equal(groups[1][1].bulletList, false);
  });

  it("appends an experience record after an existing one in a packed document", () => {
    const pageHeight = 842;
    // Seed a minimal prior section so append is not the only strip.
    const summary = buildSectionElements({
      name: "Profil",
      layout: SECTION_LAYOUTS.TEXTAREA,
      style,
      idFactory: makeIdFactory("sum"),
    });
    let doc = appendSectionAtEnd([], summary.elements, pageHeight, {});
    const exp = buildSectionElements({
      name: "Doświadczenie",
      layout: SECTION_LAYOUTS.RECORD_EXPERIENCE,
      style: deriveSectionStyle(doc, pageHeight),
      idFactory: makeIdFactory("exp"),
    });
    doc = appendSectionAtEnd(doc, exp.elements, pageHeight, {});
    const headingId = exp.headingId;

    const result = appendRecordToSection(doc, headingId, pageHeight, {
      idFactory: makeIdFactory("rec"),
    });
    assert.ok(result);
    const body = listSectionContentElements(result.elements, headingId, pageHeight);
    assert.equal(body.length, 6);
    assert.equal(body[3].content, "Nazwa wpisu");
    assert.equal(body[4].content, "Organizacja · lokalizacja · okres");
    assert.equal(body[5].content, "Opis…");
  });

  it("returns null for aa sections", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Skills",
      layout: SECTION_LAYOUTS.TEXTAREA,
      style,
      idFactory: makeIdFactory(),
    });
    assert.equal(appendRecordToSection(elements, headingId), null);
  });
});

describe("buildRecordClone / pickRecordTemplateGroup", () => {
  it("preserves bold title, muted meta colour, and bullet body from the template", () => {
    const clones = buildRecordClone([
      {
        category: "textarea", bold: true, color: "#0B1C2C", fontSize: 11,
        lineHeight: 13.5, width: 400, left: 80, content: "Senior AML",
      },
      {
        category: "textarea", bold: false, color: "#5A6A7A", fontSize: 8.7,
        lineHeight: 11.5, width: 400, left: 80, content: "Bank · 2020",
      },
      {
        category: "textarea", bold: false, color: "#243040", fontSize: 9.4,
        lineHeight: 13.3, width: 400, left: 80, content: "Did things",
        bulletList: true, height: 120,
      },
    ], makeIdFactory("c"));
    assert.equal(clones.length, 3);
    assert.equal(clones[0].content, "Nazwa wpisu");
    assert.equal(clones[0].bold, true);
    assert.equal(clones[0].color, "#0B1C2C");
    assert.equal(clones[1].content, "Organizacja · lokalizacja · okres");
    assert.equal(clones[1].bold, false);
    assert.equal(clones[1].color, "#5A6A7A");
    assert.equal(clones[2].content, "Opis…");
    assert.equal(clones[2].bulletList, true);
    assert.ok(clones[2].height < 80, "placeholder description should not keep tall source height");
    assert.equal(clones[0].isEditing, false);
    assert.equal(new Set(clones.map((element) => element.flowGroup)).size, 1);
  });

  it("prefers the longest bold-title template over a short hovered group", () => {
    const shortEdu = [
      { element_id: "a", bold: true, content: "LL.B." },
      { element_id: "b", bold: false, content: "School" },
    ];
    const fullEdu = [
      { element_id: "t", bold: true, content: "Title" },
      { element_id: "s", bold: false, content: "School" },
      { element_id: "m", bold: false, content: "Meta" },
      { element_id: "d", bold: false, bulletList: true, content: "Desc" },
    ];
    const picked = pickRecordTemplateGroup([shortEdu, fullEdu], shortEdu);
    assert.equal(picked, fullEdu);
  });

  it("expands a 2-line education stack to four canonical fields", () => {
    const shortEdu = [
      {
        element_id: "a", category: "textarea", bold: true, color: "#111",
        fontSize: 10.4, lineHeight: 13, width: 400, left: 80,
      },
      {
        element_id: "b", category: "textarea", bold: false, color: "#111",
        fontSize: 10.4, lineHeight: 13, width: 400, left: 80,
      },
    ];
    const expanded = ensureCanonicalRecordTemplate(shortEdu, [shortEdu]);
    assert.equal(expanded.length, 4);
    assert.equal(expanded[3].bulletList, true);
    const clones = buildRecordClone(shortEdu, makeIdFactory("e"), [shortEdu]);
    assert.equal(clones.length, 4);
    assert.equal(clones[0].content, "Nazwa wpisu");
    assert.equal(clones[1].content, "Organizacja");
    assert.equal(clones[2].content, "Lokalizacja · okres");
    assert.equal(clones[3].content, "Opis…");
  });
});

describe("listUpperRecordMembers / insertRecordBlockAfterRecord", () => {
  it("treats title+meta as upper and excludes the bullet description", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Doświadczenie",
      layout: SECTION_LAYOUTS.RECORD_EXPERIENCE,
      style,
      idFactory: makeIdFactory("exp"),
    });
    const body = listSectionContentElements(elements, headingId);
    const upper = listUpperRecordMembers(body);
    assert.equal(upper.length, 2);
    assert.equal(upper[0].content, "Nazwa wpisu");
    assert.equal(upper[1].content, "Organizacja · lokalizacja · okres");
    assert.equal(elementSupportsRecordBlockAdd(elements, body[0].element_id), true);
    assert.equal(elementSupportsRecordBlockAdd(elements, body[1].element_id), true);
    assert.equal(elementSupportsRecordBlockAdd(elements, body[2].element_id), false);
    // One mounted "+" per record (title), listening to title + meta.
    const anchors = listRecordBlockAddAnchors(elements);
    assert.equal(anchors.length, 1);
    assert.equal(anchors[0].elementId, body[0].element_id);
    assert.deepEqual(anchors[0].hoverIds, [body[0].element_id, body[1].element_id]);
    assert.equal(
      anchors[0].highlight.top,
      Math.min(...body.map((element) => Number(element.top) || 0)),
    );
    assert.ok(
      anchors[0].highlight.height > (Number(body[1].top) || 0) - anchors[0].highlight.top,
      "record highlight must include the description below its hover-only title/meta band",
    );
    assert.equal(listRecordBlockAddElementIds(elements).has(body[0].element_id), true);
    assert.equal(listRecordBlockAddElementIds(elements).has(body[1].element_id), false);
  });

  it("inserts a full placeholder record under the hovered block", () => {
    const pageHeight = 842;
    const { elements: built, headingId } = buildSectionElements({
      name: "Wykształcenie",
      layout: SECTION_LAYOUTS.RECORD_EDUCATION,
      style,
      idFactory: makeIdFactory("edu"),
    });
    const doc = appendSectionAtEnd([], built, pageHeight, {});
    const before = listSectionContentElements(doc, headingId, pageHeight);
    assert.equal(before.length, 4);

    // Hover the school line (upper) — insert a full edu block under the record.
    const result = insertRecordBlockAfterRecord(doc, before[1].element_id, pageHeight, {
      idFactory: makeIdFactory("gen"),
    });
    assert.ok(result);
    const after = listSectionContentElements(result.elements, headingId, pageHeight);
    assert.equal(after.length, 8);
    const groups = partitionSectionRecords(after);
    assert.equal(groups.length, 2);
    assert.equal(groups[1][0].content, "Nazwa wpisu");
    assert.equal(groups[1][1].content, "Organizacja");
    assert.equal(groups[1][2].content, "Lokalizacja · okres");
    assert.equal(groups[1][3].content, "Opis…");
    assert.equal(groups[1][3].bulletList, true);
    assert.notEqual(groups[1][0].flowGroup, before[0].flowGroup);
    assert.equal(result.firstBodyId, groups[1][0].element_id);
  });

  it("inserts between two experience records when the first record is the anchor", () => {
    const pageHeight = 842;
    const { elements: built, headingId } = buildSectionElements({
      name: "Doświadczenie",
      layout: SECTION_LAYOUTS.RECORD_EXPERIENCE,
      style,
      idFactory: makeIdFactory("exp"),
    });
    let doc = appendSectionAtEnd([], built, pageHeight, {});
    const first = appendRecordToSection(doc, headingId, pageHeight, {
      idFactory: makeIdFactory("rec2"),
    });
    assert.ok(first);
    doc = first.elements;
    const body = listSectionContentElements(doc, headingId, pageHeight);
    assert.equal(body.length, 6);
    const firstGroupId = body[0].flowGroup;
    const secondGroupId = body[3].flowGroup;
    const result = insertRecordBlockAfterRecord(doc, body[0].element_id, pageHeight, {
      idFactory: makeIdFactory("mid"),
    });
    assert.ok(result);
    const after = listSectionContentElements(result.elements, headingId, pageHeight);
    assert.equal(after.length, 9);
    const groups = partitionSectionRecords(after);
    assert.equal(groups.length, 3);
    // New block between the two original records.
    assert.equal(groups[0][0].flowGroup, firstGroupId);
    assert.notEqual(groups[1][0].flowGroup, firstGroupId);
    assert.notEqual(groups[1][0].flowGroup, secondGroupId);
    assert.equal(groups[1][0].content, "Nazwa wpisu");
    assert.equal(groups[1][1].content, "Organizacja · lokalizacja · okres");
    assert.equal(groups[1][2].content, "Opis…");
    assert.equal(groups[2][0].flowGroup, secondGroupId);
  });

  it("moves later sections down so an education insert cannot leak under Skills", () => {
    const pageHeight = 842;
    const rhythm = { ...DEFAULT_FLOW_SPACING };
    const edu = buildSectionElements({
      name: "Wykształcenie",
      layout: SECTION_LAYOUTS.RECORD_EDUCATION,
      style,
      idFactory: makeIdFactory("edu"),
    });
    let doc = appendSectionAtEnd([], edu.elements, pageHeight, { spacing: rhythm });
    // Second education record so insert sits between two entries.
    const second = appendRecordToSection(doc, edu.headingId, pageHeight, {
      spacing: rhythm,
      idFactory: makeIdFactory("edu2"),
    });
    assert.ok(second);
    doc = second.elements;
    const skills = buildSectionElements({
      name: "Umiejętności",
      layout: SECTION_LAYOUTS.TEXTAREA,
      style: deriveSectionStyle(doc, pageHeight),
      idFactory: makeIdFactory("sk"),
    });
    doc = appendSectionAtEnd(doc, skills.elements, pageHeight, { spacing: rhythm });

    const eduBody = listSectionContentElements(doc, edu.headingId, pageHeight);
    const result = insertRecordBlockAfterRecord(doc, eduBody[0].element_id, pageHeight, {
      spacing: rhythm,
      idFactory: makeIdFactory("mid"),
    });
    assert.ok(result);

    const packedEdu = listSectionContentElements(result.elements, edu.headingId, pageHeight);
    const packedSkills = listSectionContentElements(result.elements, skills.headingId, pageHeight);
    // Education still owns every edu flowGroup line (none stolen by Skills).
    for (const element of packedEdu) {
      assert.ok(
        !packedSkills.some((skill) => skill.element_id === element.element_id),
        "education line must not appear in the skills section",
      );
    }
    const skillsHeading = result.elements.find((element) => element.element_id === skills.headingId);
    const lastEdu = packedEdu[packedEdu.length - 1];
    const skillsAbs = (Number(skillsHeading.page) - 1) * pageHeight + Number(skillsHeading.top);
    const eduBottom = (Number(lastEdu.page) - 1) * pageHeight
      + Number(lastEdu.top) + Number(lastEdu.height);
    assert.ok(
      skillsAbs >= eduBottom - 0.5,
      `skills heading (${skillsAbs}) must stay below education content (${eduBottom})`,
    );
  });

  it("keeps SPACE_RECORD between an inserted education block and the next title", () => {
    const pageHeight = 842;
    const rhythm = { ...DEFAULT_FLOW_SPACING };
    // Two short education records (degree + school only) — the original keep-together bug case.
    function shortEdu(prefix, top) {
      return [
        {
          element_id: `${prefix}-deg`, category: "textarea", flowRole: "content",
          autoHeight: true, bold: true, flowGroup: `g-${prefix}`,
          content: `${prefix} degree`, page: 1, top, left: 80, width: 400,
          height: 13, fontSize: 10.4, lineHeight: 13, color: "#111",
        },
        {
          element_id: `${prefix}-sch`, category: "textarea", flowRole: "content",
          autoHeight: true, bold: false, flowGroup: `g-${prefix}`,
          content: `${prefix} school`, page: 1, top: top + 17, left: 80, width: 400,
          height: 13, fontSize: 10.4, lineHeight: 13, color: "#111",
        },
      ];
    }
    const { elements: chrome, headingId } = buildSectionElements({
      name: "Wykształcenie",
      layout: SECTION_LAYOUTS.TEXTAREA,
      style,
      idFactory: makeIdFactory("h"),
    });
    // Replace the aa body with two short edu records under the heading.
    const heading = chrome.find((element) => element.element_id === headingId);
    const withoutBody = chrome.filter((element) => element.flowRole !== "content");
    let doc = [
      ...withoutBody,
      ...shortEdu("a", (heading?.top || 100) + 40),
      ...shortEdu("b", (heading?.top || 100) + 100),
    ];
    doc = doc.map((element) => (
      element.element_id === headingId
        ? { ...element, flowRole: "section-chrome" }
        : element
    ));

    const result = insertRecordBlockAfterRecord(doc, "a-deg", pageHeight, {
      spacing: rhythm,
      idFactory: makeIdFactory("ins"),
    });
    assert.ok(result);
    const body = listSectionContentElements(result.elements, headingId, pageHeight);
    const groups = partitionSectionRecords(body);
    assert.ok(groups.length >= 3);
    // Inserted block is full education (4 lines), not degree+school only.
    assert.equal(groups[1].length, 4);
    assert.equal(groups[1][0].content, "Nazwa wpisu");
    assert.equal(groups[1][3].content, "Opis…");

    const lastInserted = groups[1][groups[1].length - 1];
    const nextTitle = groups[2][0];
    const gap = (Number(nextTitle.top) + (Number(nextTitle.page) - 1) * pageHeight)
      - (Number(lastInserted.top) + (Number(lastInserted.page) - 1) * pageHeight
        + Number(lastInserted.height));
    assert.ok(
      gap >= rhythm.record - 0.5,
      `expected record gap >= ${rhythm.record}, got ${gap}`,
    );
  });

  it("rejects description lines, aa sections, and unknown ids", () => {
    const pageHeight = 842;
    const { elements: edu, headingId } = buildSectionElements({
      name: "Wykształcenie",
      layout: SECTION_LAYOUTS.RECORD_EDUCATION,
      style,
      idFactory: makeIdFactory("edu"),
    });
    const doc = appendSectionAtEnd([], edu, pageHeight, {});
    const body = listSectionContentElements(doc, headingId, pageHeight);
    const description = body.find((element) => element.bulletList);
    assert.ok(description);
    assert.equal(insertRecordBlockAfterRecord(doc, description.element_id, pageHeight), null);

    const { elements: aa, headingId: aaId } = buildSectionElements({
      name: "Skills",
      layout: SECTION_LAYOUTS.TEXTAREA,
      style,
      idFactory: makeIdFactory("aa"),
    });
    const aaBody = listSectionContentElements(aa, aaId);
    assert.equal(elementSupportsRecordBlockAdd(aa, aaBody[0].element_id), false);
    assert.equal(listRecordBlockAddElementIds(aa).size, 0);
    assert.equal(insertRecordBlockAfterRecord(aa, aaBody[0].element_id), null);
    assert.equal(insertRecordBlockAfterRecord(doc, "missing"), null);
  });
});

describe("optional record descriptions", () => {
  it("removes and restores one education description without changing its record", () => {
    const pageHeight = 842;
    const rhythm = { ...DEFAULT_FLOW_SPACING };
    const { elements: built, headingId } = buildSectionElements({
      name: "Wykształcenie",
      layout: SECTION_LAYOUTS.RECORD_EDUCATION,
      style,
      idFactory: makeIdFactory("edu"),
    });
    let doc = appendSectionAtEnd([], built, pageHeight, { spacing: rhythm });
    const appended = appendRecordToSection(doc, headingId, pageHeight, {
      spacing: rhythm,
      idFactory: makeIdFactory("edu2"),
    });
    assert.ok(appended);
    doc = appended.elements;

    const before = listSectionContentElements(doc, headingId, pageHeight);
    const firstTitleId = before[0].element_id;
    const firstGroupId = before[0].flowGroup;
    const firstDescription = before[3];
    const secondTitleTopBefore = before[4].top;
    assert.equal(firstDescription.bulletList, true);
    assert.equal(getRecordDescriptionAction(doc, firstTitleId, pageHeight), "remove");

    const removed = removeRecordDescription(doc, firstTitleId, pageHeight, {
      spacing: rhythm,
    });
    assert.ok(removed);
    assert.deepEqual([...removed.removedIds], [firstDescription.element_id]);
    const withoutDescription = listSectionContentElements(
      removed.elements,
      headingId,
      pageHeight,
    );
    const groupsWithoutDescription = partitionSectionRecords(withoutDescription);
    assert.equal(groupsWithoutDescription[0].length, 3);
    assert.equal(groupsWithoutDescription[1].length, 4);
    assert.ok(
      groupsWithoutDescription[1][0].top < secondTitleTopBefore,
      "the following record must close the removed description gap",
    );
    assert.equal(
      getRecordDescriptionAction(removed.elements, firstTitleId, pageHeight),
      "add",
    );
    assert.equal(
      listRecordBlockAddAnchors(removed.elements, pageHeight)[0].descriptionAction,
      "add",
    );

    const restored = addRecordDescription(
      removed.elements,
      firstTitleId,
      pageHeight,
      { spacing: rhythm, idFactory: makeIdFactory("description") },
    );
    assert.ok(restored);
    const restoredBody = listSectionContentElements(restored.elements, headingId, pageHeight);
    const restoredGroups = partitionSectionRecords(restoredBody);
    const description = restoredGroups[0].find((element) => element.bulletList);
    assert.ok(description);
    assert.equal(description.element_id, restored.descriptionId);
    assert.equal(description.content, "Opis…");
    assert.equal(description.flowGroup, firstGroupId);
    assert.equal(restoredGroups[0].length, 4);
    assert.equal(restoredGroups[1].length, 4);
    assert.equal(
      getRecordDescriptionAction(restored.elements, firstTitleId, pageHeight),
      "remove",
    );
  });

  it("restores a missing description in a single Experience record", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Doświadczenie",
      layout: SECTION_LAYOUTS.RECORD_EXPERIENCE,
      style,
      idFactory: makeIdFactory("exp"),
    });
    const body = listSectionContentElements(elements, headingId);
    const titleId = body[0].element_id;
    const removed = removeRecordDescription(elements, titleId);
    assert.ok(removed);
    assert.equal(getRecordDescriptionAction(removed.elements, titleId), "add");

    const restored = addRecordDescription(removed.elements, titleId, 842, {
      idFactory: makeIdFactory("restored"),
    });
    assert.ok(restored);
    const restoredBody = listSectionContentElements(restored.elements, headingId);
    assert.equal(restoredBody.length, 3);
    assert.equal(restoredBody[2].content, "Opis…");
    assert.equal(restoredBody[2].bulletList, true);
  });

  it("does not offer a duplicate description for Skills subcategories", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Umiejętności",
      layout: SECTION_LAYOUTS.RECORD_SUBCATEGORY,
      style,
      idFactory: makeIdFactory("skills"),
    });
    const body = listSectionContentElements(elements, headingId);
    assert.equal(body.length, 2);
    assert.equal(getRecordDescriptionAction(elements, body[0].element_id), null);
    assert.equal(addRecordDescription(elements, body[0].element_id), null);
    assert.equal(removeRecordDescription(elements, body[0].element_id), null);
    assert.equal(listRecordBlockAddAnchors(elements)[0].descriptionAction, null);
  });

  it("accepts only the record upper band as an operation anchor", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Doświadczenie",
      layout: SECTION_LAYOUTS.RECORD_EXPERIENCE,
      style,
      idFactory: makeIdFactory("exp"),
    });
    const body = listSectionContentElements(elements, headingId);
    const descriptionId = body.find((element) => element.bulletList).element_id;
    assert.equal(getRecordDescriptionAction(elements, descriptionId), null);
    assert.equal(addRecordDescription(elements, descriptionId), null);
    assert.equal(removeRecordDescription(elements, descriptionId), null);
  });
});

describe("reorderRecordBlock", () => {
  it("moves the second experience record above the first and re-packs", () => {
    const pageHeight = 842;
    const rhythm = { ...DEFAULT_FLOW_SPACING };
    const { elements: built, headingId } = buildSectionElements({
      name: "Doświadczenie",
      layout: SECTION_LAYOUTS.RECORD_EXPERIENCE,
      style,
      idFactory: makeIdFactory("exp"),
    });
    let doc = appendSectionAtEnd([], built, pageHeight, { spacing: rhythm });
    const appended = appendRecordToSection(doc, headingId, pageHeight, {
      spacing: rhythm,
      idFactory: makeIdFactory("rec2"),
    });
    assert.ok(appended);
    doc = appended.elements;

    const before = listSectionContentElements(doc, headingId, pageHeight);
    assert.equal(before.length, 6);
    const firstTitle = before[0].content;
    const secondTitleId = before[3].element_id;

    const result = reorderRecordBlock(doc, secondTitleId, "up", pageHeight, {
      spacing: rhythm,
    });
    assert.ok(result);
    const after = listSectionContentElements(result.elements, headingId, pageHeight);
    assert.equal(after.length, 6);
    assert.equal(after[0].element_id, secondTitleId);
    assert.equal(after[3].content, firstTitle);
    assert.ok(after[0].top < after[3].top);
  });

  it("returns null at the ends of the section and for invalid direction", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Doświadczenie",
      layout: SECTION_LAYOUTS.RECORD_EXPERIENCE,
      style,
      idFactory: makeIdFactory("exp"),
    });
    const body = listSectionContentElements(elements, headingId);
    assert.equal(reorderRecordBlock(elements, body[0].element_id, "up"), null);
    assert.equal(reorderRecordBlock(elements, body[0].element_id, "down"), null);
    assert.equal(reorderRecordBlock(elements, body[0].element_id, "sideways"), null);
  });

  it("does not let a record-overlay date/location rail inflate positions when swapping records", () => {
    // Regression: reorderRecordBlock's own manual relocation pass (run before
    // applyFlowSpacing) used to stack every group member sequentially,
    // including `record-overlay` lines (Meridian's period/city rail, Axis's
    // date gutter, …) — inflating every later line's position by the
    // overlay's height, which showed up live as scrambled records after
    // using a record's ↑/↓ reorder arrows.
    const pageHeight = 842;
    const record = (id, top) => ([
      {
        element_id: `${id}-title`, category: "textarea", flowRole: "content",
        autoHeight: true, flowGroup: id, content: `${id} title`, bold: true,
        page: 1, top, left: 62, width: 300, height: 13,
      },
      {
        element_id: `${id}-period`, category: "textarea", flowRole: "record-overlay",
        autoHeight: false, flowGroup: id, content: "2021 – 2022", align: "right",
        page: 1, top, left: 374, width: 130, height: 11,
      },
      {
        element_id: `${id}-company`, category: "textarea", flowRole: "content",
        autoHeight: true, flowGroup: id, content: `${id} company`,
        page: 1, top: top + 17, left: 62, width: 300, height: 11,
      },
      {
        element_id: `${id}-city`, category: "textarea", flowRole: "record-overlay",
        autoHeight: false, flowGroup: id, content: "Warszawa", align: "right",
        page: 1, top: top + 17, left: 374, width: 130, height: 11,
      },
      {
        element_id: `${id}-bullets`, category: "textarea", flowRole: "content",
        autoHeight: true, flowGroup: id, content: "• one\n• two",
        page: 1, top: top + 32, left: 62, width: 471, height: 24,
      },
    ]);
    const heading = {
      element_id: "h1", category: "text", flowRole: "section-chrome",
      content: "DOŚWIADCZENIE", page: 1, top: 100, left: 62, height: 14,
    };
    const elements = [heading, ...record("recA", 122), ...record("recB", 200)];

    const rhythm = { ...DEFAULT_FLOW_SPACING };
    const result = reorderRecordBlock(elements, "recB-title", "up", pageHeight, { spacing: rhythm });
    assert.ok(result);

    const byId = Object.fromEntries(result.elements.map((element) => [element.element_id, element]));
    const abs = (element) => (element.page - 1) * pageHeight + element.top;

    // recB now comes first; recA follows immediately after recB's true
    // bottom (bullets) — not after some inflated height counting the
    // overlay lines as extra stacked rows.
    assert.ok(abs(byId["recB-title"]) < abs(byId["recA-title"]));

    // Every overlay stays pinned exactly beside its real anchor line.
    assert.equal(byId["recA-period"].top, byId["recA-title"].top);
    assert.equal(byId["recA-city"].top, byId["recA-company"].top);
    assert.equal(byId["recB-period"].top, byId["recB-title"].top);
    assert.equal(byId["recB-city"].top, byId["recB-company"].top);

    // Nothing from the swapped-to-second record (recA) lands before the
    // swapped-to-first record's (recB) title — i.e. no interleaving.
    for (const id of ["recA-title", "recA-period", "recA-company", "recA-city", "recA-bullets"]) {
      assert.ok(abs(byId[id]) > abs(byId["recB-title"]), `${id} must land after recB`);
    }
  });
});

describe("removeRecordBlock", () => {
  it("deletes one experience record and re-packs the next record upward", () => {
    const pageHeight = 842;
    const rhythm = { ...DEFAULT_FLOW_SPACING };
    const { elements: built, headingId } = buildSectionElements({
      name: "Doświadczenie",
      layout: SECTION_LAYOUTS.RECORD_EXPERIENCE,
      style,
      idFactory: makeIdFactory("exp"),
    });
    let doc = appendSectionAtEnd([], built, pageHeight, { spacing: rhythm });
    const appended = appendRecordToSection(doc, headingId, pageHeight, {
      spacing: rhythm,
      idFactory: makeIdFactory("rec2"),
    });
    assert.ok(appended);
    doc = appended.elements;

    const before = listSectionContentElements(doc, headingId, pageHeight);
    assert.equal(before.length, 6);
    const firstGroupId = before[0].flowGroup;
    const secondTopBefore = before[3].top;

    const result = removeRecordBlock(doc, before[0].element_id, pageHeight, {
      spacing: rhythm,
    });
    assert.ok(result);
    const after = listSectionContentElements(result.elements, headingId, pageHeight);
    assert.equal(after.length, 3);
    assert.notEqual(after[0].flowGroup, firstGroupId);
    assert.ok(result.removedIds.has(before[0].element_id));
    assert.ok(after[0].top < secondTopBefore, "remaining record must close the hole");
  });

  it("returns null for bullet description and unknown ids", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Doświadczenie",
      layout: SECTION_LAYOUTS.RECORD_EXPERIENCE,
      style,
      idFactory: makeIdFactory("exp"),
    });
    const body = listSectionContentElements(elements, headingId);
    const description = body.find((element) => element.bulletList);
    assert.ok(description);
    assert.equal(removeRecordBlock(elements, description.element_id), null);
    assert.equal(removeRecordBlock(elements, "missing"), null);
  });
});

describe("sidebar lane records", () => {
  const pageHeight = 842;
  const rhythm = { ...DEFAULT_FLOW_SPACING };
  const sidebarStyle = {
    ...style,
    left: 51,
    bodyLeft: 25,
    recordWidth: 128,
    heading: { ...style.heading, fontSize: 7.6 },
    rule: { width: 50, height: 1, backgroundColor: "#BFB4AA", relLeft: 0 },
    body: { fontSize: 6.6, fontFamily: "Inter", lineHeight: 9, color: "#24201E" },
  };

  function sidebarEduDoc() {
    const { elements: built, headingId } = buildSectionElements({
      name: "Wykształcenie",
      layout: SECTION_LAYOUTS.RECORD_EDUCATION,
      style: sidebarStyle,
      idFactory: makeIdFactory("sb-edu"),
      lane: "sidebar",
    });
    // Place the strip at a stable rail Y so membership resolves cleanly.
    const placed = built.map((element) => ({
      ...element,
      top: (Number(element.top) || 0) + 200,
      page: 1,
    }));
    return { elements: placed, headingId };
  }

  it("lists record anchors for sidebar education and reorders within the rail", () => {
    let { elements, headingId } = sidebarEduDoc();
    const appended = appendRecordToSection(elements, headingId, pageHeight, {
      spacing: rhythm,
      idFactory: makeIdFactory("sb-rec2"),
    });
    assert.ok(appended);
    elements = appended.elements;

    const anchors = listRecordBlockAddAnchors(elements, pageHeight);
    assert.ok(
      anchors.length >= 2,
      "sidebar education with two records must expose record anchors",
    );
    const body = listSectionContentElements(elements, headingId, pageHeight);
    assert.ok(body.length >= 6);
    assert.ok(body.every((element) => element.flowLane === "sidebar"));

    const secondTitleId = body[4].element_id;
    const result = reorderRecordBlock(elements, secondTitleId, "up", pageHeight, {
      spacing: rhythm,
    });
    assert.ok(result);
    const after = listSectionContentElements(result.elements, headingId, pageHeight);
    assert.equal(after[0].element_id, secondTitleId);
    // Main-column section list must stay empty — this fixture is rail-only.
    assert.equal(listDocumentSections(result.elements, pageHeight).length, 0);
  });
});
