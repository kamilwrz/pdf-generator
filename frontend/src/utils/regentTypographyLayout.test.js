import assert from "node:assert/strict";
import test from "node:test";

import { regentTemplate } from "../templates/regent.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import {
  applyRegentRenderedHeightsLayout,
  applyRegentTextSizeLayout,
} from "./regentTypographyLayout.js";

function withIds(elements) {
  return elements.map((element, index) => ({
    ...element,
    element_id: element.element_id || `regent-${index}`,
  }));
}

test("Regent type presets rebuild contacts and persist the selected size", () => {
  let nextId = 0;
  const createId = () => `generated-${nextId += 1}`;
  let elements = withIds(regentTemplate);

  for (const preset of ["L", "XL", "M"]) {
    elements = applyRegentTextSizeLayout(elements, preset, {
      spacing: DEFAULT_FLOW_SPACING,
      pageHeight: 842,
      createId,
    });
    const contactAnchor = elements.find((element) => element.contactBand?.id === "regent-contact");
    const appearanceAnchor = elements.find((element) => element.appearanceTemplateId === "regent");
    assert.ok(contactAnchor);
    assert.ok(appearanceAnchor);
    assert.equal(appearanceAnchor.appearanceSettings.textSize, preset);
  }
});

test("Regent batches browser heights before moving the following section", () => {
  let nextId = 0;
  const createId = () => `settled-${nextId += 1}`;
  const source = withIds(regentTemplate);
  const body = source.find((element) => (
    element.flowRole === "content" && element.category === "textarea" && element.bulletList
  ));
  const nextHeading = source.find((element) => (
    element.flowRole === "section-chrome" && Number(element.top) > Number(body.top)
  ));
  assert.ok(body);
  assert.ok(nextHeading);

  const settled = applyRegentRenderedHeightsLayout(
    source,
    new Map([[body.element_id, Number(body.height) + 44]]),
    { spacing: DEFAULT_FLOW_SPACING, pageHeight: 842, createId },
  );
  const changedBody = settled.find((element) => element.element_id === body.element_id);
  const changedHeading = settled.find((element) => element.element_id === nextHeading.element_id);

  assert.ok(Number(changedBody.height) >= Number(body.height) + 44);
  assert.ok(
    (changedHeading.page - 1) * 842 + changedHeading.top
      >= (changedBody.page - 1) * 842 + changedBody.top + changedBody.height,
  );
});
