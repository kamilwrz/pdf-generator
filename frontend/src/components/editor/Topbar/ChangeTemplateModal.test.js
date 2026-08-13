/**
 * Source-level guards for "Zmień szablon" spacing behaviour.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const hookSource = readFileSync(
  join(here, "../../../hooks/useApplyCvTemplate.js"),
  "utf8",
);
const topbarSource = readFileSync(join(here, "Topbar.jsx"), "utf8");

describe("ChangeTemplateModal spacing", () => {
  it("regenerates with DEFAULT_FLOW_SPACING instead of the previous template knobs", () => {
    assert.match(hookSource, /spacing:\s*DEFAULT_FLOW_SPACING/);
    assert.doesNotMatch(hookSource, /spacing:\s*flowSpacing/);
  });

  it("resets document knobs after a successful template swap", () => {
    assert.match(hookSource, /adoptDocumentFlowSpacing\?\.\(DEFAULT_FLOW_SPACING\)/);
  });
});

describe("Topbar template switcher", () => {
  it("opens the modal from the templates control and cycles with arrows", () => {
    assert.match(topbarSource, /aria-label="Szablony"/);
    assert.match(topbarSource, /showChangeTemplateModal/);
    assert.match(topbarSource, /adjacentAllowedTemplate/);
    assert.match(topbarSource, /templateSwitcher/);
    assert.match(topbarSource, /querySelector\("\.page-canvas"\)/);
  });
});
