import assert from "node:assert/strict";
import test from "node:test";

import {
  createPersistedDocumentSnapshot,
  hasPersistedDocumentContent,
  persistedDocumentSignature,
} from "./persistedDocumentSnapshot.js";

test("transient editor flags do not make a persisted snapshot dirty", () => {
  const base = createPersistedDocumentSnapshot({
    title: "CV",
    elements: [{ element_id: "name", category: "text", content: "Ada" }],
  });
  const selected = createPersistedDocumentSnapshot({
    title: "CV",
    elements: [{
      element_id: "name",
      category: "text",
      content: "Ada",
      isSelected: true,
      isMove: true,
      isEditing: true,
      isResizeable: true,
    }],
  });

  assert.equal(persistedDocumentSignature(base), persistedDocumentSignature(selected));
});

test("signature is stable for object key order but preserves element order", () => {
  const first = createPersistedDocumentSnapshot({
    cvData: { title: "Engineer", name: "Ada" },
    elements: [
      { element_id: "a", category: "text", content: "A" },
      { element_id: "b", category: "text", content: "B" },
    ],
  });
  const reorderedKeys = createPersistedDocumentSnapshot({
    cvData: { name: "Ada", title: "Engineer" },
    elements: [
      { content: "A", category: "text", element_id: "a" },
      { content: "B", category: "text", element_id: "b" },
    ],
  });
  const reorderedElements = createPersistedDocumentSnapshot({
    cvData: { name: "Ada", title: "Engineer" },
    elements: [...reorderedKeys.elements].reverse(),
  });

  assert.equal(persistedDocumentSignature(first), persistedDocumentSignature(reorderedKeys));
  assert.notEqual(persistedDocumentSignature(first), persistedDocumentSignature(reorderedElements));
});

test("content detection includes title and non-text canvas elements", () => {
  assert.equal(hasPersistedDocumentContent(createPersistedDocumentSnapshot()), false);
  assert.equal(hasPersistedDocumentContent(createPersistedDocumentSnapshot({ title: "CV" })), true);
  assert.equal(hasPersistedDocumentContent(createPersistedDocumentSnapshot({
    elements: [{ category: "image", src: "/photo" }],
  })), true);
});
