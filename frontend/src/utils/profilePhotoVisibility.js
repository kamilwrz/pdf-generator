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
const SIDEBAR_CONTACT_SECTION_GAP = 40;
const PORTICO_PHOTO_BOTTOM = 159;
const PORTICO_RECLAIM_PT = 100;
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

/** Whether this template exposes the photo visibility affordance. */
export function supportsProfilePhotoVisibility(templateId) {
  return SUPPORTED_TEMPLATE_IDS.has(String(templateId || ""));
}

/** Whether the document currently keeps its profile-photo slot hidden. */
export function isProfilePhotoHidden(elements) {
  return (elements || []).some((element) => element?.photoSlotHidden === true);
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
 * Place the first Slate/Tessera sidebar section below the contact stack after
 * contact-band layout has produced its final coordinates.
 *
 * Measuring rendered members instead of predicting row count is important:
 * active channels and label edits can change independently, while the sidebar
 * must be correct in the same history mutation as hide/add/remove/edit.
 */
export function alignSidebarAfterProfileContacts(elements, bandId, templateId) {
  const id = String(templateId || "");
  const list = elements || [];
  if (!SIDEBAR_CONTACT_TEMPLATE_IDS.has(id) || !isProfilePhotoHidden(list)) return list;

  const anchor = contactAnchor(list);
  const contacts = list.filter((element) => (
    (Number(element.page) || 1) === 1
    && element.contactBandId === bandId
    && element.contactChannel
    && Number.isFinite(Number(element.top))
  ));
  const contactBottom = contacts.length
    ? Math.max(...contacts.map((element) => (
      Number(element.top)
      + Math.max(
        Number(element.height) || 0,
        Number(element.lineHeight) || 0,
        Number(element.fontSize) || 0,
      )
    )))
    : Number(anchor?.contactBand?.anchor?.startY) || 42;
  const sidebarMembers = list.filter((element) => (
    (Number(element.page) || 1) === 1
    && !element.fixedToPage
    && !element.contactChannel
    && (element.flowLane === "sidebar" || element.flowRole === "sidebar-chrome")
    && Number.isFinite(Number(element.top))
  ));
  if (!sidebarMembers.length) return list;
  const sidebarStart = Math.min(...sidebarMembers.map((element) => Number(element.top)));
  const shift = contactBottom + SIDEBAR_CONTACT_SECTION_GAP - sidebarStart;
  if (Math.abs(shift) < 0.01) return list;

  return list.map((element) => {
    const top = Number(element.top);
    if (
      (Number(element.page) || 1) !== 1
      || element.fixedToPage
      || element.contactChannel
      || (element.flowLane !== "sidebar" && element.flowRole !== "sidebar-chrome")
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

/** Hide the slot and apply the template-specific geometry transition. */
export function hideProfilePhoto(elements, templateId) {
  if (!supportsProfilePhotoVisibility(templateId) || isProfilePhotoHidden(elements)) {
    return { elements, contactBandId: null };
  }
  const list = elements || [];
  const id = String(templateId);
  const anchor = contactAnchor(list);
  const next = list.map((element) => {
    if (isSlotMember(element, id)) return { ...element, photoSlotHidden: true };

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
    let updated = isSlotMember(element, id)
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
