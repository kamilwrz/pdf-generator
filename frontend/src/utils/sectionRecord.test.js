import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSectionElements, SECTION_LAYOUTS } from "./sectionBuilder.js";
import { appendSectionAtEnd, deriveSectionStyle } from "./sectionStructure.js";
import {
  appendRecordToSection,
  buildRecordClone,
  elementSupportsRecordBlockAdd,
  ensureCanonicalRecordTemplate,
  inferRecordLayout,
  insertRecordBlockAfterRecord,
  listRecordBlockAddAnchors,
  listRecordBlockAddElementIds,
  listSectionContentElements,
  listUpperRecordMembers,
  partitionSectionRecords,
  pickRecordTemplateGroup,
  placeholderContentsForRecord,
  removeRecordBlock,
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
});

describe("placeholderContentsForRecord / inferRecordLayout", () => {
  it("maps 4-line records to education placeholders", () => {
    assert.equal(inferRecordLayout([{}, {}, {}, {}]), SECTION_LAYOUTS.RECORD_EDUCATION);
    assert.deepEqual(placeholderContentsForRecord([{}, {}, {}, {}]), [
      "Nazwa dyplomu",
      "Uczelnia",
      "Miasto · okres",
      "Opis…",
    ]);
  });

  it("maps 3-line records with bullets to experience placeholders", () => {
    const exp = [{ bold: true }, {}, { bulletList: true }];
    assert.equal(inferRecordLayout(exp), SECTION_LAYOUTS.RECORD_EXPERIENCE);
    assert.deepEqual(placeholderContentsForRecord(exp), [
      "Stanowisko",
      "Firma · okres",
      "Opis…",
    ]);
  });

  it("maps 3-line records without bullets to education placeholders", () => {
    const edu = [{ bold: true }, {}, {}];
    assert.equal(inferRecordLayout(edu), SECTION_LAYOUTS.RECORD_EDUCATION);
    assert.deepEqual(placeholderContentsForRecord(edu), [
      "Nazwa dyplomu",
      "Uczelnia",
      "Miasto · okres",
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
    assert.equal(groups[1][0].content, "Nazwa dyplomu");
    assert.equal(groups[1][1].content, "Uczelnia");
    assert.equal(groups[1][2].content, "Miasto · okres");
    assert.equal(groups[1][3].content, "Opis…");
    assert.equal(groups[1][3].bulletList, true);
    assert.equal(result.firstBodyId, groups[1][0].element_id);
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
    assert.equal(body[3].content, "Stanowisko");
    assert.equal(body[4].content, "Firma · okres");
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
    assert.equal(clones[0].content, "Stanowisko");
    assert.equal(clones[0].bold, true);
    assert.equal(clones[0].color, "#0B1C2C");
    assert.equal(clones[1].content, "Firma · okres");
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
    assert.equal(clones[0].content, "Nazwa dyplomu");
    assert.equal(clones[1].content, "Uczelnia");
    assert.equal(clones[2].content, "Miasto · okres");
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
    assert.equal(upper[0].content, "Stanowisko");
    assert.equal(upper[1].content, "Firma · okres");
    assert.equal(elementSupportsRecordBlockAdd(elements, body[0].element_id), true);
    assert.equal(elementSupportsRecordBlockAdd(elements, body[1].element_id), true);
    assert.equal(elementSupportsRecordBlockAdd(elements, body[2].element_id), false);
    // One mounted "+" per record (title), listening to title + meta.
    const anchors = listRecordBlockAddAnchors(elements);
    assert.equal(anchors.length, 1);
    assert.equal(anchors[0].elementId, body[0].element_id);
    assert.deepEqual(anchors[0].hoverIds, [body[0].element_id, body[1].element_id]);
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
    assert.equal(groups[1][0].content, "Nazwa dyplomu");
    assert.equal(groups[1][1].content, "Uczelnia");
    assert.equal(groups[1][2].content, "Miasto · okres");
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
    assert.equal(groups[1][0].content, "Stanowisko");
    assert.equal(groups[1][1].content, "Firma · okres");
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
    // Two short education records (degree + school only) — the bug case from Kernel.
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
    assert.equal(groups[1][0].content, "Nazwa dyplomu");
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
