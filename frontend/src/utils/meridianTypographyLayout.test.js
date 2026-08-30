import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { meridianTemplate } from "../templates/meridian.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import { contentMaxPage } from "./structureOperation.js";
import {
  applyMeridianRenderedHeightsLayout,
  applyMeridianTextSizeLayout,
} from "./meridianTypographyLayout.js";

function withIds(elements) {
  return elements.map((element, index) => ({
    ...element,
    element_id: element.element_id || `meridian-${index}`,
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
    assert.ok(matchingLine, `${overlay.content} remains pinned to a real content line`);
  }
}

describe("Meridian typography layout", () => {
  it("packs the letterhead lane and keeps record overlays anchored after type changes", () => {
    let nextId = 0;
    const createId = () => `generated-${nextId += 1}`;
    let elements = withIds(meridianTemplate);

    for (const preset of ["L", "XL", "M"]) {
      elements = applyMeridianTextSizeLayout(elements, preset, {
        spacing: DEFAULT_FLOW_SPACING,
        pageHeight: 842,
        createId,
      });
      assert.deepEqual(overlappingFlowText(elements), [], `${preset} keeps text separated`);
      assertOverlayAnchors(elements);
    }

    assert.ok(contentMaxPage(elements) >= 1);
  });

  it("batch-packs browser heights so a grown record moves the next section", () => {
    let nextId = 0;
    const createId = () => `settled-${nextId += 1}`;
    const elements = [
      {
        element_id: "experience-heading", category: "text", content: "DOŚWIADCZENIE",
        flowRole: "section-chrome", left: 62, top: 180, width: 250, fontSize: 8.2, page: 1,
      },
      {
        element_id: "job-title", category: "textarea", content: "Senior Consultant",
        flowRole: "content", flowGroup: "job", autoHeight: true,
        left: 62, top: 214, width: 329, height: 13, fontSize: 10.3, lineHeight: 13, page: 1,
      },
      {
        element_id: "job-period", category: "textarea", content: "2022 – obecnie",
        flowRole: "record-overlay", flowGroup: "job", autoHeight: false,
        left: 403, top: 214, width: 130, height: 10.8, fontSize: 7.9, lineHeight: 10.8, page: 1,
      },
      {
        element_id: "job-body", category: "textarea", content: "Long description",
        flowRole: "content", flowGroup: "job", autoHeight: true,
        left: 62, top: 234, width: 471, height: 100, fontSize: 8.6, lineHeight: 11, page: 1,
      },
      {
        element_id: "education-heading", category: "text", content: "WYKSZTAŁCENIE",
        flowRole: "section-chrome", left: 62, top: 300, width: 250, fontSize: 8.2, page: 1,
      },
      {
        element_id: "degree", category: "textarea", content: "Strategy MA",
        flowRole: "content", flowGroup: "education", autoHeight: true,
        left: 62, top: 334, width: 329, height: 13, fontSize: 9.8, lineHeight: 12.5, page: 1,
      },
    ];

    const settled = applyMeridianRenderedHeightsLayout(
      elements,
      new Map([["job-body", 100]]),
      { spacing: DEFAULT_FLOW_SPACING, pageHeight: 842, createId },
    );
    const body = settled.find((element) => element.element_id === "job-body");
    const education = settled.find((element) => element.element_id === "education-heading");
    const period = settled.find((element) => element.element_id === "job-period");
    const title = settled.find((element) => element.element_id === "job-title");
    assert.ok(
      (education.page - 1) * 842 + education.top
        >= (body.page - 1) * 842 + body.top + body.height,
    );
    assert.equal(period.page, title.page);
    assert.equal(period.top, title.top);
    assert.deepEqual(overlappingFlowText(settled), []);
  });
});
