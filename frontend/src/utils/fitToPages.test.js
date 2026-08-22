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

import { classifyFitTier } from "./fitToPages.js";
import {
  COMPACT_FLOW_SPACING,
  MIN_FLOW_SPACING,
} from "./flowSpacing.js";

describe("classifyFitTier", () => {
  it("classifies baseline / compact-or-looser as clean", () => {
    assert.equal(classifyFitTier({ stack: 4, record: 10, section: 21, after_rule: 8 }), "clean");
    assert.equal(classifyFitTier(COMPACT_FLOW_SPACING), "clean");
  });

  it("classifies the hard floor as emergency", () => {
    assert.equal(classifyFitTier(MIN_FLOW_SPACING), "emergency");
  });

  it("classifies a candidate within 1px of the floor as emergency", () => {
    assert.equal(classifyFitTier({ stack: 3, record: 3, section: 11, after_rule: 3 }), "emergency");
  });

  it("classifies between compact and floor as tight", () => {
    // record 5 < compact.record(7) but well above floor+1(3) → tight.
    assert.equal(classifyFitTier({ stack: 3, record: 5, section: 13, after_rule: 5 }), "tight");
  });
});

import { findFitForTarget } from "./fitToPages.js";

// Fake pack: page count = 1 once `section` drops to/below `threshold`, else 2.
// Tags each returned array so we can assert WHICH candidate won.
function fakePackFn(threshold) {
  return (elements, spacing) => {
    const pages = spacing.section <= threshold ? 1 : 2;
    const tagged = [{ element_id: "probe", page: pages, top: 0, height: 10 }];
    tagged._spacing = spacing;
    return tagged;
  };
}

describe("findFitForTarget", () => {
  it("returns the LOOSEST candidate that fits, never the tightest", () => {
    // With threshold 16, the first ladder rung whose section<=16 wins — that is
    // well above the floor (section 10), proving we do not over-tighten.
    const r = findFitForTarget({
      elements: [],
      loosest: BASELINE,           // section 21
      tightest: FLOOR,             // section 10
      targetPages: 1,
      packFn: fakePackFn(16),
    });
    assert.equal(r.fits, true);
    assert.equal(r.pageCount, 1);
    assert.ok(r.spacing.section <= 16, "winner must actually fit");
    assert.ok(r.spacing.section > FLOOR.section, "winner must be looser than the floor");
    assert.ok(["clean", "tight"].includes(r.tier));
  });

  it("classifies a floor-only fit as emergency", () => {
    // Only section<=10 (the floor) fits.
    const r = findFitForTarget({
      elements: [], loosest: BASELINE, tightest: FLOOR, targetPages: 1,
      packFn: fakePackFn(10),
    });
    assert.equal(r.fits, true);
    assert.equal(r.tier, "emergency");
    assert.deepEqual(r.spacing, FLOOR);
  });

  it("returns impossible when even the floor exceeds the target", () => {
    const r = findFitForTarget({
      elements: [], loosest: BASELINE, tightest: FLOOR, targetPages: 1,
      packFn: fakePackFn(5), // nothing on the ladder reaches section<=5
    });
    assert.equal(r.fits, false);
    assert.equal(r.tier, "impossible");
    assert.deepEqual(r.spacing, FLOOR);
    assert.equal(r.pageCount, 2);
  });

  it("relax direction: picks baseline when baseline already fits the achieved target", () => {
    const r = findFitForTarget({
      elements: [], loosest: BASELINE, tightest: COMPACT_FLOW_SPACING, targetPages: 1,
      packFn: fakePackFn(25), // section 21 (baseline) already <= 25
    });
    assert.equal(r.fits, true);
    assert.deepEqual(r.spacing, BASELINE);
  });
});
