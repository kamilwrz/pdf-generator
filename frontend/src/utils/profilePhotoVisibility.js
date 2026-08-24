/**
 * Reversible profile-photo visibility operations for templates whose masthead
 * geometry has an explicit product contract.
 *
 * Slot elements stay in document state while hidden. This preserves the exact
 * authored geometry and makes show/hide lossless across undo, save, and reload.
 * Portico stores the original position on every reclaimed element. Slate and
 * Tessera store the original contact-band descriptor on its zero-size anchor,
 * then switch the band to a one-row-per-channel sidebar layout.
 */

const SUPPORTED_TEMPLATE_IDS = new Set([
  "atrium",
  "vestige",
  "monument",
  "portico",
  "slate",
  "tessera",
]);

const SIDEBAR_CONTACT_TEMPLATE_IDS = new Set(["slate", "tessera"]);
const PORTICO_PHOTO_BOTTOM = 159;
const PORTICO_RECLAIM_PT = 100;
const LEGACY_FRAMELESS_PLACEHOLDERS = {
  atrium: "/template-assets/iconic/atrium-accent/portrait.png",
};

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isSlotMember(element) {
  return Boolean(element?.photoSlot);
}

function contactAnchor(elements) {
  return (elements || []).find((element) => (
    element.flowRole === "masthead-anchor"
    && element.contactBandId
    && element.contactBand
  )) || null;
}

/** Whether this template exposes the photo visibility affordance. */
export function supportsProfilePhotoVisibility(templateId) {
  return SUPPORTED_TEMPLATE_IDS.has(String(templateId || ""));
}

/** Whether the document currently keeps its profile-photo slot hidden. */
export function isProfilePhotoHidden(elements) {
  return (elements || []).some((element) => isSlotMember(element) && element.photoSlotHidden === true);
}

/**
 * Resolve geometry used by the canvas hover affordance. The name fallback is
 * intentionally conservative: largest non-contact masthead text on page one.
 */
export function profilePhotoControlAnchor(elements, templateId) {
  if (!supportsProfilePhotoVisibility(templateId)) return null;
  const list = elements || [];
  const slots = list.filter(isSlotMember);
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

/** Hide the slot and apply the template-specific geometry transition. */
export function hideProfilePhoto(elements, templateId) {
  if (!supportsProfilePhotoVisibility(templateId) || isProfilePhotoHidden(elements)) {
    return { elements, contactBandId: null };
  }
  const list = elements || [];
  const id = String(templateId);
  const anchor = contactAnchor(list);
  const sidebarMembers = SIDEBAR_CONTACT_TEMPLATE_IDS.has(id)
    ? list.filter((element) => (
      (Number(element.page) || 1) === 1
      && element.flowRole === "sidebar-chrome"
      && Number.isFinite(Number(element.top))
    ))
    : [];
  const sidebarStart = sidebarMembers.length
    ? Math.min(...sidebarMembers.map((element) => Number(element.top)))
    : null;
  const contactCount = new Set(
    list.filter((element) => element.contactBandId === anchor?.contactBandId && element.contactChannel)
      .map((element) => element.contactChannel),
  ).size;
  const contactLineStep = Number(anchor?.contactBand?.metrics?.lineStep) || 16;
  const contactHeight = Math.max(
    Number(anchor?.contactBand?.icon?.sizePt) || 11,
    Number(anchor?.contactBand?.text?.fontSizePt) || 8,
  );
  // The first sidebar section follows the stacked contacts by the same 28 pt
  // photo-to-section gap authored by Slate/Tessera. This closes the old photo
  // hole while retaining deliberate whitespace and exact lane symmetry.
  const sidebarTargetStart = 42
    + Math.max(0, contactCount - 1) * contactLineStep
    + contactHeight
    + 28;
  const sidebarShift = sidebarStart == null ? 0 : sidebarTargetStart - sidebarStart;
  const next = list.map((element) => {
    if (isSlotMember(element)) return { ...element, photoSlotHidden: true };

    if (id === "portico") {
      if (element.contactBand?.anchor) {
        const original = clone(element.contactBand);
        const descriptor = clone(element.contactBand);
        if (Number.isFinite(Number(descriptor.anchor.startY))) {
          descriptor.anchor.startY -= PORTICO_RECLAIM_PT;
        }
        return { ...element, contactBand: descriptor, profilePhotoMainContactBand: original };
      }
      const page = Number(element.page) || 1;
      const top = Number(element.top);
      if (page === 1 && Number.isFinite(top) && top >= PORTICO_PHOTO_BOTTOM) {
        return { ...element, top: top - PORTICO_RECLAIM_PT, photoLayoutHome: { top } };
      }
    }

    if (SIDEBAR_CONTACT_TEMPLATE_IDS.has(id) && anchor && element.element_id === anchor.element_id) {
      const descriptor = clone(element.contactBand);
      return {
        ...element,
        profilePhotoMainContactBand: clone(element.contactBand),
        contactBand: {
          ...descriptor,
          mode: "stacked",
          anchor: { startX: 33, startY: 42, rightLimit: 174 },
        },
      };
    }
    if (
      SIDEBAR_CONTACT_TEMPLATE_IDS.has(id)
      && sidebarStart != null
      && sidebarShift !== 0
      && (Number(element.page) || 1) === 1
      && (element.flowLane === "sidebar" || element.flowRole === "sidebar-chrome")
      && Number(element.top) >= sidebarStart
    ) {
      return {
        ...element,
        top: Number(element.top) + sidebarShift,
        photoLayoutHome: { top: Number(element.top) },
      };
    }
    return element;
  });
  return {
    elements: next,
    contactBandId: SIDEBAR_CONTACT_TEMPLATE_IDS.has(id) ? anchor?.contactBandId ?? null : null,
  };
}

/** Restore the slot and every position/descriptor captured by hideProfilePhoto. */
export function showProfilePhoto(elements, templateId) {
  if (!supportsProfilePhotoVisibility(templateId) || !isProfilePhotoHidden(elements)) {
    return { elements, contactBandId: null };
  }
  const id = String(templateId);
  let restoredBandId = null;
  const next = (elements || []).map((element) => {
    let updated = isSlotMember(element)
      ? { ...element, photoSlotHidden: false }
      : element;
    if (updated.photoLayoutHome) {
      const { photoLayoutHome: _home, ...rest } = updated;
      updated = { ...rest, top: updated.photoLayoutHome.top };
    }
    if (updated.profilePhotoMainContactBand) {
      const descriptor = clone(updated.profilePhotoMainContactBand);
      const { profilePhotoMainContactBand: _descriptor, ...rest } = updated;
      updated = { ...rest, contactBand: descriptor };
      restoredBandId = updated.contactBandId || restoredBandId;
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
 * Converted glyphs carry their own placeholder snapshot; frame-only Portico
 * simply drops the inserted image and keeps its frame/well.
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
      locked: true,
      isSelected: false,
      isMove: false,
      isEditing: false,
    }];
  });
}
