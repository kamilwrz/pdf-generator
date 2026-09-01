import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelUrl = new URL("./SectionsPanel.jsx", import.meta.url);
const cssUrl = new URL("./SectionsPanel.module.css", import.meta.url);
const sidebarUrl = new URL("../Sidebar/Sidebar.jsx", import.meta.url);

test("customization panel exposes Appearance only for reviewed template contracts including Atrium", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /Dostosuj CV/);
  assert.match(source, /role="tablist"/);
  assert.match(source, />\s*Układ\s*</);
  assert.match(source, />\s*Wygląd\s*</);
  assert.match(source, /aria-selected/);
  assert.match(source, /const isSterlingAppearance = activeTemplateId === "sterling"/);
  assert.match(source, /const isLindenAppearance = activeTemplateId === "linden"/);
  assert.match(source, /const isMonumentAppearance = activeTemplateId === "monument"/);
  assert.match(source, /const isSlateAppearance = activeTemplateId === "slate"/);
  assert.match(source, /const isMeridianAppearance = activeTemplateId === "meridian"/);
  assert.match(source, /const isCadenzaAppearance = activeTemplateId === "cadenza"/);
  assert.match(source, /const isVellumAppearance = activeTemplateId === "vellum"/);
  assert.match(source, /const isAureliaAppearance = activeTemplateId === "aurelia"/);
  assert.match(source, /const isAtriumAppearance = activeTemplateId === "atrium"/);
  assert.match(source, /const appearanceEnabled = isAtriumAppearance/);
  assert.match(source, /\|\| isLindenAppearance/);
  assert.match(source, /\|\| isMeridianAppearance/);
  assert.match(source, /\|\| isCadenzaAppearance/);
  assert.match(source, /\|\| isVellumAppearance/);
  assert.match(source, /\|\| isAureliaAppearance/);
  assert.match(source, /const renderedTab = appearanceEnabled \? activeTab : "layout"/);
  assert.match(source, /appearanceEnabled \? \(/);
  assert.doesNotMatch(source, /isSterlingDocument/);
});

test("appearance presents template-specific palettes, reviewed previews, and text presets", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /setActiveTab\("appearance"\)/);
  assert.match(source, /STERLING_PALETTES/);
  assert.match(source, /LINDEN_PALETTES/);
  assert.match(source, /MONUMENT_PALETTES/);
  assert.match(source, /SLATE_PALETTES/);
  assert.match(source, /MERIDIAN_PALETTES/);
  assert.match(source, /CADENZA_PALETTES/);
  assert.match(source, /VELLUM_PALETTES/);
  assert.match(source, /AURELIA_PALETTES/);
  assert.match(source, /ATRIUM_PALETTES/);
  assert.match(source, /REGENT_PALETTES/);
  assert.match(source, /activeTemplateId === "regent"/);
  assert.match(source, /applyRegentPalette/);
  assert.match(source, /palettePaperMonument/);
  assert.match(source, /palettePaperLinden/);
  assert.match(source, /paletteLindenJob/);
  assert.match(source, /paletteLindenPhoto/);
  assert.match(source, /paletteMonumentFrame/);
  assert.match(source, /paletteMonumentBadge/);
  assert.match(source, /paletteMonumentFooter/);
  assert.match(source, /palettePaperSlate/);
  assert.match(source, /paletteSlatePhoto/);
  assert.match(source, /paletteSlateBadges/);
  assert.match(source, /paletteSlateFooter/);
  assert.match(source, /palettePaperMeridian/);
  assert.match(source, /paletteMeridianContacts/);
  assert.match(source, /paletteMeridianSectionRule/);
  assert.match(source, /paletteMeridianRail/);
  assert.match(source, /palettePaperCadenza/);
  assert.match(source, /paletteCadenzaBand/);
  assert.match(source, /paletteCadenzaJob/);
  assert.match(source, /palettePaperVellum/);
  assert.match(source, /paletteVellumPhoto/);
  assert.match(source, /paletteVellumField/);
  assert.match(source, /paletteVellumJob/);
  assert.match(source, /palettePaperAurelia/);
  assert.match(source, /paletteAureliaFrame/);
  assert.match(source, /paletteAureliaSectionRule/);
  assert.match(source, /palettePaperAtrium/);
  assert.match(source, /paletteAtriumPortrait/);
  assert.match(source, /paletteAtriumMastheadRule/);
  assert.match(source, /paletteAtriumSectionRule/);
  assert.match(source, /paletteAtriumFolio/);
  assert.match(source, /Paleta kolorów/);
  assert.match(source, /zmienia papier, tekst, dekoracje i dopasowany zestaw ikon/);
  assert.match(source, /STERLING_TEXT_SIZES/);
  assert.match(source, /LINDEN_TEXT_SIZES/);
  assert.match(source, /MONUMENT_TEXT_SIZES/);
  assert.match(source, /SLATE_TEXT_SIZES/);
  assert.match(source, /MERIDIAN_TEXT_SIZES/);
  assert.match(source, /CADENZA_TEXT_SIZES/);
  assert.match(source, /VELLUM_TEXT_SIZES/);
  assert.match(source, /AURELIA_TEXT_SIZES/);
  assert.match(source, /ATRIUM_TEXT_SIZES/);
  assert.match(source, /Białe tło pozostaje bez zmian/);
  assert.match(source, /pasek stanowiska pozostaje jej najciemniejszym akcentem/);
  assert.match(source, /Trzy lekkie i trzy mocne palety/);
  assert.match(source, /pole résumé, jego kontrast, portret, stanowisko, reguły oraz prawdziwe ikony/);
  assert.match(source, /Białe Carrara, dark mode i trzy mocne edycje/);
  assert.match(source, /Rozmiar tekstu/);
  assert.match(source, /oryginalny rozmiar szablonu/);
  assert.match(source, /if \(!appearanceEnabled\) return/);
});

