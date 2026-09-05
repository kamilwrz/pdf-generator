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
  assert.match(source, /elementToolbarPosition/);
  assert.match(source, /requestAnimationFrame\(updatePosition\)/);
  assert.match(source, /cancelAnimationFrame/);
  assert.match(source, /range.getBoundingClientRect/);
  assert.match(source, /data-editor-control="element-settings"/);
  assert.match(source, /function InspectorDisclosure/);
  assert.match(source, /const \[isOpen, setIsOpen\] = useState\(false\)/);
  assert.match(source, /key=\{selectionKey\}/);
  assert.match(source, /data-editor-inspector-state="open"/);
  assert.match(source, /aria-expanded=\{isOpen\}/);
  assert.match(source, /event\.key !== "Escape" \|\| !isOpen/);
});

test("Editor panel uses the editor-affordance layer above sticky chrome", async () => {
  const editorCss = await readFile(new URL("./Editor.module.css", import.meta.url), "utf8");
  assert.match(editorCss, /z-index:\s*var\(--z-editor-affordance\)/);
  assert.match(editorCss, /\.selectionEditor\s*\{[^}]*z-index:\s*var\(--z-editor-selection\)/s);
  assert.match(editorCss, /\.selectionEditor\s*\{[^}]*container-type:\s*normal/s);
  assert.doesNotMatch(editorCss, /:has\(/);
});

test("Settings use shared canvas chrome, readable groups, and compact-sheet overflow", async () => {
  const source = await readFile(new URL("./Editor.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./Editor.module.css", import.meta.url), "utf8");
  assert.match(source, /canvasControls.surface/);
  assert.match(source, /canvasControls.button/);
  assert.match(source, /<MdSettings/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /role="dialog" aria-modal="false"/);
  assert.match(source, /focusOnOpenRef/);
  assert.match(css, /--canvas-control-size: 36px/);
  assert.match(css, /overscroll-behavior: contain/);
  assert.match(css, /max-height: min\(420px, 46dvh\)/);
  assert.match(css, /@media print/);
  assert.doesNotMatch(css, /editorClosed|inspectorMark/);
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

  assert.match(source, /Ctrl \+ klik: zaznacz wiele/);
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
