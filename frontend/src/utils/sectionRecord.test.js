import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSectionElements, SECTION_LAYOUTS } from "./sectionBuilder.js";
import { appendSectionAtEnd, deriveSectionStyle } from "./sectionStructure.js";
import {
  appendRecordToSection,
  buildGenericTextBlock,
  elementSupportsRecordBlockAdd,
  inferRecordLayout,
  insertGenericBlockAfterRecord,
  listRecordBlockAddElementIds,
  listSectionContentElements,
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

describe("insertGenericBlockAfterRecord", () => {
  it("inserts a single Tekst… block under the hovered record, not a structural clone", () => {
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

    // Hover the school line (index 1) — insert still goes under the whole record.
    let seq = 0;
    const result = insertGenericBlockAfterRecord(doc, before[1].element_id, pageHeight, {
      idFactory: () => `gen-${++seq}`,
    });
    assert.ok(result);
    const after = listSectionContentElements(result.elements, headingId, pageHeight);
    assert.equal(after.length, 5);
    assert.equal(after[4].content, "Tekst…");
    assert.equal(after[4].bold, false);
    assert.equal(after[4].bulletList, false);
    assert.equal(after[4].category, "textarea");
    assert.ok(after[4].flowGroup);
    assert.notEqual(after[4].flowGroup, before[0].flowGroup);
    assert.equal(result.firstBodyId, after[4].element_id);

    // Original education lines stay a single keep-together group above the new block.
    const groups = partitionSectionRecords(after);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].length, 4);
    assert.equal(groups[1].length, 1);
    assert.equal(groups[1][0].content, "Tekst…");
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
    // Anchor on first record's title — generic block must land before second record.
    const result = insertGenericBlockAfterRecord(doc, body[0].element_id, pageHeight, {
      idFactory: makeIdFactory("mid"),
    });
    assert.ok(result);
    const after = listSectionContentElements(result.elements, headingId, pageHeight);
    assert.equal(after.length, 7);
    assert.equal(after[3].content, "Tekst…");
    assert.equal(after[4].content, "Stanowisko");
  });

  it("returns null for aa sections / unknown ids", () => {
    const { elements, headingId } = buildSectionElements({
      name: "Skills",
      layout: SECTION_LAYOUTS.TEXTAREA,
      style,
      idFactory: makeIdFactory(),
    });
    const body = listSectionContentElements(elements, headingId);
    assert.equal(elementSupportsRecordBlockAdd(elements, body[0].element_id), false);
    assert.equal(listRecordBlockAddElementIds(elements).size, 0);
    assert.equal(insertGenericBlockAfterRecord(elements, body[0].element_id), null);
    assert.equal(insertGenericBlockAfterRecord(elements, "missing"), null);
  });

  it("buildGenericTextBlock uses body styling, not bold title weight", () => {
    const block = buildGenericTextBlock({
      fontSize: 9.3,
      fontFamily: "Inter",
      lineHeight: 13,
      color: "#24201E",
      left: 66,
      width: 466,
      bold: true,
      bulletList: true,
    }, makeIdFactory("g"));
    assert.equal(block.content, "Tekst…");
    assert.equal(block.bold, false);
    assert.equal(block.bulletList, false);
  });
});
