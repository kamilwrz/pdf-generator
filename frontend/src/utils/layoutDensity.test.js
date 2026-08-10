import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_FIT_SCALE_FACTORS,
  densityDistanceFromBaseline,
  formatPageCountLabel,
  isAlreadyWellBalanced,
  measureDocumentPageFills,
  measurePageFill,
  proposeAutoFitSpacing,
  scoreLayout,
} from "./layoutDensity.js";
import {
  DEFAULT_FLOW_SPACING,
  densityPresetsFromBaseline,
  DENSITY_SPACING_MIN,
  flowSpacingEquals,
  matchDensityPreset,
  scaleFlowSpacing,
} from "./flowSpacing.js";

const el = (page, top, height, extra = {}) => ({ page, top, height, ...extra });

/** Mock packer: maps average spacing scale → prebuilt page fills / page counts. */
function makeScriptedPacker(script) {
  return (elements, spacing) => {
    const baseline = DEFAULT_FLOW_SPACING;
    const scale = spacing.section / baseline.section;
    const nearest = Object.keys(script)
      .map(Number)
      .sort((a, b) => Math.abs(a - scale) - Math.abs(b - scale))[0];
    return script[nearest];
  };
}

describe("measurePageFill", () => {
  it("ignores fixedToPage chrome", () => {
    const elements = [
      { page: 1, top: 0, height: 842, fixedToPage: true },
      el(1, 66, 140),
    ];
    const fill = measurePageFill(elements, 1);
    assert.ok(fill > 0.15 && fill < 0.25, `expected ~0.20, got ${fill}`);
  });

  it("returns fills for every page", () => {
    const elements = [el(1, 66, 640), el(2, 66, 100)];
    const fills = measureDocumentPageFills(elements, 2);
    assert.equal(fills.length, 2);
    assert.ok(fills[0] > 0.85);
    assert.ok(fills[1] < 0.25);
  });
});

describe("formatPageCountLabel", () => {
  it("uses Polish plural forms", () => {
    assert.equal(formatPageCountLabel(1), "1 strona");
    assert.equal(formatPageCountLabel(2), "2 strony");
    assert.equal(formatPageCountLabel(3), "3 strony");
    assert.equal(formatPageCountLabel(5), "5 stron");
    assert.equal(formatPageCountLabel(22), "22 strony");
  });
});

describe("density presets from baseline", () => {
  it("builds compact below and spacious above the baseline", () => {
    const presets = densityPresetsFromBaseline(DEFAULT_FLOW_SPACING);
    assert.ok(presets.compact.section < presets.standard.section);
    assert.ok(presets.compact.record < presets.standard.record);
    assert.ok(presets.spacious.section > presets.standard.section);
    assert.ok(presets.spacious.stack > presets.standard.stack);
    assert.equal(matchDensityPreset(presets.standard, DEFAULT_FLOW_SPACING), "standard");
    assert.equal(matchDensityPreset(presets.compact, DEFAULT_FLOW_SPACING), "compact");
    assert.equal(matchDensityPreset(presets.spacious, DEFAULT_FLOW_SPACING), "spacious");
    assert.equal(
      matchDensityPreset({ ...DEFAULT_FLOW_SPACING, section: 40 }, DEFAULT_FLOW_SPACING),
      null,
    );
  });

  it("respects density minima when scaling down", () => {
    const tiny = { stack: 2, record: 5, section: 12, after_rule: 4 };
    const scaled = scaleFlowSpacing(tiny, 0.5);
    assert.equal(scaled.stack, DENSITY_SPACING_MIN.stack);
    assert.equal(scaled.record, DENSITY_SPACING_MIN.record);
    assert.equal(scaled.section, DENSITY_SPACING_MIN.section);
    assert.equal(scaled.after_rule, DENSITY_SPACING_MIN.after_rule);
  });
});

describe("scoreLayout", () => {
  it("penalizes inventing an extra page", () => {
    const onePage = scoreLayout({
      pageCount: 1,
      fills: [0.55],
      spacing: DEFAULT_FLOW_SPACING,
      baselineSpacing: DEFAULT_FLOW_SPACING,
      minAchievablePages: 1,
    });
    const twoPages = scoreLayout({
      pageCount: 2,
      fills: [0.7, 0.4],
      spacing: scaleFlowSpacing(DEFAULT_FLOW_SPACING, 1.3),
      baselineSpacing: DEFAULT_FLOW_SPACING,
      minAchievablePages: 1,
    });
    assert.ok(twoPages > onePage + 500);
  });

  it("penalizes 95/30 imbalance more than 78/62", () => {
    const uneven = scoreLayout({
      pageCount: 2,
      fills: [0.95, 0.3],
      spacing: DEFAULT_FLOW_SPACING,
      baselineSpacing: DEFAULT_FLOW_SPACING,
      minAchievablePages: 2,
    });
    const balanced = scoreLayout({
      pageCount: 2,
      fills: [0.78, 0.62],
      spacing: DEFAULT_FLOW_SPACING,
      baselineSpacing: DEFAULT_FLOW_SPACING,
      minAchievablePages: 2,
    });
    assert.ok(uneven > balanced);
  });

  it("prefers spacing closer to baseline when fills match", () => {
    const near = scoreLayout({
      pageCount: 1,
      fills: [0.5],
      spacing: scaleFlowSpacing(DEFAULT_FLOW_SPACING, 1.1),
      baselineSpacing: DEFAULT_FLOW_SPACING,
      minAchievablePages: 1,
    });
    const far = scoreLayout({
      pageCount: 1,
      fills: [0.5],
      spacing: scaleFlowSpacing(DEFAULT_FLOW_SPACING, 1.3),
      baselineSpacing: DEFAULT_FLOW_SPACING,
      minAchievablePages: 1,
    });
    assert.ok(near < far);
    assert.ok(densityDistanceFromBaseline(
      scaleFlowSpacing(DEFAULT_FLOW_SPACING, 1.1),
      DEFAULT_FLOW_SPACING,
    ) < densityDistanceFromBaseline(
      scaleFlowSpacing(DEFAULT_FLOW_SPACING, 1.3),
      DEFAULT_FLOW_SPACING,
    ));
  });
});

