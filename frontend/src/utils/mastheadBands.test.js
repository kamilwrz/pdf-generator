import test from "node:test";
import assert from "node:assert/strict";
import { listMastheadBands } from "./mastheadBands.js";

function doc(withTitle = true) {
  const els = [
    { element_id: "mid", flowRole: "masthead-anchor", mastheadBandId: "masthead-main",
      mastheadIdentity: { id: "masthead-main", title: { present: withTitle } } },
    { element_id: "name", mastheadRole: "name", mastheadBandId: "masthead-main",
      left: 44, top: 44, fontSize: 23, textTransform: "uppercase" },
  ];
  if (withTitle) {
    els.push({ element_id: "title", mastheadRole: "title", mastheadBandId: "masthead-main",
      left: 44, top: 80, fontSize: 11 });
  }
  return els;
}

test("groups a managed identity block with name + title", () => {
  const [band] = listMastheadBands(doc());
  assert.equal(band.bandId, "masthead-main");
  assert.equal(band.name.uppercase, true);
  assert.equal(band.title.elementId, "title");
  assert.equal(band.titlePresent, true);
});

test("reports titlePresent=false when the title is hidden", () => {
  const [band] = listMastheadBands(doc(false));
  assert.equal(band.title, null);
  assert.equal(band.titlePresent, false);
});

test("skips a block with no descriptor anchor (legacy)", () => {
  const legacy = [{ element_id: "n", mastheadRole: "name", mastheadBandId: "x", left: 0, top: 0 }];
  assert.equal(listMastheadBands(legacy).length, 0);
});
