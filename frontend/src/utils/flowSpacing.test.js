import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COMPACT_FLOW_SPACING,
  DEFAULT_FLOW_SPACING,
  DENSITY_SPACING_MIN,
  densityPresetsFromBaseline,
  flowSpacingEquals,
  isDefaultFlowSpacing,
  matchDensityPreset,
  MIN_FLOW_SPACING,
  normalizeFlowSpacing,
  scaleFlowSpacing,
} from "./flowSpacing.js";

describe("normalizeFlowSpacing", () => {
  it("fills missing keys from defaults", () => {
    assert.deepEqual(normalizeFlowSpacing({ section: 40 }), {
      ...DEFAULT_FLOW_SPACING,
      section: 40,
    });
  });

  it("clamps out-of-range values", () => {
    const next = normalizeFlowSpacing({ stack: -3, record: 999 });
    assert.equal(next.stack, 0);
    assert.equal(next.record, 80);
  });

  it("detects defaults", () => {
    assert.equal(isDefaultFlowSpacing(null), true);
    assert.equal(isDefaultFlowSpacing({ section: 21 }), true);
    assert.equal(isDefaultFlowSpacing({ section: 30 }), false);
  });

  it("compares normalized knobs for Reset no-op (avoid force-pack on unchanged rhythm)", () => {
    // Sections panel Reset must not call applyFlowSpacing when the live knobs
    // already match the post-render baseline — force-packing generator geometry
    // to exact SPACE_* changes pagination on every shared packer template.
    assert.equal(flowSpacingEquals(DEFAULT_FLOW_SPACING, { ...DEFAULT_FLOW_SPACING }), true);
    assert.equal(flowSpacingEquals({ section: 21 }, DEFAULT_FLOW_SPACING), true);
    assert.equal(flowSpacingEquals({ section: 40 }, DEFAULT_FLOW_SPACING), false);
  });
});

describe("densityPresetsFromBaseline", () => {
  it("maps Standardowa to baseline and scales compact/spacious around it", () => {
    const base = { stack: 4, record: 10, section: 21, after_rule: 8 };
    const presets = densityPresetsFromBaseline(base);
    assert.deepEqual(presets.standard, normalizeFlowSpacing(base));
    assert.deepEqual(presets.compact, {
      stack: 3,
      record: 7,
      section: 15,
      after_rule: 6,
    });
    assert.deepEqual(presets.spacious, {
      stack: 5,
      record: 13,
      section: 25,
      after_rule: 10,
    });
    assert.equal(matchDensityPreset(presets.compact, base), "compact");
    assert.ok(scaleFlowSpacing(base, 1.0).section === 21);
  });
});

describe("MIN_FLOW_SPACING hard floor", () => {
  it("is the tightest legible rhythm the fit engine may reach", () => {
    assert.deepEqual(MIN_FLOW_SPACING, {
      stack: 2, record: 2, section: 10, after_rule: 2,
    });
  });

  it("is tighter than the density minimum on record/section/after_rule", () => {
    assert.ok(MIN_FLOW_SPACING.record < DENSITY_SPACING_MIN.record);
    assert.ok(MIN_FLOW_SPACING.section < DENSITY_SPACING_MIN.section);
    assert.ok(MIN_FLOW_SPACING.after_rule < DENSITY_SPACING_MIN.after_rule);
  });

  it("is below the compact preset on every knob (engine descends past compact)", () => {
    for (const key of ["stack", "record", "section", "after_rule"]) {
      assert.ok(MIN_FLOW_SPACING[key] <= COMPACT_FLOW_SPACING[key]);
    }
  });

  it("scaleFlowSpacing cannot reach the floor (it clamps to DENSITY_SPACING_MIN)", () => {
    // A huge shrink still bottoms out at the density minimum, never the floor.
    const scaled = scaleFlowSpacing({ stack: 4, record: 10, section: 21, after_rule: 8 }, 0.01);
    assert.deepEqual(scaled, DENSITY_SPACING_MIN);
    assert.notDeepEqual(scaled, MIN_FLOW_SPACING);
  });
});
