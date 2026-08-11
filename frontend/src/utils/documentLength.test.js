import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SIDEBAR_TOO_LONG_MIN_PAGES,
  SPARSE_LAST_PAGE_RATIO,
  TOO_LONG_MIN_PAGES,
  diagnoseDocumentLength,
  measureLastPageUtilization,
  shouldResetLongCvOffer,
} from "./documentLength.js";

// Usable band per page: CONTENT_BOTTOM(770) - PAGE_TOP(66) = 704.
const el = (page, top, height) => ({ page, top, height });

describe("measureLastPageUtilization", () => {
  it("reports a low ratio when the last page has little content", () => {
    // Last page (3) content ends at 150 → (150-66)/704 ≈ 0.12
    const elements = [el(1, 700, 40), el(3, 66, 84)];
    const util = measureLastPageUtilization(elements, 3);
    assert.ok(util > 0.1 && util < 0.15, `expected ~0.12, got ${util}`);
  });

  it("reports a high ratio when the last page is nearly full", () => {
    // Content ends near the bottom margin: (760-66)/704 ≈ 0.99
    const elements = [el(3, 66, 694)];
    const util = measureLastPageUtilization(elements, 3);
    assert.ok(util > 0.95, `expected ~0.99, got ${util}`);
  });

  it("ignores fixedToPage chrome that spans the whole page", () => {
    const elements = [
      { page: 3, top: 0, height: 842, fixedToPage: true }, // full-page bg
      el(3, 66, 84),
    ];
    const util = measureLastPageUtilization(elements, 3);
    assert.ok(util < 0.2, `chrome must not inflate utilization, got ${util}`);
  });

  it("only measures elements on the last page", () => {
    const elements = [el(1, 66, 694), el(2, 66, 100)];
    const util = measureLastPageUtilization(elements, 2);
    assert.ok(util > 0.1 && util < 0.3, `page 2 content only, got ${util}`);
  });
});

describe("diagnoseDocumentLength", () => {
  it("flags 3+ pages as too long and 2 pages as fine", () => {
    assert.equal(diagnoseDocumentLength({ pageCount: 3, elements: [] }).tooLong, true);
    assert.equal(diagnoseDocumentLength({ pageCount: TOO_LONG_MIN_PAGES, elements: [] }).tooLong, true);
    assert.equal(diagnoseDocumentLength({ pageCount: 2, elements: [] }).tooLong, false);
  });

  it("chooses spacing mode when the last page is sparse", () => {
    const elements = [el(3, 66, 84)]; // ~12% util, below 0.45
    const result = diagnoseDocumentLength({ pageCount: 3, elements });
    assert.equal(result.mode, "spacing");
  });

  it("chooses content mode when the last page is full", () => {
    const elements = [el(3, 66, 640)]; // ~90% util, above 0.45
    const result = diagnoseDocumentLength({ pageCount: 3, elements });
    assert.equal(result.mode, "content");
    assert.ok(result.utilization >= SPARSE_LAST_PAGE_RATIO);
  });

  it("targets one page fewer, never below one", () => {
    assert.equal(diagnoseDocumentLength({ pageCount: 3, elements: [] }).targetPages, 2);
    assert.equal(diagnoseDocumentLength({ pageCount: 4, elements: [] }).targetPages, 3);
    assert.equal(diagnoseDocumentLength({ pageCount: 1, elements: [] }).targetPages, 1);
  });

  describe("isSidebarLayout", () => {
    it("flags 2+ pages as too long, one page lower than single-column", () => {
      assert.equal(SIDEBAR_TOO_LONG_MIN_PAGES, TOO_LONG_MIN_PAGES - 1);
      assert.equal(
        diagnoseDocumentLength({ pageCount: 1, elements: [], isSidebarLayout: true }).tooLong,
        false,
      );
      assert.equal(
        diagnoseDocumentLength({ pageCount: 2, elements: [], isSidebarLayout: true }).tooLong,
        true,
      );
      assert.equal(
        diagnoseDocumentLength({ pageCount: SIDEBAR_TOO_LONG_MIN_PAGES, elements: [], isSidebarLayout: true }).tooLong,
        true,
      );
    });

    it("a 2-page sidebar CV that would not yet flag single-column does flag here", () => {
      // The rail (Summary/Education/Skills/Languages) never repeats past page
      // 1, so a 2nd page is already "too long" for a sidebar template even
      // though the same page count is fine for a single-column one.
      assert.equal(diagnoseDocumentLength({ pageCount: 2, elements: [] }).tooLong, false);
      assert.equal(
        diagnoseDocumentLength({ pageCount: 2, elements: [], isSidebarLayout: true }).tooLong,
        true,
      );
    });

    it("always targets exactly one page, regardless of current page count", () => {
      assert.equal(
        diagnoseDocumentLength({ pageCount: 2, elements: [], isSidebarLayout: true }).targetPages,
        1,
      );
      assert.equal(
        diagnoseDocumentLength({ pageCount: 5, elements: [], isSidebarLayout: true }).targetPages,
        1,
      );
    });

    it("still derives mode from last-page utilization (unchanged heuristic)", () => {
      const sparse = [el(2, 66, 84)]; // ~12% util on the overflow page
      assert.equal(
        diagnoseDocumentLength({ pageCount: 2, elements: sparse, isSidebarLayout: true }).mode,
        "spacing",
      );
      const full = [el(2, 66, 640)]; // ~90% util on the overflow page
      assert.equal(
        diagnoseDocumentLength({ pageCount: 2, elements: full, isSidebarLayout: true }).mode,
        "content",
      );
    });
  });
});

describe("shouldResetLongCvOffer", () => {
  it("does not reset on the first observation (no previous identity)", () => {
    assert.equal(
      shouldResetLongCvOffer(null, { pdfId: null, templateId: "harbor" }),
      false,
    );
  });

  it("does not reset when first autosave assigns a pdfId to the same draft", () => {
    assert.equal(
      shouldResetLongCvOffer(
        { pdfId: null, templateId: "harbor" },
        { pdfId: "doc-1", templateId: "harbor" },
      ),
      false,
    );
  });

  it("resets when the template changes (Zmień szablon keeps pdfId)", () => {
    assert.equal(
      shouldResetLongCvOffer(
        { pdfId: "doc-1", templateId: "harbor" },
        { pdfId: "doc-1", templateId: "slate" },
      ),
      true,
    );
  });

  it("resets when a different saved document is loaded", () => {
    assert.equal(
      shouldResetLongCvOffer(
        { pdfId: "doc-1", templateId: "harbor" },
        { pdfId: "doc-2", templateId: "harbor" },
      ),
      true,
    );
  });

  it("resets when the canvas is cleared (pdfId → null)", () => {
    assert.equal(
      shouldResetLongCvOffer(
        { pdfId: "doc-1", templateId: "harbor" },
        { pdfId: null, templateId: null },
      ),
      true,
    );
  });
});
