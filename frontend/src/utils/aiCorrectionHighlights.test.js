import assert from "node:assert/strict";
import test from "node:test";
import { collectPendingAiHighlights } from "./aiCorrectionHighlights.js";

test("collects pending content and style corrections", () => {
  const messages = [{
    id: "m1",
    role: "assistant",
    corrections: [
      { element_id: "a", content: "new" },
      { element_id: "b", fontSize: 14 },
      { element_id: "c", content: "gone" },
    ],
  }];
  const highlights = collectPendingAiHighlights({
    messages,
    correctionStates: {
      m1_c: "accepted",
    },
  });
  assert.deepEqual(
    highlights.sort((x, y) => x.elementId.localeCompare(y.elementId)),
    [
      { elementId: "a", kind: "content" },
      { elementId: "b", kind: "style" },
    ],
  );
});

test("includes layout, structure, deletion, and clone groups while pending or previewing", () => {
  const messages = [{
    id: "m2",
    role: "assistant",
    layout_groups: [{
      id: "L1",
      patches: [{ element_id: "lay1", top: 10 }],
    }],
    structure_groups: [{
      id: "S1",
      patches: [{ element_id: "st1", top: 20 }],
      remove_element_ids: ["st-old"],
    }],
    deletion_groups: [{
      id: "D1",
      remove_element_ids: ["del1", "del2"],
    }],
    clone_groups: [{
      id: "C1",
      source_element_id: "src1",
      add_elements: [{ element_id: "copy1" }],
    }],
  }];
  const highlights = collectPendingAiHighlights({
    messages,
    layoutStates: { m2_L1: "preview" },
    structureStates: { m2_S1: "pending" },
    deletionStates: { m2_D1: "pending" },
    cloneStates: { m2_C1: "pending" },
  });
  const ids = new Set(highlights.map((h) => h.elementId));
  assert.ok(ids.has("lay1"));
  assert.ok(ids.has("st1"));
  assert.ok(ids.has("st-old"));
  assert.ok(ids.has("del1"));
  assert.ok(ids.has("del2"));
  assert.ok(ids.has("src1"));
  assert.ok(ids.has("copy1"));
  assert.equal(highlights.find((h) => h.elementId === "del1").kind, "deletion");
  assert.equal(highlights.find((h) => h.elementId === "lay1").kind, "layout");
});

test("drops rejected groups and ignores user messages", () => {
  const messages = [
    { id: "u", role: "user", corrections: [{ element_id: "x", content: "nope" }] },
    {
      id: "m3",
      role: "assistant",
      layout_groups: [{ id: "L2", patches: [{ element_id: "gone", top: 1 }] }],
    },
  ];
  const highlights = collectPendingAiHighlights({
    messages,
    layoutStates: { m3_L2: "rejected" },
  });
  assert.deepEqual(highlights, []);
});
