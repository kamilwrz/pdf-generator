/**
 * Per-document vertical rhythm (px), mirrored from backend SPACE_* defaults.
 *
 * Edited in the Sections panel, persisted as `Pdf.spacing_px`, and sent to
 * `/ai/fill_template` so regeneration matches the live canvas packer.
 */

export const DEFAULT_FLOW_SPACING = Object.freeze({
  stack: 4,
  record: 10,
  section: 21,
  after_rule: 8,
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
 * True when every key matches the generator defaults.
 */
export function isDefaultFlowSpacing(spacing) {
  const normalized = normalizeFlowSpacing(spacing);
  return (
    normalized.stack === DEFAULT_FLOW_SPACING.stack
    && normalized.record === DEFAULT_FLOW_SPACING.record
    && normalized.section === DEFAULT_FLOW_SPACING.section
    && normalized.after_rule === DEFAULT_FLOW_SPACING.after_rule
  );
}
