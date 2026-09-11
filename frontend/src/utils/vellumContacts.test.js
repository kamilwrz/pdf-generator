import assert from "node:assert/strict";
import test from "node:test";
import { vellumTemplate } from "../templates/vellum.js";
import { applyChannelAddition, applyChannelRemoval, applyChannelRelayout } from "./contactBandOps.js";
import { listContactBands } from "./contactBands.js";
import { applyVellumTextSizeLayout } from "./vellumTypographyLayout.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { applyTitleToggle } from "./mastheadIdentityOps.js";
import { hydratePersistedCanvasElement } from "./persistedCanvasElement.js";

let serial = 0;
const createId = () => `vellum-contact-test-${++serial}`;
const measure = (text, _font, size) => text.length * size * 0.52;
const source = () => vellumTemplate.map((element) => ({ ...element, element_id: createId() }));
const labels = (elements) => elements.filter((element) => element.contactChannel && element.category === "textarea")
  .sort((a, b) => a.top - b.top);

function assertContactGeometry(elements) {
  const contacts = labels(elements);
  assert.equal(listContactBands(elements)[0].chips.length, contacts.length);
  contacts.forEach((contact, index) => {
    assert.equal(contact.left, 68);
    assert.equal(contact.left + contact.width, 406);
    assert.equal(contact.autoHeight, false);
    assert.equal(contact.page, 1);
    if (index) {
      const previous = contacts[index - 1];
      assert.ok(contact.top >= previous.top + previous.height + 2);
    }
    const icon = elements.find((element) => element.category === "image" && element.contactChannel === contact.contactChannel);
    assert.equal(icon.left, 58);
    assert.equal(icon.top, contact.top);
  });
  const divider = elements.find((element) => element.id === "vellum-masthead-divider");
  const anchor = elements.find((element) => element.contactBand);
  assert.ok(contacts.every((contact) => contact.top + contact.height <= divider.top - 12));
  assert.ok(anchor.contactBand.flow.bodyTop >= divider.top + 12);
  assert.ok(anchor.contactBand.flow.bodyTop >= 152);
  const firstChrome = Math.min(...elements.filter((element) => element.flowRole === "section-chrome")
    .map((element) => (element.page - 1) * 842 + element.top));
  assert.ok(firstChrome >= anchor.contactBand.flow.bodyTop - 0.01);
}

test("Vellum keeps all six contacts, including location, in one left-aligned list", () => {
  const elements = applyChannelRelayout(source(), "vellum-contact", measure, createId).elements;
  assert.deepEqual(labels(elements).map((element) => element.contactChannel),
    ["phone", "email", "linkedin", "github", "website", "location"]);
  assertContactGeometry(elements);
});

test("Vellum wraps full addresses, repaginates body and collapses after shortening without drift", () => {
  const base = applyChannelRelayout(source(), "vellum-contact", measure, createId).elements;
  const longEmail = `${"long-address".repeat(45)}@example.com`;
  const changed = base.map((element) => element.contactChannel === "email" && element.category === "textarea"
    ? { ...element, content: longEmail } : element);
  const grown = applyChannelRelayout(changed, "vellum-contact", measure, createId).elements;
  assertContactGeometry(grown);
  const email = labels(grown).find((element) => element.contactChannel === "email");
  assert.equal(email.content, longEmail);
  assert.ok(email.height > email.lineHeight);
  assert.ok(Math.max(...grown.map((element) => element.page)) > 1);
  assert.deepEqual(grown.filter((element) => element.photoSlot), base.filter((element) => element.photoSlot));
  const original = labels(base).find((element) => element.contactChannel === "email");
  let restored = applyChannelRelayout(grown.map((element) => element.element_id === email.element_id
    ? { ...element, content: original.content } : element), "vellum-contact", measure, createId).elements;
  assertContactGeometry(restored);
  assert.equal(Math.max(...restored.map((element) => element.page)), 1);
  const stable = structuredClone(restored);
  for (let index = 0; index < 5; index++) {
    restored = applyChannelRelayout(restored, "vellum-contact", measure, createId).elements;
  }
  assert.deepEqual(restored, stable);
});

test("Vellum supports removal to empty, guided re-addition, and every typography preset", () => {
  let elements = source();
  for (const contact of labels(elements)) {
    elements = applyChannelRemoval(elements, "vellum-contact", contact.contactChannel, measure, createId).elements;
    assertContactGeometry(elements);
  }
  elements = applyChannelAddition(elements, "vellum-contact", "location", "", measure, createId).elements;
  assert.equal(labels(elements)[0].content, "");
  assert.ok(labels(elements)[0].placeholder);
  elements = applyChannelAddition(elements, "vellum-contact", "email", "sample@example.com", measure, createId).elements;
  for (const textSize of ["S", "M", "L", "XL", "M"]) {
    elements = applyVellumTextSizeLayout(elements, textSize, { spacing: DEFAULT_FLOW_SPACING, createId });
    assertContactGeometry(elements);
  }
});

test("Vellum preserves custom rhythm and the growing-band contract through reload and title toggles", () => {
  const spacing = { stack: 5, record: 13, section: 32, after_rule: 10 };
  const custom = applyFlowSpacing(source(), spacing);
  const loaded = custom.map((element) => hydratePersistedCanvasElement({
    ...element, extra_properties: structuredClone(element),
  }));
  let elements = applyChannelRelayout(loaded.map((element) => element.contactChannel === "email" && element.category === "textarea"
    ? { ...element, content: `${"address".repeat(25)}@example.com` } : element), "vellum-contact", measure, createId).elements;
  assertContactGeometry(elements);
  assert.deepEqual(elements.find((element) => element.contactBand).contactBand.flow.spacing, spacing);
  const rowGap = (list) => {
    const summary = list.find((element) => element.appearanceColorRole === "summaryText");
    const next = list.filter((element) => element.flowRole === "section-chrome" && element.top > summary.top)
      .sort((a, b) => a.top - b.top)[0];
    return next.top - summary.top - summary.height;
  };
  assert.ok(Math.abs(rowGap(elements) - rowGap(custom)) < 0.01);
  for (const contact of labels(elements).filter((element) => element.contactChannel !== "location")) {
    elements = applyChannelRemoval(elements, "vellum-contact", contact.contactChannel, measure, createId).elements;
  }
  for (let index = 0; index < 2; index++) {
    elements = applyTitleToggle(elements, "masthead-main", createId).elements;
    elements = applyChannelRelayout(elements, "vellum-contact", measure, createId).elements;
    assertContactGeometry(elements);
  }
});
