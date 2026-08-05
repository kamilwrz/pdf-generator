import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canvasFontFamily } from "./canvasFont.js";

describe("canvasFontFamily", () => {
  it("aliases Helvetica and Courier to Inter stacks like the PDF renderer", () => {
    assert.match(canvasFontFamily("Helvetica"), /^Inter,/);
    assert.match(canvasFontFamily("Courier"), /^Inter,/);
  });

  it("keeps registered faces that share files with the PDF", () => {
    assert.match(canvasFontFamily("Inter"), /^Inter/);
    assert.match(canvasFontFamily("Times-Roman"), /^Times-Roman/);
    assert.match(canvasFontFamily("PlayfairDisplay"), /^PlayfairDisplay/);
  });

  it("falls back to Inter for empty values", () => {
    assert.match(canvasFontFamily(""), /^Inter/);
    assert.match(canvasFontFamily(null), /^Inter/);
  });
});
