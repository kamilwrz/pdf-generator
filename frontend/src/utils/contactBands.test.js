import test from "node:test";
import assert from "node:assert/strict";
import { listContactBands } from "./contactBands.js";

const descriptor = { id: "b1", mode: "wrapping", order: ["phone", "email", "location"] };

function elements() {
  return [
    { element_id: "anchor", flowRole: "masthead-anchor", contactBandId: "b1", contactBand: descriptor, category: "text", content: "" },
    { element_id: "em-l", category: "text", contactBandId: "b1", contactChannel: "email", left: 130, top: 104, fontSize: 8.4 },
    { element_id: "ph-l", category: "text", contactBandId: "b1", contactChannel: "phone", left: 44, top: 104, fontSize: 8.4 },
    { element_id: "ph-i", category: "image", contactBandId: "b1", contactChannel: "phone", left: 28, top: 104 },
    { element_id: "other", category: "text", content: "Name", left: 44, top: 44 },
  ];
}

test("groups chips by band, sorted into descriptor order, with inactive list", () => {
  const [band] = listContactBands(elements());
  assert.equal(band.bandId, "b1");
  assert.deepEqual(band.chips.map((c) => c.channel), ["phone", "email"]);
  assert.deepEqual(band.inactive, ["location"]);
});

test("a band without an anchor descriptor is not managed", () => {
  const els = elements().filter((e) => e.element_id !== "anchor");
  assert.deepEqual(listContactBands(els), []);
});
