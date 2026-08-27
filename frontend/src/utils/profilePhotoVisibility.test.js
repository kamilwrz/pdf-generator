import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { atriumTemplate } from "../templates/atrium.js";
import { monumentTemplate } from "../templates/monument.js";
import { porticoTemplate } from "../templates/portico.js";
import { slateTemplate } from "../templates/slate.js";
import { tesseraTemplate } from "../templates/tessera.js";
import { lindenTemplate } from "../templates/linden.js";
import { applyChannelRelayout } from "./contactBandOps.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import { applyTitleToggle } from "./mastheadIdentityOps.js";
import { reflowPorticoAfterMastheadChange } from "./porticoMastheadReflow.js";
import {
  alignSidebarAfterProfileContacts,
  hideProfilePhoto,
  isProfilePhotoHidden,
  profilePhotoControlAnchor,
  removeProfilePhoto,
  showProfilePhoto,
} from "./profilePhotoVisibility.js";
import { listDocumentSections, sectionElementIds } from "./sectionStructure.js";
import { contentMaxPage } from "./structureOperation.js";

function withIds(elements) {
  return elements.map((element, index) => ({
    ...element,
    element_id: element.element_id || `element-${index}`,
  }));
}

function twoPagePorticoFixture() {
  const source = withIds(porticoTemplate);
  const continuationSections = listDocumentSections(source).slice(2);
  const continuationIds = new Set(continuationSections.flatMap(
    (section) => [...sectionElementIds(source, section.headingId)],
  ));
  const firstContinuationTop = Math.min(...source
    .filter((element) => continuationIds.has(element.element_id))
    .map((element) => Number(element.top)));

  return source.map((element) => (
    continuationIds.has(element.element_id)
      ? { ...element, page: 2, top: Number(element.top) - firstContinuationTop + 66 }
      : element
  ));
}

/**
 * Reproduce the stale two-page geometry from the reported Portico document.
 *
 * The last experience title still fits on page one, but its company line has
 * already moved to page two. Education chrome was left between those two
 * `flowGroup` mates. A masthead pack must recover the record's semantic owner
 * before compacting sections, otherwise the company line is laid out inside
 * Education and the two sections become visibly interleaved.
 */
