/**
 * Source-level guards for "Zmień szablon" spacing behaviour.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "ChangeTemplateModal.jsx"),
  "utf8",
);

describe("ChangeTemplateModal spacing", () => {
  it("regenerates with DEFAULT_FLOW_SPACING instead of the previous template knobs", () => {
    assert.match(source, /spacing:\s*DEFAULT_FLOW_SPACING/);
    assert.doesNotMatch(source, /spacing:\s*flowSpacing/);
  });

  it("resets document knobs after a successful template swap", () => {
    assert.match(source, /adoptDocumentFlowSpacing\?\.\(DEFAULT_FLOW_SPACING\)/);
  });
});
