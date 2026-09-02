import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("structural toolbar escapes the scaled page and stacks above the inspector", async () => {
  const source = await readFile(new URL("./CanvasHoverToolbar.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./CanvasHoverToolbar.module.css", import.meta.url), "utf8");

  assert.match(source, /createPortal\(/);
  assert.match(source, /originRef/);
  assert.match(source, /getBoundingClientRect\(\)/);
  assert.match(source, /pageRect\.width \/ pageWidthInLayout/);
  assert.match(source, /document\.body/);
  assert.match(css, /\.portalAnchor\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /z-index:\s*var\(--z-editor-context\)/);
});

test("selected elements keep selection and receive a separate hover ring", async () => {
  const source = await readFile(new URL("./CanvasHoverToolbar.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./CanvasHoverToolbar.module.css", import.meta.url), "utf8");

  assert.match(source, /elementHighlightSelected/);
  assert.match(css, /\.elementHighlightSelected\s*\{[^}]*outline-offset:\s*4px/s);
  assert.match(css, /\.elementHighlightSelected\s*\{[^}]*border-color:\s*transparent/s);
});

test("direct actions replace the labelled structural toolbar with accessible icon buttons", async () => {
  const source = await readFile(new URL("./CanvasHoverToolbar.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./CanvasHoverToolbar.module.css", import.meta.url), "utf8");

  assert.match(source, /directActions\.length > 0/);
  assert.match(source, /aria-label=\{item\.label\}/);
  assert.match(source, /disabled=\{item\.disabled\}/);
  assert.match(source, /item\.danger/);
  assert.match(css, /\.directActionDanger/);
  assert.match(css, /\.control\[data-tooltip\]:focus-visible::after/);
});

test("semantic highlight can remain visible without opening the action toolbar", async () => {
  const source = await readFile(new URL("./CanvasHoverToolbar.jsx", import.meta.url), "utf8");

  assert.match(source, /highlightVisible = visible/);
  assert.match(source, /if \(!visible && !highlightVisible\) return null/);
  assert.match(source, /highlightVisible && highlight/);
  assert.match(source, /visible && portalStyle/);
});
