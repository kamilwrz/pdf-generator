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

  it("refills from the live Languages grid and keeps that profile after replacement", () => {
    assert.match(hookSource, /syncGeneratedLanguagesForTemplateSwitch\(/);
    assert.match(hookSource, /activeCvData,[\s\S]*A4_Elements/);
    assert.match(hookSource, /fillTemplate\(profileForFill, template\.id/);
    assert.match(
      hookSource,
      /replaceActiveElements\([\s\S]*\{ cvData: synchronizedProfile \}[\s\S]*\)/,
    );
  });
});

describe("Topbar template switcher", () => {
  it("opens the modal from the templates control and cycles with arrows", () => {
    assert.match(topbarSource, /aria-label="Zmień szablon"/);
    assert.match(topbarSource, /showChangeTemplateModal/);
    assert.match(topbarSource, /adjacentAllowedTemplate/);
  });

  it("lives in the left action group, not anchored to the A4 page edge", () => {
    assert.match(topbarSource, /aria-label="Szablon CV"/);
    assert.doesNotMatch(topbarSource, /querySelector\("\.page-canvas"\)/);
  });
});

describe("Topbar one-page fit action", () => {
  it("shows the animated one-page action with the requested tooltip", () => {
    assert.match(topbarSource, /onePageFit/);
    assert.match(topbarSource, /onFitToOnePage/);
    assert.match(topbarSource, /title="Zmieść CV na 1 stronę…"/);
    assert.match(topbarSource, /RiFileReduceLine/);
    assert.match(topbarSource, />1<\/span>/);
  });
});
