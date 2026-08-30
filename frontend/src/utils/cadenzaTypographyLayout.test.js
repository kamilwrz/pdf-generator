import assert from "node:assert/strict";
import test from "node:test";

import { cadenzaTemplate } from "../templates/cadenza.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import {
  applyCadenzaRenderedHeightsLayout,
  applyCadenzaTextSizeLayout,
} from "./cadenzaTypographyLayout.js";

function withIds(elements) {
  return elements.map((element, index) => ({
    ...element,
    element_id: element.element_id || `cadenza-${index}`,
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
    assert.ok(matchingLine, `${overlay.content} stays pinned to its authored content line`);
  }
}

test("Cadenza type presets rebuild contacts and keep exact date overlays anchored", () => {
  let nextId = 0;
  const createId = () => `generated-${nextId += 1}`;
  let elements = withIds(cadenzaTemplate);

  for (const preset of ["L", "XL", "M"]) {
    elements = applyCadenzaTextSizeLayout(elements, preset, {
      spacing: DEFAULT_FLOW_SPACING,
      pageHeight: 842,
      createId,
    });
    assertOverlayAnchors(elements);
    const contactAnchor = elements.find((element) => element.contactBand?.id === "cadenza-contact");
    const appearanceAnchor = elements.find((element) => element.appearanceTemplateId === "cadenza");
    assert.ok(contactAnchor);
    assert.ok(appearanceAnchor);
    assert.equal(appearanceAnchor.appearanceSettings.textSize, preset);
  }
});

test("Cadenza batches rendered textarea heights before one structural repack", () => {
  let nextId = 0;
  const createId = () => `settled-${nextId += 1}`;
  const source = withIds(cadenzaTemplate);
  const body = source.find((element) => (
    element.flowRole === "content" && element.category === "textarea" && element.bulletList
  ));
  const nextHeading = source.find((element) => (
    element.flowRole === "section-chrome" && Number(element.top) > Number(body.top)
  ));
  assert.ok(body);
  assert.ok(nextHeading);

  const settled = applyCadenzaRenderedHeightsLayout(
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
});
