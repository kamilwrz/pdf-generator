import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  elementBoundsOnPage,
  includeRenderedElementBounds,
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
    const resolved = includeRenderedElementBounds(stored, null);
    assert.deepEqual(
      { left: resolved.left, top: resolved.top, width: resolved.width },
      { left: stored.left, top: stored.top, width: stored.width },
    );
    assert.ok(Math.abs(resolved.height - stored.height) < 1e-9);
  });
});
