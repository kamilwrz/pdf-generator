import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI is attached only to section and record toolbars, not inline add controls", async () => {
  for (const component of ["GridEntryActions", "SkillsEntryActions"]) {
    const source = await readFile(new URL(`../${component}/${component}.jsx`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /aiTarget=/);
  }
  for (const component of ["SectionRecordAdd", "RecordBlockAdd"]) {
    const source = await readFile(new URL(`../${component}/${component}.jsx`, import.meta.url), "utf8");
    assert.match(source, /aiTarget=/);
  }
});

test("structural toolbar escapes the scaled page and stacks above the inspector", async () => {
  const source = await readFile(new URL("./CanvasHoverToolbar.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./CanvasHoverToolbar.module.css", import.meta.url), "utf8");

  assert.match(source, /createPortal\(/);
  assert.match(source, /originRef/);
  assert.match(source, /getBoundingClientRect\(\)/);
  assert.match(source, /document\.body/);
  assert.match(css, /\.portalAnchor\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /z-index:\s*var\(--z-editor-context\)/);
});

test("structural toolbar accepts an element anchor while preserving the page-edge fallback", async () => {
  const source = await readFile(new URL("./CanvasHoverToolbar.jsx", import.meta.url), "utf8");

  assert.match(source, /anchorX = null/);
  assert.match(source, /anchorX != null && Number\.isFinite\(Number\(anchorX\)\)/);
  assert.match(source, /side === "left" \? 0 : pageWidth/);
  assert.match(source, /left: resolvedAnchorX/);
});

test("an element-centred toolbar can render directly below its anchor", async () => {
  const source = await readFile(new URL("./CanvasHoverToolbar.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./CanvasHoverToolbar.module.css", import.meta.url), "utf8");

  assert.match(source, /placement = "gutter"/);
  assert.match(source, /placement === "below"/);
  assert.match(source, /portalLeft -= toolbarWidth \/ 2/);
  assert.match(source, /classes\.below/);
  assert.match(css, /\.below\s*\{[^}]*left:\s*0/s);
});

test("inline toolbar panels can stay inside the viewport and flip above their anchor", async () => {
  const source = await readFile(new URL("./CanvasHoverToolbar.jsx", import.meta.url), "utf8");

  assert.match(source, /panelContent/);
  assert.match(source, /collisionAware/);
  assert.match(source, /window\.innerWidth - toolbarWidth/);
  assert.match(source, /window\.innerHeight/);
  assert.match(source, /requestAnimationFrame\(updatePortalGeometry\)/);
});

test("selected elements share the same unshifted pointer outline", async () => {
  const source = await readFile(new URL("./CanvasHoverToolbar.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./CanvasHoverToolbar.module.css", import.meta.url), "utf8");

  assert.match(source, /elementHighlight \?/);
  assert.doesNotMatch(source, /elementHighlightSelected/);
  assert.doesNotMatch(css, /elementHighlightSelected|--canvas-editor-lift/);
});

test("section and entry context use spaced dotted lines around the solid element outline", async () => {
  const source = await readFile(new URL("./CanvasHoverToolbar.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./CanvasHoverToolbar.module.css", import.meta.url), "utf8");

  assert.match(source, /highlightLevel = "entry"/);
  assert.match(source, /classes\.highlightSection/);
  assert.match(source, /classes\.highlightElement/);
  assert.match(source, /classes\.highlightSkills/);
  assert.match(source, /data-canvas-highlight-level=\{highlightLevel\}/);
  assert.match(css, /\.highlight\s*\{[^}]*background:\s*transparent[^}]*border-style:\s*none/s);
  assert.match(css, /\.highlight::before,[\s\S]*\.elementHighlight::before\s*\{[^}]*--canvas-hover-padding[^}]*--canvas-hover-radius/s);
  assert.match(css, /\.highlightSection::before\s*\{[^}]*--canvas-hover-section-padding[^}]*border:\s*1px dotted[^;]*--canvas-outline-section/s);
  assert.match(css, /\.highlightEntry::before\s*\{[^}]*--canvas-hover-entry-padding[^}]*border:\s*1px dotted[^;]*--canvas-outline-entry/s);
  assert.match(css, /\.highlightSkills::before\s*\{[^}]*--canvas-hover-entry-padding[^}]*border:\s*1px dotted[^;]*--canvas-outline-entry/s);
  assert.match(css, /\.elementHighlight::before\s*\{[^}]*border:\s*1px solid[^;]*--canvas-outline-element/s);
});

