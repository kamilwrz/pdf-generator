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
  // The inspector uses live workspace anchors, prefers the compact footprint
  // from the 220% reference, and always respects the 15px A4 gap.
  assert.match(source, /data-anchor="editor-sidebar"/);
  assert.match(source, /data-anchor="editor-topbar"/);
  assert.match(source, /sidebar-documents-divider/);
  assert.match(source, /PANEL_A4_GAP_PX = 15/);
  assert.match(source, /resolveEditorInspectorWidth/);
});

test("Editor panel uses the editor-affordance layer above sticky chrome", async () => {
  const editorCss = await readFile(new URL("./Editor.module.css", import.meta.url), "utf8");
  assert.match(editorCss, /z-index:\s*var\(--z-editor-affordance\)/);
  assert.match(editorCss, /\.selectionEditor\s*\{[^}]*z-index:\s*var\(--z-editor-selection\)/s);
  assert.match(editorCss, /\.selectionEditor\s*\{[^}]*container-type:\s*normal/s);
  assert.doesNotMatch(editorCss, /:has\(/);
});

test("Editor follows the AI Assistant surface, control, active, and focus language", async () => {
  const editorCss = await readFile(new URL("./Editor.module.css", import.meta.url), "utf8");

  assert.match(editorCss, /\.panelHeader\s*\{[^}]*background:\s*var\(--chrome-surface\)/s);
  assert.match(editorCss, /\.panelHeader\s*\{[^}]*color:\s*var\(--chrome-ink\)/s);
  assert.match(editorCss, /\.panelHeader \.iconBtn\s*\{[^}]*background:\s*var\(--chrome-control\)/s);
  assert.match(editorCss, /\.panelHeader \.iconBtn:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--chrome-hover\)/s);
  assert.match(editorCss, /\.selectionTip\s*\{[^}]*background:\s*var\(--chrome-surface\)/s);
  assert.match(editorCss, /\.selectionTip\s*\{[^}]*border-bottom:\s*1px solid var\(--chrome-border\)/s);
  assert.match(editorCss, /\.group\s*\{[^}]*background:\s*var\(--chrome-control\)/s);
  assert.match(editorCss, /\.group\s*\{[^}]*border:\s*1px solid var\(--chrome-border\)/s);
  assert.match(editorCss, /\.group\s*\{[^}]*border-radius:\s*var\(--radius-control\)/s);
  assert.match(editorCss, /\.numField button\s*\{[^}]*background:\s*var\(--chrome-surface\)/s);
  assert.match(editorCss, /\.iconBtnActive\s*\{[^}]*background:\s*var\(--accent-soft\)/s);
  assert.match(editorCss, /\.numField:focus-within\s*\{[^}]*var\(--color-focus-soft\)/s);
  assert.doesNotMatch(editorCss, /border-left:\s*3px solid var\(--chrome-ink/);
});

test("Editor keeps 36px targets and gives fields the full 248px-panel card width", async () => {
  const editorCss = await readFile(new URL("./Editor.module.css", import.meta.url), "utf8");

  assert.match(editorCss, /\.iconBtn\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px/s);
  assert.match(editorCss, /\.numField\s*\{[^}]*grid-template-columns:\s*36px minmax\(42px, 1fr\) 36px/s);
  assert.match(editorCss, /\.numField button\s*\{[^}]*min-width:\s*36px;[^}]*height:\s*36px/s);
  assert.match(editorCss, /@container \(max-width: 280px\)[\s\S]*\.field\s*\{[^}]*flex:\s*1 1 100%;[^}]*min-width:\s*100%/s);
});

test("inline selection updates after pointer and keyboard range changes", async () => {
  const source = await readFile(new URL("./Editor.jsx", import.meta.url), "utf8");

  assert.match(source, /scheduleInlineSelectionUpdate/);
  assert.match(source, /addEventListener\("pointerup", scheduleInlineSelectionUpdate\)/);
  assert.match(source, /addEventListener\("keyup", scheduleInlineSelectionUpdate\)/);
  assert.match(source, /classes\.selectionEditor/);
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

test("Editor offers an attention-highlighted mid-dot only for inline Skills editing", async () => {
  const source = await readFile(new URL("./Editor.jsx", import.meta.url), "utf8");
  const editorCss = await readFile(new URL("./Editor.module.css", import.meta.url), "utf8");

  assert.match(source, /isInlineSkillsContentElement/);
  assert.match(source, /insertInlineSkillSeparator/);
  assert.match(source, /Wstaw kropkę między umiejętnościami/);
  assert.match(source, /attention=\{!!selectedElement\?\.isEditing\}/);
  assert.doesNotMatch(source, /Wstaw punktor w bieżącej linii/);
  assert.match(editorCss, /\.iconBtnAttention:not\(:disabled\)/);
  assert.match(editorCss, /background:\s*var\(--color-accent-soft\)/);
  assert.match(editorCss, /border-color:\s*var\(--color-accent\)/);
  assert.doesNotMatch(editorCss, /@keyframes\s+skillSeparator/);
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
    /TEXT_STYLE_KEYS\.has\(key\)[\s\S]*TEXT_ELEMENT_CATEGORIES\.has\(element\.category\)/,
  );
});

test("bulk textarea spacing controls stay visible and update the whole selection", async () => {
  // Generated and legacy textareas are allowed to omit default typography
  // keys. Capability therefore follows the category, while a mixed selection
  // is represented by an empty number input until the user enters one value
  // that is then committed through the selected-elements update path.
  const source = await readFile(new URL("./Editor.jsx", import.meta.url), "utf8");

  assert.match(source, /key === "lineHeight"\s*\n?\s*\? element\.category === "textarea"/);
  assert.match(source, /key === "letterSpacing"[\s\S]*TEXT_ELEMENT_CATEGORIES\.has\(element\.category\)/);
  assert.match(source, /<Group label="Odstępy zaznaczenia">/);
  assert.match(source, /value=\{isValueMixed\("lineHeight"\) \? "" : valueForField\("lineHeight"\)\}/);
  assert.match(source, /onChange=\{\(e\) => onChangeValue\(e, "lineHeight"\)\}/);
  assert.match(source, /value=\{isValueMixed\("letterSpacing"\) \? "" : valueForField\("letterSpacing"\)\}/);
  assert.match(source, /onChange=\{\(e\) => onChangeValue\(e, "letterSpacing"\)\}/);
  assert.match(source, /editSelectedElementValues\(\{ \[identifier\]: value \}\)/);
});
