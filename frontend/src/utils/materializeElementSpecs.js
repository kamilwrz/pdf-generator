/**
 * Turn template/AI element specs into canvas-ready rows with fresh ids.
 *
 * Specs may carry symbolic `id` keys referenced by connectors; those are
 * rewritten to generated nanoids so connectors survive load.
 */
import { sanitizeTextContent } from "./sanitizeTextContent";

/**
 * @param {object[]|null|undefined} specs
 * @param {(size?: number) => string} createId - usually nanoid
 * @returns {object[]}
 */
export function materializeElementSpecs(specs, createId) {
  const idMap = {};
  const mapped = (specs || []).map((spec) => {
    const nid = createId();
    if (spec.id != null) idMap[spec.id] = nid;
    const { id, ...rest } = spec;
    const normalizedRest = rest.category === "circle"
      ? { ...rest, width: rest.width ?? rest.height ?? 80, height: rest.width ?? rest.height ?? 80 }
      : rest;
    const withCleanContent = "content" in normalizedRest
      ? { ...normalizedRest, content: sanitizeTextContent(normalizedRest.content) }
      : normalizedRest;
    const fixedToPage = Boolean(withCleanContent.fixedToPage);
    return {
      isSelected: false,
      isMove: false,
      isEditing: false,
      ...withCleanContent,
      // Keep the template semantic key (e.g. slate-photo-frame) alongside the
      // runtime nanoid so photo slots and chrome can be resolved after load.
      ...(id != null ? { id } : {}),
      fixedToPage,
      // Chrome stays interaction-locked even if a template omitted locked.
      locked: withCleanContent.locked ?? fixedToPage,
      page: withCleanContent.page ?? 1,
      element_id: nid,
    };
  });
  return mapped.map((el) => (el.category === "connector"
    ? { ...el, source_id: idMap[el.source_id] ?? el.source_id, target_id: idMap[el.target_id] ?? el.target_id }
    : el));
}
