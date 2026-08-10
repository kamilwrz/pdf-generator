/**
 * Profile-photo slot helpers for template-mode gallery drops.
 *
 * Templates declare a photo area with:
 * - `photoSlot: "frame"` — the designated rectangle/circle chrome
 * - `photoSlot: "glyph"` — portrait placeholder image inside the frame
 * - `photoSlot: "ornament"` — decorative shapes the photo should cover
 * - `photoSlot: "image"` — the applied user photo (stable after upload)
 *
 * Known frame ids (`slate-photo-frame`, `tessera-photo-frame`, `aldine-frame`,
 * `harbor-photo-frame`, `cinder-frame-one`, `monument-masthead-frame`) are
 * recognised as a fallback for older payloads that still carry the symbolic
 * `id` after load.
 *
 * Applying a photo either resizes the glyph into the frame inset or inserts a
 * new locked image. Ornaments stay in place underneath a higher z-index photo;
 * the frame outline is raised so its border remains visible around the inset.
 */

import { nanoid } from "nanoid";

/** Symbolic frame ids used by Slate, Tessera, Aldine, Harbor, Cinder, Monument. */
export const PROFILE_PHOTO_FRAME_IDS = new Set([
  "slate-photo-frame",
  "tessera-photo-frame",
  "aldine-frame",
  "harbor-photo-frame",
  "cinder-frame-one",
  "monument-masthead-frame",
]);

/** Stable semantic id written onto the applied user photo element. */
export const PROFILE_PHOTO_ID = "profile-photo";

const DEFAULT_INSET_PT = 3;
const ALDINE_INSET_PT = 2;
const HARBOR_INSET_PT = 0;

/**
 * @param {object|null|undefined} element
 * @returns {{ left: number, top: number, width: number, height: number, page: number }}
 */
function bounds(element) {
  return {
    left: Number(element?.left) || 0,
    top: Number(element?.top) || 0,
    width: Number(element?.width) || 0,
    height: Number(element?.height) || 0,
    page: Number(element?.page) || 1,
  };
}

/**
 * @param {ReturnType<typeof bounds>} box
 * @param {number} inset
 */
function insetBox(box, inset) {
  const pad = Math.max(0, Number(inset) || 0);
  return {
    left: box.left + pad,
    top: box.top + pad,
    width: Math.max(1, box.width - pad * 2),
    height: Math.max(1, box.height - pad * 2),
    page: box.page,
  };
}

/**
 * @param {object} element
 * @returns {boolean}
 */
export function isProfilePhotoFrame(element) {
  if (!element) return false;
  if (element.photoSlot === "frame") return true;
  return PROFILE_PHOTO_FRAME_IDS.has(element.id);
}

/**
 * @param {object} element
 * @returns {boolean}
 */
function isPortraitGlyph(element) {
  if (!element || element.category !== "image") return false;
  if (element.photoSlot === "glyph") return true;
  const src = String(element.src || "");
  // Slate/Tessera use portrait.png; Harbor's circular placeholder uses the
  // grey "references" person mark at a geometric (non text-aligned) position.
  return /\/portrait\.png(?:\?|$)/i.test(src)
    || (/\/references\.png(?:\?|$)/i.test(src) && element.alignWithText === false);
}

/**
 * @param {object} element
 * @returns {boolean}
 */
function isOrnament(element) {
  if (!element) return false;
  if (element.photoSlot === "ornament") return true;
  return element.id === "aldine-seal"
    || element.id === "aldine-lozenge"
    || element.id === "aldine-core";
}

/**
 * @param {object[]} elements
 * @returns {object|null}
 */
function findExistingPhoto(elements) {
  return (elements || []).find((element) => (
    element.photoSlot === "image"
    || element.id === PROFILE_PHOTO_ID
  )) || null;
}

/**
 * @param {object[]} elements
 * @returns {object|null}
 */
function findFrame(elements) {
  return (elements || []).find((element) => isProfilePhotoFrame(element)) || null;
}

