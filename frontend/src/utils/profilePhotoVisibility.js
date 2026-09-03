/**
 * Reversible profile-photo visibility operations for templates whose masthead
 * geometry has an explicit product contract.
 *
 * Slot elements stay in document state while hidden. This preserves the
 * authored layout and makes show/hide lossless across undo, save, reload, and
 * structural edits performed while the slot is hidden.
 * Slate and Tessera store the original contact-band descriptor on its
 * zero-size anchor, then switch the band to a one-row-per-channel sidebar
 * layout. Slate additionally materializes a palette-aware contact heading in
 * the space released by its photo and removes that chrome on restore. Linden
 * starts with the stacked rail already active and publishes its own hidden-
 * photo anchor plus a contact-to-section spacing contract. Vellum's circular
 * masthead slot is independent of the flow column, so its hide/show transition
 * changes only the semantically tagged photo cluster.
 */

import {
  getSlateAppearance,
  slateTypographyFontFactor,
} from "./slateAppearance.js";

const SUPPORTED_TEMPLATE_IDS = new Set([
  "atrium",
  "monument",
  "slate",
  "linden",
  "vellum",
]);

const SIDEBAR_CONTACT_TEMPLATE_IDS = new Set(["slate", "linden"]);
export const SIDEBAR_CONTACT_SECTION_GAP = 40;
// Linden owns the widest rail among the two templates whose photo transition
// reflows sidebar content (210 pt; Slate ends at 180 pt). Persisted documents
// can retain an obsolete `flowLane: "sidebar"` marker after a section moves to
// the main column, so metadata alone is not sufficient to decide what moves.
const SIDEBAR_FLOW_RIGHT_EDGE = 210;
const SLATE_HIDDEN_CONTACT_ANCHOR = Object.freeze({
  startX: 33,
  startY: 84,
  rightLimit: 174,
});
const SLATE_CONTACT_HEADER_ROLE = "photo-contact-header";
const SLATE_CONTACT_HEADER_LAYOUT = Object.freeze({
  badgeLeft: 25,
  badgeTop: 60,
  badgeSize: 16,
  iconLeft: 27,
  iconTop: 62,
  iconSize: 12,
  textLeft: 49,
  textTop: 63,
  ruleTop: 76,
  ruleWidth: 46,
});
const LEGACY_FRAMELESS_PLACEHOLDERS = {
  atrium: "/template-assets/iconic/atrium-accent/portrait.png",
};

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isSlotMember(element, templateId) {
  if (element?.photoSlot) return true;
  if (!SIDEBAR_CONTACT_TEMPLATE_IDS.has(String(templateId || ""))) return false;
  // Legacy Slate/Tessera documents tagged only the frame and portrait glyph.
  // Their surrounding fixed sidebar chrome is still the same visual slot and
  // must disappear with it. The tight page-one photo-zone bounds avoid
  // capturing the rail background, divider, masthead contacts, or sections.
  return Boolean(
    element?.fixedToPage
    && (Number(element.page) || 1) === 1
    && element.flowLane === "sidebar"
    && element.flowRole === "content"
    && Number(element.left) < 180
    && Number(element.top) < 180,
  );
}

function contactAnchor(elements) {
  return (elements || []).find((element) => (
    element.flowRole === "masthead-anchor"
    && element.contactBandId
    && element.contactBand
  )) || null;
}

/**
 * Identify page-one rail content owned by the structural sidebar packer.
 *
 * Contact rows and fixed template chrome have independent layout contracts.
 * Only ordinary sidebar sections participate in the uniform photo transition.
 */
function isPageOneSidebarFlowElement(element) {
  return Boolean(
    (Number(element?.page) || 1) === 1
    && !element?.fixedToPage
    && !element?.contactChannel
    && (element?.flowLane === "sidebar" || element?.flowRole === "sidebar-chrome")
    && Number(element?.left) < SIDEBAR_FLOW_RIGHT_EDGE
    && Number.isFinite(Number(element?.top)),
  );
}

/**
 * Read the accumulated rail translation recorded on the contact anchor.
 *
 * Older hidden documents predate the anchor-level value, so their first
 * shifted section still provides a compatible fallback through its existing
 * `photoLayoutHome.top` snapshot.
 */
