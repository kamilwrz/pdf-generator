/**
 * Per-document vertical rhythm (px), mirrored from backend SPACE_* defaults.
 *
 * Edited in the Sections panel and persisted as `Pdf.spacing_px`. Initial
 * fill flows (import / bio) send the live knobs to `/ai/fill_template`.
 * Change-template regenerates with `DEFAULT_FLOW_SPACING` so a previous
 * template’s custom rhythm does not leak into the new layout.
 */

export const DEFAULT_FLOW_SPACING = Object.freeze({
  stack: 4,
  record: 10,
  section: 21,
  after_rule: 8,
});

/**
 * Compact rhythm preset: ~30% tighter than the generator defaults, applied
 * deterministically (no API cost) as the first attempt to fit a too-long CV
 * on fewer pages. Deliberately NOT a literal halving of every value — that
 * kills the visual rhythm of templates like Monument / Portico. Each knob is
 * reduced proportionally but kept above a legible minimum.
 */
export const COMPACT_FLOW_SPACING = Object.freeze({
  stack: 3,
  record: 7,
  section: 15,
  after_rule: 6,
});

const SPACING_MIN = 0;
const SPACING_MAX = 80;

function clampSpacing(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(SPACING_MAX, Math.max(SPACING_MIN, parsed));
}

/**
 * Normalize a partial spacing object onto defaults.
 * @param {object|null|undefined} raw
 * @returns {{ stack: number, record: number, section: number, after_rule: number }}
 */
export function normalizeFlowSpacing(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    stack: clampSpacing(source.stack, DEFAULT_FLOW_SPACING.stack),
    record: clampSpacing(source.record, DEFAULT_FLOW_SPACING.record),
    section: clampSpacing(source.section, DEFAULT_FLOW_SPACING.section),
    after_rule: clampSpacing(source.after_rule, DEFAULT_FLOW_SPACING.after_rule),
  };
}

/**
 * Payload shape for create/update/autosave / fill_template.
 */
export function flowSpacingToPayload(spacing) {
  return normalizeFlowSpacing(spacing);
}

/**
 * True when two spacing objects normalize to the same rhythm knobs.
 */
export function flowSpacingEquals(left, right) {
  const a = normalizeFlowSpacing(left);
  const b = normalizeFlowSpacing(right);
  return (
    a.stack === b.stack
    && a.record === b.record
    && a.section === b.section
    && a.after_rule === b.after_rule
  );
}

/**
 * True when every key matches the generator defaults.
 */
export function isDefaultFlowSpacing(spacing) {
  return flowSpacingEquals(spacing, DEFAULT_FLOW_SPACING);
}

/**
 * True when the spacing already matches the compact preset (used to disable /
 * mark the "Kompaktowo" control when it would be a no-op).
 */
export function isCompactFlowSpacing(spacing) {
  return flowSpacingEquals(spacing, COMPACT_FLOW_SPACING);
}

/**
 * Safe minima for density presets / auto-fit scaling. Tighter than absolute
 * zero so stack/record/section rhythm stays legible on every template.
 */
export const DENSITY_SPACING_MIN = Object.freeze({
  stack: 2,
  record: 5,
  section: 12,
  after_rule: 4,
});

/**
 * Absolute hard floor for the progressive page-fit engine (fitToPages.js).
 * Tighter than DENSITY_SPACING_MIN — this is the lowest legible rhythm we will
 * ever apply, and only to save a page. `scaleFlowSpacing` clamps to
 * DENSITY_SPACING_MIN and can never reach this; the fit engine builds its own
 * candidate ladder to descend here. Never surfaced as a density preset.
 */
export const MIN_FLOW_SPACING = Object.freeze({
  stack: 2,
  record: 2,
  section: 10,
  after_rule: 2,
});

/**
 * Scale all four rhythm knobs from a baseline, respecting density minima.
 *
 * Used by the Układ CV density segmented control and offline auto-fit trials.
 * Does not change `spacing_px` shape — still `{ stack, record, section, after_rule }`.
 *
 * @param {object} baseline
 * @param {number} factor
 * @returns {{ stack: number, record: number, section: number, after_rule: number }}
 */
export function scaleFlowSpacing(baseline, factor) {
  const base = normalizeFlowSpacing(baseline);
  const scale = Number(factor);
  const safeFactor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return normalizeFlowSpacing({
    stack: Math.max(
      DENSITY_SPACING_MIN.stack,
      Math.round(base.stack * safeFactor),
    ),
    record: Math.max(
      DENSITY_SPACING_MIN.record,
      Math.round(base.record * safeFactor),
    ),
    section: Math.max(
      DENSITY_SPACING_MIN.section,
      Math.round(base.section * safeFactor),
    ),
    after_rule: Math.max(
      DENSITY_SPACING_MIN.after_rule,
      Math.round(base.after_rule * safeFactor),
    ),
  });
}

/**
 * Compact / standard / spacious presets relative to the document baseline.
 *
 * Compact and spacious use the product formulas from the Układ CV panel
 * (not the absolute `COMPACT_FLOW_SPACING` used by the 3+ page LongCv modal).
 *
 * @param {object} baseline
 * @returns {{
 *   compact: { stack: number, record: number, section: number, after_rule: number },
 *   standard: { stack: number, record: number, section: number, after_rule: number },
 *   spacious: { stack: number, record: number, section: number, after_rule: number },
 * }}
 */
export function densityPresetsFromBaseline(baseline) {
  const standard = normalizeFlowSpacing(baseline);
  return {
    compact: normalizeFlowSpacing({
      stack: Math.max(DENSITY_SPACING_MIN.stack, Math.round(standard.stack * 0.75)),
      record: Math.max(DENSITY_SPACING_MIN.record, Math.round(standard.record * 0.70)),
      section: Math.max(DENSITY_SPACING_MIN.section, Math.round(standard.section * 0.70)),
      after_rule: Math.max(
        DENSITY_SPACING_MIN.after_rule,
        Math.round(standard.after_rule * 0.75),
      ),
    }),
    standard,
    spacious: normalizeFlowSpacing({
      stack: Math.round(standard.stack * 1.25),
      record: Math.round(standard.record * 1.25),
      section: Math.round(standard.section * 1.20),
      after_rule: Math.round(standard.after_rule * 1.25),
    }),
  };
}

/**
 * Which density segment matches the live knobs, or null when custom.
 *
 * @param {object} spacing
 * @param {object} baseline
 * @returns {"compact"|"standard"|"spacious"|null}
 */
export function matchDensityPreset(spacing, baseline) {
  const presets = densityPresetsFromBaseline(baseline);
  if (flowSpacingEquals(spacing, presets.standard)) return "standard";
  if (flowSpacingEquals(spacing, presets.compact)) return "compact";
  if (flowSpacingEquals(spacing, presets.spacious)) return "spacious";
  return null;
}
