import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Editor renders selection formatting as its own panel, independent of the workspace inspector", async () => {
  const source = await readFile(new URL("./Editor.jsx", import.meta.url), "utf8");

  assert.match(source, /inlineSelection/);
  assert.match(source, /applyInlineMark/);
  assert.match(source, /rangeColor/);
  // Its own ref/state and portal content, not a row nested inside `panel`.
  assert.match(source, /selectionPanelRef/);
  assert.match(source, /selectionPanelPosition/);
  assert.match(source, /const selectionPanel = \(/);
  assert.match(source, /Formatowanie zaznaczenia/);
  assert.match(source, /Kolor zaznaczenia/);
  assert.match(source, /applyInlineMark\("color", event\.target\.value\)/);
  assert.match(source, /type="color"/);
  // Standalone swatch palette toolbar must stay removed.
  assert.doesNotMatch(source, /InlineFormatToolbar/);
  assert.doesNotMatch(source, /PALETTE/);
  // Layer (zIndex) is freeform-only — structural mode has nothing useful to stack.
  assert.match(source, /canEditElementLayer/);
  assert.match(source, /showLayerField && \(/);
  // The inspector uses live workspace anchors and preserves a 15px A4 gap.
  assert.match(source, /data-anchor="editor-sidebar"/);
  assert.match(source, /data-anchor="editor-topbar"/);
  assert.match(source, /sidebar-documents-divider/);
  assert.match(source, /PANEL_A4_GAP_PX = 15/);
});

test("Editor panel uses the editor-affordance layer above sticky chrome", async () => {
  const editorCss = await readFile(new URL("./Editor.module.css", import.meta.url), "utf8");
  assert.match(editorCss, /z-index:\s*var\(--z-editor-affordance\)/);
});

test("Editor exposes plain-language labels, multi-select help, and stepper buttons", async () => {
  const source = await readFile(new URL("./Editor.jsx", import.meta.url), "utf8");

  assert.match(source, /Ctrl \+ lewy przycisk myszy/);
  assert.match(source, /zaznacza wiele elementów/);
  assert.match(source, /Krój pisma/);
  assert.match(source, /Odstęp między wierszami/);
  assert.match(source, /Od lewej krawędzi/);
  assert.match(source, /Zmniejsz: \$\{label\}/);
  assert.match(source, /Zwiększ: \$\{label\}/);
  assert.match(source, /<FiMinus/);
  assert.match(source, /<FiPlus/);
});

test("bulk B/I/U toggles stay visible for a multi-selection even when an element never serialized `underline`", async () => {
  // Regression: the backend's `_text()` primitive only ever sets `bold` /
  // `italic`, never `underline` (it stays implicitly false). A strict
  // `hasOwnProperty` check in `supportsBulkField` made the whole bold/
  // italic/underline row disappear from the bulk toolbar whenever the
  // selection included such an element (e.g. two section headings) — even
  // though a single selected element shows the same toggles unconditionally.
  const source = await readFile(new URL("./Editor.jsx", import.meta.url), "utf8");

  assert.match(source, /TEXT_STYLE_KEYS = new Set\(\["bold", "italic", "underline"\]\)/);
  assert.match(
    source,
    /TEXT_STYLE_KEYS\.has\(key\)\s*\n?\s*\? \(element\.category === "text" \|\| element\.category === "textarea"\)/,
  );
});
