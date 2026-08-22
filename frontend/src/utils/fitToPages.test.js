import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSpacingLadder } from "./fitToPages.js";

const BASELINE = { stack: 4, record: 10, section: 21, after_rule: 8 };
const FLOOR = { stack: 2, record: 2, section: 10, after_rule: 2 };

describe("buildSpacingLadder", () => {
  it("returns steps + 1 candidates with exact endpoints", () => {
    const ladder = buildSpacingLadder(BASELINE, FLOOR, 10);
    assert.equal(ladder.length, 11);
    assert.deepEqual(ladder[0], BASELINE);
    assert.deepEqual(ladder[ladder.length - 1], FLOOR);
  });

  it("is monotone non-increasing on every knob from loosest to tightest", () => {
    const ladder = buildSpacingLadder(BASELINE, FLOOR, 10);
    for (let i = 1; i < ladder.length; i += 1) {
      for (const key of ["stack", "record", "section", "after_rule"]) {
        assert.ok(
          ladder[i][key] <= ladder[i - 1][key],
          `${key} rose at step ${i}: ${ladder[i - 1][key]} -> ${ladder[i][key]}`,
        );
      }
    }
  });

  it("collapses to a single candidate when endpoints are equal", () => {
    const ladder = buildSpacingLadder(FLOOR, FLOOR, 10);
    assert.ok(ladder.length >= 1);
    assert.deepEqual(ladder[0], FLOOR);
    assert.deepEqual(ladder[ladder.length - 1], FLOOR);
  });
});
