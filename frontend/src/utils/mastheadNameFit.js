/**
 * Fit legacy point-text masthead names into their authored contact column.
 * Slate and Monument use this representation; the other templates already
 * own bounded multiline identity layouts. Geometry is persisted in A4 points,
 * never screen pixels, so zoom cannot change the fit or the exported document.
 */
import { styledSegments } from './textRuns.js';
import { measureTextareaHeight } from './textareaHeight.js';
import { isSidebarLaneElement, listDocumentSections, packDocumentSections, sectionElementIds } from './sectionStructure.js';
import { reconcileDocumentPages } from './structureOperation.js';

export const MASTHEAD_NAME_MIN_FONT_SIZE = 14;
const round = (value) => Math.round(value * 100) / 100;
const pageOf = (element) => Number(element.page) || 1;

/**
 * Apply an explicit properties-panel size as the name's new maximum, even if
 * the chosen value equals its current automatic fit. Typing and other patches
 * preserve the previous maximum. Returns a new element without mutating input.
 */
export function applyMastheadNameFontIntent(element, patch) {
  const fontSize = Number(patch.fontSize);
  return { ...element, ...patch,
    ...(element.nameFit && 'fontSize' in patch && Number.isFinite(fontSize) && fontSize > 0
      ? { nameFit: { ...element.nameFit, baseFontSize: fontSize, fittedFontSize: fontSize } } : {}),
  };
}

/**
 * Resolve the safe right edge from authored masthead geometry, including legacy
 * saved documents without fitting metadata. A smaller manually authored frame
 * remains authoritative. Photo bounds are considered only beside the name.
 */
function nameWidth(elements, name, contact, pageWidth) {
  let right = Math.min(pageWidth - 24, Number(contact.anchor.rightLimit));
  if (!Number.isFinite(right)) return null;
  for (const element of elements) {
    if (!element.photoSlot || element.photoSlotHidden || element.deleted
      || pageOf(element) !== pageOf(name) || Number(element.left) <= Number(name.left)) continue;
    const bottom = Number(element.top) + Number(element.height);
    if (Number(element.top) <= Number(name.top) + Number(name.fontSize)
      && bottom >= Number(name.top) - Number(name.fontSize)) {
      right = Math.min(right, Number(element.left) - 12);
    }
  }
  const authoredWidth = Number(name.width) > 0 && name.width !== name.nameFit?.width
    ? Number(name.width) : Number(name.nameFit?.maxWidth);
  if (authoredWidth > 0) {
    right = Math.min(right, Number(name.left) + authoredWidth);
  }
  return right > Number(name.left) ? round(right - Number(name.left)) : null;
}

/**
 * Compute a font size and line-box height without changing source text or runs.
 * The optional browser line resolver supplies exact shaped wraps; headless
 * callers use the same width/word fallback as other canvas text measurements.
 */
