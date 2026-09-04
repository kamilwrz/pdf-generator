import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const topbarUrl = new URL("./Topbar.jsx", import.meta.url);
const topbarCssUrl = new URL("./Topbar.module.css", import.meta.url);
const pageControlsUrl = new URL("../PageControls/PageControls.jsx", import.meta.url);
const sidebarUrl = new URL("../Sidebar/Sidebar.jsx", import.meta.url);
const sidebarControlsUrl = new URL("../../common/SidebarControls/SidebarControls.jsx", import.meta.url);

test("topbar labels ambiguous actions without changing their existing handlers", async () => {
  const source = await readFile(topbarUrl, "utf8");

  assert.match(source, />Importuj PDF<\/span>/);
  assert.match(source, /onClick={showAiPanel}/);
  assert.match(source, />Nowe CV<\/span>/);
  assert.match(source, /onClick={showNewCvSetup}/);
  assert.match(source, />Zmień szablon<\/span>/);
  assert.match(source, /onClick={showChangeTemplateModal}/);
  assert.match(source, />Pobierz PDF<\/span>/);
  assert.match(source, /onClick={downloadPdf}/);
  assert.match(source, />Zapisz<\/span>/);
  assert.match(source, /onClick={createPdf}/);
});

test("topbar exposes stable semantic groups and a precise destructive label", async () => {
  const source = await readFile(topbarUrl, "utf8");

  assert.match(source, /aria-label="Tworzenie CV"/);
  assert.match(source, /aria-label="Historia zmian"/);
  assert.match(source, /aria-label="Widok dokumentu"/);
  assert.match(source, /aria-label="Operacje dokumentu"/);
  assert.match(source, /aria-label="Wyczyść zawartość CV"/);
  assert.match(source, /aria-busy={isPdfLoading}/);
});

test("responsive topbar keeps every command and collapses only visible labels", async () => {
  const css = await readFile(topbarCssUrl, "utf8");

  assert.match(css, /@media \(max-width: 1600px\)/);
  assert.match(css, /\.toolLabel,\s*\.outputLabel\s*{[^}]*display: none/s);
  assert.match(css, /\.outputLabel\s*{[^}]*display: none/s);
});

test("sidebar panels expose contextual labels and selected states", async () => {
  const [sidebar, controls] = await Promise.all([
    readFile(sidebarUrl, "utf8"),
    readFile(sidebarControlsUrl, "utf8"),
  ]);

  assert.match(sidebar, /"Zdjęcie profilowe"/);
  assert.match(sidebar, /labelText="Dostosuj CV"/);
  assert.match(sidebar, /labelText="Edytuj jako kopię"/);
  assert.match(sidebar, /tooltipText="Utwórz kopię do swobodnej edycji"/);
  assert.match(sidebar, /labelText="Moje dokumenty"/);
  assert.match(sidebar, /active={isGallery}/);
  assert.match(sidebar, /active={isSectionsPanel}/);
  assert.match(sidebar, /active={isModalPdfs}/);
  assert.match(controls, /aria-pressed={active == null \? undefined : active}/);
  assert.match(controls, /aria-describedby={tooltipId}/);
  assert.match(controls, /role="tooltip"/);
});

test("two-page view names the action that its current state will perform", async () => {
  const source = await readFile(pageControlsUrl, "utf8");

  assert.match(source, /isTwoPageView \? "Wyłącz widok dwóch stron" : "Włącz widok dwóch stron"/);
  assert.match(source, /aria-pressed={isTwoPageView}/);
});
