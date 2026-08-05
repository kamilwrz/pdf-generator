import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSectionElements, SECTION_LAYOUTS } from "./sectionBuilder.js";
import { appendSectionAtEnd, deriveSectionStyle } from "./sectionStructure.js";
import {
  appendRecordToSection,
  elementSupportsRecordBlockAdd,
  inferRecordLayout,
  insertRecordBlockAfterRecord,
  listRecordBlockAddAnchors,
  listRecordBlockAddElementIds,
  listSectionContentElements,
  listUpperRecordMembers,
  partitionSectionRecords,
  placeholderContentsForRecord,
  sectionSupportsRecordAdd,
} from "./sectionRecord.js";

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

  it("maps 3-line records to experience placeholders", () => {
    assert.equal(inferRecordLayout([{}, {}, {}]), SECTION_LAYOUTS.RECORD_EXPERIENCE);
    assert.deepEqual(placeholderContentsForRecord([{}, {}, {}]), [
      "Stanowisko",
      "Firma · okres",
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
