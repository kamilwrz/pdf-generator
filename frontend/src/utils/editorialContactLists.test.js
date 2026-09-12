import { listDocumentSections } from "./sectionStructure.js";
import { reflowTextareaHeight } from "./textareaReflow.js";
import assert from "node:assert/strict";
import test from "node:test";
import { regentTemplate } from "../templates/regent.js";
import { meridianTemplate } from "../templates/meridian.js";
import { applyRegentPalette, REGENT_PALETTES } from "./regentAppearance.js";
import { applyMeridianPalette, MERIDIAN_PALETTES } from "./meridianAppearance.js";
import { applyRegentTextSizeLayout } from "./regentTypographyLayout.js";
import { applyMeridianTextSizeLayout } from "./meridianTypographyLayout.js";
import { applyChannelAddition, applyChannelRemoval, applyChannelRelayout } from "./contactBandOps.js";
import { applyTitleToggle } from "./mastheadIdentityOps.js";
import { normalizeCommittedDocumentSnapshot } from "./documentSnapshotCommit.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";

let serial = 0;
const createId = () => `editorial-${++serial}`;
const channels = ["phone", "email", "linkedin", "github", "website", "location"];
const labels = (elements) => elements.filter((element) => element.contactChannel && element.category === "textarea")
  .sort((a, b) => a.top - b.top);

function assertGeometry(elements, theme) {
  const contacts = labels(elements);
  const band = elements.find((element) => element.contactBand).contactBand;
  const divider = elements.find((element) => element.id === band.flow.dividerId);
  for (const [index, label] of contacts.entries()) {
    const icon = elements.find((element) => element.category === "image" && element.contactChannel === label.contactChannel);
    assert.equal(label.left, 76);
    assert.equal(label.width, 457);
    assert.equal(label.autoHeight, false);
    assert.equal(icon.width, 11);
    assert.equal(icon.height, 11);
    assert.equal(icon.alignWithText, false);
    assert.equal(icon.left + icon.width + 3, label.left);
    assert.ok(Math.abs(icon.top + 5.5 - label.top - label.height / 2) < 0.001);
    assert.ok(icon.src.includes(`/iconic/${theme}/`));
    if (index) assert.ok(label.top >= contacts[index - 1].top + contacts[index - 1].height + 2);
    assert.ok(label.top + label.height <= divider.top - 10);
  }
  const name = elements.find((element) => element.mastheadRole === "name");
  const title = elements.find((element) => element.mastheadRole === "title");
  assert.equal(name.top, 24);
  if (title) {
    assert.ok(title.top >= name.top + name.height + 3.99);
    assert.ok(band.anchor.startY >= title.top + title.height + 7.99);
  } else assert.ok(band.anchor.startY >= name.top + name.height + 7.99);
  assert.ok(band.flow.bodyTop >= divider.top + 14);
  for (const heading of elements.filter((element) => element.flowRole === "section-chrome")) {
    assert.ok((heading.page - 1) * 842 + heading.top >= band.flow.bodyTop - 0.01);
  }
}

for (const [id, template, palettes, recolor, resize] of [
  ["regent", regentTemplate, REGENT_PALETTES, applyRegentPalette, applyRegentTextSizeLayout],
  ["meridian", meridianTemplate, MERIDIAN_PALETTES, applyMeridianPalette, applyMeridianTextSizeLayout],
]) {
  test(`${id}: every palette preserves list geometry through additions, wrapping, typography, title toggles and reload`, () => {
    for (const palette of palettes) {
      let elements = recolor(template.map((element) => ({ ...element, element_id: createId() })), palette.id);
      for (const channel of channels) elements = applyChannelAddition(elements, `${id}-contact`, channel, "", null, createId).elements;
      assert.deepEqual(labels(elements).map((element) => element.contactChannel), channels);
      elements = elements.map((element) => element.category === "textarea" && element.contactChannel === "email"
        ? { ...element, content: `${"long-address".repeat(35)}@example.com` } : element);
      for (const preset of ["S", "L", "XL", "M"]) {
        elements = resize(elements, preset, { spacing: DEFAULT_FLOW_SPACING, createId });
        assertGeometry(elements, palette.iconTheme);
        assert.ok(labels(elements).find((element) => element.contactChannel === "email").height > 11);
      }
      for (let toggle = 0; toggle < 2; toggle++) {
        elements = applyTitleToggle(elements, "masthead-main", createId).elements;
        elements = resize(elements, "XL", { spacing: DEFAULT_FLOW_SPACING, createId });
        assertGeometry(elements, palette.iconTheme);
      }
      for (const channel of channels) elements = applyChannelRemoval(elements, `${id}-contact`, channel, null, createId).elements;
      for (const channel of channels) elements = applyChannelAddition(elements, `${id}-contact`, channel, "", null, createId).elements;
      assertGeometry(elements, palette.iconTheme);
      elements = normalizeCommittedDocumentSnapshot({ elements, pdfId: 1, templateId: id }).elements;
      assertGeometry(elements, palette.iconTheme);
      const once = applyChannelRelayout(elements, `${id}-contact`, null, createId).elements;
      assert.deepEqual(applyChannelRelayout(once, `${id}-contact`, null, createId).elements, once);
    }
  });
}

for (const [id, template] of [["regent", regentTemplate], ["meridian", meridianTemplate]]) {
  test(`${id}: shared textarea reflow owns all header measurements and repairs saved overlaps`, () => {
    let elements = template.map((element) => ({ ...element, element_id: createId() }));
    for (const field of elements.filter((element) => element.mastheadRole || element.contactChannel && element.category === "textarea")) {
      for (const content of ["", "Jan", "Jan Kowalski", "Long identity ".repeat(12), ""]) {
        elements = elements.map((element) => element.element_id === field.element_id ? { ...element, content } : element);
        for (const height of [0, 47, 88, 41]) {
          elements = reflowTextareaHeight(elements, field.element_id, height, 842, { pageTop: 66, bottomMargin: 72 }).elements;
          const floor = elements.find((element) => element.contactBand).contactBand.flow.bodyTop;
          for (const section of listDocumentSections(elements)) assert.ok(section.startAbs >= floor - 0.01);
        }
      }
    }
    elements = elements.map((element) => element.flowRole === "section-chrome" ? { ...element, top: element.top - 90 } : element);
    const name = elements.find((element) => element.mastheadRole === "name");
    elements = reflowTextareaHeight(elements, name.element_id, name.height, 842).elements;
    const floor = elements.find((element) => element.contactBand).contactBand.flow.bodyTop;
    for (const section of listDocumentSections(elements)) assert.ok(section.startAbs >= floor - 0.01);
  });
}
