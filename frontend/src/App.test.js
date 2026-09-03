import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./App.jsx", import.meta.url);
const appStylesUrl = new URL("./App.css", import.meta.url);
const globalStylesUrl = new URL("./index.css", import.meta.url);

test("top-level routes are lazy and share a branded error element", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const PdfCanvas = lazy\(\(\) => import\('\.\/pages\/PdfCanvas'\)\)/);
  assert.match(source, /const Hero = lazy\(\(\) => import\('\.\/pages\/Hero\/Hero'\)\)/);
  assert.match(source, /<Suspense fallback=/);
  assert.ok(
    (source.match(/errorElement: <RouteErrorPage \/>/g) || []).length >= 5,
    "every public route should render the branded error state",
  );
});

test("the A4 workspace uses a grey base with a translucent white overlay", async () => {
  const [appStyles, globalStyles] = await Promise.all([
    readFile(appStylesUrl, "utf8"),
    readFile(globalStylesUrl, "utf8"),
  ]);

  assert.match(globalStyles, /--color-editor-canvas-base:\s*#DDE0E3;/);
  assert.match(globalStyles, /--color-editor-canvas-overlay:\s*rgba\(255, 255, 255, \.58\);/);
  assert.match(appStyles, /\.right-pane\s*\{[\s\S]*?background:\s*var\(--color-editor-canvas-base\);/);
  assert.match(appStyles, /\.canvas-area\s*\{[\s\S]*?background:\s*var\(--color-editor-canvas-overlay\);/);
});

test("the editor route replaces near-black chrome with the Swiss brown token", async () => {
  const [appStyles, globalStyles] = await Promise.all([
    readFile(appStylesUrl, "utf8"),
    readFile(globalStylesUrl, "utf8"),
  ]);

  assert.match(globalStyles, /--color-editor-ink:\s*#674E3E;/);
  assert.match(appStyles, /body:has\(\.main-container\)\s*\{[\s\S]*?--color-ink:\s*var\(--color-editor-ink\);/);
  assert.match(appStyles, /body:has\(\.main-container\)\s*\{[\s\S]*?--primary-btn:\s*var\(--color-editor-ink\);/);
  assert.doesNotMatch(appStyles, /body(?::not\([^)]*\))?\s*\{[^}]*--color-editor-ink:/);
});
