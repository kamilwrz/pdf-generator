import test from "node:test";
import assert from "node:assert/strict";
import { listContactBands } from "./contactBands.js";

const descriptor = { id: "b1", mode: "wrapping", order: ["phone", "email", "location"] };

function elements() {
  return [
    { element_id: "anchor", flowRole: "masthead-anchor", contactBandId: "b1", contactBand: descriptor, category: "text", content: "" },
    { element_id: "em-l", category: "text", contactBandId: "b1", contactChannel: "email", left: 130, top: 104, width: 90, height: 11, fontSize: 8.4 },
    { element_id: "ph-l", category: "text", contactBandId: "b1", contactChannel: "phone", left: 44, top: 104, width: 72, height: 11, fontSize: 8.4 },
    { element_id: "ph-i", category: "image", contactBandId: "b1", contactChannel: "phone", left: 28, top: 104 },
    { element_id: "other", category: "text", content: "Name", left: 44, top: 44 },
  ];
}

test("groups chips by band (canonical order) and offers every unused channel", () => {
  const [band] = listContactBands(elements());
  assert.equal(band.bandId, "b1");
  assert.deepEqual(band.chips.map((c) => c.channel), ["phone", "email"]);
  assert.deepEqual(
    band.chips.map(({ width, height }) => ({ width, height })),
    [{ width: 72, height: 11 }, { width: 90, height: 11 }],
  );
  // The `+` menu offers the full canonical set the wizard supports minus the
  // active channels — including github/website that were never generated — not
  // just the leftovers of the descriptor's generation-time order.
  assert.deepEqual(band.inactive, ["linkedin", "github", "website", "location"]);
});

test("a band without an anchor descriptor is not managed", () => {
  const els = elements().filter((e) => e.element_id !== "anchor");
  assert.deepEqual(listContactBands(els), []);
});