function splitExperienceBeforeEducationFixture() {
  const source = withIds(porticoTemplate);
  const experienceTitle = source.find(
    (element) => element.content === "Specjalistka Obsługi Klienta",
  );
  const experienceGroup = experienceTitle.flowGroup;
  const experienceMembers = source.filter(
    (element) => element.flowGroup === experienceGroup,
  );
  const education = listDocumentSections(source).find(
    (section) => section.title === "WYKSZTAŁCENIE",
  );
  const skills = listDocumentSections(source).find(
    (section) => section.title === "UMIEJĘTNOŚCI",
  );
  const languages = listDocumentSections(source).find(
    (section) => section.title === "JĘZYKI",
  );
  const educationIds = sectionElementIds(source, education.headingId);
  const skillsIds = sectionElementIds(source, skills.headingId);
  const languageIds = sectionElementIds(source, languages.headingId);
  const educationMembers = source.filter((element) => educationIds.has(element.element_id));
  const educationChrome = educationMembers.filter(
    (element) => element.flowRole === "section-chrome",
  );
  const educationBody = educationMembers.filter(
    (element) => element.flowRole !== "section-chrome",
  );

  const positionBand = (element, members, page, startTop) => {
    const firstTop = Math.min(...members.map((member) => Number(member.top)));
    return {
      ...element,
      page,
      top: startTop + Number(element.top) - firstTop,
    };
  };

  return source.map((element) => {
    if (element.element_id === experienceMembers[0].element_id) {
      return { ...element, page: 1, top: 700 };
    }
    if (experienceMembers.slice(1).some((member) => member.element_id === element.element_id)) {
      return positionBand(element, experienceMembers.slice(1), 2, 66);
    }
    if (educationChrome.some((member) => member.element_id === element.element_id)) {
      return positionBand(element, educationChrome, 1, 730);
    }
    if (educationBody.some((member) => member.element_id === element.element_id)) {
      return positionBand(element, educationBody, 2, 100);
    }
    if (skillsIds.has(element.element_id)) {
      const members = source.filter((member) => skillsIds.has(member.element_id));
      return positionBand(element, members, 2, 190);
    }
    if (languageIds.has(element.element_id)) {
      const members = source.filter((member) => languageIds.has(member.element_id));
      return positionBand(element, members, 2, 250);
    }
    return element;
  });
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

  it("restores the Portico title inside the compressed masthead while the photo stays hidden", () => {
    const source = withIds(porticoTemplate);
    const originalTitle = source.find((element) => element.mastheadRole === "title");
    const photoHidden = hideProfilePhoto(source, "portico").elements;
    assert.equal(
      photoHidden.find((element) => element.mastheadRole === "title").top,
      originalTitle.top - 100,
    );

    const titleHidden = applyTitleToggle(photoHidden, "masthead-main", () => "hidden-id").elements;
    const titleShown = applyTitleToggle(titleHidden, "masthead-main", () => "restored-title").elements;
    assert.equal(
      titleShown.find((element) => element.mastheadRole === "title").top,
      originalTitle.top - 100,
    );

    const photoShown = showProfilePhoto(titleShown, "portico").elements;
    assert.equal(
      photoShown.find((element) => element.mastheadRole === "title").top,
      originalTitle.top,
    );
  });

  it("keeps Portico title restoration correct when the title is hidden before the photo", () => {
    const source = withIds(porticoTemplate);
    const originalTitle = source.find((element) => element.mastheadRole === "title");
    const titleHidden = applyTitleToggle(source, "masthead-main", () => "hidden-id").elements;
    const photoHidden = hideProfilePhoto(titleHidden, "portico").elements;
    const titleShown = applyTitleToggle(photoHidden, "masthead-main", () => "restored-title").elements;
    assert.equal(
      titleShown.find((element) => element.mastheadRole === "title").top,
      originalTitle.top - 100,
    );
  });

  for (const order of ["photo-first", "title-first"]) {
    it(`reflows Portico continuation sections after ${order} masthead toggles`, () => {
      let elements = twoPagePorticoFixture();
      let nextId = 0;
      const createId = () => `generated-${nextId += 1}`;
      assert.equal(contentMaxPage(elements), 2);

      const togglePhoto = () => {
        elements = hideProfilePhoto(elements, "portico").elements;
        elements = reflowPorticoAfterMastheadChange(
          elements, DEFAULT_FLOW_SPACING, createId,
        );
      };
      const toggleTitle = () => {
        elements = applyTitleToggle(elements, "masthead-main", createId).elements;
        elements = reflowPorticoAfterMastheadChange(
          elements, DEFAULT_FLOW_SPACING, createId,
        );
      };

      if (order === "photo-first") {
        togglePhoto();
        toggleTitle();
      } else {
        toggleTitle();
        togglePhoto();
      }

      assert.equal(contentMaxPage(elements), 1);
      assert.ok(elements.every((element) => (element.page ?? 1) === 1));
    });
  }

  it("keeps a split Portico job record ahead of Education after hiding the photo", () => {
    const source = splitExperienceBeforeEducationFixture();
    const experienceTitle = source.find(
      (element) => element.content === "Specjalistka Obsługi Klienta",
    );
    const group = experienceTitle.flowGroup;
    const educationHeading = source.find((element) => element.content === "WYKSZTAŁCENIE");
    let nextId = 0;
    const createId = () => `generated-${nextId += 1}`;

    const hidden = hideProfilePhoto(source, "portico").elements;
    const reflowed = reflowPorticoAfterMastheadChange(
      hidden, DEFAULT_FLOW_SPACING, createId,
    );
    const recordMembers = reflowed.filter((element) => element.flowGroup === group);
    const finalEducationHeading = reflowed.find(
      (element) => element.element_id === educationHeading.element_id,
    );
    const absoluteTop = (element) => ((element.page || 1) - 1) * 842 + element.top;
    const recordBottom = Math.max(...recordMembers.map(
      (element) => absoluteTop(element) + Number(element.height || element.lineHeight || 12),
    ));

    assert.equal(new Set(recordMembers.map((element) => element.page)).size, 1);
    assert.ok(
      recordBottom < absoluteTop(finalEducationHeading),
      "the complete job record must finish before Education chrome begins",
    );
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

  it("reflows Linden's existing contact rail when its rectangular photo is hidden", () => {
    const source = withIds(lindenTemplate);
    const contactLabel = source.find((element) => element.content === "DANE KONTAKTOWE");
    const originalLabelTop = contactLabel.top;
    const hidden = hideProfilePhoto(source, "linden");
    assert.equal(hidden.contactBandId, "linden-contact");
    assert.equal(
      hidden.elements.find((element) => element.element_id === contactLabel.element_id).top,
      38,
    );

    const relaid = applyChannelRelayout(
      hidden.elements,
      hidden.contactBandId,
      (text) => String(text).length * 5,
      () => "unused-id",
    ).elements;
    const aligned = alignSidebarAfterProfileContacts(relaid, hidden.contactBandId, "linden");
    const contactBottom = Math.max(...aligned
      .filter((element) => element.contactBandId === "linden-contact" && element.contactChannel)
      .map((element) => Number(element.top) + Math.max(
        Number(element.height) || 0,
        Number(element.fontSize) || 0,
      )));
    const sidebarTop = Math.min(...aligned
      .filter((element) => element.flowRole === "sidebar-chrome")
      .map((element) => Number(element.top)));
    assert.equal(sidebarTop - contactBottom, 32);

    const restored = showProfilePhoto(aligned, "linden").elements;
    assert.equal(
      restored.find((element) => element.element_id === contactLabel.element_id).top,
      originalLabelTop,
    );
  });

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
