import { applyChannelRelayout } from "./contactBandOps.js";
import { applyRegentTextSize } from "./regentAppearance.js";
import { applyFlowSpacing } from "./sectionStructure.js";
import { reconcileDocumentPages } from "./structureOperation.js";

/**
 * Apply a Regent type preset, contact reflow, document pack, and continuation
 * chrome reconciliation as one transaction.
 */
export function applyRegentTextSizeLayout(
  elements,
  textSizeId,
  { spacing, pageHeight = 842, createId, measureTextWidth = null },
) {
  const resized = applyRegentTextSize(elements, textSizeId, { measureTextWidth });
  const contacts = applyChannelRelayout(
    resized,
    "regent-contact",
    null,
    createId,
  ).elements;
  const packed = applyFlowSpacing(contacts, spacing, pageHeight);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}

/**
 * Repack Regent once after Chromium supplies the final textarea measurements.
 * Unmounted continuation-page fields keep the conservative preset estimate.
 */
export function applyRegentRenderedHeightsLayout(
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
