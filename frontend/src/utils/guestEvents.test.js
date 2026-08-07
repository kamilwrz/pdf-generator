import test from "node:test";
import assert from "node:assert/strict";
import { queueGuestEvent, loadGuestEvents, clearGuestEvents } from "./guestEvents.js";

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

test("queueGuestEvent appends to the buffer with a timestamp", () => {
  globalThis.localStorage = fakeLocalStorage();
  queueGuestEvent("guest_editor_opened");
  const events = loadGuestEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "guest_editor_opened");
  assert.equal(typeof events[0].ts, "number");
});

test("queueGuestEvent accumulates multiple events in order", () => {
  globalThis.localStorage = fakeLocalStorage();
  queueGuestEvent("guest_editor_opened");
  queueGuestEvent("guest_first_edit");
  const events = loadGuestEvents();
  assert.deepEqual(events.map((e) => e.eventType), ["guest_editor_opened", "guest_first_edit"]);
});

test("loadGuestEvents returns an empty array when nothing was queued", () => {
  globalThis.localStorage = fakeLocalStorage();
  assert.deepEqual(loadGuestEvents(), []);
});

test("loadGuestEvents returns an empty array for corrupted JSON instead of throwing", () => {
  globalThis.localStorage = fakeLocalStorage();
  globalThis.localStorage.setItem("cvstudio.guest.events", "{not json");
  assert.deepEqual(loadGuestEvents(), []);
});

test("clearGuestEvents empties the buffer", () => {
  globalThis.localStorage = fakeLocalStorage();
  queueGuestEvent("save_gate_shown");
  clearGuestEvents();
  assert.deepEqual(loadGuestEvents(), []);
});

test("the buffer is capped so it cannot grow unbounded on an abandoned tab", () => {
  globalThis.localStorage = fakeLocalStorage();
  for (let i = 0; i < 100; i += 1) queueGuestEvent("guest_first_edit");
  assert.ok(loadGuestEvents().length <= 50);
});
