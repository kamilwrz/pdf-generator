import assert from "node:assert/strict";
import { readPresentationSource as readFile } from "../../scripts/read-presentation-source.mjs";
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


test("PdfCanvas publishes demo state through the editor context", async () => {
  const canvas = await source("pages/PdfCanvas.jsx");

  assert.match(canvas, /isDemoContent,\s*groupMoveDelta/);
  assert.match(canvas, /A4_Elements, isDemoContent, groupMoveDelta/);
  assert.match(canvas, /<DemoBanner onUseOwnData=/);
  assert.match(canvas, /openOnboarding\('new'\)/);
  assert.match(canvas, /loadGuestDocument\(\)\?\.isDemoContent/);
  assert.match(canvas, /guestDocumentRestoredRef/);
  assert.match(canvas, /import \{ lindenTemplate \} from '\.\.\/templates\/linden'/);
  assert.match(canvas, /commitDocumentSnapshot\(\{[\s\S]*materializeElementSpecs\(getUiLanguage\(\) === 'en'[\s\S]*englishLinden[\s\S]*lindenTemplate, nanoid\)[\s\S]*title: "DEMO_CV"[\s\S]*templateId: "linden"/);
  assert.match(canvas, /guestDoc\.templateId !== "linden"[\s\S]*clearGuestDocument\(\)[\s\S]*commitDocumentSnapshot\(\{[\s\S]*lindenTemplate/);
  assert.match(canvas, /handleDemoUseOwnData[\s\S]*openOnboarding\('new'\)/);
  assert.match(canvas, /handleCreateStarterCv/);
});

test("authenticated demo refresh does not offer the demo snapshot for claiming", async () => {
  const canvas = await source("pages/PdfCanvas.jsx");

  assert.match(canvas, /if \(guestDoc\.isDemoContent\) \{\s*\/\/ The Linden demo is product content/);
  assert.match(canvas, /if \(guestDoc\.isDemoContent\) \{[\s\S]*clearGuestDocument\(\);[\s\S]*return;/);
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
