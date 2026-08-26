import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sterlingTemplate } from "../templates/sterling.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import { contentMaxPage } from "./structureOperation.js";
import { applySterlingTextSizeLayout } from "./sterlingTypographyLayout.js";

function withIds(elements) {
  return elements.map((element, index) => ({
    ...element,
    element_id: element.element_id || `sterling-${index}`,
  }));
}

function textHeight(element) {
  const height = Number(element.height);
  return Number.isFinite(height) && height > 0
    ? height
    : Number(element.fontSize || 0) * 1.35;
}

function textWidth(element) {
  const width = Number(element.width);
  return Number.isFinite(width) && width > 0
    ? width
    : String(element.content || "").length * Number(element.fontSize || 0) * 0.56;
}

function overlappingFlowText(elements) {
  const text = elements.filter((element) => (
    ["text", "textarea"].includes(element.category)
    && !element.fixedToPage
    && element.flowRole !== "masthead"
  ));
  const collisions = [];
  for (let leftIndex = 0; leftIndex < text.length; leftIndex += 1) {
    const left = text[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < text.length; rightIndex += 1) {
      const right = text[rightIndex];
      if ((left.page ?? 1) !== (right.page ?? 1)) continue;
      const overlapsX = Number(left.left) < Number(right.left) + textWidth(right)
        && Number(right.left) < Number(left.left) + textWidth(left);
      const overlapsY = Number(left.top) < Number(right.top) + textHeight(right)
        && Number(right.top) < Number(left.top) + textHeight(left);
      if (overlapsX && overlapsY) {
        collisions.push([left.content, right.content]);
      }
    }
  }
  return collisions;
}

describe("Sterling typography layout", () => {
  it("packs all text lanes without collisions after growing and restoring type", () => {
    let nextId = 0;
    const createId = () => `generated-${nextId += 1}`;
    let elements = withIds(sterlingTemplate);

    for (const preset of ["L", "XL", "M"]) {
      elements = applySterlingTextSizeLayout(elements, preset, {
        spacing: DEFAULT_FLOW_SPACING,
        pageHeight: 842,
        createId,
      });
      assert.deepEqual(overlappingFlowText(elements), [], `${preset} keeps text separated`);
    }

    assert.equal(contentMaxPage(elements), 1);
  });
});
