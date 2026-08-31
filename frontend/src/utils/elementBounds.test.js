import assert from "node:assert/strict";
import test from "node:test";
import { getElementOutlineBounds } from "./elementBounds.js";

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
