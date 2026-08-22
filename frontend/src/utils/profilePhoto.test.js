/**
 * Profile-photo slot detection and apply behaviour for all clickable templates.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyProfilePhoto,
  findProfilePhotoSlot,
  hasProfilePhotoSlot,
  isProfilePhotoClickTarget,
  PROFILE_PHOTO_ID,
} from "./profilePhoto.js";
import { materializeElementSpecs } from "./materializeElementSpecs.js";
import { slateTemplate } from "../templates/slate.js";
import { tesseraTemplate } from "../templates/tessera.js";
import { monumentTemplate } from "../templates/monument.js";
import { atriumTemplate } from "../templates/atrium.js";

const PHOTO = { src: "/images/9/content", img_id: 9 };

describe("findProfilePhotoSlot", () => {
  it("finds the slate portrait glyph via photoSlot", () => {
    const slot = findProfilePhotoSlot(slateTemplate);
    assert.ok(slot);
    assert.equal(slot.photoSlot, "glyph");
    assert.ok(String(slot.src).endsWith("/portrait.png"));
  });

  it("finds the tessera portrait glyph via photoSlot", () => {
    const slot = findProfilePhotoSlot(tesseraTemplate);
    assert.ok(slot);
    assert.equal(slot.photoSlot, "glyph");
  });

  it("finds the Monument portrait glyph", () => {
    const slot = findProfilePhotoSlot(monumentTemplate);
    assert.ok(slot);
    assert.equal(slot.photoSlot, "glyph");
    assert.ok(String(slot.src).endsWith("/monument/portrait.png"));
  });

  it("finds the Atrium portrait glyph", () => {
    const slot = findProfilePhotoSlot(atriumTemplate);
    assert.ok(slot);
    assert.equal(slot.photoSlot, "glyph");
  });

  it("still prefers a large near-top non-icon image (legacy)", () => {
    const slot = findProfilePhotoSlot([
      { element_id: "icon", category: "image", src: "/template-assets/iconic/x.svg", width: 14, height: 14, top: 40 },
      { element_id: "photo", category: "image", src: "/images/2/content", width: 90, height: 90, top: 50 },
      { element_id: "logo", category: "image", src: "/images/3/content", width: 40, height: 20, top: 400 },
    ]);
    assert.equal(slot.element_id, "photo");
  });
});

describe("applyProfilePhoto", () => {
  it("fits a photo inside the slate frame under the outline", () => {
    const elements = materializeElementSpecs(slateTemplate, () => `id-${Math.random()}`);
    const next = applyProfilePhoto(elements, PHOTO, () => "new-photo");
    const photo = next.find((el) => el.photoSlot === "image");
    const frame = next.find((el) => el.id === "slate-photo-frame");
    assert.ok(photo);
    assert.ok(frame);
    assert.equal(photo.src, PHOTO.src);
    assert.equal(photo.img_id, 9);
    assert.equal(photo.id, PROFILE_PHOTO_ID);
    assert.equal(photo.locked, true);
    assert.equal(photo.fixedToPage, true);
    // Inset 3pt inside 33,40,112×126 → 36,43,106×120
    assert.equal(photo.left, 36);
    assert.equal(photo.top, 43);
    assert.equal(photo.width, 106);
    assert.equal(photo.height, 120);
    assert.ok(photo.zIndex < frame.zIndex);
    // Portrait glyph was converted in place (no second image left).
    assert.equal(next.filter((el) => el.photoSlot === "glyph").length, 0);
  });

  it("fits a photo inside the tessera frame", () => {
    const elements = materializeElementSpecs(tesseraTemplate, () => `t-${Math.random()}`);
    const next = applyProfilePhoto(elements, PHOTO, () => "new-photo");
    const photo = next.find((el) => el.photoSlot === "image");
    assert.ok(photo);
    assert.equal(photo.left, 36);
    assert.equal(photo.top, 43);
    assert.equal(photo.width, 106);
    assert.equal(photo.height, 120);
  });

  it("replaces Monument's glyph and keeps its frame border above the photo", () => {
    const elements = materializeElementSpecs(monumentTemplate, () => `m-${Math.random()}`);
    const next = applyProfilePhoto(elements, PHOTO, () => "monument-photo");
    const photo = next.find((el) => el.photoSlot === "image");
    const frame = next.find((el) => el.id === "monument-masthead-frame");
    assert.ok(photo);
    assert.ok(frame);
    assert.equal(next.filter((el) => el.photoSlot === "ornament").length, 0);
    assert.equal(next.length, elements.length);
    // Inset 2pt inside 425,47,80×107 → 427,49,76×103.
    assert.equal(photo.left, 427);
    assert.equal(photo.top, 49);
    assert.equal(photo.width, 76);
    assert.equal(photo.height, 103);
    assert.ok(frame.zIndex > photo.zIndex);
  });

  it("replaces an already-applied profile photo in place", () => {
    const elements = materializeElementSpecs(slateTemplate, () => `r-${Math.random()}`);
    const once = applyProfilePhoto(elements, PHOTO, () => "p1");
    const twice = applyProfilePhoto(once, { src: "/images/10/content", img_id: 10 }, () => "p2");
    const photos = twice.filter((el) => el.photoSlot === "image");
    assert.equal(photos.length, 1);
    assert.equal(photos[0].src, "/images/10/content");
    assert.equal(photos[0].img_id, 10);
  });

  it("reports hasProfilePhotoSlot for tagged templates", () => {
    assert.equal(hasProfilePhotoSlot(slateTemplate), true);
    assert.equal(hasProfilePhotoSlot(tesseraTemplate), true);
    assert.equal(hasProfilePhotoSlot(monumentTemplate), true);
    assert.equal(hasProfilePhotoSlot(atriumTemplate), true);
    assert.equal(hasProfilePhotoSlot([]), false);
  });

  it("marks frames, glyphs, and applied profile photos as gallery click targets", () => {
    assert.equal(isProfilePhotoClickTarget({ photoSlot: "frame" }), true);
    assert.equal(isProfilePhotoClickTarget({ photoSlot: "glyph" }), true);
    assert.equal(isProfilePhotoClickTarget({ photoSlot: "image" }), true);
    assert.equal(isProfilePhotoClickTarget({ photoSlot: "ornament" }), false);
  });
});
