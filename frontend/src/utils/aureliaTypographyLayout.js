import { applyChannelRelayout } from "./contactBandOps.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { applyAureliaTextSize } from "./aureliaAppearance.js";
import { reconcileDocumentPages } from "./structureOperation.js";

/**
 * Apply one Aurelia type preset as a complete layout transaction.
 *
 * The managed contact band is rebuilt before the single-column flow is packed.
 * The masthead frame stays fixed, while period/city overlays retain their
 * exact record anchors.
 *
 * @param {object[]} elements - Current Aurelia canvas elements.
 * @param {string} textSizeId - Aurelia S, M, L, or XL preset identifier.
 * @param {object} options - Current document layout inputs.
 * @param {object} options.spacing - Active vertical-rhythm settings.
 * @param {number} [options.pageHeight=842] - Canvas page height in points.
 * @param {() => string} options.createId - Identifier factory for cloned chrome.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * @returns {object[]} Fully packed elements for the selected preset.
 */
export function applyAureliaTextSizeLayout(
  elements,
  textSizeId,
  { spacing, pageHeight = 842, createId, measureTextWidth = null },
) {
  const resized = applyAureliaTextSize(elements, textSizeId, { measureTextWidth });
  const contacts = applyChannelRelayout(
    resized,
    "aurelia-contact",
    null,
    createId,
  ).elements;
  const packed = applyFlowSpacing(contacts, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}

/**
 * Commit browser textarea heights and repack Aurelia once after font settle.
 *
 * @param {object[]} elements - Current Aurelia canvas elements.
 * @param {Map<string, number>} measuredHeights - Browser scroll heights by id.
 * @param {object} options - Current document layout inputs.
 * @param {object} options.spacing - Active vertical-rhythm settings.
 * @param {number} [options.pageHeight=842] - Canvas page height in points.
 * @param {() => string} options.createId - Identifier factory for cloned chrome.
 * @returns {object[]} Browser-measured and fully repacked elements.
 */
export function applyAureliaRenderedHeightsLayout(
  elements,
  measuredHeights,
  { spacing, pageHeight = 842, createId },
) {
  if (!(measuredHeights instanceof Map) || measuredHeights.size === 0) return elements;

  const measured = elements.map((element) => {
    if (
      element.category !== "textarea"
      || element.fixedToPage
      || element.flowRole === "masthead"
    ) return element;
    const browserHeight = Number(measuredHeights.get(element.element_id));
    if (!Number.isFinite(browserHeight) || browserHeight <= 0) return element;
    const nextHeight = Math.max(Number(element.lineHeight) || 0, Math.ceil(browserHeight));
    if (Math.abs(nextHeight - Number(element.height)) < 0.5) return element;
    return { ...element, height: nextHeight };
  });

  const packed = applyFlowSpacing(measured, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}
