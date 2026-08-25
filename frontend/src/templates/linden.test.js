import test from "node:test";
import assert from "node:assert/strict";
import { lindenTemplate } from "./linden.js";
import { applyTitleToggle } from "../utils/mastheadIdentityOps.js";
import { transferSectionLane } from "../utils/transferSectionLane.js";
import { DEFAULT_FLOW_SPACING } from "../utils/flowSpacing.js";

test("Linden starter exposes the complete editorial structure", () => {
  const frame = lindenTemplate.find((element) => element.photoSlot === "frame");
  const name = lindenTemplate.find((element) => element.mastheadRole === "name");
  const title = lindenTemplate.find((element) => element.mastheadRole === "title");
  const summary = lindenTemplate.find((element) => element.content === "PODSUMOWANIE ZAWODOWE");

  assert.ok(frame);
  assert.equal(frame.photoShape, "rect");
  assert.ok(frame.height > frame.width);
  assert.equal(name.textTransform, "uppercase");
  assert.equal(name.fontFamily, "CormorantGaramond");
  assert.equal(title.italic, true);
  assert.equal(summary.flowRole, "section-chrome");
  assert.ok(lindenTemplate.some((element) => element.flowRole === "sidebar-chrome"));
  assert.ok(lindenTemplate.some((element) => element.flowGroup));
});

test("Linden contact band reserves the rail and uses dedicated icons", () => {
  const anchor = lindenTemplate.find((element) => element.contactBandId === "linden-contact" && element.contactBand);
  const contactIcons = lindenTemplate.filter(
    (element) => element.contactBandId === "linden-contact" && element.category === "image",
  );

  assert.equal(anchor.contactBand.mode, "stacked");
  assert.equal(anchor.contactBand.sidebarSectionGap, 32);
  assert.equal(anchor.contactBand.photoHidden.anchor.startY, 64);
  assert.ok(contactIcons.length >= 4);
  assert.ok(contactIcons.every((element) => element.src.includes("/iconic/linden/")));
});

test("Linden job-position toggle keeps the contact rail and body stationary", () => {
  const source = lindenTemplate.map((element, index) => ({
    ...element,
    element_id: `linden-${index}`,
  }));
  const title = source.find((element) => element.mastheadRole === "title");
  const summary = source.find((element) => element.content === "PODSUMOWANIE ZAWODOWE");
  const contact = source.find((element) => element.contactChannel === "phone" && element.category === "text");

  const hidden = applyTitleToggle(source, "linden-masthead", () => "new-title").elements;
  assert.equal(hidden.some((element) => element.element_id === title.element_id), false);
  assert.equal(hidden.some((element) => element.mastheadRole === "title-decoration"), false);
  assert.equal(hidden.find((element) => element.element_id === summary.element_id).top, summary.top);
  assert.equal(hidden.find((element) => element.element_id === contact.element_id).top, contact.top);

  const restored = applyTitleToggle(hidden, "linden-masthead", () => "restored-title").elements;
  assert.ok(restored.some((element) => element.mastheadRole === "title"));
  assert.ok(restored.some((element) => element.mastheadRole === "title-decoration"));
});

test("Linden sidebar sections transfer through the shared structural editor", () => {
  const source = lindenTemplate.map((element, index) => ({
    ...element,
    element_id: `linden-transfer-${index}`,
  }));
  const education = source.find((element) => (
    element.content === "WYKSZTAŁCENIE" && element.flowRole === "sidebar-chrome"
  ));
  const moved = transferSectionLane(source, education.element_id, 842, DEFAULT_FLOW_SPACING);
  const mainHeading = moved.find((element) => element.element_id === education.element_id);

  assert.equal(mainHeading.flowRole, "section-chrome");
  assert.equal(mainHeading.flowLane, undefined);
  assert.ok(mainHeading.left >= 210);

  const restored = transferSectionLane(moved, education.element_id, 842, DEFAULT_FLOW_SPACING);
  const sidebarHeading = restored.find((element) => element.element_id === education.element_id);
  assert.equal(sidebarHeading.flowRole, "sidebar-chrome");
  assert.equal(sidebarHeading.flowLane, "sidebar");
});
