import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const url = new URL("./PdfCanvas.jsx", import.meta.url);

test("uses the page-fit engine instead of a single fixed compact pass", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /findFitForTarget/);
  assert.match(source, /resolveFitAction/);
  assert.match(source, /MIN_FLOW_SPACING/);
  // The old single-preset entry point is gone.
  assert.doesNotMatch(source, /applyCompactSpacingPass/);
});

test("shrink searches baseline->floor; post-AI relax searches baseline->COMPACT", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /tightest:\s*MIN_FLOW_SPACING/);
  assert.match(source, /tightest:\s*COMPACT_FLOW_SPACING/);
});

test("routes tiers via resolveFitAction to commit / emergency / impossible", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /"commit"/);
  assert.match(source, /variant:\s*"emergency"/);
  assert.match(source, /variant:\s*"impossible"/);
});

test("commit is a single undoable entry (setFlowSpacing + reconciled setA4_Elements)", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /const commitFit/);
  assert.match(source, /setFlowSpacing\(/);
  assert.match(source, /reconcileDocumentPages/);
});

test("detection now drives a badge flag, not an auto-opened modal", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /fitTooLong/);
  assert.match(source, /onFitToPages/);
  assert.match(source, /fitStatus/);
});

test("LongCvModal receives the two-variant props (no onApplyCompact)", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /variant={longCvModal\.variant}/);
  assert.match(source, /onForceTighten=/);
  assert.doesNotMatch(source, /onApplyCompact=/);
});
