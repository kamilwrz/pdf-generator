import { applyChannelRelayout } from "./contactBandOps.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { applyVellumTextSize } from "./vellumAppearance.js";
import { reconcileDocumentPages } from "./structureOperation.js";

/**
 * Apply one Vellum type preset as a single document-layout transaction.
 *
 * The centered contact band is rebuilt before the one-column editorial flow
 * is packed. The circular portrait remains fixed page chrome, the summary fill
 * follows its textarea through the shared section-background contract, and
 * right-hand date/location overlays keep their exact record anchors.
 *
 * @param {object[]} elements - Current Vellum canvas elements.
 * @param {string} textSizeId - Vellum S, M, L, or XL preset identifier.
 * @param {object} options - Current document layout inputs.
 * @param {object} options.spacing - Active vertical-rhythm settings.
 * @param {number} [options.pageHeight=842] - Canvas page height in points.
 * @param {() => string} options.createId - Identifier factory for cloned chrome.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * @returns {object[]} Fully packed elements for the selected typography preset.
 */
export function applyVellumTextSizeLayout(
  elements,
  textSizeId,
  { spacing, pageHeight = 842, createId, measureTextWidth = null },
) {
  const resized = applyVellumTextSize(elements, textSizeId, { measureTextWidth });
  const contacts = applyChannelRelayout(
    resized,
    "vellum-contact",
    null,
    createId,
  ).elements;
  const packed = applyFlowSpacing(contacts, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}

/**
 * Commit Chromium's Vellum textarea heights and repack the document once.
 *
 * @param {object[]} elements - Current Vellum canvas elements.
 * @param {Map<string, number>} measuredHeights - Browser scroll heights by id.
 * @param {object} options - Current document layout inputs.
 * @param {object} options.spacing - Active vertical-rhythm settings.
 * @param {number} [options.pageHeight=842] - Canvas page height in points.
 * @param {() => string} options.createId - Identifier factory for cloned chrome.
 * @returns {object[]} Browser-measured and fully repacked elements.
 */
export function applyVellumRenderedHeightsLayout(
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

  // Repack even when a field-level effect already committed the same heights;
  // the next section, summary background, or exact-top overlays may still need
  // to move as one document transaction.
  const packed = applyFlowSpacing(measured, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}
