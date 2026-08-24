import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Cadenza exposes sidebar-to-main section transfer controls", async () => {
  const source = await readFile(new URL("./CanvasElements.jsx", import.meta.url), "utf8");

  // The editor control is intentionally gated by template ID because transfer
  // restyles a section for the destination lane. Cadenza emits the same
  // sidebar-chrome/content metadata as Sterling, so hiding this ID would make
  // a valid transfer utility unreachable to the user.
  assert.match(source, /"cadenza"/);
  assert.match(source, /const allowLaneTransfer = LANE_TRANSFER_TEMPLATE_IDS\.has\(activeTemplateId\)/);
  assert.match(source, /resolveSectionLaneTransfer\(documentElements, section\.headingId, pageHeight\)/);
});
