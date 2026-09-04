import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./GridEntryActions.jsx", import.meta.url), "utf8");
const hoverHookSource = await readFile(
  new URL("../../../hooks/useCanvasHoverToolbar.js", import.meta.url),
  "utf8",
);

test("grid entries expose only direct add and delete actions", () => {
  assert.match(source, /label: "Dodaj wpis"/);
  assert.match(source, /label: "Usuń wpis"/);
  assert.match(source, /directActions=\{directActions\}/);
  assert.doesNotMatch(source, /menuItems=/);
  assert.doesNotMatch(source, /addLabel=/);
  assert.doesNotMatch(source, /canMoveUp=/);
  assert.match(source, /key: "add"/);
  assert.match(source, /key: "delete"/);
  assert.doesNotMatch(source, /key: "move/);
});

test("grid entry actions use context mutations, deletion undo, and a keyboard entry path", () => {
  assert.match(source, /addGridSectionEntry\?\.\(elementId\)/);
  assert.match(source, /removeGridSectionEntry\?\.\(elementId\)/);
  assert.match(source, /deleteWithUndo\(\{/);
  assert.match(source, /event\.key === "ContextMenu"/);
  assert.match(source, /event\.key === "F10" && event\.shiftKey/);
  assert.match(source, /aria-keyshortcuts/);
  assert.match(hoverHookSource, /addEventListener\("pointerenter", onPointerEnter\)/);
  assert.match(hoverHookSource, /addEventListener\("focusin", onFocusIn\)/);
});

test("grid entry detection excludes rectangle-backed skill chips", () => {
  assert.match(source, /entry\?\.category === "textarea"/);
  assert.match(source, /entry\?\.flowRole === "grid-member"/);
});

test("grid actions stay in the section gutter and protect the final entry", () => {
  assert.match(source, /gutterSide === "left" \|\| gutterSide === "right"/);
  assert.match(source, /resolveStructuralToolbarSide\(preferredSide, spreadSide\)/);
  assert.match(source, /disabled: !canDelete \|\| typeof removeGridSectionEntry !== "function"/);
  assert.match(source, /<CanvasHoverToolbar/);
});

test("language actions are centred 18px below the hovered language and use compact inline sizing", () => {
  assert.match(source, /const isLanguageEntry = gridKind === "languages" \|\| sectionType === "languages"/);
  assert.match(source, /compactInlineToolbarLayoutSize\(zoom\)/);
  assert.match(source, /boxHeight \+ 18 \/ safeZoom/);
  assert.match(source, /\(Number\(left\) \|\| 0\) \+ boxWidth \/ 2/);
  assert.match(source, /placement=\{isLanguageEntry \? "below" : "gutter"\}/);
  assert.match(source, /anchorX=\{toolbarAnchorX\}/);
});

test("grid entry hover never stacks toolbar frames over selection, editing, or focus", () => {
  assert.match(source, /hoveredTriggerId,/);
  assert.match(
    source,
    /const hasPersistentStateFrame = Boolean\(entry\?\.isSelected \|\| entry\?\.isEditing\)/,
  );
  assert.match(source, /&& hoveredTriggerId === elementId/);
  assert.doesNotMatch(source, /hoveredTriggerId === elementId \|\| pinned/);
  assert.match(source, /highlight=\{hoverHighlight\}/);
  assert.doesNotMatch(source, /elementHighlight=/);
  assert.doesNotMatch(source, /elementHighlightSelected=/);
});
