import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("demo mode exposes only editor-focused topbar actions", async () => {
  const topbar = await source("components/editor/Topbar/Topbar.jsx");

  assert.match(topbar, /isDemoContent/);
  assert.match(topbar, /showSections/);
  assert.match(topbar, /Układ CV/);
  assert.match(topbar, /!isDemoContent &&/);
});

test("demo mode hides account and upload tools from the sidebar", async () => {
  const sidebar = await source("components/editor/Sidebar/Sidebar.jsx");

  assert.match(sidebar, /!isDemoContent/);
  assert.match(sidebar, /isGuest \|\| isDemoContent/);
  assert.match(sidebar, /labelText="Moje dokumenty"/);
  assert.match(sidebar, /labelText="Zdjęcia"/);
});

test("demo mode keeps its product-focused banner copy", async () => {
  const banner = await source("components/editor/DemoBanner/DemoBanner.jsx");

  assert.match(banner, /Wypróbuj CV Studio/);
  assert.match(banner, /Edytuj tekst Regenta/);
  assert.match(banner, /Stwórz moje CV/);
  assert.doesNotMatch(banner, /Zacznij od zera/);
});

test("demo mode removes template switching from the topbar", async () => {
  const topbar = await source("components/editor/Topbar/Topbar.jsx");

  assert.match(topbar, /!isDemoContent && <div className={classes.cluster} role="group" aria-label="Szablon CV">/);
  assert.doesNotMatch(topbar, /classes\.demoTemplate/);
});

test("empty-state chooser offers saved documents and shields editor chrome", async () => {
  const chooser = await source("components/editor/StartChooser/StartChooser.jsx");
  const styles = await source("components/editor/StartChooser/StartChooser.module.css");
  const canvas = await source("pages/PdfCanvas.jsx");

  assert.match(chooser, /Moje dokumenty/);
  assert.match(chooser, /onDocuments/);
  assert.doesNotMatch(chooser, /onBlank/);
  assert.match(styles, /position: fixed/);
  assert.match(styles, /grid-template-columns: repeat\(3, 1fr\)/);
  assert.match(canvas, /onDocuments=\{\(\) => \{/);
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
  assert.match(canvas, /demo-conversion/);
  assert.match(canvas, /loadGuestDocument\(\)\?\.isDemoContent/);
  assert.match(canvas, /demoGuestRestoredRef/);
  assert.match(canvas, /fillTemplate\(claim.profile, "regent"/);
  assert.match(canvas, /handleLoadAiElements\(response.elements, "Moje CV", "regent"\);\s*\/\/ The generated CV is now an authenticated document[\s\S]*setIsDemoContent\(false\)/);
});

test("guest onboarding uses four steps while authenticated wizard keeps templates", async () => {
  const data = await source("utils/bioCvData.js");
  const wizard = await source("components/ai/BioCvModal/BioCvModal.jsx");

  assert.match(data, /BIO_CV_ONBOARDING_STEPS = BIO_CV_STEPS\.slice\(0, 4\)/);
  assert.match(wizard, /variant = "full"/);
  assert.match(wizard, /BIO_CV_ONBOARDING_STEPS/);
  assert.match(wizard, /wizard-conversion/);
  assert.match(wizard, /TemplateCarousel/);
  assert.match(wizard, /visibleCount=\{5\}/);
  assert.match(wizard, /isGuestOnboarding = variant === "guest-onboarding" \|\| isDemoConversion/);
  assert.match(wizard, /hasAuthenticatedSession = Boolean\(getAccessToken\(\)\)/);
  assert.match(wizard, /"Utwórz konto i moje CV"/);
  assert.match(wizard, /"Utwórz moje CV"/);
});

test("registration and login preserve the demo conversion intent", async () => {
  const register = await source("pages/Register/Register.jsx");
  const login = await source("pages/Login/Login.jsx");

  assert.match(register, /"demo-conversion"/);
  assert.match(register, /"wizard-conversion"/);
  assert.match(register, /przeniesiemy dane z kreatora/);
  assert.match(register, /startIntent === "wizard" \? null : startIntent/);
  assert.match(login, /"demo-conversion"/);
  assert.match(login, /"wizard-conversion"/);
  assert.match(login, /utworzymy Twoje CV w Regencie/);
  assert.match(login, /startIntent === "wizard" \? null : startIntent/);
});
