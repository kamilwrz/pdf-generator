import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCommittedDocumentSnapshot } from "./documentSnapshotCommit.js";

test("complete snapshot normalization clears metadata that is not supplied", () => {
  const snapshot = normalizeCommittedDocumentSnapshot({ elements: [] });

  assert.deepEqual(snapshot, {
    elements: [],
    deletedElements: [],
    title: "",
    pageCount: 1,
    currentPage: 1,
    templateId: null,
    editorMode: "freeform",
    flowSpacing: null,
    cvData: null,
    sourceImportId: null,
    pdfId: null,
    serverRevision: null,
    isDemoContent: false,
  });
});

test("saved API metadata becomes one canonical editor snapshot", () => {
  const elements = [{ element_id: "page-three", category: "text", page: 3 }];
  const cvData = { name: "Ada" };
  const snapshot = normalizeCommittedDocumentSnapshot({
    elements,
    deletedIds: ["removed"],
    title: "Ada.pdf",
    pages: 2,
    currentPage: 9,
    template_id: "slate",
    editor_mode: "template",
    spacing_px: { sectionGap: 20 },
    cv_data: cvData,
    source_import_id: 14,
    pdf_id: 27,
    revision: 6,
    isDemoContent: true,
  });

  assert.equal(snapshot.elements, elements);
  assert.deepEqual(snapshot.deletedElements, ["removed"]);
  assert.equal(snapshot.title, "Ada");
  assert.equal(snapshot.pageCount, 3);
  assert.equal(snapshot.currentPage, 3);
  assert.equal(snapshot.templateId, "slate");
  assert.equal(snapshot.editorMode, "template");
  assert.equal(snapshot.cvData, cvData);
  assert.equal(snapshot.sourceImportId, 14);
  assert.equal(snapshot.pdfId, 27);
  assert.equal(snapshot.serverRevision, 6);
  assert.equal(snapshot.isDemoContent, true);
});

test("opening an older German Languages grid backfills its identity and removes only its generated level accent", () => {
  const generatedLevelRun = { start: 9, end: 11, italic: true, color: "#A05A3C" };
  const manualNameRun = { start: 0, end: 6, bold: true };
  const elements = [
    {
      element_id: "languages-heading",
      category: "text",
      content: "SPRACHEN",
      left: 80,
      top: 100,
      width: 400,
      height: 14,
      page: 1,
      flowRole: "section-chrome",
    },
    {
      element_id: "languages-rule",
      category: "line",
      left: 80,
      top: 116,
      width: 400,
      height: 1,
      page: 1,
      flowRole: "section-chrome",
    },
    {
      element_id: "language-polish",
      category: "textarea",
      content: "Polski — C2",
      left: 80,
      top: 128,
      width: 92,
      height: 18,
      page: 1,
      flowRole: "grid-member",
      runs: [manualNameRun, generatedLevelRun],
    },
  ];

  const snapshot = normalizeCommittedDocumentSnapshot({
    elements,
    templateId: "regent",
    editorMode: "template",
  });

  assert.notEqual(snapshot.elements, elements);
  assert.deepEqual(snapshot.elements[2].runs, [manualNameRun]);
  assert.equal(snapshot.elements[2].gridKind, "languages");
});

test("opening a renamed semantic Languages grid still migrates its legacy level run", () => {
  const generatedLevelRun = { start: 9, end: 11, italic: true, color: "#A05A3C" };
  const elements = [
    {
      element_id: "languages-heading",
      category: "text",
      content: "KOMPETENCJE GLOBALNE",
      left: 80,
      top: 100,
      width: 400,
      height: 14,
      page: 1,
      flowRole: "section-chrome",
    },
    {
      element_id: "languages-rule",
      category: "line",
      left: 80,
      top: 116,
      width: 400,
      height: 1,
      page: 1,
      flowRole: "section-chrome",
    },
    {
      element_id: "language-polish",
      category: "textarea",
      content: "Polski — C2",
      left: 80,
      top: 128,
      width: 92,
      height: 18,
      page: 1,
      flowRole: "grid-member",
      gridKind: "languages",
      runs: [generatedLevelRun],
    },
  ];

  const snapshot = normalizeCommittedDocumentSnapshot({ elements });

  assert.equal(snapshot.elements[2].gridKind, "languages");
  assert.equal(snapshot.elements[2].runs, null);
});

test("opening a custom JĘZYKI entries grid preserves its inline runs and semantic kind", () => {
  const customRun = { start: 9, end: 11, italic: true, color: "#155EEF" };
  const elements = [
    {
      element_id: "custom-heading",
      category: "text",
      content: "JĘZYKI",
      left: 80,
      top: 100,
      width: 300,
      height: 14,
      page: 1,
      flowRole: "section-chrome",
      gridKind: "entries",
    },
    {
      element_id: "custom-cell",
      category: "textarea",
      content: "Polski — C2",
      left: 80,
      top: 128,
      width: 92,
      height: 18,
      page: 1,
      flowRole: "grid-member",
      gridKind: "entries",
      runs: [customRun],
    },
  ];

  const snapshot = normalizeCommittedDocumentSnapshot({ elements });

  assert.equal(snapshot.elements, elements);
  assert.equal(snapshot.elements[1].gridKind, "entries");
  assert.deepEqual(snapshot.elements[1].runs, [customRun]);
});
