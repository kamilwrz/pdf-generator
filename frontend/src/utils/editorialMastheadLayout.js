import { measureTextareaHeight } from "./textareaHeight.js";

/**
 * Keep an opted-in editorial name, title and contact list vertically ordered.
 * Typography uses conservative text heights until browser measurements arrive.
 * The hidden title blueprint follows the same geometry, so restoring it after
 * a size change cannot overlap the name. Existing fixed mastheads are untouched.
 * This pure transform changes only masthead geometry; contact reflow then owns
 * the divider and downstream body pack.
 * @param {object[]} elements - Current authored document graph.
 * @param {string} bandId - Managed contact band.
 * @param {object} options - Optional width measurer or final browser heights.
 * @returns {object[]} Updated graph, or the original for a legacy masthead.
 */
export function layoutEditorialMasthead(elements, bandId, { measureTextWidth = null, measuredHeights = null } = {}) {
  const anchor = elements.find((element) => element.contactBand?.id === bandId);
  const layout = anchor?.contactBand.identityLayout;
  const identity = elements.find((element) => element.mastheadIdentity?.contactBandId === bandId);
  const name = elements.find((element) => element.mastheadRole === "name"
    && element.mastheadBandId === identity?.mastheadBandId);
  if (!layout || !identity || !name) return elements;
  const title = elements.find((element) => element.mastheadRole === "title"
    && element.mastheadBandId === identity.mastheadBandId);
  const spec = identity.mastheadIdentity.title.spec;
  const height = (element) => {
    const measured = Number(measuredHeights?.get(element.element_id));
    if (Number.isFinite(measured) && measured > 0) return measured;
    return Math.max(Number(element.lineHeight) || Number(element.fontSize), measureTextareaHeight(
      element.content || element.placeholder || "", element.width, element.fontSize, element.lineHeight,
      { measureTextWidth, textStyle: element },
    ) - 6);
  };
  const nameHeight = height(name);
  const titleHeight = height(title || { ...spec, fontSize: spec.fontSizePt });
  const titleTop = Number(name.top) + nameHeight + layout.nameTitleGap;
  const contactTop = titleTop + (title ? titleHeight : 0) + layout.titleContactGap;
  return elements.map((element) => {
    if (element === name) return { ...element, height: nameHeight };
    if (element === title) return { ...element, top: titleTop, height: titleHeight };
    if (element === anchor) return { ...element, contactBand: {
      ...element.contactBand, anchor: { ...element.contactBand.anchor, startY: contactTop },
    } };
    if (element === identity) return { ...element, mastheadIdentity: {
      ...element.mastheadIdentity, title: { ...element.mastheadIdentity.title,
        spec: { ...spec, top: titleTop, height: titleHeight },
        blockPt: titleHeight + layout.titleContactGap, reclaimPt: titleHeight,
      },
    } };
    return element;
  });
}