function profilePhotoSidebarShift(elements, anchor) {
  const recordedValue = anchor?.photoLayoutHome?.sidebarShift;
  const recorded = recordedValue == null ? Number.NaN : Number(recordedValue);
  if (Number.isFinite(recorded)) return recorded;

  const legacyMember = (elements || [])
    .filter((element) => (
      isPageOneSidebarFlowElement(element)
      && Number.isFinite(Number(element.photoLayoutHome?.top))
    ))
    .sort((left, right) => Number(left.top) - Number(right.top))[0];
  if (!legacyMember) return null;
  return Number(legacyMember.top) - Number(legacyMember.photoLayoutHome.top);
}

function isSlateContactHeader(element) {
  return element?.flowRole === SLATE_CONTACT_HEADER_ROLE;
}

function slateAccentColor(elements) {
  const sidebarRule = (elements || []).find((element) => (
    element.flowRole === "sidebar-chrome"
    && element.category === "line"
    && Number(element.height) <= 2
    && Number(element.width) >= 40
    && Number(element.width) <= 80
    && element.backgroundColor
  ));
  if (sidebarRule) return sidebarRule.backgroundColor;

  const railEdge = (elements || []).find((element) => (
    element.category === "line"
    && element.fixedToPage
    && Number(element.left) === 178
    && Number(element.width) === 2
    && Number(element.height) >= 800
    && element.backgroundColor
  ));
  return railEdge?.backgroundColor || "#3E5C76";
}

function slateHeadingStyle(elements, anchor) {
  const authoredHeading = (elements || []).find((element) => (
    element.flowRole === "sidebar-chrome"
    && element.category === "text"
    && String(element.content || "").trim()
  ));
  const mastheadName = (elements || []).find((element) => (
    element.mastheadRole === "name" && element.color
  ));
  const bandIcon = (elements || []).find((element) => (
    element.contactBandId === anchor?.contactBandId
    && element.contactChannel
    && element.category === "image"
    && element.src
  ));
  const iconSrc = bandIcon?.src
    ? String(bandIcon.src).replace(
      /\/slate(?:-[a-z0-9]+)*-accent\/[^/]+\.png/,
      "/slate/contact.png",
    )
    : "/template-assets/iconic/slate/contact.png";
  const baseFontSize = Number(
    authoredHeading?.appearanceBaseFontSize ?? authoredHeading?.fontSize,
  ) || 7.6;
  const activeTextSize = getSlateAppearance(elements).textSize;
  const materializedFontSize = Math.round(
    baseFontSize * slateTypographyFontFactor(activeTextSize, "heading") * 100,
  ) / 100;

  return {
    iconSrc,
    fontFamily: authoredHeading?.fontFamily
      || anchor?.contactBand?.text?.fontFamily
      || "Montserrat",
    fontSize: Number(authoredHeading?.fontSize) || materializedFontSize,
    baseFontSize,
    color: authoredHeading?.color || mastheadName?.color || "#1C2530",
    letterSpacing: Number(authoredHeading?.letterSpacing) || 0.85,
    accent: slateAccentColor(elements),
  };
}

/**
 * Build the four locked elements that identify Slate's temporary contact rail.
 *
 * The filled 16 pt badge and its inset 12 pt white glyph deliberately mirror
 * Slate's authored sidebar-section chrome. Only the badge and rule take the
 * active palette accent; the white glyph keeps sufficient contrast in every
 * palette. Heading typography is copied from current sidebar chrome, which
 * also preserves an active S/M/L/XL preset. Deterministic fallback identifiers
 * keep the pure helper usable in tests; the editor supplies NanoID identifiers
 * for real history transactions.
 */
