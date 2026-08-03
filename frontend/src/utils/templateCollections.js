/**
 * Group / sort CV templates by the seven product collections.
 *
 * Prefer the explicit `collection` field on the registry entry. Fall back to
 * the `industry` prefix before " · " for older snapshots that omit collection.
 */

/** Display order for picker section headings (7 product families). */
export const TEMPLATE_COLLECTION_ORDER = [
  "Finanse",
  "IT",
  "Classic",
  "Sidebar",
  "Banking",
  "Darktheme",
  "Iconic",
];

/**
 * @param {{ collection?: string, industry?: string }} template
 * @returns {string}
 */
export function getTemplateCollection(template) {
  const explicit = String(template?.collection || "").trim();
  if (explicit) return explicit;
  const industry = String(template?.industry || "");
  const prefix = industry.split("·")[0]?.trim();
  return prefix || "Inne";
}

/**
 * @param {Array<object>} templates
 * @returns {Array<{ collection: string, templates: Array<object> }>}
 */
export function groupTemplatesByCollection(templates) {
  const list = Array.isArray(templates) ? templates : [];
  const buckets = new Map(TEMPLATE_COLLECTION_ORDER.map((name) => [name, []]));
  const extras = [];

  for (const template of list) {
    const collection = getTemplateCollection(template);
    if (buckets.has(collection)) {
      buckets.get(collection).push(template);
    } else {
      extras.push(template);
    }
  }

  const groups = [];
  for (const collection of TEMPLATE_COLLECTION_ORDER) {
    const items = buckets.get(collection);
    if (items.length > 0) {
      groups.push({ collection, templates: items });
    }
  }
  if (extras.length > 0) {
    groups.push({ collection: "Inne", templates: extras });
  }
  return groups;
}

/**
 * Flatten templates in collection order (Finanse → … → Iconic).
 *
 * @param {Array<object>} templates
 * @returns {Array<object>}
 */
export function sortTemplatesByCollection(templates) {
  return groupTemplatesByCollection(templates).flatMap((group) => group.templates);
}
