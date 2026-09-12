import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL("./SkillsLayoutPanel.jsx", import.meta.url);
const stylesUrl = new URL("./SkillsLayoutPanel.module.css", import.meta.url);
const canvasUrl = new URL("../../../pages/PdfCanvas.jsx", import.meta.url);
const elementsHookUrl = new URL("../../../hooks/useA4Elements.js", import.meta.url);

test("skills panel exposes exactly nine native radio choices with stable examples", async () => {
  const source = await readFile(componentUrl, "utf8");
  const optionBlock = source.match(/const STYLE_OPTIONS = \[([\s\S]*?)\n\];/)?.[1] || "";

  assert.equal((optionBlock.match(/\n {2}\{/g) || []).length, 9);
  assert.match(source, /type="radio"/);
  assert.match(source, /checked=\{selected\}/);
  assert.match(source, /PREVIEW_SKILLS\.join\(" · "\)/);
  assert.match(source, /• \{skill\}/);
  assert.match(source, />Excel<\/span>/);
});

test("every selection is committed immediately without closing the panel", async () => {
  const source = await readFile(componentUrl, "utf8");

  assert.match(source, /onChange=\{\(\) => onChange\(/);
  assert.doesNotMatch(source, /setChipSelection/);
  assert.doesNotMatch(source, /DialogShell/);
});

test("skills panel matches gallery bounds and animates opacity without sliding", async () => {
  const [source, styles] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(source, /initial: \{ opacity: 0 \}/);
  assert.match(source, /animate: \{ opacity: 1 \}/);
  assert.match(source, /exit: \{ opacity: 0 \}/);
  assert.doesNotMatch(source, /\bx:/);
  assert.match(styles, /width:\s*min\(460px, calc\(100vw - 88px\)\)/);
  assert.match(styles, /height:\s*70vh/);
  assert.match(styles, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
});

test("skills cards use white paper with brown editor typography and decoration", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(styles, /\.optionSurface\s*\{[\s\S]*?background:\s*var\(--color-paper\)/);
  assert.match(styles, /\.optionSurface\s*\{[\s\S]*?color:\s*var\(--chrome-ink\)/);
  assert.match(styles, /\.optionLabel\s*\{[\s\S]*?color:\s*var\(--chrome-ink\)/);
  assert.match(styles, /\.selectionIndicator\s*\{/);
  assert.doesNotMatch(styles, /\.optionSurface\s*\{[\s\S]*?background:\s*var\(--chrome-control\)/);
});

test("the selected chip variant reaches the document conversion commit", async () => {
  const [canvasSource, hookSource] = await Promise.all([
    readFile(canvasUrl, "utf8"),
    readFile(elementsHookUrl, "utf8"),
  ]);

  assert.match(canvasSource, /handleChangeSkillsLayout = useCallback\(\(mode, chipVariant\)/);
  assert.match(canvasSource, /handleChangeSkillsDisplayMode\(headingId, mode, chipVariant\)/);
  assert.match(hookSource, /handleChangeSkillsDisplayMode = useCallback\(\(headingId, mode, chipVariant\)/);
  assert.match(hookSource, /flowSpacingRef\.current,\s*chipVariant,/);
});
