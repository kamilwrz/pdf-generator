/**
 * Group tagged masthead identity elements into blocks for the hover UI.
 *
 * A block is discoverable only when its zero-footprint anchor (flowRole
 * "masthead-anchor" carrying `mastheadIdentity`) and a `name` element are both
 * present, so legacy documents (no anchor) yield no controls and behave as today.
 */

/**
 * @param {object[]} elements - Canvas elements (typically page-filtered).
 * @returns {Array<{bandId:string, descriptor:object, name:object, title:object|null, titlePresent:boolean}>}
 */
export function listMastheadBands(elements) {
  const byBand = new Map();
  for (const el of elements) {
    if (!el.mastheadBandId) continue;
    if (!byBand.has(el.mastheadBandId)) {
      byBand.set(el.mastheadBandId, { bandId: el.mastheadBandId, descriptor: null, name: null, title: null });
    }
    const band = byBand.get(el.mastheadBandId);
    if (el.flowRole === "masthead-anchor" && el.mastheadIdentity) {
      band.descriptor = el.mastheadIdentity;
      continue;
    }
    if (el.mastheadRole === "name") {
      band.name = {
        elementId: el.element_id,
        left: Number(el.left) || 0, top: Number(el.top) || 0,
        fontSize: Number(el.fontSize) || 18,
        uppercase: el.textTransform === "uppercase",
      };
    } else if (el.mastheadRole === "title") {
      band.title = {
        elementId: el.element_id,
        left: Number(el.left) || 0, top: Number(el.top) || 0,
        fontSize: Number(el.fontSize) || 10,
      };
    }
  }

  const bands = [];
  for (const band of byBand.values()) {
    if (!band.descriptor || !band.name) continue; // unmanaged / legacy → no controls
    band.titlePresent = band.title != null;
    bands.push(band);
  }
  return bands;
}
