import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every structurally compatible sidebar template exposes lane-transfer controls", async () => {
  const source = await readFile(new URL("./CanvasElements.jsx", import.meta.url), "utf8");

  // The editor control is intentionally gated by template ID because transfer
  // restyles a section for the destination lane. These generators emit the
  // same sidebar-chrome/content metadata, so omitting any ID would leave the
  // tested transfer utility unreachable in the live editor.
  for (const templateId of ["sterling", "slate", "linden"]) {
    assert.match(source, new RegExp(`"${templateId}"`));
  }
  assert.match(source, /const allowLaneTransfer = LANE_TRANSFER_TEMPLATE_IDS\.has\(activeTemplateId\)/);
  assert.match(source, /resolveSectionLaneTransfer\(documentElements, section\.headingId, pageHeight\)/);
});

test("selected and editing structural fields remain eligible hover targets", async () => {
  const recordSource = await readFile(
    new URL("../RecordBlockAdd/RecordBlockAdd.jsx", import.meta.url),
    "utf8",
  );
  const sectionSource = await readFile(
    new URL("../SectionRecordAdd/SectionRecordAdd.jsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(recordSource, /!triggerElements\.some\([^)]*isEditing/);
  assert.doesNotMatch(recordSource, /!hoveredElement\.isSelected/);
  assert.doesNotMatch(recordSource, /!hoveredElement\.isEditing/);
  assert.match(recordSource, /elementHighlightSelected=\{Boolean\(hoveredElement\?\.isSelected\)\}/);
  assert.match(recordSource, /triggerRevision/);

  assert.doesNotMatch(sectionSource, /!heading\?\.isEditing/);
  assert.doesNotMatch(sectionSource, /!hoveredHeading\.isSelected/);
  assert.doesNotMatch(sectionSource, /!hoveredHeading\.isEditing/);
  assert.match(sectionSource, /elementHighlightSelected=\{Boolean\(hoveredHeading\?\.isSelected\)\}/);
  assert.match(sectionSource, /triggerRevision/);
});

test("section and record toolbars use distinct element-relative gaps and centred anchors", async () => {
  const recordSource = await readFile(
    new URL("../RecordBlockAdd/RecordBlockAdd.jsx", import.meta.url),
    "utf8",
  );
  const sectionSource = await readFile(
    new URL("../SectionRecordAdd/SectionRecordAdd.jsx", import.meta.url),
    "utf8",
  );

  assert.match(recordSource, /structuralToolbarLayoutSize\(zoom, RECORD_TOOLBAR_OFFSET_SCREEN_PX\)/);
  assert.match(recordSource, /const toolbarAnchorBounds = renderedAnchorMeasurement\?\.key/);
  assert.match(recordSource, /const toolbarAnchorX = toolbarAnchorBounds\.left/);
  assert.match(recordSource, /side="left"[\s\S]*anchorX=\{toolbarAnchorX\}/);
  assert.match(recordSource, /toolbarAnchorBounds\.top[\s\S]*toolbarAnchorBounds\.height \/ 2/);
  assert.match(sectionSource, /structuralToolbarLayoutSize\(zoom, SECTION_TOOLBAR_OFFSET_SCREEN_PX\)/);
  assert.match(sectionSource, /const toolbarHeadingBounds = currentMeasurement\?\.headingBounds/);
  assert.match(sectionSource, /toolbarHeadingBounds\.left \+ toolbarHeadingBounds\.width/);
  assert.match(sectionSource, /side="right"[\s\S]*anchorX=\{toolbarAnchorX\}/);
  assert.match(sectionSource, /toolbarHeadingBounds\.top[\s\S]*toolbarHeadingBounds\.height \/ 2/);
});

test("repeatable grid cells mount their dedicated two-action control", async () => {
  const source = await readFile(new URL("./CanvasElements.jsx", import.meta.url), "utf8");

  assert.match(source, /import GridEntryActions from '\.\.\/GridEntryActions\/GridEntryActions'/);
  assert.match(source, /listGridSectionEntryAnchors\(documentElements, pageHeight\)/);
  assert.match(source, /gridEntryAnchorsById\.get\(element\.element_id\)/);
  assert.match(source, /<GridEntryActions/);
  assert.match(source, /gutterSide=\{gridEntryAnchor\.gutterSide\}/);
  assert.match(source, /canDelete=\{gridEntryAnchor\.canDelete\}/);
});

test("plain section content reveals the complete section depth without stealing nested controls", async () => {
  const source = await readFile(new URL("./CanvasElements.jsx", import.meta.url), "utf8");
  const sectionSource = await readFile(
    new URL("../SectionRecordAdd/SectionRecordAdd.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const nestedStructuralHoverIds = useMemo/);
  assert.match(source, /!nestedStructuralHoverIds\.has\(element\.element_id\)/);
  assert.match(source, /contentHoverIds=\{sectionAnchor\.contentHoverIds\}/);
  assert.match(sectionSource, /const sectionHoverVisible = hoveredTriggerId === headingId \|\| contentHoverActive/);
  assert.match(sectionSource, /highlightVisible=\{sectionHoverVisible\}/);
  assert.match(sectionSource, /addEventListener\("pointerenter", showContext\)/);
  assert.doesNotMatch(sectionSource, /node\.addEventListener\("focusin", showContext\)/);
});

test("semantic contact and identity fields receive editor-only hover depth", async () => {
  const [canvasSource, textSource, textCss, textareaSource, textareaCss] = await Promise.all([
    readFile(new URL("./CanvasElements.jsx", import.meta.url), "utf8"),
    readFile(new URL("../Text/Text.jsx", import.meta.url), "utf8"),
    readFile(new URL("../Text/Text.module.css", import.meta.url), "utf8"),
    readFile(new URL("../Textarea/Textarea.jsx", import.meta.url), "utf8"),
    readFile(new URL("../Textarea/Textarea.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(canvasSource, /editorMode === EDITOR_MODE_TEMPLATE/);
  assert.match(canvasSource, /element\.contactChannel/);
  assert.match(canvasSource, /element\.mastheadRole === "name"/);
  assert.match(canvasSource, /element\.mastheadRole === "title"/);
  assert.match(textSource, /data-editor-hover-outline=/);
  assert.match(textareaSource, /data-editor-hover-outline=/);
  assert.match(textCss, /\.editorHoverOutline[^}]*:hover::after[\s\S]*box-shadow:[^;]*--shadow-editor-element/);
  assert.match(textCss, /height: calc\(1\.2em \+ 4px\)/);
  assert.match(textCss, /pointer-events: none/);
  assert.match(textareaCss, /\.editorHoverOutline[^}]*:hover[\s\S]*box-shadow:[^;]*--shadow-editor-element/);
  assert.match(textCss, /\.editorHoverOutline:not\(\.editing\):hover::after/);
  assert.match(textareaCss, /\.editorHoverOutline:hover/);
  assert.match(textCss, /\.textElement\[data-placeholder\]:empty\s*\{[^}]*min-height:\s*1\.2em[^}]*margin-top:\s*-\.67em[^}]*padding-top:\s*\.67em/s);
});