function materializeSlateContactHeader(elements, anchor, createId) {
  const withoutStaleHeader = (elements || []).filter(
    (element) => !isSlateContactHeader(element),
  );
  const style = slateHeadingStyle(withoutStaleHeader, anchor);
  const nextId = (part) => (
    createId?.(`slate-contact-header-${part}`)
    || `slate-contact-header-${part}`
  );
  const common = {
    page: 1,
    fixedToPage: true,
    repeatOnContinuation: false,
    locked: true,
    flowRole: SLATE_CONTACT_HEADER_ROLE,
    flowLane: "sidebar",
  };
  const layout = SLATE_CONTACT_HEADER_LAYOUT;

  return [
    ...withoutStaleHeader,
    {
      ...common,
      element_id: nextId("badge"),
      id: "slate-contact-header-badge",
      category: "line",
      left: layout.badgeLeft,
      top: layout.badgeTop,
      width: layout.badgeSize,
      height: layout.badgeSize,
      backgroundColor: style.accent,
      zIndex: 2,
    },
    {
      ...common,
      element_id: nextId("icon"),
      id: "slate-contact-header-icon",
      category: "image",
      src: style.iconSrc,
      left: layout.iconLeft,
      top: layout.iconTop,
      width: layout.iconSize,
      height: layout.iconSize,
      zIndex: 3,
      alignWithText: false,
    },
    {
      ...common,
      element_id: nextId("label"),
      id: "slate-contact-header-label",
      category: "text",
      content: "DANE KONTAKTOWE",
      left: layout.textLeft,
      top: layout.textTop,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      color: style.color,
      bold: true,
      italic: false,
      letterSpacing: style.letterSpacing,
      zIndex: 3,
      appearanceTypographyRole: "heading",
      appearanceBaseFontSize: style.baseFontSize,
    },
    {
      ...common,
      element_id: nextId("rule"),
      id: "slate-contact-header-rule",
      category: "line",
      left: layout.textLeft,
      top: layout.ruleTop,
      width: layout.ruleWidth,
      height: 1,
      backgroundColor: style.accent,
      zIndex: 2,
    },
  ];
}

/**
 * Resolve the absolute Y coordinate reserved for the first sidebar section.
 *
 * Slate/Tessera use the fallback only while contacts occupy a hidden-photo
 * rail. Templates such as Linden may publish ``sidebarSectionGap`` directly
 * on the active contact descriptor, which keeps the same measured boundary
 * while the photo is visible and after live contact edits.
 *
 * Structural packers call this after spacing or section-order changes. Using
 * the same measured contact geometry as the hide flow prevents those packers
 * from reviving the hidden photo's obsolete floor or collapsing the intended
 * 40 pt boundary.
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {number|null}
 */
export function hiddenProfileContactSectionFloor(elements, pageHeight = 842) {
  const list = elements || [];
  const anchor = contactAnchor(list);
  const authoredGap = Number(anchor?.contactBand?.sidebarSectionGap);
  const hasAuthoredSidebarFloor = Number.isFinite(authoredGap) && authoredGap >= 0;
  const isHiddenSidebarBand = Boolean(
    anchor?.profilePhotoMainContactBand
    && anchor?.contactBand?.mode === "stacked"
    && list.some((element) => element?.photoSlotHidden === true),
  );
  if (!isHiddenSidebarBand && !hasAuthoredSidebarFloor) return null;

  const contacts = list.filter((element) => (
    element.contactBandId === anchor.contactBandId
    && element.contactChannel
    && Number.isFinite(Number(element.top))
  ));
  const startY = Number(anchor.contactBand?.anchor?.startY) || 42;
  const contactBottom = contacts.length
    ? Math.max(...contacts.map((element) => {
      const page = Math.max(1, Math.trunc(Number(element.page) || 1));
      const top = (page - 1) * pageHeight + Number(element.top);
      return top + Math.max(
        Number(element.height) || 0,
        Number(element.lineHeight) || 0,
        Number(element.fontSize) || 0,
      );
    }))
    : startY;
  return contactBottom + (
    hasAuthoredSidebarFloor ? authoredGap : SIDEBAR_CONTACT_SECTION_GAP
  );
}

/** Whether this template exposes the photo visibility affordance. */
export function supportsProfilePhotoVisibility(templateId) {
  return SUPPORTED_TEMPLATE_IDS.has(String(templateId || ""));
}

/** Whether the document currently keeps its profile-photo slot hidden. */
export function isProfilePhotoHidden(elements) {
  return (elements || []).some((element) => element?.photoSlotHidden === true);
}

