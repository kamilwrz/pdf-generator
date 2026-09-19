import { applyChannelRelayout } from "./contactBandOps.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { applyAmaranthTextSize } from "./amaranthAppearance.js";
import { reconcileDocumentPages } from "./structureOperation.js";

/**
 * Apply one Amaranth type preset as a single document-layout transaction.
 *
 * Content copy is resized first, then the bounded contact stack is rebuilt (the
 * same reflow also re-pins the masthead divider and its rounded accent bar),
 * the single editorial column and its right-hand date/location overlays are
 * packed, and continuation-page chrome is reconciled. The rounded photo cluster
 * stays fixed page chrome, and the summary field follows its textarea through
 * the shared section-background contract.
 *
 * @param {object[]} elements - Current Amaranth canvas elements.
 * @param {string} textSizeId - Amaranth S, M, L, or XL preset identifier.
 * @param {object} options - Current document layout inputs.
 * @param {object} options.spacing - Active vertical-rhythm settings.
 * @param {number} [options.pageHeight=842] - Canvas page height in points.
 * @param {() => string} options.createId - Identifier factory for cloned chrome.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * @returns {object[]} Fully packed elements for the selected typography preset.
 */
export function applyAmaranthTextSizeLayout(
  elements,
  textSizeId,
  { spacing, pageHeight = 842, createId, measureTextWidth = null },
) {
  const resized = applyAmaranthTextSize(elements, textSizeId, { measureTextWidth });
  const contacts = applyChannelRelayout(resized, "amaranth-contact", null, createId).elements;
  const packed = applyFlowSpacing(contacts, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}

/**
 * Commit Chromium's Amaranth textarea heights and repack the document once.
 *
 * The first transaction uses conservative pre-paint estimates. This final batch
 * replaces every mounted flow height before one structural pack, while unmounted
 * continuation-page fields retain their safe estimates.
 *
 * @param {object[]} elements - Current Amaranth canvas elements.
 * @param {Map<string, number>} measuredHeights - Browser scroll heights by id.
 * @param {object} options - Current document layout inputs.
 * @param {object} options.spacing - Active vertical-rhythm settings.
 * @param {number} [options.pageHeight=842] - Canvas page height in points.
 * @param {() => string} options.createId - Identifier factory for cloned chrome.
 * @returns {object[]} Browser-measured and fully repacked elements.
 */
export function applyAmaranthRenderedHeightsLayout(
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

  const packed = applyFlowSpacing(measured, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}