test("selection and editing use screen-stable hairlines with active textarea depth", async () => {
  const [tokens, pageSource, selectionSource, selectionCss, textCss, textareaSource, textareaCss] = await Promise.all([
    readFile(new URL("../../../index.css", import.meta.url), "utf8"),
    readFile(new URL("../A4/A4.jsx", import.meta.url), "utf8"),
    readFile(new URL("../SelectionOverlay/SelectionOverlay.jsx", import.meta.url), "utf8"),
    readFile(new URL("../SelectionOverlay/SelectionOverlay.module.css", import.meta.url), "utf8"),
    readFile(new URL("../Text/Text.module.css", import.meta.url), "utf8"),
    readFile(new URL("../Textarea/Textarea.jsx", import.meta.url), "utf8"),
    readFile(new URL("../Textarea/Textarea.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(tokens, /--shadow-editor-entry:/);
  assert.match(tokens, /--shadow-editor-active:/);
  assert.match(tokens, /--shadow-editor-skills-active:/);
  assert.match(tokens, /--shadow-editor-entry-color:\s*rgba\(22, 22, 22, \.17\)/);
  assert.match(pageSource, /const px = \(screenPixels\) => `\$\{screenPixels \/ safeZoom\}px`/);
  assert.match(pageSource, /"--canvas-shadow-editor-entry"/);
  assert.match(pageSource, /"--canvas-shadow-editor-active"/);
  assert.match(pageSource, /"--canvas-shadow-editor-skills-active"/);
  assert.match(pageSource, /"--canvas-hover-padding":\s*px\(4\)/);
  assert.match(pageSource, /"--canvas-hover-entry-padding":\s*px\(8\)/);
  assert.match(pageSource, /"--canvas-hover-section-padding":\s*px\(12\)/);
  assert.match(pageSource, /"--canvas-hover-radius":\s*"2px"/);
  assert.match(pageSource, /"--canvas-editor-hairline":\s*px\(1\)/);
  assert.match(selectionSource, /!\(element\.isEditing && \["text", "textarea"\]\.includes\(element\.category\)\)/);
  assert.match(selectionCss, /\.frame\s*\{[^}]*border:[^;]*--canvas-editor-hairline[^;]*--color-focus[^}]*box-shadow:\s*none/s);
  assert.match(selectionCss, /\.groupFrame\s*\{[^}]*border:[^;]*--canvas-editor-hairline[^;]*--color-focus[^}]*box-shadow:\s*none/s);
  assert.match(textCss, /\.editing:focus::after\s*\{[^}]*outline:[^;]*--canvas-editor-hairline[^;]*--color-focus[^}]*box-shadow:\s*none/s);
  assert.match(textareaCss, /\.selected\s*\{[^}]*box-shadow:[^;]*--canvas-shadow-editor-active/s);
  assert.match(textareaCss, /\.editing:focus\s*\{[^}]*outline:[^;]*--canvas-editor-hairline[^}]*box-shadow:[^;]*--canvas-shadow-editor-active/s);
  assert.match(textareaSource, /className=\{`\$\{classes\.editing\} \$\{skillsField \? classes\.skillsField : ""\} \$\{isSelected \? classes\.selected : ""\}`\}/);
  assert.match(textareaCss, /\.editing\.selected\s*\{[^}]*outline:[^;]*--canvas-editor-hairline[^}]*box-shadow:[^;]*--canvas-shadow-editor-active/s);
  assert.match(textareaCss, /\.editing:focus\s*\{[^}]*outline:[^;]*--canvas-editor-hairline[^;]*--color-focus/s);
});

test("direct actions replace the labelled structural toolbar with accessible icon buttons", async () => {
  const source = await readFile(new URL("./CanvasHoverToolbar.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./CanvasHoverToolbar.module.css", import.meta.url), "utf8");

  assert.match(source, /directActions\.length > 0/);
  assert.match(source, /aria-label=\{item\.label\}/);
  assert.match(source, /disabled=\{item\.disabled\}/);
  assert.match(source, /item\.danger/);
  assert.match(css, /\.directActionDanger/);
  assert.match(await readFile(new URL("../CanvasControls.module.css", import.meta.url), "utf8"), /\.button\[data-tooltip\]:focus-visible::after/);
});

test("semantic highlight can remain visible without opening the action toolbar", async () => {
  const source = await readFile(new URL("./CanvasHoverToolbar.jsx", import.meta.url), "utf8");

  assert.match(source, /highlightVisible: requestedHighlightVisible = requestedVisible/);
  assert.match(source, /if \(!visible && !highlightVisible\) return null/);
  assert.match(source, /highlightVisible && highlight/);
  assert.match(source, /visible && portalStyle/);
});
