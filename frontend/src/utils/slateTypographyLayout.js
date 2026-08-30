import { applyChannelRelayout } from "./contactBandOps.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { applySlateTextSize } from "./slateAppearance.js";
import { reconcileDocumentPages } from "./structureOperation.js";

/**
 * Apply one Slate type preset as a single two-lane layout transaction.
 *
 * Text nodes are resized together, the wrapping masthead contact band is
 * rebuilt, main/sidebar content is packed, and continuation decorations are
 * reconciled. This prevents asynchronous textarea measurements from combining
 * old and new heights and temporarily overlapping a following section.
 *
 * @param {object[]} elements - Current Slate canvas elements.
 * @param {string} textSizeId - Slate S, M, L, or XL preset identifier.
 * @param {object} options - Current document layout inputs.
 * @param {object} options.spacing - Active vertical-rhythm settings.
 * @param {number} [options.pageHeight=842] - Canvas page height in points.
 * @param {() => string} options.createId - Identifier factory for cloned chrome.
 * @param {null|((text: string, style?: object) => number)} [options.measureTextWidth]
 * @returns {object[]} Fully packed elements for the selected typography preset.
 */
export function applySlateTextSizeLayout(
  elements,
  textSizeId,
  { spacing, pageHeight = 842, createId, measureTextWidth = null },
) {
  const resized = applySlateTextSize(elements, textSizeId, { measureTextWidth });
  const contacts = applyChannelRelayout(
    resized,
    "contact-main",
    null,
    createId,
  ).elements;
  const packed = applyFlowSpacing(contacts, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}

/**
 * Commit Chromium's Slate textarea heights and repack both document lanes.
 *
 * The initial preset transaction uses conservative estimates before paint.
 * This final batch replaces all mounted textarea heights before one structural
 * pack; fields on unmounted continuation pages keep their safe estimates.
 *
 * @param {object[]} elements - Current Slate canvas elements.
 * @param {Map<string, number>} measuredHeights - Browser scroll heights by id.
 * @param {object} options - Current document layout inputs.
 * @param {object} options.spacing - Active vertical-rhythm settings.
 * @param {number} [options.pageHeight=842] - Canvas page height in points.
 * @param {() => string} options.createId - Identifier factory for cloned chrome.
 * @returns {object[]} Browser-measured and fully repacked elements.
 */
export function applySlateRenderedHeightsLayout(
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

  // Pack even when a field-level effect already stored the same heights; that
  // effect may not have moved the next main or sidebar section from stale Y.
  const packed = applyFlowSpacing(measured, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}
