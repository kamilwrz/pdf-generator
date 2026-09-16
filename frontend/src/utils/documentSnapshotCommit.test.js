import assert from "node:assert/strict";
import test from "node:test";
import { matchesAutomaticNameFitSnapshot, normalizeCommittedDocumentSnapshot } from "./documentSnapshotCommit.js";
import { hasUnchangedSavedTextLayout } from "./savedTextLayout.js";
import { createPersistedDocumentSnapshot, persistedDocumentSignature } from "./persistedDocumentSnapshot.js";
import { fitMastheadNames } from "./mastheadNameFit.js";

const nameFixture = () => [
  { element_id: 'name', category: 'text', content: 'W'.repeat(40), fontSize: 24,
    fontFamily: 'Montserrat', left: 218, top: 60, page: 1, mastheadRole: 'name',
    mastheadBandId: 'masthead-main', flowRole: 'masthead' },
  { element_id: 'identity', category: 'text', content: '', left: 0, top: 0, page: 1,
    flowRole: 'masthead-anchor', mastheadBandId: 'masthead-main',
    mastheadIdentity: { id: 'masthead-main', contactBandId: 'contact',
      title: { spec: { top: 92 }, decorations: [] } } },
  { element_id: 'contact-anchor', category: 'text', content: '', left: 0, top: 0, page: 1,
    flowRole: 'masthead-anchor', contactBand: { id: 'contact',
      anchor: { startX: 218, startY: 119, rightLimit: 547 } } },
  { element_id: 'body', category: 'textarea', content: 'Saved summary', fontSize: 12,
    left: 218, top: 200, width: 329, height: 28, lineHeight: 14, page: 1, flowRole: 'content' },
];
const nameMetrics = (factor) => ({ measureTextWidth: (text, style) => text.length * style.fontSize * factor,
  measureLines: null, createId: () => 'continuation' });

test('legacy name fitting precedes both the live commit and clean snapshot', () => {
  const snapshot = normalizeCommittedDocumentSnapshot({ pdfId: 27, templateId: 'slate',
    elements: nameFixture(), title: 'Saved CV' }, { nameFitOptions: nameMetrics(0.4) });
  const name = snapshot.elements.find((element) => element.mastheadRole === 'name');
  assert.ok(name.nameFit);
  assert.ok(name.fontSize < 24);
  const baseline = createPersistedDocumentSnapshot(snapshot);
  const fittedAgain = fitMastheadNames(snapshot.elements, nameMetrics(0.4));
  assert.equal(fittedAgain, snapshot.elements);
  assert.equal(persistedDocumentSignature(createPersistedDocumentSnapshot({ ...snapshot, elements: fittedAgain })),
    persistedDocumentSignature(baseline));
});

test('late font repair accepts the complete saved graph and never newer authored edits', () => {
  const snapshot = normalizeCommittedDocumentSnapshot({ pdfId: 27, templateId: 'slate',
    elements: nameFixture(), title: 'Saved CV' }, { nameFitOptions: nameMetrics(0.4) });
  const baseline = createPersistedDocumentSnapshot(snapshot);
  const late = createPersistedDocumentSnapshot({ ...snapshot,
    elements: fitMastheadNames(snapshot.elements, nameMetrics(0.8)) });
  assert.notEqual(persistedDocumentSignature(late), persistedDocumentSignature(baseline));
  assert.equal(matchesAutomaticNameFitSnapshot(baseline, late, nameMetrics(0.8)), true);
  for (const patch of [
    { title: 'Unsaved title' },
    { cvData: { name: 'Another candidate' } },
    { deletedElements: ['body'] },
    { elements: late.elements.filter((element) => element.element_id !== 'body') },
    { elements: late.elements.map((element) => element.element_id === 'body'
      ? { ...element, content: 'Unsaved summary' } : element) },
    { elements: late.elements.map((element) => element.element_id === 'body'
      ? { ...element, top: element.top + 1 } : element) },
    { elements: late.elements.map((element) => element.element_id === 'name'
      ? { ...element, fontFamily: 'Inter' } : element) },
  ]) {
    assert.equal(matchesAutomaticNameFitSnapshot(baseline, { ...late, ...patch }, nameMetrics(0.8)), false);
  }
});

test('late font pagination ignores only new chrome IDs and preserves saved fixed shapes', () => {
  const original = nameFixture().filter((element) => element.element_id !== 'body');
  original.push(
    { element_id: 'saved-frame', category: 'rect', left: 24, top: 24,
      width: 547, height: 794, page: 1, fixedToPage: true, stroke: '#000000' },
    { element_id: 'heading', category: 'text', content: 'EXPERIENCE', fontSize: 12,
      left: 218, top: 710, page: 1, flowRole: 'section-chrome', editorSectionType: 'experience' },
    { element_id: 'body', category: 'textarea', content: 'Saved experience', fontSize: 12,
      left: 218, top: 740, width: 329, height: 28, lineHeight: 14, page: 1,
      flowRole: 'content', flowGroup: 'record' },
  );
  const snapshot = normalizeCommittedDocumentSnapshot({ pdfId: 27, templateId: 'slate',
    elements: original, title: 'Saved CV' }, { nameFitOptions: nameMetrics(0.4) });
  const baseline = createPersistedDocumentSnapshot(snapshot);
  const elements = fitMastheadNames(snapshot.elements, {
    ...nameMetrics(0.8), createId: () => 'actual-generated-frame',
  });
  const late = createPersistedDocumentSnapshot({ ...snapshot, elements,
    pageCount: Math.max(...elements.map((element) => element.page)) });
  assert.equal(late.pageCount, 2);
  assert.ok(late.elements.some((element) => element.element_id === 'actual-generated-frame'));
  assert.equal(matchesAutomaticNameFitSnapshot(baseline, late, nameMetrics(0.8)), true);
  for (const altered of [
    late.elements.filter((element) => element.element_id !== 'saved-frame'),
    late.elements.map((element) => element.element_id === 'saved-frame'
      ? { ...element, element_id: 'replaced-authored-frame' } : element),
    late.elements.map((element) => element.element_id === 'actual-generated-frame'
      ? { ...element, width: element.width - 1 } : element),
  ]) {
    assert.equal(matchesAutomaticNameFitSnapshot(baseline, { ...late, elements: altered }, nameMetrics(0.8)), false);
  }
});

test("regenerated content retaining a document ID is measured before editing", () => {
  const input = { pdfId: 27, revision: 6, elements: [{ element_id: "role", category: "textarea",
    content: "Specialist", autoHeight: true, width: 280, height: 15, lineHeight: 11 }] };
  const saved = normalizeCommittedDocumentSnapshot(input);
  const regenerated = normalizeCommittedDocumentSnapshot(input, { preserveSavedLayout: false });
  assert.equal(hasUnchangedSavedTextLayout(saved.elements[0]), true);
  assert.equal(hasUnchangedSavedTextLayout(regenerated.elements[0]), false);
  assert.equal(regenerated.pdfId, 27);
  assert.equal(regenerated.serverRevision, 6);
});

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

test("load-time bullet cleanup precedes the saved measurement baseline", () => {
  const snapshot = normalizeCommittedDocumentSnapshot({
    pdfId: 41,
    elements: [{ element_id: "body", category: "textarea", content: "Item\n• ", bulletList: true, width: 200, height: 40 }],
  });
  assert.equal(snapshot.elements[0].content, "Item");
});
