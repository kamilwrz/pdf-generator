import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Editor renders selection formatting as its own panel, independent of the topbar-docked properties panel", async () => {
  const source = await readFile(new URL("./Editor.jsx", import.meta.url), "utf8");

  assert.match(source, /inlineSelection/);
  assert.match(source, /applyInlineMark/);
  assert.match(source, /rangeColor/);
  // Its own ref/state and portal content, not a row nested inside `panel`.
  assert.match(source, /selectionPanelRef/);
  assert.match(source, /selectionPanelPosition/);
  assert.match(source, /const selectionPanel = \(/);
  assert.match(source, /Formatowanie zaznaczenia/);
  assert.match(source, /Kolor zaznaczenia/);
  assert.match(source, /applyInlineMark\("color", event\.target\.value\)/);
  assert.match(source, /type="color"/);
  // Standalone swatch palette toolbar must stay removed.
  assert.doesNotMatch(source, /InlineFormatToolbar/);
  assert.doesNotMatch(source, /PALETTE/);
  // Layer (zIndex) is freeform-only — structural mode has nothing useful to stack.
  assert.match(source, /canEditElementLayer/);
  assert.match(source, /showLayerField && \(/);
  // Topbar panel docks off the zoom anchor, not the canvas selection.
  assert.match(source, /data-anchor="topbar-zoom"/);
  assert.match(source, /GAP_FROM_ZOOM_PX/);
});

test("Editor panel stacks above the topbar it docks against", async () => {
  // The properties panel is vertically centered on the topbar's zoom
  // cluster, so it paints underneath the topbar's opaque background unless
  // its z-index clears the topbar's. Regression guard for that exact bug:
  // a shadow was visible but the panel body was hidden behind the topbar.
  const editorCss = await readFile(new URL("./Editor.module.css", import.meta.url), "utf8");
  const topbarCss = await readFile(
    new URL("../Topbar/Topbar.module.css", import.meta.url),
    "utf8",
  );

  const editorZIndex = Number(editorCss.match(/\.editor\s*{[^}]*z-index:\s*(\d+)/)?.[1]);
  const topbarZIndex = Number(topbarCss.match(/\.topbar\s*{[^}]*z-index:\s*(\d+)/)?.[1]);

  assert.ok(Number.isFinite(editorZIndex), "could not find .editor z-index");
  assert.ok(Number.isFinite(topbarZIndex), "could not find .topbar z-index");
  assert.ok(
    editorZIndex > topbarZIndex,
    `.editor z-index (${editorZIndex}) must be greater than .topbar z-index (${topbarZIndex})`,
  );
});
