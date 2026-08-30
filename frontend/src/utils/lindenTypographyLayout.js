import { applyChannelRelayout } from "./contactBandOps.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { applyLindenTextSize } from "./lindenAppearance.js";
import { reconcileDocumentPages } from "./structureOperation.js";

/**
 * Apply a Linden type preset, rebuild its stacked contact rail, pack both flow
 * lanes, and reconcile continuation-page furniture as one history operation.
 *
 * @param {object[]} elements - Current Linden canvas elements.
 * @param {string} textSizeId - Linden S, M, L, or XL preset identifier.
 * @param {object} options - Current document layout inputs.
 * @param {object} options.spacing - Active vertical-rhythm settings.
 * @param {number} [options.pageHeight=842] - Canvas page height in points.
 * @param {() => string} options.createId - Identifier factory for cloned chrome.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * @returns {object[]} Fully packed elements for the selected typography preset.
 */
export function applyLindenTextSizeLayout(
  elements,
  textSizeId,
  { spacing, pageHeight = 842, createId, measureTextWidth = null },
) {
  const resized = applyLindenTextSize(elements, textSizeId, { measureTextWidth });
  const contacts = applyChannelRelayout(
    resized,
    "linden-contact",
    null,
    createId,
  ).elements;
  const packed = applyFlowSpacing(contacts, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}

/**
 * Commit one complete browser-height snapshot before repacking Linden. This
 * prevents independent textarea effects from preserving a transient overlap
 * between a grown record and the following section.
 *
 * @param {object[]} elements - Current Linden canvas elements.
 * @param {Map<string, number>} measuredHeights - Browser scroll heights by id.
 * @param {object} options - Current document layout inputs.
 * @param {object} options.spacing - Active vertical-rhythm settings.
 * @param {number} [options.pageHeight=842] - Canvas page height in points.
 * @param {() => string} options.createId - Identifier factory for cloned chrome.
 * @returns {object[]} Browser-measured and fully repacked elements.
 */
export function applyLindenRenderedHeightsLayout(
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
