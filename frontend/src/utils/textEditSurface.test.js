import assert from "node:assert/strict";
import test from "node:test";
import { seedTextEditNode, shouldCommitTextEditBlur } from "./textEditSurface.js";

// Minimal node stand-in. The project's test runner has no jsdom; only the
// properties `seedTextEditNode` writes are implemented.
function makeNode(initial = "") {
  let text = initial;
  let html = initial;
  return {
    get textContent() { return text; },
    set textContent(value) {
      text = String(value);
      html = text;
    },
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = String(value);
      text = html.replace(/<[^>]+>/g, "");
    },
  };
}

test("seeds a remounted empty text node from stored content", () => {
  // Reproduce the 2-page → 1-page remount: a fresh <p> with no children,
  // already in edit mode, so the display-sync path would skip.
  const node = makeNode("");
  assert.equal(node.textContent, "");
  seedTextEditNode(node, "Ada Kowalska", []);
  assert.equal(node.textContent, "Ada Kowalska");
});

test("seeds decorated content as styled spans", () => {
  const node = makeNode("");
  seedTextEditNode(node, "Ada Kowalska", [
    { start: 0, end: 3, bold: true },
  ]);
  assert.match(node.innerHTML, /data-bold="true"/);
  assert.equal(node.textContent, "Ada Kowalska");
});

test("does not commit blur from a detached remounted node", () => {
  assert.equal(shouldCommitTextEditBlur({
    node: { isConnected: false },
    elementId: "name",
    spreadTransitionId: null,
  }), false);
});

test("does not commit blur while the spread remount is in progress", () => {
  assert.equal(shouldCommitTextEditBlur({
    node: { isConnected: true },
    elementId: "name",
    spreadTransitionId: "name",
  }), false);
  assert.equal(shouldCommitTextEditBlur({
    node: { isConnected: true },
    elementId: "name",
    spreadTransitionId: null,
  }), true);
});
