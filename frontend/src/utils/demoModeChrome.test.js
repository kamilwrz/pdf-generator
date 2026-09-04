import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("demo mode exposes import conversion while layout stays in the sidebar", async () => {
  const topbar = await source("components/editor/Topbar/Topbar.jsx");
  const sidebar = await source("components/editor/Sidebar/Sidebar.jsx");

  assert.match(topbar, /isDemoContent/);
  assert.match(topbar, /to="\/register\?start=import"/);
  assert.match(topbar, /Wgraj CV/);
  assert.doesNotMatch(topbar, /Dostosuj CV/);
  assert.match(sidebar, /labelText="Dostosuj CV"/);
  assert.match(sidebar, /sidebarEvent={showSections}/);
  assert.match(topbar, /!isDemoContent &&/);
});

test("demo mode hides account and upload tools from the sidebar", async () => {
  const sidebar = await source("components/editor/Sidebar/Sidebar.jsx");

  assert.match(sidebar, /!isDemoContent/);
  assert.match(sidebar, /isGuest \|\| isDemoContent/);
  assert.match(sidebar, /labelText="Moje dokumenty"/);
  assert.match(sidebar, /const photoLabel = isTemplate \? "Zdjęcie profilowe" : "Zdjęcia"/);
});

test("demo mode keeps its product-focused banner copy", async () => {
  const banner = await source("components/editor/DemoBanner/DemoBanner.jsx");

  assert.match(banner, /Wypróbuj CV Studio/);
  assert.match(banner, /Edytuj przykładowe CV w Linden/);
  assert.match(banner, /Utwórz moje CV na A4/);
  assert.doesNotMatch(banner, /Zacznij od zera/);
});

test("demo mode removes template switching from the topbar", async () => {
  const topbar = await source("components/editor/Topbar/Topbar.jsx");

  assert.match(topbar, /!isDemoContent && <div className={classes.workflowCluster}/);
  assert.match(topbar, /className={classes.templateCluster} role="group" aria-label="Szablon CV"/);
  assert.doesNotMatch(topbar, /classes\.demoTemplate/);
});

test("empty-state chooser replaces editor chrome and Pro-only AI actions", async () => {
  const chooser = await source("components/editor/StartChooser/StartChooser.jsx");
  const styles = await source("components/editor/StartChooser/StartChooser.module.css");
  const canvas = await source("pages/PdfCanvas.jsx");

  assert.match(chooser, /Moje dokumenty/);
  assert.match(chooser, /onDocuments/);
  assert.match(chooser, /onNew/);
  assert.match(chooser, /legacyDraftAvailable/);
  assert.match(chooser, /onLogout/);
  assert.match(chooser, /CV STUDIO/);
  assert.match(chooser, /cv-studio-mark\.svg/);
  assert.match(chooser, /aria-labelledby="start-chooser-title"/);
  assert.match(chooser, /titleRef\.current\?\.focus/);
  assert.match(styles, /\.overlay\s*\{[\s\S]*position: absolute/);
  assert.match(styles, /z-index: var\(--z-popover\)/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(canvas, /onDocuments=\{\(\) => \{/);
  assert.match(canvas, /documents=\{PDFs\}/);
  assert.match(canvas, /documentsLoaded=\{pdfsLoaded\}/);
  assert.match(canvas, /!showStartChooser \? \(\s*<Sidebar>/);
  assert.match(canvas, /!showStartChooser \? <Editor \/>/);
  assert.match(canvas, /!showStartChooser \? \(\s*<div className="right-pane">/);
  assert.match(canvas, /!showStartChooser \? <Gallery \/>/);
  assert.match(canvas, /!showStartChooser && entitlements\?\.ai_assistant \? \([\s\S]*<Suspense[\s\S]*<LazyAiAssistant \/>/);
  assert.match(
    canvas,
    /onDocuments=\{\(\) => \{\s*\/\/ Keep the chooser mounted behind the documents modal\./,
  );
});

test("PdfCanvas publishes demo state through the editor context", async () => {
  const canvas = await source("pages/PdfCanvas.jsx");

  assert.match(canvas, /isDemoContent,\s*groupMoveDelta/);
  assert.match(canvas, /A4_Elements, isDemoContent, groupMoveDelta/);
  assert.match(canvas, /<DemoBanner onUseOwnData=/);
  assert.match(canvas, /setDialog\('newCv'\)/);
  assert.match(canvas, /loadGuestDocument\(\)\?\.isDemoContent/);
  assert.match(canvas, /guestDocumentRestoredRef/);
  assert.match(canvas, /import \{ lindenTemplate \} from '\.\.\/templates\/linden'/);
  assert.match(canvas, /commitDocumentSnapshot\(\{[\s\S]*materializeElementSpecs\(lindenTemplate, nanoid\)[\s\S]*title: "DEMO_CV"[\s\S]*templateId: "linden"/);
  assert.match(canvas, /guestDoc\.templateId !== "linden"[\s\S]*clearGuestDocument\(\)[\s\S]*commitDocumentSnapshot\(\{[\s\S]*lindenTemplate/);
  assert.match(canvas, /handleDemoUseOwnData[\s\S]*setDialog\('newCv'\)/);
  assert.match(canvas, /handleCreateStarterCv/);
});

test("authenticated demo refresh does not offer the demo snapshot for claiming", async () => {
  const canvas = await source("pages/PdfCanvas.jsx");

  assert.match(canvas, /if \(guestDoc\.isDemoContent\) \{\s*\/\/ The Linden demo is product content/);
  assert.match(canvas, /if \(guestDoc\.isDemoContent\) \{[\s\S]*clearGuestDocument\(\);[\s\S]*return;/);
});

test("new CV onboarding uses one setup dialog for guests and accounts", async () => {
  const setup = await source("components/editor/NewCvSetupModal/NewCvSetupModal.jsx");
  const starter = await source("utils/cvStarter.js");

  assert.match(setup, /<DialogShell/);
  assert.match(setup, /Skonfiguruj nowe CV/);
  assert.match(setup, /Utwórz A4/);
  assert.match(setup, /draggable/);
  assert.match(starter, /STARTER_TEMPLATE_ID = "meridian"/);
  assert.doesNotMatch(setup, /stepper|wizardStep/);
});

test("registration and login accept the new intent and retire conversion intents", async () => {
  const register = await source("pages/Register/Register.jsx");
  const login = await source("pages/Login/Login.jsx");

  assert.match(register, /"new"/);
  assert.match(login, /"new"/);
  assert.match(register, /requestedStart === "wizard" \? "new"/);
  assert.match(login, /requestedStart === "wizard" \? "new"/);
  assert.doesNotMatch(register, /demo-conversion|wizard-conversion/);
  assert.doesNotMatch(login, /demo-conversion|wizard-conversion/);
});