function fitName(name, width, measureTextWidth, measureLines) {
  const previous = name.nameFit;
  const maxWidth = Number(name.width) > 0 && name.width !== previous?.width
    ? Number(name.width) : previous?.maxWidth;
  const baseFontSize = Math.max(1, Number(previous && name.fontSize === previous.fittedFontSize
    ? previous.baseFontSize : name.fontSize) || 24);
  const floor = Math.min(baseFontSize, MASTHEAD_NAME_MIN_FONT_SIZE);
  const content = String(name.content ?? '');
  const transform = (text) => name.textTransform === 'uppercase' ? text.toUpperCase() : text;
  const segments = styledSegments(content, name.runs);
  const measure = (size) => segments.reduce((total, segment) => {
    const text = transform(segment.text);
    const style = { ...name, fontSize: size,
      bold: name.bold || segment.bold, italic: name.italic || segment.italic };
    // The shared canvas reader omits final tracking; CSS applies it after the
    // last character too. Include it per span, matching the PDF draw advances.
    return total + (measureTextWidth
      ? measureTextWidth(text, style) + (text ? Number(name.letterSpacing) || 0 : 0)
      : text.length * (size * 0.6 + (Number(name.letterSpacing) || 0)));
  }, 0);
  let size = baseFontSize;
  if (measure(size) > width - 1) {
    let low = floor;
    let high = baseFontSize;
    // Width is monotonic for a fixed face and tracking. A bounded binary search
    // keeps typing cheap even for large display sizes; round down to stay inside.
    for (let step = 0; step < 16; step += 1) {
      const middle = (low + high) / 2;
      if (measure(middle) <= width - 1) low = middle;
      else high = middle;
    }
    size = Math.max(floor, Math.floor(low * 100) / 100);
  }
  const lineHeight = round(size * 1.2);
  const probe = { ...name, category: 'textarea', width, fontSize: size, lineHeight };
  let rows = 1;
  // Fitting does not remove authored line breaks. Even at the minimum an
  // unbroken surname can wrap; no ellipsis or substring is stored or exported.
  if (measure(size) > width - 1 || /[\r\n]/.test(content)) {
    const lines = measureLines?.(probe);
    rows = lines?.length || Math.max(1, Math.round((measureTextareaHeight(
      transform(content), width, size, lineHeight,
      { measureTextWidth, textStyle: probe },
    ) - 6) / lineHeight));
  }
  const extraHeight = round((rows - 1) * lineHeight);
  return { fontSize: size, width, height: round(rows * lineHeight), lineHeight,
    nameFit: { baseFontSize, fittedFontSize: size, width, extraHeight,
      ...(maxWidth > 0 ? { maxWidth } : {}),
    } };
}

function shiftIdentityDescriptor(identity, delta) {
    const title = identity.title;
    return { ...identity,
      title: { ...title,
        ...(title?.spec ? { spec: { ...title.spec, top: round(Number(title.spec.top) + delta) } } : {}),
        ...(title?.decorations ? { decorations: title.decorations.map((decoration) => ({
          ...decoration, top: round(Number(decoration.top) + delta),
        })) } : {}),
      },
    };
}

/** Shift the managed main lane while keeping photo, sidebar and page chrome fixed. */
function shiftBelowName(element, name, identity, contactAnchor, delta) {
  if (!delta || element === name || pageOf(element) !== pageOf(name)) return element;
  if (element === identity) {
    return { ...element, mastheadIdentity: shiftIdentityDescriptor(element.mastheadIdentity, delta),
      ...(element.profilePhotoMainMastheadIdentity ? {
        profilePhotoMainMastheadIdentity: shiftIdentityDescriptor(element.profilePhotoMainMastheadIdentity, delta),
      } : {}),
    };
  }
  if (element === contactAnchor) {
    // Slate parks the main descriptor while contacts occupy the photo-less
    // rail. Move its restoration target, leaving the visible sidebar untouched.
    const key = element.profilePhotoMainContactBand ? 'profilePhotoMainContactBand' : 'contactBand';
    const band = element[key];
    return { ...element, [key]: { ...band,
      anchor: { ...band.anchor, startY: round(Number(band.anchor.startY) + delta) },
      ...(band.flow ? { flow: { ...band.flow, bodyTop: round(Number(band.flow.bodyTop) + delta) } } : {}),
    } };
  }
  if (element.fixedToPage || element.photoSlot || element.flowLane === 'sidebar'
    || String(element.flowRole || '').startsWith('sidebar')
    || element.flowRole === 'photo-contact-header'
    || (contactAnchor.profilePhotoMainContactBand && element.contactChannel
      && element.contactBandId === contactAnchor.contactBand.id)
    || Number(element.top) <= Number(name.top)) return element;
  return { ...element, top: round(Number(element.top) + delta) };
}

/**
 * Normalize complete document elements before a canvas state transaction.
 *
 * Only semantic point-text names with a coupled contact column opt in. The
 * stored base font is the user's size intent; the effective font can grow back
 * after shortening. Explicit font edits replace that base. Saved extra height
 * makes wrapping/shortening reversible without repeatedly shifting the page.
 * Neither source strings, inline formatting nor unrelated templates are changed.
 *
 * @param {object[]} elements - Current authored graph, never mutated.
 * @param {object} options - Width/line readers and physical page width.
 * @returns {object[]} Fitted graph, preserving the array on an unchanged layout.
 */
