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

test("repeatable grid cells mount their dedicated two-action gutter control", async () => {
  const source = await readFile(new URL("./CanvasElements.jsx", import.meta.url), "utf8");

  assert.match(source, /import GridEntryActions from '\.\.\/GridEntryActions\/GridEntryActions'/);
  assert.match(source, /listGridSectionEntryAnchors\(documentElements, pageHeight\)/);
  assert.match(source, /gridEntryAnchorsById\.get\(element\.element_id\)/);
  assert.match(source, /<GridEntryActions/);
  assert.match(source, /gutterSide=\{gridEntryAnchor\.gutterSide\}/);
  assert.match(source, /canDelete=\{gridEntryAnchor\.canDelete\}/);
});
