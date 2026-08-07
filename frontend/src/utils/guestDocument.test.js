import test from "node:test";
import assert from "node:assert/strict";
import {
  saveGuestDocument,
  loadGuestDocument,
  clearGuestDocument,
  hasGuestDocument,
} from "./guestDocument.js";

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

test("saveGuestDocument then loadGuestDocument round-trips the snapshot", () => {
  globalThis.localStorage = fakeLocalStorage();
  const snapshot = {
    elements: [{ element_id: "a", category: "text", content: "hi" }],
    deletedIds: [],
    title: "Moje CV",
    pageCount: 1,
    editorMode: "template",
    templateId: "ledger",
    spacingPx: null,
    isDemoContent: false,
    updatedAt: 1234,
  };

  saveGuestDocument(snapshot);
  const loaded = loadGuestDocument();

  assert.deepEqual(loaded, snapshot);
});

test("loadGuestDocument returns null when nothing was saved", () => {
  globalThis.localStorage = fakeLocalStorage();
  assert.equal(loadGuestDocument(), null);
});

test("loadGuestDocument returns null for corrupted JSON instead of throwing", () => {
  globalThis.localStorage = fakeLocalStorage();
  globalThis.localStorage.setItem("cvstudio.guest.doc", "{not json");
  assert.equal(loadGuestDocument(), null);
});

test("clearGuestDocument removes the stored snapshot", () => {
  globalThis.localStorage = fakeLocalStorage();
  saveGuestDocument({
    elements: [{ element_id: "a", category: "text" }],
    deletedIds: [],
    title: "x",
    pageCount: 1,
    editorMode: "freeform",
    templateId: null,
    spacingPx: null,
    isDemoContent: false,
    updatedAt: 1,
  });
  clearGuestDocument();
  assert.equal(loadGuestDocument(), null);
});

test("hasGuestDocument is true only when there is at least one non-deleted element", () => {
  globalThis.localStorage = fakeLocalStorage();
  assert.equal(hasGuestDocument(), false);

  saveGuestDocument({
    elements: [],
    deletedIds: [],
    title: "",
    pageCount: 1,
    editorMode: "freeform",
    templateId: null,
    spacingPx: null,
    isDemoContent: false,
    updatedAt: 1,
  });
  assert.equal(hasGuestDocument(), false);

  saveGuestDocument({
    elements: [{ element_id: "a", category: "text", content: "hi" }],
    deletedIds: [],
    title: "",
    pageCount: 1,
    editorMode: "freeform",
    templateId: null,
    spacingPx: null,
    isDemoContent: false,
    updatedAt: 2,
  });
  assert.equal(hasGuestDocument(), true);
});
