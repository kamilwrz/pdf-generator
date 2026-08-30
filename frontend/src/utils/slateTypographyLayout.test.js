import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { slateTemplate } from "../templates/slate.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import { contentMaxPage } from "./structureOperation.js";
import {
  applySlateRenderedHeightsLayout,
  applySlateTextSizeLayout,
} from "./slateTypographyLayout.js";

function withIds(elements) {
  return elements.map((element, index) => ({
    ...element,
    element_id: element.element_id || `slate-${index}`,
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
      if (overlapsX && overlapsY) collisions.push([left.content, right.content]);
    }
  }
  return collisions;
}

describe("Slate typography layout", () => {
  it("packs main and sidebar lanes without collisions after growing and restoring type", () => {
    let nextId = 0;
    const createId = () => `generated-${nextId += 1}`;
    let elements = withIds(slateTemplate);

    for (const preset of ["L", "XL", "M"]) {
      elements = applySlateTextSizeLayout(elements, preset, {
        spacing: DEFAULT_FLOW_SPACING,
        pageHeight: 842,
        createId,
      });
      assert.deepEqual(overlappingFlowText(elements), [], `${preset} keeps text separated`);
    }

    assert.ok(contentMaxPage(elements) >= 1);
  });

  it("batch-packs browser heights so a grown record moves the next section", () => {
    let nextId = 0;
    const createId = () => `settled-${nextId += 1}`;
    const elements = [
      {
        element_id: "experience-heading", category: "text", content: "DOŚWIADCZENIE",
        flowRole: "section-chrome", left: 244, top: 180, width: 230, fontSize: 8.1, page: 1,
      },
      {
        element_id: "job-title", category: "textarea", content: "Senior Analyst",
        flowRole: "content", flowGroup: "job", autoHeight: true,
        left: 218, top: 214, width: 329, height: 14, fontSize: 10.4, lineHeight: 13.4, page: 1,
      },
      {
        element_id: "job-body", category: "textarea", content: "Long description",
        flowRole: "content", flowGroup: "job", autoHeight: true,
        left: 218, top: 234, width: 329, height: 100, fontSize: 9, lineHeight: 13.2, page: 1,
      },
      {
        element_id: "education-heading", category: "text", content: "WYKSZTAŁCENIE",
        flowRole: "section-chrome", left: 244, top: 300, width: 230, fontSize: 8.1, page: 1,
      },
      {
        element_id: "degree", category: "textarea", content: "Finance MA",
        flowRole: "content", flowGroup: "education", autoHeight: true,
        left: 218, top: 334, width: 329, height: 14, fontSize: 10.2, lineHeight: 13, page: 1,
      },
    ];

    const settled = applySlateRenderedHeightsLayout(
      elements,
      new Map([["job-body", 100]]),
      { spacing: DEFAULT_FLOW_SPACING, pageHeight: 842, createId },
    );
    const body = settled.find((element) => element.element_id === "job-body");
    const education = settled.find((element) => element.element_id === "education-heading");
    assert.ok(
      (education.page - 1) * 842 + education.top
        >= (body.page - 1) * 842 + body.top + body.height,
    );
    assert.deepEqual(overlappingFlowText(settled), []);
  });
});