/**
 * Upgrade a persisted Slate document that was already photo-less before the
 * contact heading contract existed.
 *
 * The migration is intentionally idempotent and does not alter contact or
 * sidebar coordinates. A complete current heading is returned unchanged;
 * missing or partial legacy chrome is rebuilt from the document's live palette
 * and typography so save/reload never introduces a default-colour duplicate.
 *
 * @param {object[]} elements - Hydrated canvas elements.
 * @param {string} templateId - Persisted template identifier.
 * @param {null|((part: string) => string)} [createId] - Optional identifier factory.
 * @returns {object[]} The original array or a normalized Slate array.
 */
export function normalizeProfilePhotoVisibilityPersistence(
  elements,
  templateId,
  createId = null,
) {
  const list = elements || [];
  if (String(templateId || "") !== "slate" || !isProfilePhotoHidden(list)) return list;
  const headerMembers = list.filter((element) => isSlateContactHeader(element));
  if (headerMembers.length === 4) return list;
  return materializeSlateContactHeader(list, contactAnchor(list), createId);
}

/**
 * Resolve geometry used by the canvas hover affordance. The name fallback is
 * intentionally conservative: largest non-contact masthead text on page one.
 */
export function profilePhotoControlAnchor(elements, templateId) {
  if (!supportsProfilePhotoVisibility(templateId)) return null;
  const list = elements || [];
  const slots = list.filter((element) => isSlotMember(element, templateId));
  if (!slots.length) return null;
  const visibleBox = slots.find((element) => element.photoSlot === "frame")
    || slots.find((element) => element.photoSlot === "image")
    || slots.find((element) => element.photoSlot === "glyph")
    || slots[0];
  const explicitName = list.find((element) => element.mastheadRole === "name");
  const fallbackNames = list.filter((element) => (
    (element.category === "text" || element.category === "textarea")
    && (Number(element.page) || 1) === 1
    && !element.contactChannel
    && element.flowRole !== "section-chrome"
    && element.flowRole !== "sidebar-chrome"
    && (element.flowRole === "masthead" || (Number(element.top) || 0) < 190)
    && String(element.content || "").trim()
  ));
  const name = explicitName || fallbackNames.sort(
    (a, b) => (Number(b.fontSize) || 0) - (Number(a.fontSize) || 0),
  )[0] || null;
  return {
    hidden: isProfilePhotoHidden(list),
    hasPhoto: slots.some((element) => element.photoSlot === "image"),
    slotElementIds: slots.map((element) => element.element_id).filter(Boolean),
    box: {
      left: Number(visibleBox.left) || 0,
      top: Number(visibleBox.top) || 0,
      width: Number(visibleBox.width) || 0,
      height: Number(visibleBox.height) || 0,
    },
    name: name ? {
      elementId: name.element_id,
      left: Number(name.left) || 0,
      top: Number(name.top) || 0,
      width: Number(name.width)
        || String(name.content || "").length * (Number(name.fontSize) || 12) * 0.62,
      fontSize: Number(name.fontSize) || 12,
    } : null,
  };
}

/**
 * Place the first managed sidebar section below the contact stack after the
 * contact-band layout has produced its final coordinates.
 *
 * Measuring rendered members instead of predicting row count is important:
 * active channels and label edits can change independently, while the sidebar
 * must be correct in the same history mutation as hide/add/remove/edit.
 */
