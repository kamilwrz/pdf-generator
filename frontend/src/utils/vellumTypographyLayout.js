import { applyChannelRelayout } from "./contactBandOps.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { applyVellumTextSize } from "./vellumAppearance.js";
import { reconcileDocumentPages } from "./structureOperation.js";

/**
 * Repair legacy Vellum list icons before recording the clean document snapshot.
 *
 * The first 8.6 pt / 10 pt gutter release needs a complete band reflow. Lists
 * already using the current size can still contain added icons with the old
 * baseline flag; repair only those icons against their companion textarea.
 * Current geometric icons, manual moves, and centred legacy mastheads remain
 * untouched. This pure normalization never writes to the API.
 *
 * @param {object[]} elements - Hydrated document elements.
 * @param {() => string} createId - Identifier factory for continuation chrome.
 * @returns {object[]} Repaired elements, or the original array when current.
 */
export function normalizeVellumContactLayout(elements, createId) {
  const anchor = elements.find((element) => element.contactBand?.id === "vellum-contact");
  const band = anchor?.contactBand;
  if (band?.mode !== "bounded-stack") return elements;
  if (band.icon?.sizePt !== 8.6 || band.metrics?.iconGap !== 10) {
    const labels = new Map(elements.filter((element) => element.contactBandId === band.id
      && element.contactChannel && element.category === "textarea")
      .map((element) => [element.contactChannel, element]));
    let changed = false;
    const repaired = elements.map((element) => {
      if (element.contactBandId !== band.id || element.category !== "image"
        || element.alignWithText === false) return element;
      const label = labels.get(element.contactChannel);
      const size = Number(band.icon?.sizePt);
      if (!label || Number(label.page || 1) !== Number(element.page || 1)
        || !Number.isFinite(size) || size <= 0
        || !Number.isFinite(Number(label.top)) || !Number.isFinite(Number(label.height))) return element;
      // Never add the legacy optical offset a second time. The stored box
      // centre becomes authoritative for canvas, selection and PDF rendering.
      changed = true;
      return { ...element, top: Number(label.top) + (Number(label.height) - size) / 2,
        width: size, height: size, alignWithText: false };
    });
    return changed ? repaired : elements;
  }
  const upgraded = elements.map((element) => element === anchor ? {
    ...element,
    contactBand: {
      ...band,
      icon: { ...band.icon, sizePt: 11 },
      metrics: { ...band.metrics, iconGap: 14 },
      ...(band.appearanceBaseMetrics ? {
        appearanceBaseMetrics: { ...band.appearanceBaseMetrics, iconGap: 14 },
      } : {}),
    },
  } : element);
  return applyChannelRelayout(upgraded, band.id, null, createId).elements;
}

/**
 * Apply one Vellum type preset as a single document-layout transaction.
 *
 * The left-aligned contact list is rebuilt before the one-column editorial flow
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
