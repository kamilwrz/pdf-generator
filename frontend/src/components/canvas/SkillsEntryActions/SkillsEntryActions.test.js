import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./SkillsEntryActions.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("./SkillsEntryActions.module.css", import.meta.url), "utf8");

test("Skills add form is labelled, keyboard-operable, and portalled through the shared toolbar", () => {
  assert.match(source, /Dodaj umiejętność/);
  assert.match(source, /type="submit"/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /event\.key === "F10" && event\.shiftKey/);
  assert.match(source, /aria-keyshortcuts/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /panelContent=\{formOpen \? form : null\}/);
  assert.match(source, /panelContent=\{formOpen \? form : null\}[\s\S]*collisionAware/);
});

test("Skills add form exposes recovery for blank and duplicate values", () => {
  assert.match(source, /disabled=\{!value\.trim\(\)\}/);
  assert.match(source, /result\?\.error === "duplicate"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-invalid=\{Boolean\(error\)\}/);
});

test("Skills add form uses Swiss editor tokens and compact accessible sizing", () => {
  assert.match(css, /--color-editor-ink/);
  assert.match(css, /--color-paper/);
  assert.match(css, /--color-border/);
  assert.match(css, /--color-focus/);
  assert.match(css, /height:\s*var\(--control-height\)/);
  assert.match(css, /width:\s*var\(--control-height-compact\)/);
  assert.match(css, /font:\s*400 16px/);
  assert.match(css, /prefers-reduced-motion/);
});

test("Skills plus matches Languages and centres every layout on the content edge", () => {
  assert.match(source, /compactInlineToolbarLayoutSize\(safeZoom\)/);
  assert.match(source, /resolveSkillsEntryToolbarTop\(\{/);
  assert.doesNotMatch(source, /\bmode,/);
  assert.match(source, /anchorX=\{toolbarAnchorX\}/);
  assert.match(source, /placement="below"/);
});
