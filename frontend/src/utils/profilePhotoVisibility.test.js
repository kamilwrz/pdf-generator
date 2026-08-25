import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { atriumTemplate } from "../templates/atrium.js";
import { monumentTemplate } from "../templates/monument.js";
import { porticoTemplate } from "../templates/portico.js";
import { slateTemplate } from "../templates/slate.js";
import { tesseraTemplate } from "../templates/tessera.js";
import { applyChannelRelayout } from "./contactBandOps.js";
import {
  alignSidebarAfterProfileContacts,
  hideProfilePhoto,
  isProfilePhotoHidden,
  profilePhotoControlAnchor,
  removeProfilePhoto,
  showProfilePhoto,
} from "./profilePhotoVisibility.js";

function withIds(elements) {
  return elements.map((element, index) => ({
    ...element,
    element_id: element.element_id || `element-${index}`,
  }));
}

describe("profile photo visibility", () => {
  it("hides Atrium without moving non-slot content and restores it", () => {
    const source = withIds(atriumTemplate);
    const hidden = hideProfilePhoto(source, "atrium").elements;
    assert.equal(isProfilePhotoHidden(hidden), true);
    source.forEach((element, index) => {
      if (!element.photoSlot) assert.equal(hidden[index].top, element.top);
    });
    const restored = showProfilePhoto(hidden, "atrium").elements;
    assert.equal(isProfilePhotoHidden(restored), false);
  });

  it("reclaims Portico photo height and restores exact authored positions", () => {
    const source = withIds(porticoTemplate);
    const contact = source.find((element) => element.contactChannel === "phone" && element.category === "text");
    const fixedChrome = source.filter((element) => element.fixedToPage && !element.photoSlot);
    const hidden = hideProfilePhoto(source, "portico").elements;
    const moved = hidden.find((element) => element.element_id === contact.element_id);
    const hiddenAnchor = hidden.find((element) => element.contactBand);
    assert.equal(moved.top, contact.top - 100);
    assert.deepEqual(moved.photoLayoutHome, { top: contact.top });
    assert.equal(hiddenAnchor.contactBand.anchor.startY, 91);
    fixedChrome.forEach((element) => {
      const afterHide = hidden.find((candidate) => candidate.element_id === element.element_id);
      assert.equal(afterHide.top, element.top, `${element.category} fixed chrome stays anchored`);
      assert.equal(afterHide.photoLayoutHome, undefined);
    });
    const restored = showProfilePhoto(hidden, "portico").elements;
    assert.equal(restored.find((element) => element.element_id === contact.element_id).top, contact.top);
  });

  for (const [templateId, template] of [["slate", slateTemplate], ["tessera", tesseraTemplate]]) {
    it(`switches ${templateId} contacts to a sidebar stack and back to main`, () => {
      const source = withIds(template);
      const originalAnchor = source.find((element) => element.contactBand);
      const originalSidebarTop = Math.min(...source
        .filter((element) => element.flowRole === "sidebar-chrome")
        .map((element) => Number(element.top)));
      const hiddenResult = hideProfilePhoto(source, templateId);
      const hiddenAnchor = hiddenResult.elements.find((element) => element.element_id === originalAnchor.element_id);
      assert.equal(hiddenResult.contactBandId, "contact-main");
      assert.equal(hiddenAnchor.contactBand.mode, "stacked");
      assert.deepEqual(hiddenAnchor.contactBand.anchor, { startX: 33, startY: 42, rightLimit: 174 });
      const hiddenPhotoCluster = hiddenResult.elements.filter((element) => (
        element.fixedToPage
        && element.flowLane === "sidebar"
        && element.flowRole === "content"
        && Number(element.left) < 180
        && Number(element.top) < 180
      ));
      assert.ok(hiddenPhotoCluster.length >= 6);
      assert.ok(hiddenPhotoCluster.every((element) => element.photoSlotHidden === true));
      const relaid = applyChannelRelayout(
        hiddenResult.elements,
        hiddenResult.contactBandId,
        (text) => String(text).length * 5,
        () => "unused-id",
      ).elements;
      const aligned = alignSidebarAfterProfileContacts(
        relaid, hiddenResult.contactBandId, templateId,
      );
      const contactBottom = Math.max(...aligned
        .filter((element) => element.contactBandId === "contact-main" && element.contactChannel)
        .map((element) => Number(element.top) + Math.max(
          Number(element.height) || 0,
          Number(element.lineHeight) || 0,
          Number(element.fontSize) || 0,
        )));
      const hiddenSidebarTop = Math.min(...aligned
        .filter((element) => element.flowRole === "sidebar-chrome")
        .map((element) => Number(element.top)));
      assert.ok(hiddenSidebarTop < originalSidebarTop);
      assert.equal(hiddenSidebarTop - contactBottom, 40);
      const shown = showProfilePhoto(aligned, templateId).elements;
      const shownAnchor = shown.find((element) => element.element_id === originalAnchor.element_id);
      assert.deepEqual(shownAnchor.contactBand, originalAnchor.contactBand);
      const shownSidebarTop = Math.min(...shown
        .filter((element) => element.flowRole === "sidebar-chrome")
        .map((element) => Number(element.top)));
      assert.equal(shownSidebarTop, originalSidebarTop);
      assert.ok(shown
        .filter((element) => hiddenPhotoCluster.some((member) => member.element_id === element.element_id))
        .every((element) => element.photoSlotHidden === false));
    });
  }

  it("hides legacy Tessera photo chrome that predates ornament tags", () => {
    const legacy = withIds(tesseraTemplate).map((element) => {
      if (element.photoSlot !== "ornament") return element;
      const { photoSlot: _photoSlot, ...withoutTag } = element;
      return withoutTag;
    });
    const hidden = hideProfilePhoto(legacy, "tessera").elements;
    const legacyCluster = hidden.filter((element) => (
      element.fixedToPage
      && element.flowLane === "sidebar"
      && element.flowRole === "content"
      && Number(element.left) < 180
      && Number(element.top) < 180
    ));
    assert.ok(legacyCluster.every((element) => element.photoSlotHidden === true));
  });

  it("brings every hidden-photo contact onto page one before measuring the sidebar gap", () => {
    const source = withIds(tesseraTemplate).map((element) => (
      ["github", "website"].includes(element.contactChannel)
        ? { ...element, page: 2 }
        : element
    ));
    const hidden = hideProfilePhoto(source, "tessera");
    const contacts = hidden.elements.filter((element) => element.contactChannel);
    assert.ok(contacts.every((element) => element.page === 1));

    const relaid = applyChannelRelayout(
      hidden.elements,
      hidden.contactBandId,
      (text) => String(text).length * 5,
      () => "unused-id",
    ).elements;
    const aligned = alignSidebarAfterProfileContacts(
      relaid, hidden.contactBandId, "tessera",
    );
    const contactBottom = Math.max(...aligned
      .filter((element) => element.contactChannel)
      .map((element) => Number(element.top) + Math.max(
        Number(element.height) || 0,
        Number(element.fontSize) || 0,
      )));
    const sidebarTop = Math.min(...aligned
      .filter((element) => element.flowRole === "sidebar-chrome")
      .map((element) => Number(element.top)));
    assert.equal(sidebarTop - contactBottom, 40);
  });

  it("removes only the user raster and restores its saved placeholder", () => {
    const elements = [{
      element_id: "photo",
      category: "image",
      photoSlot: "image",
      src: "/images/8/content",
      img_id: 8,
      objectFit: "cover",
      left: 10,
      top: 10,
      width: 80,
      height: 100,
      photoPlaceholder: {
        category: "image",
        src: "/template-assets/portrait.png",
        left: 30,
        top: 40,
        width: 24,
        height: 24,
      },
    }];
    const [slot] = removeProfilePhoto(elements);
    assert.equal(slot.photoSlot, "glyph");
    assert.equal(slot.src, "/template-assets/portrait.png");
    assert.equal(slot.img_id, undefined);
    assert.equal(slot.left, 30);
  });

  it("restores the Atrium glyph for photos saved before placeholder snapshots", () => {
    const [slot] = removeProfilePhoto([{
      element_id: "legacy-atrium-photo",
      category: "image",
      photoSlot: "image",
      src: "/images/9/content",
      left: 462,
      top: 19,
      width: 60,
      height: 80,
    }], "atrium");
    assert.equal(slot.photoSlot, "glyph");
    assert.equal(slot.src, "/template-assets/iconic/atrium-accent/portrait.png");
    assert.equal(slot.width, 60);
  });

  it("finds a name-hover restore anchor in Monument without identity tags", () => {
    const source = withIds(monumentTemplate);
    const hidden = hideProfilePhoto(source, "monument").elements;
    const anchor = profilePhotoControlAnchor(hidden, "monument");
    assert.equal(anchor.hidden, true);
    assert.ok(anchor.name?.elementId);
    assert.ok(anchor.slotElementIds.length >= 2);
  });
});

it("exposes accessible hover actions for hide, restore, and raster removal", async () => {
  const controlsUrl = new URL(
    "../components/canvas/ProfilePhotoControls/ProfilePhotoControls.jsx",
    import.meta.url,
  );
  const source = await readFile(controlsUrl, "utf8");
  assert.match(source, /Ukryj slot zdjęcia profilowego/);
  assert.match(source, /Pokaż slot zdjęcia profilowego/);
  assert.match(source, /Usuń zdjęcie ze slotu/);
  assert.match(source, /FiEyeOff/);
  assert.match(source, /FiTrash2/);
  assert.match(source, /anchor\.name\.elementId/);
});
