import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SPARSE_LAST_PAGE_RATIO,
  TOO_LONG_MIN_PAGES,
  diagnoseDocumentLength,
  measureLastPageUtilization,
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
});
