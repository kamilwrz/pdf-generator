import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL("./SkillsLayoutModal.jsx", import.meta.url);
const stylesUrl = new URL("./SkillsLayoutModal.module.css", import.meta.url);
const canvasUrl = new URL("../../../pages/PdfCanvas.jsx", import.meta.url);
const elementsHookUrl = new URL("../../../hooks/useA4Elements.js", import.meta.url);

test("skills layout choices use a short fixed example instead of CV content", async () => {
  const source = await readFile(componentUrl, "utf8");

  assert.match(source, /const PREVIEW_SKILLS = \["React", "TypeScript", "Node\.js", "SQL"\]/);
  assert.doesNotMatch(source, /collectSkillGroups/);
  assert.match(source, /aria-pressed=\{active\}/);
});

test("skills layout modal stays wide with three side-by-side primary choices", async () => {
  const [source, styles] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(source, /width=\{1080\}/);
  assert.match(styles, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*grid-template-columns:\s*1fr/);
});

test("seven chip treatments update the preview before the Chips card applies them", async () => {
  const source = await readFile(componentUrl, "utf8");

  const optionBlock = source.match(/const CHIP_VARIANT_OPTIONS = \[([\s\S]*?)\n\];/)?.[1] || "";
  assert.equal((optionBlock.match(/\{ value:/g) || []).length, 7);
  assert.match(source, /setChipSelection\(\{/);
  assert.match(source, /variant:\s*option\.value/);
  assert.match(source, /isChipOption \? selectedChipVariant : undefined/);
  assert.match(source, /7 wariantów/);
});

test("the selected chip variant reaches the document conversion commit", async () => {
  const [canvasSource, hookSource] = await Promise.all([
    readFile(canvasUrl, "utf8"),
    readFile(elementsHookUrl, "utf8"),
  ]);

  assert.match(canvasSource, /handleApplySkillsLayout = useCallback\(\(mode, chipVariant\)/);
  assert.match(canvasSource, /handleChangeSkillsDisplayMode\(headingId, mode, chipVariant\)/);
  assert.match(hookSource, /handleChangeSkillsDisplayMode = useCallback\(\(headingId, mode, chipVariant\)/);
  assert.match(hookSource, /flowSpacingRef\.current,\s*chipVariant,/);
});
