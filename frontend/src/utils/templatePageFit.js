/**
 * Template-aware deterministic page fitting.
 *
 * The ordinary spacing probe remains the first choice because it preserves the
 * user's typography. When that probe would require the hard floor or cannot
 * reach the target, the engine retries with the template's real `S` typography
 * transaction. AI is intentionally outside this module: callers may offer
 * content shortening only after the returned result still does not fit.
 */
import { findFitForTarget } from "./fitToPages.js";
import { applyAtriumTextSizeLayout } from "./atriumTypographyLayout.js";
import { applyAureliaTextSizeLayout } from "./aureliaTypographyLayout.js";
import { applyCadenzaTextSizeLayout } from "./cadenzaTypographyLayout.js";
import { applyLindenTextSizeLayout } from "./lindenTypographyLayout.js";
import { applyMeridianTextSizeLayout } from "./meridianTypographyLayout.js";
import { applyMonumentTextSizeLayout } from "./monumentTypographyLayout.js";
import { applyRegentTextSizeLayout } from "./regentTypographyLayout.js";
import { applySlateTextSizeLayout } from "./slateTypographyLayout.js";
import { applySterlingTextSizeLayout } from "./sterlingTypographyLayout.js";
import { applyVellumTextSizeLayout } from "./vellumTypographyLayout.js";

const SMALL_TEXT_SIZE_ID = "S";

const smallTypographyLayouts = new Map([
  ["atrium", applyAtriumTextSizeLayout],
  ["aurelia", applyAureliaTextSizeLayout],
  ["cadenza", applyCadenzaTextSizeLayout],
  ["linden", applyLindenTextSizeLayout],
  ["meridian", applyMeridianTextSizeLayout],
  ["monument", applyMonumentTextSizeLayout],
  ["regent", applyRegentTextSizeLayout],
  ["slate", applySlateTextSizeLayout],
  ["sterling", applySterlingTextSizeLayout],
  ["vellum", applyVellumTextSizeLayout],
]);

/**
 * Report whether a registered template can participate in the S fallback.
 * Kept public so the registry coverage contract fails when a new template is
 * added without an explicit typography transaction.
 *
 * @param {string} templateId
 * @returns {boolean}
 */
export function supportsSmallTypographyFit(templateId) {
  return smallTypographyLayouts.has(templateId);
}

function createProbeIdFactory(elements) {
  const used = new Set((Array.isArray(elements) ? elements : [])
    .map((element) => element?.element_id)
    .filter(Boolean));
  let counter = 0;
  return () => {
    let candidate;
    do {
      counter += 1;
      candidate = `fit-typography-probe-${counter}`;
    } while (used.has(candidate));
    used.add(candidate);
    return candidate;
  };
}

/**
 * Compare the current typography with an already prepared `S` candidate.
 *
 * A clean/tight spacing-only result wins immediately. An emergency result is
 * retained as a safe fallback, but `S` is tried first because it can recover a
 * more readable rhythm. Any fitting result is deterministic and must be used
 * before content is sent to AI.
 *
 * @param {object} args
 * @param {object[]} args.elements - Current document elements.
 * @param {object[]|null} args.smallElements - Same document after preset `S`.
 * @param {object} args.loosest - Baseline spacing.
 * @param {object} args.tightest - Hard spacing floor.
 * @param {number} args.targetPages - Requested maximum page count.
 * @param {number} [args.pageHeight=842] - Canvas page height.
 * @param {Function} [args.packFn] - Optional deterministic pack override for tests.
 * @param {object|null} [args.spacingFitResult] - Reused first-stage probe.
 * @returns {object} A normal fit result plus typography strategy metadata.
 */
export function findFitAcrossTypography({
  elements,
  smallElements = null,
  loosest,
  tightest,
  targetPages,
  pageHeight = 842,
  packFn,
  spacingFitResult = null,
}) {
  const common = { loosest, tightest, targetPages, pageHeight };
  if (packFn) common.packFn = packFn;

  const spacingFit = spacingFitResult ?? findFitForTarget({ elements, ...common });
  if (spacingFit.fits && spacingFit.tier !== "emergency") {
    return {
      ...spacingFit,
      attemptedSmallTypography: false,
      typographyPreset: null,
    };
  }

  let smallFit = null;
  if (Array.isArray(smallElements)) {
    smallFit = findFitForTarget({ elements: smallElements, ...common });
    if (smallFit.fits) {
      return {
        ...smallFit,
        attemptedSmallTypography: true,
        typographyPreset: SMALL_TEXT_SIZE_ID,
      };
    }
  }

  if (spacingFit.fits) {
    return {
      ...spacingFit,
      attemptedSmallTypography: Array.isArray(smallElements),
      typographyPreset: null,
    };
  }

  return {
    ...(smallFit ?? spacingFit),
    attemptedSmallTypography: Array.isArray(smallElements),
    typographyPreset: null,
  };
}

/**
 * Run the complete deterministic fit for one registered CV template.
 *
 * The `S` candidate uses the same template-specific typography transaction as
 * the Appearance panel, including contact relayout, flow packing, and fixed
 * page-chrome reconciliation. Trial identifiers are local and deterministic;
 * callers committing the result may supply `nanoid` as `createId`.
 *
 * @param {object} args
 * @param {object[]} args.elements
 * @param {string} args.templateId
 * @param {object} args.loosest
 * @param {object} args.tightest
 * @param {number} args.targetPages
 * @param {number} [args.pageHeight=842]
 * @param {() => string} [args.createId]
 * @param {null|((text: string, style?: object) => number)} [args.measureTextWidth]
 * @returns {object} Fit result with `typographyPreset: "S"` when S was selected.
 */
export function findTemplateFitForTarget({
  elements,
  templateId,
  loosest,
  tightest,
  targetPages,
  pageHeight = 842,
  createId,
  measureTextWidth = null,
}) {
  const spacingFit = findFitForTarget({
    elements,
    loosest,
    tightest,
    targetPages,
    pageHeight,
  });
  if (spacingFit.fits && spacingFit.tier !== "emergency") {
    return {
      ...spacingFit,
      attemptedSmallTypography: false,
      typographyPreset: null,
    };
  }

  const applySmallTypography = smallTypographyLayouts.get(templateId);
  const smallElements = applySmallTypography
    ? applySmallTypography(elements, SMALL_TEXT_SIZE_ID, {
      spacing: loosest,
      pageHeight,
      createId: createId ?? createProbeIdFactory(elements),
      measureTextWidth,
    })
    : null;

  return findFitAcrossTypography({
    elements,
    smallElements,
    loosest,
    tightest,
    targetPages,
    pageHeight,
    spacingFitResult: spacingFit,
  });
}
