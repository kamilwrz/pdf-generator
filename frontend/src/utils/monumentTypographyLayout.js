import { applyChannelRelayout } from "./contactBandOps.js";
import { applyMonumentTextSize } from "./monumentAppearance.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { reconcileDocumentPages } from "./structureOperation.js";

/**
 * Apply one Monument type preset as a single document-layout transaction.
 *
 * Every text field is resized first, then the wrapping masthead contacts are
 * rebuilt, the single document lane is packed, and continuation-page frame
 * decorations are reconciled. This prevents independently measured textareas
 * from temporarily overlapping the next numbered section.
 *
 * @param {object[]} elements - Current Monument canvas elements.
 * @param {string} textSizeId - Monument S, M, L, or XL preset identifier.
 * @param {object} options - Current document layout inputs.
 * @param {object} options.spacing - Active vertical-rhythm settings.
 * @param {number} [options.pageHeight=842] - Canvas page height in points.
 * @param {() => string} options.createId - Identifier factory for cloned chrome.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * Browser-backed glyph-width reader used to seed wrapped heights.
 * @returns {object[]} Fully packed elements for the selected typography preset.
 */
export function applyMonumentTextSizeLayout(
  elements,
  textSizeId,
  { spacing, pageHeight = 842, createId, measureTextWidth = null },
) {
  const resized = applyMonumentTextSize(elements, textSizeId, { measureTextWidth });
  const contacts = applyChannelRelayout(
    resized,
    "monument-contact",
    null,
    createId,
  ).elements;
  const packed = applyFlowSpacing(contacts, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}

/**
 * Commit Chromium's Monument textarea heights and repack the document once.
 *
 * The preset transaction uses a conservative pre-paint estimate. Browser font
 * metrics remain authoritative, so this final batch replaces every available
 * height before one structural pack instead of running competing field-level
 * reflows. Textareas on unmounted continuation pages keep their estimate.
 *
 * @param {object[]} elements - Current Monument canvas elements.
 * @param {Map<string, number>} measuredHeights - Browser scroll heights by id.
 * @param {object} options - Current document layout inputs.
 * @param {object} options.spacing - Active vertical-rhythm settings.
 * @param {number} [options.pageHeight=842] - Canvas page height in points.
 * @param {() => string} options.createId - Identifier factory for cloned chrome.
 * @returns {object[]} Browser-measured and fully repacked elements.
 */
export function applyMonumentRenderedHeightsLayout(
  elements,
  measuredHeights,
  { spacing, pageHeight = 842, createId },
) {
  if (!(measuredHeights instanceof Map) || measuredHeights.size === 0) {
    return elements;
  }

  const measured = elements.map((element) => {
    if (
      element.category !== "textarea"
      || element.fixedToPage
      || element.flowRole === "masthead"
    ) {
      return element;
    }
    const browserHeight = Number(measuredHeights.get(element.element_id));
    if (!Number.isFinite(browserHeight) || browserHeight <= 0) return element;
    const nextHeight = Math.max(Number(element.lineHeight) || 0, Math.ceil(browserHeight));
    if (Math.abs(nextHeight - Number(element.height)) < 0.5) return element;
    return { ...element, height: nextHeight };
  });

  // Pack even when mounted textareas already contain these heights. An earlier
  // field-level effect may have updated the box without moving the next plate.
  const packed = applyFlowSpacing(measured, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}
