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
