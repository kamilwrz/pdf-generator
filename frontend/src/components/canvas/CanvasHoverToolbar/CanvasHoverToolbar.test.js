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
