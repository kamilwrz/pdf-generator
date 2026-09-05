/**
 * Group tagged contact elements into managed bands for the hover UI.
 *
 * A band is discoverable only when its zero-footprint anchor (flowRole
 * "masthead-anchor") is present, because the anchor carries the descriptor the
 * controller needs. Chips are the label (text) elements — one per channel —
 * sorted into the canonical channel order so the `+` menu and delete targets
 * line up with what the user sees. The add-menu (`inactive`) offers the full set
 * of channels the wizard supports minus the active ones, so GitHub/website are
 * offered even when the CV was generated without them.
 */
import { CHANNEL_ORDER } from "./contactChannelNames.js";

/**
 * @param {object[]} elements - Canvas elements (typically page-filtered).
 * @returns {Array<{bandId:string, descriptor:object, chips:Array<{channel:string,elementId:string,left:number,top:number,width:number,height:number,fontSize:number}>, inactive:string[]}>}
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
        width: Number(el.width) || 0,
        height: Number(el.height) || 0,
        fontSize: Number(el.fontSize) || 8,
      });
    }
  }

  const bands = [];
  for (const band of byBand.values()) {
    if (!band.descriptor) continue; // unmanaged / legacy band → no controls
    // Sort and offer channels by the canonical order (the wizard's full set),
    // not the descriptor's generation-time `order`, so channels the CV never
    // had (typically github/website) still appear in the `+` menu. The canonical
    // order matches the generator sequence, so active chips are not reordered.
    band.chips.sort(
      (a, b) => CHANNEL_ORDER.indexOf(a.channel) - CHANNEL_ORDER.indexOf(b.channel),
    );
    const active = new Set(band.chips.map((c) => c.channel));
    band.inactive = CHANNEL_ORDER.filter((channel) => !active.has(channel));
    bands.push(band);
  }
  return bands;
}
