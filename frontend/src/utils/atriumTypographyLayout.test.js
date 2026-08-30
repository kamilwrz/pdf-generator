import assert from "node:assert/strict";
import test from "node:test";

import { atriumTemplate } from "../templates/atrium.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import { listDocumentSections, sectionElementIds } from "./sectionStructure.js";
import {
  applyAtriumRenderedHeightsLayout,
  applyAtriumTextSizeLayout,
} from "./atriumTypographyLayout.js";

const PAGE_HEIGHT = 842;

function withIds(elements) {
  return elements.map((element, index) => ({
    ...element,
    element_id: element.element_id || `atrium-${index}`,
  }));
}

function absTop(element) {
  return ((Number(element.page) || 1) - 1) * PAGE_HEIGHT + Number(element.top || 0);
}

function photoGeometry(elements) {
  const photo = elements.find((element) => (
    element.id === "atrium-photo-glyph" || element.id === "profile-photo"
  ));
  return [photo.left, photo.top, photo.width, photo.height, photo.page || 1];
}

/**
 * Guard Atrium's previously repaired section-membership contract while type
 * presets repack its single editorial lane.
 */
function assertHeadingsStayWithBodies(elements, label) {
  const sections = listDocumentSections(elements, PAGE_HEIGHT);
  assert.ok(sections.length > 0, `${label}: document exposes sections`);
  for (const section of sections) {
    const ids = sectionElementIds(elements, section.headingId, PAGE_HEIGHT);
    const heading = elements.find((element) => element.element_id === section.headingId);
    const bodies = [...ids]
      .map((id) => elements.find((element) => element.element_id === id))
      .filter((element) => (
        element
        && element.element_id !== section.headingId
        && element.flowRole !== "section-chrome"
        && ["text", "textarea"].includes(element.category)
      ));
    assert.ok(bodies.length > 0, `${label}: ${section.title} retains its body`);
    const firstBodyTop = Math.min(...bodies.map(absTop));
    const gap = firstBodyTop - absTop(heading);
    assert.ok(gap > 0 && gap < 80, `${label}: ${section.title} body gap is ${gap}`);
  }
}

function assertContactsClearMastheadRule(elements, label) {
  const contactIcons = elements.filter((element) => (
    element.category === "image" && element.contactBandId === "contact-main"
  ));
  const mastheadRules = elements.filter((element) => (
    element.category === "line" && element.flowRole === "masthead"
  ));
  assert.ok(contactIcons.length > 0);
  assert.ok(mastheadRules.length > 0);
  const contactBottom = Math.max(...contactIcons.map((element) => (
    Number(element.top) + Number(element.height)
  )));
  const ruleTop = Math.min(...mastheadRules.map((element) => Number(element.top)));
  assert.ok(ruleTop - contactBottom >= 12, `${label}: contacts retain rule clearance`);
}

test("Atrium type presets rebuild contacts without moving its portrait or linear chrome", () => {
  let nextId = 0;
  const createId = () => `generated-${nextId += 1}`;
  let elements = withIds(atriumTemplate);
  const originalPhoto = photoGeometry(elements);
  const originalMastheadRules = elements
    .filter((element) => element.category === "line" && element.flowRole === "masthead")
    .map((element) => [element.left, element.top, element.width, element.height]);

  for (const preset of ["L", "XL", "M"]) {
    elements = applyAtriumTextSizeLayout(elements, preset, {
      spacing: DEFAULT_FLOW_SPACING,
      pageHeight: PAGE_HEIGHT,
      createId,
    });
    const contactAnchor = elements.find((element) => element.contactBand?.id === "contact-main");
    const appearanceAnchor = elements.find((element) => element.appearanceTemplateId === "atrium");
    const contactMembers = elements.filter((element) => (
      element.contactBandId === "contact-main" && element.contactChannel
    ));
    const mastheadRules = elements
      .filter((element) => element.category === "line" && element.flowRole === "masthead")
      .map((element) => [element.left, element.top, element.width, element.height]);

    assert.ok(contactAnchor);
    assert.ok(appearanceAnchor);
    assert.equal(appearanceAnchor.appearanceSettings.textSize, preset);
    assert.equal(contactMembers.length, 12);
    assert.deepEqual(photoGeometry(elements), originalPhoto);
    assert.deepEqual(mastheadRules, originalMastheadRules);
    assertContactsClearMastheadRule(elements, preset);
    assertHeadingsStayWithBodies(elements, preset);
  }
});

test("Atrium batches rendered heights before one document-wide structural pack", () => {
  let nextId = 0;
  const createId = () => `settled-${nextId += 1}`;
  const source = withIds(atriumTemplate);
  const summary = source.find((element) => (
    element.category === "textarea"
    && element.flowRole === "content"
    && !element.flowGroup
  ));
  const nextHeading = source.find((element) => (
    element.flowRole === "section-chrome"
    && element.category === "text"
    && absTop(element) > absTop(summary)
  ));
  const originalPhoto = photoGeometry(source);
  assert.ok(summary);
  assert.ok(nextHeading);

  const settled = applyAtriumRenderedHeightsLayout(
    source,
    new Map([[summary.element_id, Number(summary.height) + 90]]),
    { spacing: DEFAULT_FLOW_SPACING, pageHeight: PAGE_HEIGHT, createId },
  );
  const changedSummary = settled.find((element) => element.element_id === summary.element_id);
  const changedHeading = settled.find((element) => element.element_id === nextHeading.element_id);

  assert.ok(Number(changedSummary.height) >= Number(summary.height) + 90);
  assert.ok(absTop(changedHeading) >= absTop(changedSummary) + Number(changedSummary.height));
  assert.deepEqual(photoGeometry(settled), originalPhoto);
  assertHeadingsStayWithBodies(settled, "rendered heights");
  assert.equal(
    applyAtriumRenderedHeightsLayout(
      source,
      new Map(),
      { spacing: DEFAULT_FLOW_SPACING, pageHeight: PAGE_HEIGHT, createId },
    ),
    source,
  );
});
