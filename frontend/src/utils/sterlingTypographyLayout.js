import { applyChannelRelayout } from "./contactBandOps.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { applySterlingTextSize } from "./sterlingAppearance.js";
import { reconcileDocumentPages } from "./structureOperation.js";

/**
 * Apply one Sterling type preset as a single document-layout transaction.
 *
 * Resizing all text nodes at once cannot safely rely on each mounted textarea
 * to reflow its neighbours independently: those browser measurements arrive
 * in component order and briefly combine old and new box heights. This helper
 * seeds the new textarea heights, recomputes the contact band, packs both flow
 * lanes, and only then reconciles continuation-page chrome.
 *
 * @param {object[]} elements - Current canvas elements.
 * @param {string} textSizeId - Sterling S, M, L, or XL preset identifier.
 * @param {object} options - Current document layout inputs.
 * @param {object} options.spacing - Active vertical-rhythm settings.
 * @param {number} [options.pageHeight=842] - Canvas page height in points.
 * @param {() => string} options.createId - Identifier factory for cloned chrome.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * Browser-backed glyph-width reader used to seed exact wrapped heights.
 * @returns {object[]} Fully packed elements for the selected typography preset.
 */
export function applySterlingTextSizeLayout(
  elements,
  textSizeId,
  { spacing, pageHeight = 842, createId, measureTextWidth = null },
) {
  const resized = applySterlingTextSize(elements, textSizeId, { measureTextWidth });
  const contacts = applyChannelRelayout(
    resized,
    "sterling-contact",
    null,
    createId,
  ).elements;
  const packed = applyFlowSpacing(contacts, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}
