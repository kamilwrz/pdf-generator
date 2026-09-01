import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const url = new URL("./PdfCanvas.jsx", import.meta.url);

test("uses the page-fit engine instead of a single fixed compact pass", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /findFitForTarget/);
  assert.match(source, /findTemplateFitForTarget/);
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

test("commits deterministic fits and opens AI fallback only after failure", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /"commit"/);
  assert.match(source, /setLongCvModalOpen\(true\)/);
  assert.doesNotMatch(source, /variant:\s*"emergency"|onForceTighten/);
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

test("all layouts use the same realistic one-page reduction target", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /getNextPageFitTarget\(pageCount\)/);
  assert.match(source, /Number\.isFinite\(numericTarget\)/);
  assert.doesNotMatch(source, /isSidebarTemplate\s*\?\s*1\s*:/);
});

test("LongCvModal receives only the post-deterministic AI fallback props", async () => {
  const source = await readFile(url, "utf8");
  assert.match(source, /open={longCvModalOpen}/);
  assert.match(source, /onRequestAiShorten=/);
  assert.doesNotMatch(source, /variant={longCvModal|onForceTighten=|onApplyCompact=/);
});

test("one-page fitting probes and commits template typography S before AI", async () => {
  const source = await readFile(url, "utf8");
  assert.ok((source.match(/findTemplateFitForTarget\(/g) || []).length >= 3);
  assert.match(source, /templateId:\s*activeTemplateId/);
  assert.match(source, /useState\(\(\) => createCanvasTextWidthMeasurer\(\)\)/);
  assert.match(source, /measureTextWidth:\s*fitTextWidthMeasurer/);
  assert.match(source, /fit\.typographyPreset === 'S'/);
});

test("guest restore and claim run the hidden-photo persistence migration", async () => {
  const source = await readFile(url, "utf8");
  assert.match(
    source,
    /import \{ normalizeProfilePhotoVisibilityPersistence \} from '\.\.\/utils\/profilePhotoVisibility'/,
  );
  assert.equal(
    (source.match(/normalizeProfilePhotoVisibilityPersistence\(/g) || []).length,
    2,
  );
  assert.equal(
    (source.match(/normalizeSterlingFamilyPersistence\(guestDoc\.elements, guestDoc\.templateId\)/g) || []).length,
    2,
  );
});
