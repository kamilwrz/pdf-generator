/**
 * Wheel → page-step resolver for the canvas scroll container.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolvePageWheelDelta } from "./canvasPageWheel.js";

function scrollEl({
  scrollTop = 0,
  scrollHeight = 100,
  clientHeight = 100,
} = {}) {
  return { scrollTop, scrollHeight, clientHeight };
}

function wheel(deltaY, extras = {}) {
  return { deltaY, deltaX: 0, ctrlKey: false, metaKey: false, target: null, ...extras };
}

describe("resolvePageWheelDelta", () => {
  it("goes to the next page when scrolling down with no overflow", () => {
    assert.equal(
      resolvePageWheelDelta(wheel(40), scrollEl(), { currentPage: 1, pageCount: 3 }),
      1,
    );
  });

  it("goes to the previous page when scrolling up with no overflow", () => {
    assert.equal(
      resolvePageWheelDelta(wheel(-40), scrollEl(), { currentPage: 2, pageCount: 3 }),
      -1,
    );
  });

  it("does not leave page 1 upward or the last page downward", () => {
    assert.equal(
      resolvePageWheelDelta(wheel(-20), scrollEl(), { currentPage: 1, pageCount: 2 }),
      0,
    );
    assert.equal(
      resolvePageWheelDelta(wheel(20), scrollEl(), { currentPage: 2, pageCount: 2 }),
      0,
    );
  });

  it("lets native scroll consume the wheel while not at the edge", () => {
    const el = scrollEl({ scrollTop: 40, scrollHeight: 400, clientHeight: 200 });
    assert.equal(
      resolvePageWheelDelta(wheel(30), el, { currentPage: 1, pageCount: 3 }),
      0,
    );
    assert.equal(
      resolvePageWheelDelta(wheel(-30), el, { currentPage: 2, pageCount: 3 }),
      0,
    );
  });

  it("changes page when scrolling past the bottom or top edge", () => {
    const atBottom = scrollEl({ scrollTop: 200, scrollHeight: 400, clientHeight: 200 });
    assert.equal(
      resolvePageWheelDelta(wheel(25), atBottom, { currentPage: 1, pageCount: 2 }),
      1,
    );
    const atTop = scrollEl({ scrollTop: 0, scrollHeight: 400, clientHeight: 200 });
    assert.equal(
      resolvePageWheelDelta(wheel(-25), atTop, { currentPage: 2, pageCount: 2 }),
      -1,
    );
  });

  it("ignores ctrl/meta wheel and horizontal-dominant gestures", () => {
    assert.equal(
      resolvePageWheelDelta(wheel(40, { ctrlKey: true }), scrollEl(), { currentPage: 1, pageCount: 2 }),
      0,
    );
    assert.equal(
      resolvePageWheelDelta(
        { deltaY: 10, deltaX: 40, ctrlKey: false, metaKey: false, target: null },
        scrollEl(),
        { currentPage: 1, pageCount: 2 },
      ),
      0,
    );
  });
});
