import { applyChannelRelayout } from "./contactBandOps.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { applyAtriumTextSize } from "./atriumAppearance.js";
import { reconcileDocumentPages } from "./structureOperation.js";

/**
 * Apply one Atrium type preset as a single document-layout transaction.
 *
 * The centered contact band is rebuilt before the one-column editorial flow
 * is packed. Date and location overlays remain pinned to their record lines.
 */
export function applyAtriumTextSizeLayout(
  elements,
  textSizeId,
  { spacing, pageHeight = 842, createId, measureTextWidth = null },
) {
  const resized = applyAtriumTextSize(elements, textSizeId, { measureTextWidth });
  const contacts = applyChannelRelayout(
    resized,
    "contact-main",
    null,
    createId,
  ).elements;
  const packed = applyFlowSpacing(contacts, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}

/** Commit Chromium textarea heights and repack Atrium once. */
export function applyAtriumRenderedHeightsLayout(
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
