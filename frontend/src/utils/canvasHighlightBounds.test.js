import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampCanvasBounds,
  elementBoundsOnPage,
  includeRenderedBounds,
  resolveRenderedHighlightLimits,
  sectionVisualStartOnPage,
  unionCanvasBounds,
} from "./canvasHighlightBounds.js";

describe("canvas semantic highlight bounds", () => {
  it("includes an optically shifted Portico section icon above the stored heading top", () => {
    const elements = [
      {
        element_id: "summary-icon",
        category: "image",
        src: "/template-assets/iconic/portico/summary.png",
        alignWithText: true,
        left: 54,
        top: 259,
        width: 14,
        height: 14,
        page: 1,
      },
      {
        element_id: "summary-heading",
        category: "text",
        content: "PODSUMOWANIE ZAWODOWE",
        left: 76,
        top: 259,
        fontSize: 8.5,
        page: 1,
      },
      {
        element_id: "summary-rule",
        category: "line",
        left: 76,
        top: 272.475,
        width: 443,
        height: 1,
        page: 1,
      },
      {
        element_id: "summary-body",
        category: "textarea",
        left: 76,
        top: 280.475,
        width: 443,
        height: 24,
        page: 1,
      },
    ];

    const bounds = elementBoundsOnPage(
      elements,
      new Set(elements.map((element) => element.element_id)),
      1,
    );

    // Portico stores icon.top at the label line. Its painted 14 px glyph starts
    // at 259 + 1 - 14/2 = 253, which must become the section border's top.
    assert.equal(bounds.top, 253);
    assert.equal(bounds.left, 54);
    assert.equal(bounds.width, 465);
    assert.ok(Math.abs(bounds.height - 51.475) < 1e-9);
  });

  it("expands a stored section box to a live heading Range without shrinking it", () => {
    const stored = { left: 54, top: 259, width: 465, height: 45.475 };
    const liveHeading = { left: 76, top: 256, width: 145, height: 10 };

    const expanded = unionCanvasBounds([stored, liveHeading]);
    assert.deepEqual(
      { left: expanded.left, top: expanded.top, width: expanded.width },
      { left: 54, top: 256, width: 465 },
    );
    assert.ok(Math.abs(expanded.height - 48.475) < 1e-9);
  });

  it("keeps the stored highlight when no rendered heading is available", () => {
    const stored = { left: 54, top: 253, width: 465, height: 51.475 };
    const resolved = includeRenderedBounds(stored, null);
    assert.deepEqual(
      { left: resolved.left, top: resolved.top, width: resolved.width },
      { left: stored.left, top: stored.top, width: stored.width },
    );
    assert.ok(Math.abs(resolved.height - stored.height) < 1e-9);
  });

  it("clips an oversized body box at the next semantic section boundary", () => {
    const elements = [
      {
        element_id: "skills-heading",
        category: "text",
        content: "UMIEJĘTNOŚCI",
        left: 34,
        top: 337,
        width: 92,
        height: 10,
        page: 1,
      },
      {
        element_id: "skills-rule",
        category: "line",
        left: 34,
        top: 353,
        width: 22,
        height: 1,
        page: 1,
      },
      {
        element_id: "skills-body",
        category: "textarea",
        left: 34,
        top: 365,
        width: 152,
        // Mirrors the live failure: the stored auto-height box retained blank
        // space below its visible copy and crossed the Languages heading.
        height: 335,
        page: 1,
      },
      {
        element_id: "languages-heading",
        category: "text",
        content: "JĘZYKI",
        left: 34,
        top: 653,
        width: 48,
        height: 10,
        page: 1,
      },
    ];

    const bounds = elementBoundsOnPage(
      elements,
      new Set(["skills-heading", "skills-rule", "skills-body"]),
      1,
      { maxBottom: 653 },
    );

    assert.equal(bounds.top, 337);
    assert.equal(bounds.top + bounds.height, 653);
  });

  it("ignores a stale mounted DOM position while React is committing a reorder", () => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    let domReads = 0;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        getElementById() {
          domReads += 1;
          throw new Error("section bounds must not inspect pre-commit DOM");
        },
      },
    });

    try {
      const bounds = elementBoundsOnPage(
        [{
          element_id: "moved-heading",
          category: "text",
          content: "DOŚWIADCZENIE ZAWODOWE",
          left: 82,
          top: 420,
          fontSize: 9,
          page: 1,
        }],
        new Set(["moved-heading"]),
        1,
        { minTop: 420, maxBottom: 520 },
      );

      assert.equal(domReads, 0);
      assert.equal(bounds.top, 420);
      assert.equal(bounds.top + bounds.height, 429);
    } finally {
      if (previousDocument) {
        Object.defineProperty(globalThis, "document", previousDocument);
      } else {
        delete globalThis.document;
      }
    }
  });

  it("clips polluted members above and oversized content below a moved section", () => {
    const elements = [
      {
        element_id: "previous-body",
        category: "textarea",
        left: 82,
        top: 180,
        width: 430,
        height: 90,
        page: 1,
      },
      {
        element_id: "experience-heading",
        category: "text",
        content: "DOŚWIADCZENIE ZAWODOWE",
        left: 82,
        top: 300,
        fontSize: 9,
        page: 1,
      },
      {
        element_id: "experience-body",
        category: "textarea",
        left: 82,
        top: 320,
        width: 430,
        height: 260,
        page: 1,
      },
    ];

    const bounds = elementBoundsOnPage(
      elements,
      new Set(elements.map((element) => element.element_id)),
      1,
      { minTop: 300, maxBottom: 500 },
    );

    assert.equal(bounds.top, 300);
    assert.equal(bounds.top + bounds.height, 500);
  });

  it("keeps trusted leading icon ink while rejecting an unrelated earlier member", () => {
    const elements = [
      {
        element_id: "previous-body",
        category: "textarea",
        flowRole: "content",
        left: 54,
        top: 180,
        width: 465,
        height: 50,
        page: 1,
      },
      {
        element_id: "summary-icon",
        category: "image",
        src: "/template-assets/iconic/portico/summary.png",
        alignWithText: true,
        left: 54,
        top: 259,
        width: 14,
        height: 14,
        page: 1,
      },
      {
        element_id: "summary-heading",
        category: "text",
        content: "PODSUMOWANIE ZAWODOWE",
        flowRole: "section-chrome",
        left: 76,
        top: 259,
        fontSize: 8.5,
        page: 1,
      },
    ];
    const memberIds = new Set(elements.map((element) => element.element_id));

    const visualStart = sectionVisualStartOnPage(
      elements,
      memberIds,
      "summary-heading",
      1,
      842,
      259,
    );

    assert.equal(visualStart, 253);
  });

  it("reapplies both semantic limits after merging fresh line-height ink", () => {
    const stored = { left: 82, top: 300, width: 430, height: 260 };
    const renderedHeading = { left: 82, top: 297, width: 142, height: 9 };
    const renderedNextHeading = { left: 82, top: 497, width: 96, height: 9 };
    const limits = resolveRenderedHighlightLimits(
      { minTop: 300, maxBottom: 500 },
      {
        headingBounds: renderedHeading,
        nextHeadingBounds: renderedNextHeading,
        headingTopExtension: 6,
        nextHeadingTopExtension: 6,
      },
    );

    const resolved = includeRenderedBounds(
      stored,
      renderedHeading,
      limits,
    );

    assert.equal(resolved.top, 297);
    assert.equal(resolved.top + resolved.height, 497);
  });

  it("rejects a live Range that is too far from the current model boundary", () => {
    const limits = resolveRenderedHighlightLimits(
      { minTop: 300, maxBottom: 500 },
      {
        headingBounds: { left: 82, top: 180, width: 142, height: 9 },
        nextHeadingBounds: { left: 82, top: 360, width: 96, height: 9 },
        headingTopExtension: 6,
        nextHeadingTopExtension: 6,
      },
    );

    assert.deepEqual(limits, { minTop: 300, maxBottom: 500 });
  });

  it("suppresses the outline when corrupt section limits cross", () => {
    const resolved = clampCanvasBounds(
      { left: 82, top: 300, width: 430, height: 100 },
      { minTop: 450, maxBottom: 420 },
    );

    assert.equal(resolved, null);
  });
});
