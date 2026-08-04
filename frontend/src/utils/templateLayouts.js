/**
 * Internal layout tags used by generators and reflow — not product categories.
 *
 * Users see each template as an individual name + description. Code uses these
 * tags to route shared layout behaviour (sidebar packing, icon chrome, dark
 * page chrome) without exposing industry/style collections in the UI.
 */

/** Structural layout tags recognised by the registry and backend generators. */
export const TEMPLATE_LAYOUT_TAGS = Object.freeze([
  "single",
  "sidebar",
  "icons",
  "dark",
]);

/**
 * @param {{ layouts?: string[] }} template
 * @returns {string[]}
 */
export function getTemplateLayouts(template) {
  const raw = Array.isArray(template?.layouts) ? template.layouts : [];
  return raw
    .map((tag) => String(tag || "").trim())
    .filter((tag) => TEMPLATE_LAYOUT_TAGS.includes(tag));
}

/**
 * @param {{ layouts?: string[] }} template
 * @param {string} tag
 * @returns {boolean}
 */
export function templateHasLayout(template, tag) {
  return getTemplateLayouts(template).includes(tag);
}

/**
 * Preserve registry order. Product pickers no longer regroup by industry/style.
 *
 * @param {Array<object>} templates
 * @returns {Array<object>}
 */
export function listTemplatesInRegistryOrder(templates) {
  return Array.isArray(templates) ? [...templates] : [];
}

/**
 * @param {Array<object>} templates
 * @param {string} tag
 * @returns {Array<object>}
 */
export function filterTemplatesByLayout(templates, tag) {
  return listTemplatesInRegistryOrder(templates).filter((template) =>
    templateHasLayout(template, tag),
  );
}

/**
 * Carousel window start for the currently applied template.
 * Returns 0 when the id is missing or unknown so browsing still works.
 *
 * @param {Array<{id?: string}>} templates
 * @param {string|null|undefined} selectedId
 * @returns {number}
 */
export function startIndexForSelectedTemplate(templates, selectedId) {
  if (!selectedId || !Array.isArray(templates) || templates.length === 0) return 0;
  const index = templates.findIndex((template) => template.id === selectedId);
  return index >= 0 ? index : 0;
}