export function alignSidebarAfterProfileContacts(elements, bandId, templateId) {
  const id = String(templateId || "");
  const list = elements || [];
  const anchor = contactAnchor(list);
  const keepsVisibleContactFloor = Number.isFinite(Number(anchor?.contactBand?.sidebarSectionGap));
  if (
    !SIDEBAR_CONTACT_TEMPLATE_IDS.has(id)
    || (!isProfilePhotoHidden(list) && !keepsVisibleContactFloor)
  ) return list;

  const sectionFloor = hiddenProfileContactSectionFloor(list);
  if (sectionFloor == null) return list;
  const sidebarMembers = list.filter(isPageOneSidebarFlowElement);
  if (!sidebarMembers.length) return list;
  const sidebarStart = Math.min(...sidebarMembers.map((element) => Number(element.top)));
  const shift = sectionFloor - sidebarStart;
  if (Math.abs(shift) < 0.01) return list;

  // Record one accumulated translation on the stable contact anchor. Sidebar
  // sections can be added, removed, reordered, or remeasured while the photo
  // is hidden; restoring per-element snapshots would then mix old coordinates
  // with new hidden-state coordinates. Reversing this single translation for
  // every current rail member preserves the live relative layout instead.
  const recordsPhotoTransition = isProfilePhotoHidden(list);
  const previousShiftValue = anchor?.photoLayoutHome?.sidebarShift;
  const previousShift = previousShiftValue == null
    ? Number.NaN
    : Number(previousShiftValue);
  const accumulatedShift = (Number.isFinite(previousShift) ? previousShift : 0) + shift;

  return list.map((element) => {
    if (recordsPhotoTransition && element.element_id === anchor?.element_id) {
      return {
        ...element,
        photoLayoutHome: {
          ...(element.photoLayoutHome || {}),
          sidebarShift: accumulatedShift,
        },
      };
    }
    const top = Number(element.top);
    if (
      !isPageOneSidebarFlowElement(element)
      || !Number.isFinite(top)
      || top < sidebarStart
    ) {
      return element;
    }
    return {
      ...element,
      top: top + shift,
      photoLayoutHome: element.photoLayoutHome || { top },
    };
  });
}

/**
 * Hide the slot and apply the template-specific geometry transition.
 *
 * @param {object[]} elements - Current document elements.
 * @param {string} templateId - Active template identifier.
 * @param {null|((part: string) => string)} [createId] - Optional identifier
 * factory for temporary Slate contact-header chrome.
 * @returns {{elements: object[], contactBandId: string|null}}
 */
export function hideProfilePhoto(elements, templateId, createId = null) {
  if (!supportsProfilePhotoVisibility(templateId) || isProfilePhotoHidden(elements)) {
    return { elements, contactBandId: null };
  }
  const list = elements || [];
  const id = String(templateId);
  const anchor = contactAnchor(list);
  const transitioned = list.map((element) => {
    if (isSlotMember(element, id)) return { ...element, photoSlotHidden: true };

    const hiddenTop = Number(element.profilePhotoHiddenTop);
    if (Number.isFinite(hiddenTop)) {
      return {
        ...element,
        top: hiddenTop,
        photoLayoutHome: element.photoLayoutHome || { top: Number(element.top) || 0 },
      };
    }

    if (SIDEBAR_CONTACT_TEMPLATE_IDS.has(id) && anchor && element.element_id === anchor.element_id) {
      const descriptor = clone(element.contactBand);
      const hidden = descriptor?.photoHidden;
      const hiddenAnchor = id === "slate"
        ? SLATE_HIDDEN_CONTACT_ANCHOR
        : hidden?.anchor || { startX: 33, startY: 42, rightLimit: 174 };
      return {
        ...element,
        profilePhotoMainContactBand: clone(element.contactBand),
        contactBand: {
          ...descriptor,
          mode: hidden?.mode || "stacked",
          anchor: hiddenAnchor,
        },
      };
    }
    if (
      SIDEBAR_CONTACT_TEMPLATE_IDS.has(id)
      && anchor
      && element.contactBandId === anchor.contactBandId
      && element.contactChannel
    ) {
      // A contact can retain page=2 after an earlier multi-page reflow even
      // though its managed coordinates are later laid out in the page-one
      // sidebar. Normalize the complete band before measuring its bottom;
      // otherwise the initial hide sees only a partial stack and a later
      // "2 pages to 1" operation appears to fix the spacing by accident.
      return { ...element, page: 1 };
    }
    return element;
  });
  const next = id === "slate"
    ? materializeSlateContactHeader(transitioned, contactAnchor(transitioned), createId)
    : transitioned;
  return {
    elements: next,
    contactBandId: SIDEBAR_CONTACT_TEMPLATE_IDS.has(id) ? anchor?.contactBandId ?? null : null,
  };
}

/**
 * Restore the slot and every position/descriptor captured by hideProfilePhoto.
 * Slate's temporary contact heading is removed before authored positions and
 * the original main-column contact descriptor are restored.
 */
