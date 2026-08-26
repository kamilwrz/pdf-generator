import { applyFlowSpacing } from "./sectionStructure.js";
import { reconcileDocumentPages } from "./structureOperation.js";

/**
 * Repack Portico's complete section flow after its masthead changes height.
 *
 * Photo and job-title toggles first update the authored masthead geometry.
 * That local transformation cannot decide whether a section currently on a
 * continuation page now fits on page one, so this second pass deliberately
 * runs the shared document packer before trailing fixed chrome is reconciled.
 *
 * @param {object[]} elements - Elements after the masthead transformation.
 * @param {object} spacing - The document's current vertical-rhythm settings.
 * @param {() => string} createId - Identifier factory for continuation chrome.
 * @returns {object[]} Repacked elements with the correct final page count.
 */
export function reflowPorticoAfterMastheadChange(elements, spacing, createId) {
  const packed = applyFlowSpacing(elements, spacing);
  return reconcileDocumentPages(packed, createId, { collapseEmpty: true }).elements;
}
