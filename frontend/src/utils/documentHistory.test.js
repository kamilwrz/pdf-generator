import test from "node:test";
import assert from "node:assert/strict";
import { recordSnapshotState } from "./documentHistory.js";

const snap = (label) => ({ elements: [{ content: label }], pageCount: 1 });

test("a real edit pushes a new step and advances the index", () => {
  const start = { stack: [snap("base")], index: 0 };
  const next = recordSnapshotState(start, snap("A"), { quiet: false });
  assert.deepEqual(next.stack.map((s) => s.elements[0].content), ["base", "A"]);
  assert.equal(next.index, 1);
});

test("an unchanged non-quiet record is a no-op (no new step)", () => {
  const start = { stack: [snap("base"), snap("A")], index: 1 };
  const next = recordSnapshotState(start, snap("A"), { quiet: false });
  assert.equal(next, start);
});

test("a real edit after an undo discards the redo tail", () => {
  // [base, A, B] with index at A (an undo has moved off B).
  const start = { stack: [snap("base"), snap("A"), snap("B")], index: 1 };
  const next = recordSnapshotState(start, snap("C"), { quiet: false });
  assert.deepEqual(next.stack.map((s) => s.elements[0].content), ["base", "A", "C"]);
  assert.equal(next.index, 2);
});

// Regression: Bug A. After an undo, a reflow/measure settle records in quiet
// mode while index < length-1. This must NOT delete the redo tail, or redo
// becomes permanently unavailable after any undo.
test("a quiet settle after an undo preserves the redo tail", () => {
  const start = { stack: [snap("base"), snap("A"), snap("B")], index: 1 };
  const next = recordSnapshotState(start, snap("A-remeasured"), { quiet: true });
  assert.deepEqual(
    next.stack.map((s) => s.elements[0].content),
    ["base", "A-remeasured", "B"],
    "redo entry B must survive a quiet settle",
  );
  assert.equal(next.index, 1);
  // Redo is still reachable: index points before the last entry.
  assert.ok(next.index < next.stack.length - 1);
});

test("a quiet settle at the tip refreshes in place without duplicating", () => {
  const start = { stack: [snap("base"), snap("A")], index: 1 };
  const next = recordSnapshotState(start, snap("A-remeasured"), { quiet: true });
  assert.deepEqual(next.stack.map((s) => s.elements[0].content), ["base", "A-remeasured"]);
  assert.equal(next.index, 1);
});

test("a quiet record with no baseline seeds the stack", () => {
  const next = recordSnapshotState({ stack: [], index: -1 }, snap("loaded"), { quiet: true });
  assert.deepEqual(next.stack.map((s) => s.elements[0].content), ["loaded"]);
  assert.equal(next.index, 0);
});

test("pushing past the limit drops the oldest entries", () => {
  const start = { stack: [snap("a"), snap("b"), snap("c")], index: 2 };
  const next = recordSnapshotState(start, snap("d"), { quiet: false, limit: 3 });
  assert.deepEqual(next.stack.map((s) => s.elements[0].content), ["b", "c", "d"]);
  assert.equal(next.index, 2);
});
