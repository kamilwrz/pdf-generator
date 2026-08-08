import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeElementsContent,
  sanitizeTextContent,
} from "./sanitizeTextContent.js";

test("normalizes unusual spaces without removing paragraph newlines", () => {
  assert.equal(sanitizeTextContent("first\u00A0line\n\nsecond"), "first line\n\nsecond");
});

test("removes a leaked numeric database id before an API request", () => {
  const [element] = sanitizeElementsContent([
    {
      id: 904,
      element_id: "canvas-element",
      category: "textarea",
      content: "Languages\n\n• Polish",
    },
  ]);

  assert.equal("id" in element, false);
  assert.equal(element.content, "Languages\n\n• Polish");
});

test("preserves semantic string ids used by template elements", () => {
  const [element] = sanitizeElementsContent([
    {
      id: "tessera-photo-frame",
      element_id: "canvas-element",
      category: "rectangle",
    },
  ]);

  assert.equal(element.id, "tessera-photo-frame");
});
