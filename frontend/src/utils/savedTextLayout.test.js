import assert from "node:assert/strict";
import test from "node:test";
import { hasUnchangedSavedTextLayout, preserveSavedTextLayouts } from "./savedTextLayout.js";
import { createPersistedDocumentSnapshot, persistedDocumentSignature } from "./persistedDocumentSnapshot.js";

const field = { element_id: "body", category: "textarea", content: "Saved text", width: 200, height: 40, autoHeight: true };

test("saved layout survives selection and undo clones without entering persistence", () => {
  const [saved] = preserveSavedTextLayouts([field]);
  assert.equal(hasUnchangedSavedTextLayout({ ...saved, isSelected: true, isEditing: true }), true);
  assert.equal(JSON.stringify(saved), JSON.stringify(field));
  assert.equal(persistedDocumentSignature(createPersistedDocumentSnapshot({ elements: [saved] })),
    persistedDocumentSignature(createPersistedDocumentSnapshot({ elements: [field] })));
  assert.equal(hasUnchangedSavedTextLayout(field), false);
});

test("actual content and typography edits unlock measurement; reverting restores the baseline", () => {
  const [saved] = preserveSavedTextLayouts([field]);
  for (const change of [{ content: "Changed" }, { width: 100 }, { fontSize: 15 }, { bold: true },
    { italic: true }, { runs: [{ start: 0, end: 2, bold: true }] }, { textTransform: "uppercase" }]) {
    assert.equal(hasUnchangedSavedTextLayout({ ...saved, ...change }), false);
  }
  assert.equal(hasUnchangedSavedTextLayout({ ...saved, content: "Changed", ...field }), true);
});

test("a save response cannot freeze edits made after submission", () => {
  const edited = { ...field, content: "Typed while saving" };
  assert.equal(preserveSavedTextLayouts([edited], [field])[0], edited);
  assert.equal(hasUnchangedSavedTextLayout(edited), false);
  const saved = preserveSavedTextLayouts([field]);
  assert.equal(preserveSavedTextLayouts(saved), saved);
});

test("save baselines ignore property order inside formatted runs", () => {
  const live = { ...field, runs: [{ start: 0, end: 2, bold: true }] };
  const sent = { ...field, runs: [{ bold: true, end: 2, start: 0 }] };
  assert.equal(hasUnchangedSavedTextLayout(preserveSavedTextLayouts([live], [sent])[0]), true);
});