describe("proposeAutoFitSpacing", () => {
  it("chooses a more spacious spacing for a very empty single page", () => {
    const sparse = [el(1, 66, 140)]; // ~20% fill
    const mid = [el(1, 66, 280)];
    const roomy = [el(1, 66, 360)];
    const packFn = makeScriptedPacker({
      0.65: sparse,
      0.75: sparse,
      0.85: sparse,
      1: sparse,
      1.1: mid,
      1.2: mid,
      1.3: roomy,
    });
    const result = proposeAutoFitSpacing({
      elements: sparse,
      baselineSpacing: DEFAULT_FLOW_SPACING,
      currentSpacing: DEFAULT_FLOW_SPACING,
      packFn,
    });
    assert.equal(result.changed, true);
    assert.ok(result.spacing.section > DEFAULT_FLOW_SPACING.section);
    assert.equal(result.pageCount, 1);
  });

  it("leaves a well-filled single page alone", () => {
    const full = [el(1, 66, 560)]; // ~79%
    const packFn = () => full;
    const result = proposeAutoFitSpacing({
      elements: full,
      baselineSpacing: DEFAULT_FLOW_SPACING,
      currentSpacing: DEFAULT_FLOW_SPACING,
      packFn,
    });
    assert.equal(result.changed, false);
    assert.ok(["well_balanced", "already_best"].includes(result.reason));
    assert.equal(flowSpacingEquals(result.spacing, DEFAULT_FLOW_SPACING), true);
  });

  it("does not grow from 1 page to 2 just to raise spacing", () => {
    const onePage = [el(1, 66, 400)];
    const twoPages = [el(1, 66, 640), el(2, 66, 120)];
    const packFn = makeScriptedPacker({
      0.65: onePage,
      0.75: onePage,
      0.85: onePage,
      1: onePage,
      1.1: onePage,
      1.2: twoPages,
      1.3: twoPages,
    });
    const result = proposeAutoFitSpacing({
      elements: onePage,
      baselineSpacing: DEFAULT_FLOW_SPACING,
      currentSpacing: DEFAULT_FLOW_SPACING,
      packFn,
    });
    assert.ok(result.pageCount == null || result.pageCount === 1 || result.changed === false);
    if (result.changed) {
      assert.equal(result.pageCount, 1);
      assert.ok(result.spacing.section <= Math.round(DEFAULT_FLOW_SPACING.section * 1.1));
    }
  });

  it("improves a 95/30 two-page imbalance when a balanced candidate exists", () => {
    const uneven = [el(1, 66, 670), el(2, 66, 140)];
    const better = [el(1, 66, 520), el(2, 66, 400)];
    const packFn = makeScriptedPacker({
      0.65: uneven,
      0.75: uneven,
      0.85: uneven,
      1: uneven,
      1.1: better,
      1.2: better,
      1.3: [el(1, 66, 670), el(2, 66, 200), el(3, 66, 80)],
    });
    const result = proposeAutoFitSpacing({
      elements: uneven,
      baselineSpacing: DEFAULT_FLOW_SPACING,
      currentSpacing: DEFAULT_FLOW_SPACING,
      packFn,
    });
    assert.equal(result.changed, true);
    assert.equal(result.pageCount, 2);
    assert.ok(result.spacing.section > DEFAULT_FLOW_SPACING.section);
  });

  it("does not change an already balanced 90/85 layout", () => {
    const balanced = [el(1, 66, 630), el(2, 66, 600)];
    assert.equal(isAlreadyWellBalanced(measureDocumentPageFills(balanced, 2)), true);
    const result = proposeAutoFitSpacing({
      elements: balanced,
      baselineSpacing: DEFAULT_FLOW_SPACING,
      currentSpacing: DEFAULT_FLOW_SPACING,
      packFn: () => balanced,
    });
    assert.equal(result.changed, false);
    assert.equal(result.reason, "well_balanced");
  });

  it("never selects a candidate that increases pageCount when a smaller count exists", () => {
    const two = [el(1, 66, 600), el(2, 66, 200)];
    const three = [el(1, 66, 600), el(2, 66, 400), el(3, 66, 100)];
    const packFn = makeScriptedPacker({
      0.65: two,
      0.75: two,
      0.85: two,
      1: two,
      1.1: two,
      1.2: two,
      1.3: three,
    });
    const result = proposeAutoFitSpacing({
      elements: two,
      baselineSpacing: DEFAULT_FLOW_SPACING,
      currentSpacing: DEFAULT_FLOW_SPACING,
      packFn,
    });
    assert.ok((result.pageCount ?? 2) <= 2);
    if (result.changed) {
      assert.notEqual(
        flowSpacingEquals(result.spacing, scaleFlowSpacing(DEFAULT_FLOW_SPACING, 1.3)),
        true,
      );
    }
  });

  it("exposes the scale-factor set used by auto-fit", () => {
    assert.deepEqual([...AUTO_FIT_SCALE_FACTORS], [0.65, 0.75, 0.85, 1, 1.1, 1.2, 1.3]);
  });
});
