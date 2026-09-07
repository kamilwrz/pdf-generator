import assert from "node:assert/strict";
import test from "node:test";
import { getElementOutlineBounds, getElementSelectionBounds } from "./elementBounds.js";

test("element outline bounds use model geometry when no canvas node is mounted", () => {
  assert.deepEqual(
    getElementOutlineBounds({
      element_id: "record-title",
      category: "textarea",
      left: 72,
      top: 180,
      width: 310,
      height: 24,
    }),
    { left: 72, top: 180, width: 310, height: 24 },
  );
});

test("element outline bounds preserve icon optical alignment and a visible minimum", () => {
  assert.deepEqual(
    getElementOutlineBounds({
      element_id: "contact-icon",
      category: "image",
      left: 28,
      top: 40,
      width: 8,
      height: 8,
      src: "/template-assets/iconic/phone.svg",
      alignWithText: true,
    }),
    { left: 28, top: 37, width: 8, height: 8 },
  );

  assert.deepEqual(
    getElementOutlineBounds({
      element_id: "empty-shape",
      category: "rectangle",
      left: 12,
      top: 16,
      width: 0,
      height: 0,
    }),
    { left: 12, top: 16, width: 1, height: 1 },
  );
});

test("populated text selection keeps two screen pixels around glyph bounds", () => {
  assert.deepEqual(
    getElementSelectionBounds({
      element_id: "contact-label",
      category: "text",
      content: "email@example.com",
      left: 100,
      top: 40,
      width: 120,
      height: 10,
    }, 2.5),
    { left: 99.2, top: 39.2, width: 121.6, height: 11.6 },
  );

  assert.deepEqual(
    getElementSelectionBounds({
      element_id: "empty-contact-label",
      category: "text",
      content: "",
      left: 100,
      top: 40,
      width: 24,
      height: 10,
    }, 2.5),
    { left: 100, top: 40, width: 24, height: 10 },
  );
});

test("empty CSS guidance uses its live lifted box and rendered zoom instead of the saved baseline", () => {
  const previousDocument = globalThis.document;
  const emptyRect = { left: 0, top: 0, width: 0, height: 0 };
  const node = {
    tagName: "P",
    matches: (selector) => selector === "[data-placeholder]:empty",
    closest: () => ({
      clientWidth: 600, clientHeight: 800,
      getBoundingClientRect: () => ({ left: 20, top: 30, width: 1500, height: 2000 }),
    }),
    getBoundingClientRect: () => ({ left: 270, top: 280, width: 300, height: 25 }),
    ownerDocument: {
      createRange: () => ({
        selectNodeContents() {},
        getClientRects: () => [],
        getBoundingClientRect: () => emptyRect,
      }),
    },
  };
  globalThis.document = { getElementById: () => node };
  try {
    const element = { element_id: "empty-email", category: "text", content: "", left: 100, top: 117 };
    assert.deepEqual(getElementOutlineBounds(element), { left: 100, top: 100, width: 120, height: 10 });
    // The target zoom has advanced to 280%, but the painted canvas is at 250%.
    assert.deepEqual(getElementSelectionBounds(element, 2.8), {
      left: 99.2, top: 99.2, width: 121.6, height: 11.6,
    });
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
