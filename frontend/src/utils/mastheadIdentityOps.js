/**
 * Masthead identity transforms (pure) — Phase 3.
 *
 * Two ops on the name/title identity block, both committed through the same
 * `setA4_Elements` + history path as the contact-band ops:
 *
 *   - applyNameCaseToggle: flip the name element's `textTransform` between
 *     "uppercase" and "none". Reversible and position-preserving (uppercasing
 *     grows glyphs in place; the stored box is not width-constrained).
 *   - applyTitleToggle: hide the title (remove it, shift everything at/below its
 *     top up by `blockPt`, nudge the coupled contact band's startY, mark absent)
 *     or show it (reconstruct from the stored spec, reverse the shift, mark
 *     present). `blockPt = contactBandStartY - titleTop`, fixed at generation.
 *
 * The identity anchor (flowRole "masthead-anchor", carrying `mastheadIdentity`)
 * and any fixedToPage chrome (page background, footer) are never shifted.
 */
import { reconcileDocumentPages } from "./structureOperation.js";

function identityAnchor(elements, bandId) {
  return elements.find(
    (el) => el.mastheadBandId === bandId && el.flowRole === "masthead-anchor" && el.mastheadIdentity,
  ) ?? null;
}

function identityDescriptor(elements, bandId) {
  return identityAnchor(elements, bandId)?.mastheadIdentity ?? null;
}

/** Flip the name element's case flag; positions untouched. No reflow. */
export function applyNameCaseToggle(elements, bandId) {
  if (!identityDescriptor(elements, bandId)) return { elements };
  let changed = false;
  const next = elements.map((el) => {
    if (el.mastheadBandId === bandId && el.mastheadRole === "name") {
      changed = true;
      return { ...el, textTransform: el.textTransform === "uppercase" ? "none" : "uppercase" };
    }
    return el;
  });
  return changed ? { elements: next } : { elements };
}

// Shift one element by `delta` when it sits at/below `boundaryTop` and is not
// page-fixed chrome. The coupled contact band anchor is special-cased: its
// descriptor `startY` moves with the band so later channel reflows use the new
// origin. The identity anchor (top 0) and the name (above the title) are never
// caught by the boundary test.
function shiftBelow(el, boundaryTop, delta, contactBandId) {
  if (el.flowRole === "masthead-anchor" && el.contactBand && el.contactBandId === contactBandId) {
    const anchor = { ...el.contactBand.anchor };
    if (typeof anchor.startY === "number") anchor.startY += delta;
    return { ...el, contactBand: { ...el.contactBand, anchor } };
  }
  if (el.fixedToPage) return el;
  if (typeof el.top === "number" && el.top >= boundaryTop) {
    return { ...el, top: el.top + delta };
  }
  return el;
}

function setTitlePresence(elements, bandId, present) {
  return elements.map((el) => {
    if (el.mastheadBandId === bandId && el.flowRole === "masthead-anchor" && el.mastheadIdentity) {
      const identity = el.mastheadIdentity;
      return { ...el, mastheadIdentity: { ...identity, title: { ...identity.title, present } } };
    }
    return el;
  });
}

function nameElement(elements, bandId) {
  return elements.find((el) => el.mastheadBandId === bandId && el.mastheadRole === "name") ?? null;
}

function hideTitle(elements, bandId, descriptor, blockPt, createId) {
  const title = elements.find(
    (el) => el.mastheadBandId === bandId && el.mastheadRole === "title",
  );
  if (!title) return { elements };
  const boundaryTop = Number(title.top) || 0;
  const contactBandId = descriptor.contactBandId;
  const withoutTitle = elements.filter((el) => el !== title);
  const shifted = withoutTitle.map((el) => shiftBelow(el, boundaryTop, -blockPt, contactBandId));
  const marked = setTitlePresence(shifted, bandId, false);
  const reconciled = reconcileDocumentPages(marked, createId, { collapseEmpty: true });
  return { elements: reconciled.elements, pageCount: reconciled.pageCount };
}

