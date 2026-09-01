import assert from "node:assert/strict";
import test from "node:test";

import { aureliaTemplate } from "./aurelia.js";

test("Aurelia keeps a framed one-column editorial identity", () => {
  const frame = aureliaTemplate.find((element) => element.id === "aurelia-masthead-frame");
  assert.equal(frame?.category, "rectangle");
  assert.deepEqual(
    [frame?.left, frame?.top, frame?.width, frame?.height],
    [58, 38, 479, 104],
  );
  assert.equal(frame?.backgroundColor, "#98884D");

  const name = aureliaTemplate.find((element) => element.mastheadRole === "name");
  const title = aureliaTemplate.find((element) => element.mastheadRole === "title");
  assert.equal(name?.fontFamily, "Montserrat");
  assert.equal(name?.align, "center");
  assert.equal(name?.textTransform, "uppercase");
  assert.equal(title?.align, "center");

  const headings = aureliaTemplate.filter((element) => (
    element.flowRole === "section-chrome"
    && element.category === "text"
    && element.content
  ));
  assert.ok(headings.length >= 5);
  assert.ok(headings.every((element) => element.width === 479 && element.align === "center"));
  assert.equal(
    aureliaTemplate.some((element) => element.flowLane === "sidebar"),
    false,
  );
});

test("Aurelia uses managed icons and exact record overlays", () => {
  const icons = aureliaTemplate.filter((element) => element.category === "image");
  assert.ok(icons.length > 0);
  assert.ok(icons.every((element) => element.src.includes("/iconic/aurelia-gilded/")));

  const overlays = aureliaTemplate.filter((element) => element.flowRole === "record-overlay");
  assert.ok(overlays.length > 0);
  for (const overlay of overlays) {
    const anchor = aureliaTemplate.find((element) => (
      element.category === "textarea"
      && element.flowRole === "content"
      && element.flowGroup === overlay.flowGroup
      && element.top === overlay.top
    ));
    assert.ok(anchor, `${overlay.content} must share an exact content anchor`);
    assert.equal(overlay.align, "right");
    assert.equal(overlay.autoHeight, false);
  }

  const recordDescriptions = aureliaTemplate.filter((element) => (
    element.flowRole === "content" && element.bulletList && element.width === 479
  ));
  assert.ok(recordDescriptions.length >= 4);
  assert.ok(recordDescriptions.every((element) => element.left === 58));
});