export function fitMastheadNames(elements, {
  measureTextWidth = null, measureLines = null, pageWidth = 595,
  pageHeight = 842, spacing, createId = () => globalThis.crypto.randomUUID(),
} = {}) {
  if (!Array.isArray(elements)) return elements;
  let result = elements;
  for (const candidate of elements) {
    if (candidate.category !== 'text' || candidate.mastheadRole !== 'name' || candidate.deleted) continue;
    const name = result.find((element) => element === candidate) || candidate;
    const identity = result.find((element) => element.mastheadIdentity
      && element.mastheadBandId === name.mastheadBandId);
    const contactAnchor = result.find((element) => element.contactBand
      && element.contactBand.id === identity?.mastheadIdentity.contactBandId);
    if (!identity || !contactAnchor) continue;
    const width = nameWidth(result, name,
      contactAnchor.profilePhotoMainContactBand || contactAnchor.contactBand, pageWidth);
    if (!width) continue;
    const fitted = fitName(name, width, measureTextWidth, measureLines);
    if (name.nameFit?.repaginate) fitted.nameFit.repaginate = true;
    if (Number.isFinite(name.nameFit?.flowStart)) fitted.nameFit.flowStart = name.nameFit.flowStart;
    const delta = round(fitted.nameFit.extraHeight - (Number(name.nameFit?.extraHeight) || 0));
    if (['fontSize', 'width', 'height', 'lineHeight'].every((key) => name[key] === fitted[key])
      && JSON.stringify(name.nameFit) === JSON.stringify(fitted.nameFit)) continue;
    const before = result;
    result = result.map((element) => element === name ? { ...name, ...fitted }
      : shiftBelowName(element, name, identity, contactAnchor, delta));
    const overflow = delta > 0 && result.some((element) => !element.fixedToPage
      && !element.photoSlot && !isSidebarLaneElement(element)
      && element.flowRole !== 'masthead' && element.flowRole !== 'masthead-anchor'
      && Number(element.top) + (element.category === 'text'
        ? Number(element.fontSize) * 0.7 : Number(element.height) || 0) > pageHeight - 72);
    if (delta && (overflow || name.nameFit?.repaginate)) {
      // A taller identity may push an otherwise full page into its footer.
      // Use the existing record-aware packer and pre-shift membership so no
      // role is split or accidentally attached to a later section. Subsequent
      // shortening also reclaims continuation space; ordinary fits keep every
      // body coordinate unchanged. Reconciliation adds/removes page chrome.
      const sections = listDocumentSections(before, pageHeight);
      const firstIds = sections.length ? sectionElementIds(before, sections[0].headingId, pageHeight) : new Set();
      const firstChrome = before.filter((element) => firstIds.has(element.element_id)
        && element.flowRole === 'section-chrome');
      const originalStart = name.nameFit?.flowStart ?? Math.min(...firstChrome.map((element) =>
        (pageOf(element) - 1) * pageHeight + Number(element.top)));
      const flowStart = originalStart + delta;
      // Preserve the authored first-section clearance. The packer's generic
      // legacy-gap repair would otherwise mistake a wrapped masthead for a
      // stale gap and move Slate's first heading upwards after shortening.
      const anchored = Number.isFinite(flowStart) ? result.map((element) => element.element_id === identity.element_id
        ? { ...element, mainFlowStart: flowStart } : element) : result;
      result = packDocumentSections(anchored, sections.map((section) => section.headingId), pageHeight,
      { spacing, membershipReference: before });
      result = reconcileDocumentPages(result, createId, { collapseEmpty: true }).elements;
      result = result.map((element) => {
        if (element.element_id === name.element_id) return { ...element,
          nameFit: { ...element.nameFit, repaginate: true,
            ...(Number.isFinite(flowStart) ? { flowStart } : {}),
          } };
        if (element.element_id === identity.element_id && Number.isFinite(flowStart)) {
          const { mainFlowStart: _ignored, ...rest } = element;
          return 'mainFlowStart' in identity ? { ...rest, mainFlowStart: identity.mainFlowStart } : rest;
        }
        return element;
      });
    }
  }
  return result;
}