export function showProfilePhoto(elements, templateId) {
  if (!supportsProfilePhotoVisibility(templateId) || !isProfilePhotoHidden(elements)) {
    return { elements, contactBandId: null };
  }
  const id = String(templateId);
  let restoredBandId = null;
  const source = id === "slate"
    ? (elements || []).filter((element) => !isSlateContactHeader(element))
    : (elements || []);
  const sourceAnchor = contactAnchor(source);
  const sidebarShift = profilePhotoSidebarShift(source, sourceAnchor);
  const next = source.map((element) => {
    let updated = isSlotMember(element, id)
      ? { ...element, photoSlotHidden: false }
      : element;

    if (updated.photoLayoutHome) {
      const home = updated.photoLayoutHome;
      const { photoLayoutHome: _home, ...rest } = updated;
      updated = Number.isFinite(sidebarShift) && isPageOneSidebarFlowElement(updated)
        ? { ...rest, top: Number(updated.top) - sidebarShift }
        // Legacy transfers may already carry a rail snapshot into main.
        // Only explicit photo-dependent elements can restore an individual
        // position outside the current sidebar flow; ordinary main sections
        // keep the geometry produced by the section packer.
        : Number.isFinite(Number(home.top))
          && Number.isFinite(Number(updated.profilePhotoHiddenTop))
          ? { ...rest, top: Number(home.top) }
          : rest;
    } else if (Number.isFinite(sidebarShift) && isPageOneSidebarFlowElement(updated)) {
      // New sections created while the slot was hidden have no individual
      // home snapshot. They still belong to the same rail translation and
      // must return with their neighbours when the photo is shown again.
      updated = { ...updated, top: Number(updated.top) - sidebarShift };
    }
    if (updated.profilePhotoMainContactBand) {
      const descriptor = clone(updated.profilePhotoMainContactBand);
      const { profilePhotoMainContactBand: _descriptor, ...rest } = updated;
      updated = { ...rest, contactBand: descriptor };
      restoredBandId = updated.contactBandId || restoredBandId;
    }
    if (updated.profilePhotoMainMastheadIdentity) {
      const identity = clone(updated.profilePhotoMainMastheadIdentity);
      const { profilePhotoMainMastheadIdentity: _identity, ...rest } = updated;
      updated = { ...rest, mastheadIdentity: identity };
    }
    return updated;
  });
  return {
    elements: next,
    contactBandId: SIDEBAR_CONTACT_TEMPLATE_IDS.has(id) ? restoredBandId : null,
  };
}

/**
 * Remove only the selected user raster while retaining the reusable slot.
 * Converted glyphs carry their own placeholder snapshot; frame-only templates
 * simply drop the inserted image and keep their frame/well.
 */
export function removeProfilePhoto(elements, templateId) {
  const list = elements || [];
  return list.flatMap((element) => {
    if (element.photoSlot !== "image") return [element];
    const legacyPlaceholderSrc = LEGACY_FRAMELESS_PLACEHOLDERS[String(templateId || "")];
    if (!element.photoPlaceholder && !legacyPlaceholderSrc) return [];
    // Photos saved before placeholder snapshots were introduced can still be
    // removed safely from Atrium's frameless slot: its authored glyph and user
    // raster deliberately share the same direct-size geometry.
    const placeholder = clone(element.photoPlaceholder) || {
      category: "image",
      src: legacyPlaceholderSrc,
      left: element.left,
      top: element.top,
      width: element.width,
      height: element.height,
      page: element.page || 1,
      zIndex: element.zIndex,
      id: "atrium-photo-glyph",
      photoShape: "direct",
      alignWithText: false,
    };
    const {
      img_id: _imgId,
      objectFit: _objectFit,
      photoPlaceholder: _photoPlaceholder,
      borderRadius: _borderRadius,
      ...base
    } = element;
    return [{
      ...base,
      ...placeholder,
      photoSlot: "glyph",
      id: placeholder.id || base.id,
      fixedToPage: true,
      repeatOnContinuation: false,
      locked: true,
      isSelected: false,
      isMove: false,
      isEditing: false,
    }];
  });
}