function buildTitleElement(spec, bandId, createId, page, nameEl) {
  // Reconstruct the title's horizontal geometry. Centered mastheads store the
  // title as a width-bounded, ``align: "center"`` textarea; rebuilding it as
  // point text would anchor it at the band's left edge and lose the centering
  // on re-add, and — because point text has no alignment — make it impossible
  // to keep centered while editing.
  //
  // ``spec`` carries the full box geometry for documents generated after the
  // masthead spec was widened. For documents saved before that (legacy specs
  // with no ``width``/``align``), fall back to the sibling name element, which
  // shares the masthead's centered column and alignment.
  const width =
    typeof spec.width === "number" ? spec.width
    : typeof nameEl?.width === "number" ? nameEl.width : null;
  const align = spec.align ?? nameEl?.align ?? null;
  const left =
    typeof spec.left === "number" ? spec.left
    : typeof nameEl?.left === "number" ? nameEl.left : 0;
  // Rebuild as a textarea whenever we can bound it to a width (either from the
  // spec's own category or from the recovered band width). Only genuinely
  // width-less point-text titles remain point text.
  const isTextarea = spec.category === "textarea" || width != null;

  const el = {
    element_id: createId("title"),
    category: isTextarea ? "textarea" : "text",
    content: spec.content ?? "",
    left, top: spec.top,
    fontSize: spec.fontSizePt, fontFamily: spec.fontFamily, color: spec.colorHex,
    zIndex: 3, page, flowRole: "masthead",
    mastheadRole: "title", mastheadBandId: bandId,
  };
  if (isTextarea) {
    el.width = width;
    // A width-bounded box needs a line height for wrapping/measurement. Prefer
    // the captured value; approximate from the font size for legacy specs.
    el.lineHeight =
      typeof spec.lineHeight === "number" ? spec.lineHeight
      : Math.round((Number(spec.fontSizePt) || 10) * 1.3);
    el.height = typeof spec.height === "number" ? spec.height : el.lineHeight;
    el.align = align ?? "left";
    // The user re-added this box; let it grow to fit edits instead of pinning
    // the generator's original measured height.
    el.autoHeight = true;
    el.bulletList = false;
  }
  if (typeof spec.letterSpacing === "number") el.letterSpacing = spec.letterSpacing;
  if (spec.bold) el.bold = true;
  if (spec.textTransform && spec.textTransform !== "none") el.textTransform = spec.textTransform;
  // If the title was empty at generation, give the re-added element a hint + hit
  // area so the user can click it and type (same mechanism as added contacts).
  if (!spec.content) el.placeholder = "Stanowisko";
  return el;
}

function showTitle(elements, bandId, descriptor, blockPt, createId) {
  const spec = descriptor.title?.spec;
  if (!spec) return { elements };
  const boundaryTop = Number(spec.top) || 0;
  const contactBandId = descriptor.contactBandId;
  // Shift existing at/below-title content DOWN first (the band currently sits at
  // the title's top because the title was hidden), then insert the title.
  const shifted = elements.map((el) => shiftBelow(el, boundaryTop, +blockPt, contactBandId));
  const nameEl = nameElement(elements, bandId);
  const titleEl = buildTitleElement(spec, bandId, createId, nameEl?.page ?? 1, nameEl);
  const withTitle = [...shifted, titleEl];
  const marked = setTitlePresence(withTitle, bandId, true);
  const reconciled = reconcileDocumentPages(marked, createId, { collapseEmpty: true });
  return { elements: reconciled.elements, pageCount: reconciled.pageCount };
}

/** Hide the title (when present) or show it (when hidden), reflowing downstream. */
export function applyTitleToggle(elements, bandId, createId) {
  const descriptor = identityDescriptor(elements, bandId);
  if (!descriptor) return { elements };
  const blockPt = Number(descriptor.title?.blockPt) || 0;
  const present = elements.some(
    (el) => el.mastheadBandId === bandId && el.mastheadRole === "title",
  );
  return present
    ? hideTitle(elements, bandId, descriptor, blockPt, createId)
    : showTitle(elements, bandId, descriptor, blockPt, createId);
}
