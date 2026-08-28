import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sterlingTemplate } from "../templates/sterling.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import { contentMaxPage } from "./structureOperation.js";
import {
  applySterlingRenderedHeightsLayout,
  applySterlingTextSizeLayout,
} from "./sterlingTypographyLayout.js";

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

  it("packs from glyph-measured heights instead of a stale character-count estimate", () => {
    let nextId = 0;
    const createId = () => `measured-${nextId += 1}`;
    const source = withIds(sterlingTemplate);
    const summaryId = source.find((element) => (
      element.category === "textarea"
      && element.flowRole === "content"
      && String(element.content || "").startsWith("Analityczka AML")
    )).element_id;
    // Deliberately wide glyph metrics reproduce the real failure mode: a line
    // can wrap earlier than `content.length / charsPerLine` predicts.
    const measureTextWidth = (text) => String(text).length * 7;

    const heuristic = applySterlingTextSizeLayout(source, "L", {
      spacing: DEFAULT_FLOW_SPACING,
      pageHeight: 842,
      createId,
    });
    const measured = applySterlingTextSizeLayout(source, "L", {
      spacing: DEFAULT_FLOW_SPACING,
      pageHeight: 842,
      createId,
      measureTextWidth,
    });
    const heuristicSummary = heuristic.find((element) => element.element_id === summaryId);
    const measuredSummary = measured.find((element) => element.element_id === summaryId);

    assert.ok(measuredSummary.height > heuristicSummary.height);
    assert.deepEqual(overlappingFlowText(measured), []);
  });

  it("batch-packs browser heights so a long final job cannot overlap Education", () => {
    let nextId = 0;
    const createId = () => `settled-${nextId += 1}`;
    const elements = [
      {
        element_id: "experience-heading", category: "text", content: "DOŚWIADCZENIE ZAWODOWE",
        flowRole: "section-chrome", left: 245, top: 174, width: 300, fontSize: 9.4, page: 1,
      },
      {
        element_id: "job-title", category: "textarea", content: "Customer Service Specialist with German",
        flowRole: "content", flowGroup: "job-4", autoHeight: true,
        left: 245, top: 202, width: 300, height: 14, fontSize: 10.8, lineHeight: 14, page: 1,
      },
      {
        element_id: "job-meta", category: "textarea", content: "Amazon CS Poland · Warszawa · 08/2020–06/2022",
        flowRole: "content", flowGroup: "job-4", autoHeight: true,
        left: 245, top: 220, width: 300, height: 12, fontSize: 8.6, lineHeight: 11.8, page: 1,
      },
      {
        element_id: "job-bullets", category: "textarea", content: "Long four-item job description",
        flowRole: "content", flowGroup: "job-4", autoHeight: true, bulletList: true,
        left: 245, top: 236, width: 300, height: 110, fontSize: 9.5, lineHeight: 13.8, page: 1,
      },
      {
        element_id: "education-heading", category: "text", content: "WYKSZTAŁCENIE",
        flowRole: "section-chrome", left: 245, top: 312, width: 300, fontSize: 9.4, page: 1,
      },
      {
        element_id: "degree", category: "textarea", content: "Bachelor of Laws (LL.B.)",
        flowRole: "content", flowGroup: "edu-1", autoHeight: true,
        left: 245, top: 340, width: 300, height: 14, fontSize: 10.8, lineHeight: 14, page: 1,
      },
    ];

    const settled = applySterlingRenderedHeightsLayout(
      elements,
      // The browser height is already stored, reproducing the race where a
      // per-field effect updated the box but left the next section at stale Y.
      new Map([["job-bullets", 110]]),
      { spacing: DEFAULT_FLOW_SPACING, pageHeight: 842, createId },
    );
    const bullets = settled.find((element) => element.element_id === "job-bullets");
    const education = settled.find((element) => element.element_id === "education-heading");

    assert.equal(bullets.height, 110);
    assert.ok(
      (education.page - 1) * 842 + education.top
        >= (bullets.page - 1) * 842 + bullets.top + bullets.height,
    );
    assert.deepEqual(overlappingFlowText(settled), []);
  });
});
