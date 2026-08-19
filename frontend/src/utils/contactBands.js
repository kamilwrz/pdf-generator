/**
 * Group tagged contact elements into managed bands for the hover UI.
 *
 * A band is discoverable only when its zero-footprint anchor (flowRole
 * "masthead-anchor") is present, because the anchor carries the descriptor the
 * controller needs. Chips are the label (text) elements — one per channel —
 * sorted into the descriptor's canonical order so the `+` menu and delete
 * targets line up with what the user sees.
 */

/**
 * @param {object[]} elements - Canvas elements (typically page-filtered).
 * @returns {Array<{bandId:string, descriptor:object, chips:Array<{channel:string,elementId:string,left:number,top:number,fontSize:number}>, inactive:string[]}>}
 */
export function listContactBands(elements) {
  const byBand = new Map();
  for (const el of elements) {
    if (!el.contactBandId) continue;
    if (!byBand.has(el.contactBandId)) {
      byBand.set(el.contactBandId, { bandId: el.contactBandId, descriptor: null, chips: [] });
    }
    const band = byBand.get(el.contactBandId);
    if (el.flowRole === "masthead-anchor") {
      band.descriptor = el.contactBand ?? null;
      continue;
    }
    if (el.contactChannel && el.category === "text") {
      band.chips.push({
        channel: el.contactChannel,
        elementId: el.element_id,
        left: Number(el.left) || 0,
        top: Number(el.top) || 0,
        fontSize: Number(el.fontSize) || 8,
      });
    }
  }

  const bands = [];
  for (const band of byBand.values()) {
    if (!band.descriptor) continue; // unmanaged / legacy band → no controls
    const order = Array.isArray(band.descriptor.order) ? band.descriptor.order : [];
    band.chips.sort((a, b) => order.indexOf(a.channel) - order.indexOf(b.channel));
    const active = new Set(band.chips.map((c) => c.channel));
    band.inactive = order.filter((channel) => !active.has(channel));
    bands.push(band);
  }
  return bands;
}
