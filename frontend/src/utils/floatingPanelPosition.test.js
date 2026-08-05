import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeFloatingPanelPosition,
  unionRects,
} from "./floatingPanelPosition.js";

describe("computeFloatingPanelPosition", () => {
  const panel = { width: 320, height: 200 };
  const viewport = { width: 1200, height: 800 };

  it("places the panel above the selection when there is room", () => {
    const pos = computeFloatingPanelPosition(
      { left: 400, top: 300, width: 100, height: 40 },
      panel,
      viewport,
    );
    assert.equal(pos.placement, "above");
    assert.equal(pos.top, 300 - 8 - 200);
    assert.equal(pos.left, 400 + 50 - 160);
  });

  it("flips below when space above is tighter than below", () => {
    const pos = computeFloatingPanelPosition(
      { left: 400, top: 40, width: 100, height: 40 },
      panel,
      viewport,
      { gap: 8, padding: 8 },
    );
    assert.equal(pos.placement, "below");
    assert.equal(pos.top, 40 + 40 + 8);
  });

  it("clamps horizontally into the viewport", () => {
    const pos = computeFloatingPanelPosition(
      { left: 10, top: 400, width: 20, height: 20 },
      panel,
      viewport,
    );
    assert.equal(pos.left, 8);
  });

  it("clamps vertically into the viewport", () => {
    const pos = computeFloatingPanelPosition(
      { left: 500, top: 10, width: 40, height: 20 },
      { width: 320, height: 700 },
      { width: 1200, height: 400 },
    );
    assert.ok(pos.top >= 8);
    assert.ok(pos.top + 700 <= 400 - 8 + 0.01 || pos.top === 8);
  });
});

describe("unionRects", () => {
  it("returns null for an empty list", () => {
    assert.equal(unionRects([]), null);
  });

  it("unions multiple selection boxes", () => {
    const box = unionRects([
      { left: 10, top: 20, width: 40, height: 30 },
      { left: 30, top: 40, width: 50, height: 20 },
    ]);
    assert.deepEqual(box, { left: 10, top: 20, width: 70, height: 40 });
  });
});