test("Regent uses the shared three-column palette grid for two rows of editions", async () => {
  const [source, css] = await Promise.all([
    readFile(panelUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(source, /<div className=\{classes\.paletteGrid\} role="radiogroup"/);
  assert.match(css, /\.paletteGrid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s);
  assert.doesNotMatch(source, /paletteGridRegent/);
  assert.doesNotMatch(css, /\.paletteGridRegent/);
});

test("document card keeps tier-honest fit status and CTA", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /formatPageCountLabel/);
  assert.match(source, /fitStatus/);
  assert.match(source, /onFitToPages/);
  assert.match(source, /onClick=\{\(\) => onFitToPages\(\)\}/);
  assert.match(source, /Zmieść na /);
  assert.match(source, /Układ wygląda dobrze/);
  assert.match(source, /po skróceniu treści/);
});

test("structure groups show counts, contextual add actions, and reorder controls", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /listSidebarSections/);
  assert.match(source, /Kolumna główna/);
  assert.match(source, /Sidebar/);
  assert.match(source, /LuGripVertical/);
  assert.match(source, /FiChevronUp/);
  assert.match(source, /FiChevronDown/);
  assert.match(source, /lane:\s*"sidebar"/);
  assert.equal((source.match(/Dodaj sekcję/g) || []).length, 2);
  assert.doesNotMatch(source, /dnd-kit|DragDrop|onDragStart/);
});

test("density and optimization remain distinct from fit-to-page", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /densityPresetsFromBaseline/);
  assert.match(source, /Kompaktowa/);
  assert.match(source, /Standardowa/);
  assert.match(source, /Przestronna/);
  assert.match(source, /Zoptymalizuj układ/);
  assert.match(source, /proposeAutoFitSpacing/);
  assert.doesNotMatch(source, /Dopasuj automatycznie/);
});

test("precise spacing uses accessible steppers and baseline reset", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /Precyzyjne odstępy/);
  assert.match(source, /nudgeSpacing/);
  assert.match(source, /FiMinus/);
  assert.match(source, /<output/);
  assert.match(source, /Przywróć ustawienia szablonu/);
  assert.doesNotMatch(source, /type="number"/);
});

test("drawer is responsive and becomes a fixed overlay on small screens", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /width: min\(380px/);
  assert.match(css, /max-width: 1280px/);
  assert.match(css, /width: min\(360px/);
  assert.match(css, /max-width: 1024px/);
  assert.match(css, /width: min\(340px/);
  assert.match(css, /max-width: 720px/);
  assert.match(css, /position: fixed/);
  assert.doesNotMatch(css, /linear-gradient/);
});

test("sidebar rail label matches the new panel name", async () => {
  const source = await readFile(sidebarUrl, "utf8");
  assert.match(source, /labelText="Dostosuj CV"/);
});
