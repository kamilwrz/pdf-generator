import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reconcileTemplateStyles } from "./reconcileTemplateStyles.js";

const oldText = {
  element_id: "old-summary",
  category: "textarea",
  content: "Summary",
  left: 80,
  top: 300,
  width: 260,
  height: 80,
  color: "#AABBCC",
  fontFamily: "Lora",
  fontSize: 16,
  bold: true,
  lineHeight: 24,
  flowRole: "content",
  flowLane: "main",
};

describe("reconcileTemplateStyles", () => {
  it("keeps user typography while using target geometry", () => {
    const next = [{
      ...oldText,
      element_id: "new-summary",
      left: 42,
      top: 120,
      width: 400,
      height: 100,
      color: "#000000",
      fontFamily: "Inter",
      fontSize: 11,
      bold: false,
    }];

    const [merged] = reconcileTemplateStyles([oldText], next);

    assert.equal(merged.color, "#AABBCC");
    assert.equal(merged.fontFamily, "Lora");
    assert.equal(merged.fontSize, 16);
    assert.equal(merged.bold, true);
    assert.equal(merged.left, 42);
    assert.equal(merged.top, 120);
    assert.equal(merged.width, 400);
    assert.equal(merged.height, 100);
    assert.equal(merged.element_id, "new-summary");
  });

  it("does not copy styles from decorative or unmatched elements", () => {
    const decorative = {
      ...oldText,
      element_id: "chrome",
      fixedToPage: true,
      color: "#FF0000",
    };
    const next = {
      ...oldText,
      element_id: "new-unmatched",
      content: "Different content",
      color: "#123456",
    };

    const [merged] = reconcileTemplateStyles([decorative], [next]);

    assert.equal(merged.color, "#123456");
  });

  it("keeps inline runs only when content is unchanged", () => {
    const previous = { ...oldText, runs: [{ start: 0, end: 7, bold: true }] };
    const same = { ...oldText, element_id: "same" };
    const changed = { ...oldText, element_id: "changed", content: "Changed" };

    assert.deepEqual(reconcileTemplateStyles([previous], [same])[0].runs, previous.runs);
    assert.equal(reconcileTemplateStyles([previous], [changed])[0].runs, undefined);
  });
});
