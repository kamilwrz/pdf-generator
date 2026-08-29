import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEMPLATES } from "../templates/index.js";
import {
  isDecorativeOrdinalChrome,
  listDocumentSections,
  listSidebarSections,
  sectionElementIds,
  sidebarSectionElementIds,
} from "./sectionStructure.js";
import {
  elementBoundsOnPage,
  getStoredVisualBounds,
  sectionVisualStartOnPage,
} from "./canvasHighlightBounds.js";

const PAGE_HEIGHT = 842;

function materializeTemplate(template) {
  return template.elements.map((element, index) => ({
    ...element,
    element_id: `${template.id}-${index}`,
  }));
}

function verifyLane(templateId, elements, sections, resolveMemberIds, laneName) {
  const laneHeadingIds = new Set(sections.map((section) => section.headingId));
  const anchors = sections.map((section) => {
    const heading = elements.find((element) => element.element_id === section.headingId);
    const page = Math.max(1, Math.trunc(Number(heading?.page) || 1));
    const memberIds = resolveMemberIds(elements, section.headingId, PAGE_HEIGHT);
    assert.ok(
      memberIds.has(section.headingId),
      `${templateId}/${laneName}/${section.title} owns its heading`,
    );
    for (const otherHeadingId of laneHeadingIds) {
      if (otherHeadingId === section.headingId) continue;
      assert.equal(
        memberIds.has(otherHeadingId),
        false,
        `${templateId}/${laneName}/${section.title} excludes neighbour headings`,
      );
    }
    const minTop = sectionVisualStartOnPage(
      elements,
      memberIds,
      section.headingId,
      page,
      PAGE_HEIGHT,
      section.startAbs,
    );
    return { section, page, memberIds, minTop, heading };
  });

  anchors.forEach((anchor, index) => {
    const next = anchors[index + 1];
    const maxBottom = next?.page === anchor.page ? next.minTop : PAGE_HEIGHT;
    const modelBounds = elementBoundsOnPage(
      elements,
      anchor.memberIds,
      anchor.page,
    );
    const headingBounds = getStoredVisualBounds(anchor.heading);
    assert.ok(modelBounds, `${templateId}/${laneName}/${anchor.section.title} has model bounds`);
    assert.ok(
      modelBounds.top <= headingBounds.top
      && modelBounds.top + modelBounds.height >= headingBounds.top + headingBounds.height,
      `${templateId}/${laneName}/${anchor.section.title} contains its heading box`,
    );
    const pollutedIds = new Set(anchor.memberIds);
    if (index > 0) pollutedIds.add(anchors[index - 1].section.headingId);

    // Force both historical failure modes into every built-in template: a
    // previous heading is accidentally supplied above, while a synthetic body
    // retains enough height to cross the next section. Semantic limits must
    // still isolate the current section in either lane.
    const oversizedId = `${templateId}-${laneName}-${index}-oversized`;
    pollutedIds.add(oversizedId);
    const oversizedBody = {
      element_id: oversizedId,
      category: "textarea",
      flowRole: "content",
      flowLane: laneName === "sidebar" ? "sidebar" : undefined,
      left: Number(anchor.heading?.left) || 0,
      top: Math.min(PAGE_HEIGHT, anchor.minTop + 1),
      width: Number(anchor.heading?.width) || 120,
      height: PAGE_HEIGHT,
      page: anchor.page,
    };
    const bounds = elementBoundsOnPage(
      [...elements, oversizedBody],
      pollutedIds,
      anchor.page,
      { minTop: anchor.minTop, maxBottom },
    );

    assert.ok(bounds, `${templateId}/${laneName}/${anchor.section.title} has bounds`);
    assert.ok(
      bounds.top >= anchor.minTop,
      `${templateId}/${laneName}/${anchor.section.title} does not leak upward`,
    );
    assert.ok(
      bounds.top + bounds.height <= maxBottom,
      `${templateId}/${laneName}/${anchor.section.title} does not leak downward`,
    );
  });
}

describe("section highlight limits across built-in templates", () => {
  for (const template of TEMPLATES) {
    it(`${template.name} isolates every main and sidebar section`, () => {
      const elements = materializeTemplate(template);
      const mainSections = listDocumentSections(elements, PAGE_HEIGHT);
      const sidebarSections = listSidebarSections(elements, PAGE_HEIGHT);
      const expectedMainIds = elements
        .filter((element) => (
          element.flowRole === "section-chrome"
          && (element.category === "text" || element.category === "textarea")
          && String(element.content || "").trim()
          && !isDecorativeOrdinalChrome(element)
        ))
        .map((element) => element.element_id)
        .sort();
      const expectedSidebarIds = elements
        .filter((element) => (
          element.flowRole === "sidebar-chrome"
          && (element.category === "text" || element.category === "textarea")
          && String(element.content || "").trim()
          && !isDecorativeOrdinalChrome(element)
        ))
        .map((element) => element.element_id)
        .sort();

      assert.deepEqual(
        mainSections.map((section) => section.headingId).sort(),
        expectedMainIds,
        `${template.id} exposes every explicit main heading`,
      );
      assert.deepEqual(
        sidebarSections.map((section) => section.headingId).sort(),
        expectedSidebarIds,
        `${template.id} exposes every explicit sidebar heading`,
      );
      verifyLane(
        template.id,
        elements,
        mainSections,
        sectionElementIds,
        "main",
      );
      verifyLane(
        template.id,
        elements,
        sidebarSections,
        sidebarSectionElementIds,
        "sidebar",
      );
    });
  }
});
