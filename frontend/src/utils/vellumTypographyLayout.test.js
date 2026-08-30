import assert from "node:assert/strict";
import test from "node:test";

import { vellumTemplate } from "../templates/vellum.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import {
  applyVellumRenderedHeightsLayout,
  applyVellumTextSizeLayout,
} from "./vellumTypographyLayout.js";

function withIds(elements) {
  return elements.map((element, index) => ({
    ...element,
    element_id: element.element_id || `vellum-${index}`,
  }));
}

function assertOverlayAnchors(elements) {
  const overlays = elements.filter((element) => element.flowRole === "record-overlay");
  assert.ok(overlays.length > 0);
  for (const overlay of overlays) {
    const matchingLine = elements.find((element) => (
      element.category === "textarea"
      && element.flowRole === "content"
      && element.flowGroup === overlay.flowGroup
      && element.page === overlay.page
      && Math.abs(Number(element.top) - Number(overlay.top)) < 0.01
    ));
    assert.ok(matchingLine, `${overlay.content} stays pinned to its content line`);
  }
}

function assertSummaryFieldFollowsCopy(elements) {
  const background = elements.find((element) => element.id === "vellum-summary-background");
  const summary = elements.find((element) => element.appearanceColorRole === "summaryText");
  assert.ok(background);
  assert.ok(summary);
  assert.equal(background.page, summary.page);
  assert.ok(Number(background.top) <= Number(summary.top));
  assert.ok(Number(background.top) + Number(background.height) >= Number(summary.top) + Number(summary.height));
}

test("Vellum type presets rebuild contacts and preserve portrait, field, and date contracts", () => {
  let nextId = 0;
  const createId = () => `generated-${nextId += 1}`;
  let elements = withIds(vellumTemplate);
  const portraitGeometry = elements
    .filter((element) => element.photoSlot)
    .map((element) => [element.id, element.left, element.top, element.width, element.height]);

  for (const preset of ["L", "XL", "M"]) {
    elements = applyVellumTextSizeLayout(elements, preset, {
      spacing: DEFAULT_FLOW_SPACING,
      pageHeight: 842,
      createId,
    });
    assertOverlayAnchors(elements);
    assertSummaryFieldFollowsCopy(elements);
    const contactAnchor = elements.find((element) => element.contactBand?.id === "vellum-contact");
    const appearanceAnchor = elements.find((element) => element.appearanceTemplateId === "vellum");
    const nextPortraitGeometry = elements
      .filter((element) => element.photoSlot)
      .map((element) => [element.id, element.left, element.top, element.width, element.height]);
    assert.ok(contactAnchor);
    assert.ok(appearanceAnchor);
    assert.equal(appearanceAnchor.appearanceSettings.textSize, preset);
    assert.deepEqual(nextPortraitGeometry, portraitGeometry);
  }
});

test("Vellum batches rendered textarea heights before one structural repack", () => {
  let nextId = 0;
  const createId = () => `settled-${nextId += 1}`;
  const source = withIds(vellumTemplate);
  const body = source.find((element) => (
    element.flowRole === "content" && element.category === "textarea" && element.bulletList
  ));
  const nextHeading = source.find((element) => (
    element.flowRole === "section-chrome" && Number(element.top) > Number(body.top)
  ));
  assert.ok(body);
  assert.ok(nextHeading);

  const settled = applyVellumRenderedHeightsLayout(
    source,
    new Map([[body.element_id, Number(body.height) + 40]]),
    { spacing: DEFAULT_FLOW_SPACING, pageHeight: 842, createId },
  );
  const changedBody = settled.find((element) => element.element_id === body.element_id);
  const changedHeading = settled.find((element) => element.element_id === nextHeading.element_id);

  assert.ok(Number(changedBody.height) >= Number(body.height) + 40);
  assert.ok(
    (changedHeading.page - 1) * 842 + changedHeading.top
      >= (changedBody.page - 1) * 842 + changedBody.top + changedBody.height,
  );
  assertOverlayAnchors(settled);
  assertSummaryFieldFollowsCopy(settled);
});
