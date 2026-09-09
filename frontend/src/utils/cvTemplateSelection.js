/**
 * CV template list for wizards and change-template flows.
 * Preserves registry order so every picker shows the same individual templates
 * (no industry/style collections).
 */
import { listTemplatesInRegistryOrder } from "./templateLayouts.js";
import { isTemplateAllowed } from "./entitlements.js";

export const selectCvTemplates = (templates) => listTemplatesInRegistryOrder(templates);

/**
 * Resolve an untrusted landing selection against the Free registry only.
 * Returns null for missing, unknown or paid IDs; callers then use normal setup.
 * This does not grant entitlements or materialize a document.
 */
export function resolveFreeStartTemplate(templates, templateId) {
  return templates.find((template) => template.id === templateId && template.tier === "free") || null;
}

/**
 * Next or previous template the current plan may apply, wrapping in registry order.
 *
 * Locked (Pro) templates are skipped so the topbar arrows never land on a
 * paywall. Returns null when fewer than two allowed templates exist, so the
 * caller can disable the control instead of no-op cycling.
 *
 * @param {Array<object>} templates
 * @param {string|null|undefined} currentId
 * @param {1|-1} direction
 * @param {object|null|undefined} entitlements
 * @returns {object|null}
 */
export function adjacentAllowedTemplate(templates, currentId, direction, entitlements) {
  const step = direction < 0 ? -1 : 1;
  const allowed = selectCvTemplates(templates).filter((template) => (
    isTemplateAllowed(template, entitlements)
  ));
  if (allowed.length < 2) return null;
  const index = allowed.findIndex((template) => template.id === currentId);
  const from = index >= 0 ? index : 0;
  const nextIndex = (from + step + allowed.length) % allowed.length;
  return allowed[nextIndex] || null;
}