/**
 * @param {object[]} elements
 * @param {object} frame
 * @returns {object|null}
 */
function findGlyphInFrame(elements, frame) {
  const frameBox = bounds(frame);
  return (elements || []).find((element) => {
    if (!isPortraitGlyph(element)) return false;
    if ((Number(element.page) || 1) !== frameBox.page) return false;
    const glyph = bounds(element);
    const cx = glyph.left + glyph.width / 2;
    const cy = glyph.top + glyph.height / 2;
    return (
      cx >= frameBox.left
      && cx <= frameBox.left + frameBox.width
      && cy >= frameBox.top
      && cy <= frameBox.top + frameBox.height
    );
  }) || null;
}

/**
 * Inset so the frame stroke remains visible around the photo.
 * Harbor's filled disc uses zero inset so the photo covers the circle.
 *
 * @param {object} frame
 * @returns {number}
 */
function insetForFrame(frame) {
  if (
    frame?.id === "aldine-frame"
    || frame?.id === "monument-masthead-frame"
    || frame?.photoShape === "ornament-frame"
  ) {
    return ALDINE_INSET_PT;
  }
  if (
    frame?.id === "harbor-photo-frame"
    || frame?.category === "circle"
    || frame?.photoShape === "circle"
  ) {
    return HARBOR_INSET_PT;
  }
  return DEFAULT_INSET_PT;
}

/**
 * Legacy heuristic: large near-top non-icon gallery/image slot.
 *
 * @param {object[]} elements
 * @returns {object|null}
 */
function findLegacyImageSlot(elements) {
  const images = (elements || []).filter((element) => (
    element.category === "image"
    && !element.fixedToPage
    && element.photoSlot !== "glyph"
    && !/template-assets\/iconic\//.test(String(element.src || ""))
  ));
  if (images.length === 0) return null;
  return [...images].sort((a, b) => {
    const score = (element) => {
      const area = (Number(element.width) || 0) * (Number(element.height) || 0);
      const top = Number(element.top) || 0;
      return area - top * 2;
    };
    return score(b) - score(a);
  })[0];
}

/**
 * Resolve a profile-photo drop target for template mode.
 * Returns an existing photo, a portrait glyph, a frame-backed stub, or a
 * legacy large image. Truthy result means GalleryItem can offer "zdjęcie profilowe".
 *
 * @param {object[]|null|undefined} elements
 * @returns {object|null}
 */
export function findProfilePhotoSlot(elements) {
  const list = elements || [];
  const existing = findExistingPhoto(list);
  if (existing) return existing;

  const frame = findFrame(list);
  if (frame) {
    const glyph = findGlyphInFrame(list, frame);
    if (glyph) return glyph;
    // Frame-only templates (Aldine): expose a truthy slot descriptor. Callers
    // that need geometry must use `applyProfilePhoto`, not editElementValues.
    return {
      element_id: frame.element_id || frame.id || "photo-frame-slot",
      category: "image",
      id: frame.id,
      photoSlot: "frame",
      left: frame.left,
      top: frame.top,
      width: frame.width,
      height: frame.height,
      page: frame.page || 1,
      _frameSlot: true,
    };
  }

  // Untagged Slate/Tessera: portrait glyph still identifies the slot.
  const looseGlyph = list.find((element) => isPortraitGlyph(element));
  if (looseGlyph) return looseGlyph;

  return findLegacyImageSlot(list);
}

/**
 * Whether the document has a dedicated profile-photo placement (frame/glyph).
 *
 * @param {object[]|null|undefined} elements
 * @returns {boolean}
 */
export function hasProfilePhotoSlot(elements) {
  const slot = findProfilePhotoSlot(elements);
  if (!slot) return false;
  if (slot._frameSlot || slot.photoSlot === "frame" || slot.photoSlot === "glyph") {
    return true;
  }
  if (slot.photoSlot === "image" || slot.id === PROFILE_PHOTO_ID) return true;
  if (isPortraitGlyph(slot)) return true;
  // Legacy large image counts as a replaceable slot.
  return slot.category === "image";
}

