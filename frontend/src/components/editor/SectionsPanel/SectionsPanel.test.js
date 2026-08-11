import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelUrl = new URL("./SectionsPanel.jsx", import.meta.url);
const cssUrl = new URL("./SectionsPanel.module.css", import.meta.url);
const sidebarUrl = new URL("../Sidebar/Sidebar.jsx", import.meta.url);

test("panel is branded Układ CV with page-count status and layout lede", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /Układ CV/);
  assert.match(source, /Zmieniaj kolejność sekcji i dopasuj rozkład dokumentu/);
  assert.match(source, /formatPageCountLabel/);
  assert.match(source, /pageStatus/);
  assert.doesNotMatch(source, />Sekcje</);
});

test("add-section CTA keeps the existing picker and readable copy", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /openAddSectionModal/);
  assert.match(source, /Dodaj sekcję/);
  assert.doesNotMatch(source, /hideSection|showSection|visibility/);
});

test("density segmented control uses baseline presets", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /densityPresetsFromBaseline/);
  assert.match(source, /Kompaktowa/);
  assert.match(source, /Standardowa/);
  assert.match(source, /Przestronna/);
  assert.match(source, /handleDensitySelect/);
  assert.match(source, /role="radiogroup"/);
  assert.match(source, /aria-checked/);
});

test("auto-fit proposes offline then commits once via applySpacing", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /proposeAutoFitSpacing/);
  assert.match(source, /Dopasuj automatycznie/);
  assert.match(source, /Układ został dopasowany/);
  assert.match(source, /Układ jest już dobrze dopasowany/);
  // Trials must not setState in a loop — only the winner calls applySpacing.
  const autoFit = source.match(/function handleAutoFit\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.match(autoFit, /proposeAutoFitSpacing/);
  assert.match(autoFit, /applySpacing\(proposal\.spacing\)/);
  assert.equal((autoFit.match(/applySpacing\(/g) || []).length, 1);
  assert.doesNotMatch(autoFit, /setFlowSpacing\(/);
  assert.doesNotMatch(autoFit, /setA4_Elements\(/);
});

test("advanced spacing accordion defaults closed and reset uses baseline copy", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /useState\(false\)/);
  assert.match(source, /Zaawansowane odstępy/);
  assert.match(source, /aria-expanded=\{advancedOpen\}/);
  assert.match(source, /Przywróć odstępy szablonu/);
  assert.match(source, /handleResetSpacing/);
  assert.match(source, /baselineSpacing/);
  assert.doesNotMatch(source, /Kompaktowo/);
});

test("section rows keep up/down reorder without hide/show or fake DnD", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /reorderSection/);
  assert.match(source, /FiChevronUp/);
  assert.match(source, /FiChevronDown/);
  assert.doesNotMatch(source, /dnd-kit|DragDrop|onDragStart/);
  assert.doesNotMatch(source, /ukryj sekcj|hide section/i);
});

test("sidebar lane list and add CTA use listSidebarSections", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /listSidebarSections/);
  assert.match(source, /Dodaj w sidebarze/);
  assert.match(source, /lane:\s*"sidebar"/);
});

test("panel styles stay compact with gold density accent", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /\.segmentActive/);
  assert.match(css, /chrome-accent/);
  assert.match(css, /\.autoFit/);
  assert.match(css, /\.advancedToggle/);
  assert.doesNotMatch(css, /linear-gradient/);
});

test("sidebar rail label matches the panel name", async () => {
  const source = await readFile(sidebarUrl, "utf8");
  assert.match(source, /labelText="Układ CV"/);
  assert.doesNotMatch(source, /labelText="Sekcje"/);
});
