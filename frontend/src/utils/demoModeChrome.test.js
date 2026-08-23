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
  assert.match(banner, /Kliknij dowolny tekst/);
  assert.match(banner, /Stwórz moje CV/);
});

test("PdfCanvas publishes demo state through the editor context", async () => {
  const canvas = await source("pages/PdfCanvas.jsx");

  assert.match(canvas, /isDemoContent,\s*groupMoveDelta/);
  assert.match(canvas, /A4_Elements, isDemoContent, groupMoveDelta/);
  assert.match(canvas, /<DemoBanner onUseOwnData=/);
});
