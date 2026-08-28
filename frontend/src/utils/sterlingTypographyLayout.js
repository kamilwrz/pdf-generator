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

/**
 * Repack Sterling once after Chromium has measured every rendered textarea.
 *
 * The preset transaction above deliberately seeds heights before paint, but
 * browser font metrics remain the final authority. React textareas report
 * those metrics independently; applying each delta as a separate lane reflow
 * can preserve a transient overlap created by an earlier measurement. This
 * helper commits all available DOM heights first and then runs one structural
 * pack, so a long final job description always moves the following Education
 * section as a unit.
 *
 * Only mounted fields appear in `measuredHeights` (single-page view may leave
 * continuation pages unmounted). Unmeasured fields retain the conservative
 * heights produced by `applySterlingTextSizeLayout`.
 *
 * @param {object[]} elements - Current Sterling canvas elements.
 * @param {Map<string, number>} measuredHeights - Browser scroll heights by id.
 * @param {object} options - Current document layout inputs.
 * @param {object} options.spacing - Active vertical-rhythm settings.
 * @param {number} [options.pageHeight=842] - Canvas page height in points.
 * @param {() => string} options.createId - Identifier factory for cloned chrome.
 * @returns {object[]} Browser-measured and fully repacked elements.
 */
export function applySterlingRenderedHeightsLayout(
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

  // Always pack when a browser snapshot is available. Earlier independent
  // textarea effects may already have committed the same heights while still
  // leaving a following section at its transient, overlapping Y position.
  const packed = applyFlowSpacing(measured, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}
