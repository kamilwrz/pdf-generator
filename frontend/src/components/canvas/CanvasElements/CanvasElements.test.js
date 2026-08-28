import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every structurally compatible sidebar template exposes lane-transfer controls", async () => {
  const source = await readFile(new URL("./CanvasElements.jsx", import.meta.url), "utf8");

  // The editor control is intentionally gated by template ID because transfer
  // restyles a section for the destination lane. These generators emit the
  // same sidebar-chrome/content metadata, so omitting any ID would leave the
  // tested transfer utility unreachable in the live editor.
  for (const templateId of ["sterling", "tessera", "slate", "vestige", "linden"]) {
    assert.match(source, new RegExp(`"${templateId}"`));
  }
  assert.match(source, /const allowLaneTransfer = LANE_TRANSFER_TEMPLATE_IDS\.has\(activeTemplateId\)/);
  assert.match(source, /resolveSectionLaneTransfer\(documentElements, section\.headingId, pageHeight\)/);
});