/**
 * Place (or replace) the user photo inside the template photo slot.
 *
 * @param {object[]|null|undefined} elements
 * @param {{ src: string, img_id?: string|number|null }} photo
 * @param {() => string} [createId]
 * @returns {object[]}
 */
export function applyProfilePhoto(elements, photo, createId = nanoid) {
  const list = Array.isArray(elements) ? elements : [];
  const src = String(photo?.src || "");
  const imgId = photo?.img_id ?? null;
  if (!src) return list;

  const existing = findExistingPhoto(list);
  const frame = findFrame(list);
  const glyph = frame ? findGlyphInFrame(list, frame) : list.find((el) => isPortraitGlyph(el)) || null;

  // No dedicated chrome: replace the legacy large image src in place.
  if (!frame && !glyph && !existing) {
    const legacy = findLegacyImageSlot(list);
    if (!legacy) return list;
    return list.map((element) => (
      element.element_id === legacy.element_id
        ? {
          ...element,
          src,
          img_id: imgId,
          photoSlot: "image",
          id: element.id || PROFILE_PHOTO_ID,
          alignWithText: false,
        }
        : element
    ));
  }

  const frameBox = frame ? bounds(frame) : bounds(glyph);
  const inset = frame ? insetForFrame(frame) : DEFAULT_INSET_PT;
  const photoBox = insetBox(frameBox, inset);
  const isCircle = Boolean(
    frame
    && (
      frame.category === "circle"
      || frame.photoShape === "circle"
      || frame.id === "harbor-photo-frame"
    ),
  );

  // Layering:
  // - Slate/Tessera: photo sits under the outline stroke (inset shows the border).
  // - Aldine: photo covers seal/lozenge/core; frame outline is raised above it.
  // - Harbor circle: photo covers the filled disc (no outline to preserve).
  const frameZ = Number(frame?.zIndex) || 3;
  const isOrnamentFrame = frame?.photoShape === "ornament-frame" || frame?.id === "aldine-frame";
  let photoZ = Number(glyph?.zIndex) || 4;
  let nextFrameZ = frameZ;
  if (frame) {
    if (isCircle) {
      photoZ = frameZ + 1;
    } else if (isOrnamentFrame) {
      photoZ = frameZ + 1;
      nextFrameZ = photoZ + 1;
    } else {
      photoZ = Math.max(1, frameZ - 1);
    }
  }

  const photoFields = {
    category: "image",
    src,
    img_id: imgId,
    left: photoBox.left,
    top: photoBox.top,
    width: photoBox.width,
    height: photoBox.height,
    page: photoBox.page,
    zIndex: photoZ,
    photoSlot: "image",
    id: PROFILE_PHOTO_ID,
    alignWithText: false,
    locked: true,
    fixedToPage: true,
    isSelected: false,
    isMove: false,
    isEditing: false,
    ...(isCircle ? { borderRadius: Math.min(photoBox.width, photoBox.height) / 2 } : {}),
  };

  // Prefer updating an existing applied photo or converting the glyph.
  const targetId = existing?.element_id || glyph?.element_id || null;
  let replaced = false;
  const next = list.map((element) => {
    if (frame && element.element_id === frame.element_id) {
      return { ...element, zIndex: nextFrameZ, photoSlot: element.photoSlot || "frame" };
    }
    if (targetId && element.element_id === targetId) {
      replaced = true;
      return {
        ...element,
        ...photoFields,
        element_id: element.element_id,
      };
    }
    // Glyph left behind when we insert a fresh photo: collapse it so it does
    // not peek out from under a slightly smaller inset photo.
    if (
      !targetId
      && glyph
      && element.element_id === glyph.element_id
    ) {
      return {
        ...element,
        width: 0,
        height: 0,
        photoSlot: "glyph",
        locked: true,
        fixedToPage: true,
      };
    }
    return element;
  });

  if (replaced) return next;

  return [
    ...next,
    {
      element_id: createId(),
      ...photoFields,
    },
  ];
}
