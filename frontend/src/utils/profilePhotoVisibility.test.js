import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { atriumTemplate } from "../templates/atrium.js";
import { monumentTemplate } from "../templates/monument.js";
import { slateTemplate } from "../templates/slate.js";
import { lindenTemplate } from "../templates/linden.js";
import { vellumTemplate } from "../templates/vellum.js";
import { applyChannelRelayout } from "./contactBandOps.js";
import { transferSectionLane } from "./transferSectionLane.js";
import { listSidebarSections } from "./sectionStructure.js";
import {
  alignSidebarAfterProfileContacts,
  hideProfilePhoto,
  isProfilePhotoHidden,
  normalizeProfilePhotoVisibilityPersistence,
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
  it("keeps a section transferred out of hidden Slate contacts intact across photo toggles", () => {
    const source = withIds(slateTemplate);
    const hiddenResult = hideProfilePhoto(source, "slate");
    const relayout = (elements) => alignSidebarAfterProfileContacts(
      applyChannelRelayout(elements, hiddenResult.contactBandId,
        (text) => String(text).length * 5, () => "unused-id").elements,
      hiddenResult.contactBandId, "slate",
    );
    const hidden = relayout(hiddenResult.elements);
    const skills = listSidebarSections(hidden).find((section) => /UMIEJ/.test(section.title));
    assert.ok(skills);
    assert.ok(hidden.find((element) => element.element_id === skills.headingId).photoLayoutHome);
    const moved = transferSectionLane(hidden, skills.headingId);
    assert.ok(moved);
    const mainGeometry = (elements) => elements
      .filter((element) => !element.fixedToPage && !element.contactBandId && Number(element.left) >= 210)
      .map((element) => [element.element_id, element.top, element.page]);
    const expected = mainGeometry(moved);
    assert.equal(moved.find((element) => element.element_id === skills.headingId).photoLayoutHome, undefined);
    const shown = showProfilePhoto(moved, "slate").elements;
    assert.deepEqual(mainGeometry(shown), expected);
    const hiddenAgain = relayout(hideProfilePhoto(shown, "slate").elements);
    assert.deepEqual(mainGeometry(hiddenAgain), expected);

    // Already-saved transfers can retain the old snapshot. Restoring a photo
    // must discard it without overwriting the current main-column position.
    const legacy = moved.map((element) => element.element_id === skills.headingId
      ? { ...element, photoLayoutHome: { top: 700 } } : element);
    assert.deepEqual(mainGeometry(showProfilePhoto(legacy, "slate").elements), expected);
  });

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

  it("hides Vellum's circular photo cluster without moving the document flow", () => {
    const source = withIds(vellumTemplate);
    const flowGeometry = source
      .filter((element) => !element.photoSlot)
      .map((element) => [element.element_id, element.page, element.top]);
    const hidden = hideProfilePhoto(source, "vellum").elements;
    const hiddenCluster = hidden.filter((element) => element.photoSlot);
    assert.ok(hiddenCluster.length >= 3);
    assert.ok(hiddenCluster.every((element) => element.photoSlotHidden === true));
    assert.deepEqual(
      hidden.filter((element) => !element.photoSlot)
        .map((element) => [element.element_id, element.page, element.top]),
      flowGeometry,
    );

    const restored = showProfilePhoto(hidden, "vellum").elements;
    assert.ok(
      restored.filter((element) => element.photoSlot)
        .every((element) => element.photoSlotHidden === false),
    );
  });

  for (const [templateId, template] of [["slate", slateTemplate]]) {
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
      assert.deepEqual(hiddenAnchor.contactBand.anchor, { startX: 33, startY: 84, rightLimit: 174 });
      const contactHeader = hiddenResult.elements.filter(
        (element) => element.flowRole === "photo-contact-header",
      );
      assert.equal(contactHeader.length, 4);
      const contactHeaderBadge = contactHeader.find(
        (element) => element.element_id === "slate-contact-header-badge",
      );
      const contactHeaderIcon = contactHeader.find((element) => element.category === "image");
      const contactHeaderLabel = contactHeader.find((element) => element.category === "text");
      const contactHeaderRule = contactHeader.find(
        (element) => element.element_id === "slate-contact-header-rule",
      );
      assert.ok(contactHeader.every((element) => (
        element.fixedToPage === true
        && element.locked === true
        && element.repeatOnContinuation === false
        && element.flowLane === "sidebar"
        && !element.photoSlot
        && !element.contactChannel
      )));
      assert.deepEqual(
        [contactHeaderBadge.left, contactHeaderBadge.top, contactHeaderBadge.width, contactHeaderBadge.height],
        [25, 60, 16, 16],
      );
      assert.equal(contactHeaderBadge.backgroundColor, "#3E5C76");
      assert.equal(
        contactHeaderBadge.top,
        source.find((element) => element.mastheadRole === "name").top,
      );
      assert.match(contactHeaderIcon.src, /\/slate\/contact\.png$/);
      assert.deepEqual(
        [contactHeaderIcon.left, contactHeaderIcon.top, contactHeaderIcon.width, contactHeaderIcon.height],
        [27, 62, 12, 12],
      );
      assert.equal(contactHeaderLabel.content, "DANE KONTAKTOWE");
      assert.deepEqual([contactHeaderLabel.left, contactHeaderLabel.top], [49, 63]);
      assert.equal(contactHeaderRule.backgroundColor, "#3E5C76");
      assert.deepEqual([contactHeaderRule.left, contactHeaderRule.top, contactHeaderRule.width], [49, 76, 46]);
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
      const hiddenContactTop = Math.min(...aligned
        .filter((element) => element.contactBandId === "contact-main" && element.contactChannel)
        .map((element) => Number(element.top)));
      assert.equal(hiddenContactTop, 84);
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
      assert.ok(hiddenSidebarTop > originalSidebarTop);
      assert.equal(hiddenSidebarTop - contactBottom, 40);
      const shownResult = showProfilePhoto(aligned, templateId);
      const shownRelaid = applyChannelRelayout(
        shownResult.elements,
        shownResult.contactBandId,
        (text) => String(text).length * 5,
        () => "unused-id",
      ).elements;
      const shown = alignSidebarAfterProfileContacts(
        shownRelaid, shownResult.contactBandId, templateId,
      );
      const shownAnchor = shown.find((element) => element.element_id === originalAnchor.element_id);
      assert.deepEqual(shownAnchor.contactBand, originalAnchor.contactBand);
      assert.equal(
        shown.some((element) => element.flowRole === "photo-contact-header"),
        false,
      );
      const shownSidebarTop = Math.min(...shown
        .filter((element) => element.flowRole === "sidebar-chrome")
        .map((element) => Number(element.top)));
      assert.equal(shownSidebarTop, originalSidebarTop);
      const originalContactGeometry = source
        .filter((element) => element.contactChannel)
        .map((element) => [element.element_id, element.left, element.top, element.page]);
      const shownContactGeometry = shown
        .filter((element) => element.contactChannel)
        .map((element) => [element.element_id, element.left, element.top, element.page]);
      assert.deepEqual(shownContactGeometry, originalContactGeometry);
      assert.deepEqual(
        shown.map((element) => [
          element.element_id,
          element.left,
          element.top,
          element.width,
          element.height,
          element.page,
        ]),
        source.map((element) => [
          element.element_id,
          element.left,
          element.top,
          element.width,
          element.height,
          element.page,
        ]),
      );
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

  it("keeps Linden's latest visible-contact layout across a later hide/show cycle", () => {
    const source = withIds(lindenTemplate).filter((element) => (
      !["github", "website"].includes(element.contactChannel)
    ));
    const relaidVisible = applyChannelRelayout(
      source,
      "linden-contact",
      (text) => String(text).length * 5,
      () => "unused-id",
    ).elements;
    const visible = alignSidebarAfterProfileContacts(
      relaidVisible,
      "linden-contact",
      "linden",
    );
    const visibleSidebarGeometry = visible
      .filter((element) => (
        (element.flowLane === "sidebar" || element.flowRole === "sidebar-chrome")
        && !element.fixedToPage
        && !element.contactChannel
      ))
      .map((element) => [element.element_id, element.top]);

    const hiddenResult = hideProfilePhoto(visible, "linden");
    const hiddenRelaid = applyChannelRelayout(
      hiddenResult.elements,
      hiddenResult.contactBandId,
      (text) => String(text).length * 5,
      () => "unused-id",
    ).elements;
    const hidden = alignSidebarAfterProfileContacts(
      hiddenRelaid,
      hiddenResult.contactBandId,
      "linden",
    );
    const shownResult = showProfilePhoto(hidden, "linden");
    const shownRelaid = applyChannelRelayout(
      shownResult.elements,
      shownResult.contactBandId,
      (text) => String(text).length * 5,
      () => "unused-id",
    ).elements;
    const shown = alignSidebarAfterProfileContacts(
      shownRelaid,
      shownResult.contactBandId,
      "linden",
    );
    const shownSidebarGeometry = shown
      .filter((element) => (
        (element.flowLane === "sidebar" || element.flowRole === "sidebar-chrome")
        && !element.fixedToPage
        && !element.contactChannel
      ))
      .map((element) => [element.element_id, element.top]);

    assert.deepEqual(shownSidebarGeometry, visibleSidebarGeometry);
  });

  it("does not move a main-column Languages heading with a stale sidebar marker when Linden's photo returns", () => {
    const source = withIds(lindenTemplate);
    const hiddenResult = hideProfilePhoto(source, "linden");
    const relaid = applyChannelRelayout(
      hiddenResult.elements,
      hiddenResult.contactBandId,
      (text) => String(text).length * 5,
      () => "unused-id",
    ).elements;
    const hidden = alignSidebarAfterProfileContacts(
      relaid,
      hiddenResult.contactBandId,
      "linden",
    );
    const mainLanguages = [
      {
        element_id: "main-languages-heading",
        category: "text",
        content: "JĘZYKI",
        flowRole: "section-chrome",
        // Older transferred sections can retain this stale lane marker even
        // though their rendered geometry already belongs to the main column.
        flowLane: "sidebar",
        page: 1,
        left: 245,
        top: 610,
        fontSize: 10.2,
      },
      {
        element_id: "main-languages-rule",
        category: "line",
        flowRole: "section-chrome",
        page: 1,
        left: 245,
        top: 628.6,
        width: 300,
        height: 1,
      },
      {
        element_id: "main-languages-entry",
        category: "textarea",
        content: "Język — poziom",
        flowRole: "grid-member",
        page: 1,
        left: 245,
        top: 637,
        width: 142,
        height: 12,
      },
    ];

    const shown = showProfilePhoto([...hidden, ...mainLanguages], "linden").elements;
    for (const expected of mainLanguages) {
      const actual = shown.find((element) => element.element_id === expected.element_id);
      assert.equal(actual.top, expected.top);
    }
    assert.equal(
      shown.find((element) => element.element_id === "main-languages-heading").content,
      "JĘZYKI",
    );
  });

  for (const [templateId, template] of [["slate", slateTemplate], ["linden", lindenTemplate]]) {
    it(`restores ${templateId}'s complete live sidebar after a section is added while the photo is hidden`, () => {
      const source = withIds(template);
      const hiddenResult = hideProfilePhoto(source, templateId);
      const relaid = applyChannelRelayout(
        hiddenResult.elements,
        hiddenResult.contactBandId,
        (text) => String(text).length * 5,
        () => "unused-id",
      ).elements;
      const hidden = alignSidebarAfterProfileContacts(
        relaid,
        hiddenResult.contactBandId,
        templateId,
      );
      const hiddenAnchor = hidden.find((element) => element.contactBandId === hiddenResult.contactBandId
        && element.flowRole === "masthead-anchor");
      const shift = Number(hiddenAnchor.photoLayoutHome?.sidebarShift);
      assert.ok(Number.isFinite(shift) && Math.abs(shift) > 0);

      const currentSidebarBottom = Math.max(...hidden
        .filter((element) => (
          (element.flowLane === "sidebar" || element.flowRole === "sidebar-chrome")
          && !element.fixedToPage
          && !element.contactChannel
          && (Number(element.page) || 1) === 1
        ))
        .map((element) => Number(element.top) + (Number(element.height) || 0)));
      const added = [
        ...hidden,
        {
          element_id: `${templateId}-added-heading`,
          category: "text",
          content: "NOWA SEKCJA",
          flowRole: "sidebar-chrome",
          flowLane: "sidebar",
          page: 1,
          left: 34,
          top: currentSidebarBottom + 24,
          fontSize: 9,
        },
        {
          element_id: `${templateId}-added-body`,
          category: "textarea",
          content: "Nowy wpis",
          flowRole: "content",
          flowLane: "sidebar",
          page: 1,
          left: 34,
          top: currentSidebarBottom + 44,
          width: 120,
          height: 14,
          fontSize: 8,
        },
      ];
      const hiddenGeometry = new Map(added
        .filter((element) => (
          (element.flowLane === "sidebar" || element.flowRole === "sidebar-chrome")
          && !element.fixedToPage
          && !element.contactChannel
          && (Number(element.page) || 1) === 1
        ))
        .map((element) => [element.element_id, Number(element.top)]));

      const shown = showProfilePhoto(added, templateId).elements;
      for (const [elementId, hiddenTop] of hiddenGeometry) {
        const restored = shown.find((element) => element.element_id === elementId);
        assert.equal(restored.top, hiddenTop - shift);
        assert.equal(restored.photoLayoutHome, undefined);
      }
      assert.ok(
        shown.find((element) => element.element_id === `${templateId}-added-heading`).top
        < shown.find((element) => element.element_id === `${templateId}-added-body`).top,
      );
    });
  }

  it("hides legacy Slate photo chrome that predates ornament tags", () => {
    const legacy = withIds(slateTemplate).map((element) => {
      if (element.photoSlot !== "ornament") return element;
      const { photoSlot: _photoSlot, ...withoutTag } = element;
      return withoutTag;
    });
    const hidden = hideProfilePhoto(legacy, "slate").elements;
    const legacyCluster = hidden.filter((element) => (
      element.fixedToPage
      && element.flowLane === "sidebar"
      && element.flowRole === "content"
      && Number(element.left) < 180
      && Number(element.top) < 180
    ));
    assert.ok(legacyCluster.every((element) => element.photoSlotHidden === true));
  });

  it("hydrates a legacy photo-less Slate heading once without moving contacts", () => {
    const source = withIds(slateTemplate);
    const hidden = hideProfilePhoto(source, "slate").elements;
    const legacyHidden = hidden.filter(
      (element) => element.flowRole !== "photo-contact-header",
    );
    const contactGeometry = legacyHidden
      .filter((element) => element.contactChannel)
      .map((element) => [element.element_id, element.left, element.top, element.page]);

    const normalized = normalizeProfilePhotoVisibilityPersistence(
      legacyHidden,
      "slate",
      (part) => `persisted-${part}`,
    );
    assert.equal(
      normalized.filter((element) => element.flowRole === "photo-contact-header").length,
      4,
    );
    assert.deepEqual(
      normalized
        .filter((element) => element.contactChannel)
        .map((element) => [element.element_id, element.left, element.top, element.page]),
      contactGeometry,
    );
    assert.equal(
      normalizeProfilePhotoVisibilityPersistence(normalized, "slate"),
      normalized,
    );
  });

  it("brings every hidden-photo contact onto page one before measuring the sidebar gap", () => {
    const source = withIds(slateTemplate).map((element) => (
      ["github", "website"].includes(element.contactChannel)
        ? { ...element, page: 2 }
        : element
    ));
    const hidden = hideProfilePhoto(source, "slate");
    const contacts = hidden.elements.filter((element) => element.contactChannel);
    assert.ok(contacts.every((element) => element.page === 1));

    const relaid = applyChannelRelayout(
      hidden.elements,
      hidden.contactBandId,
      (text) => String(text).length * 5,
      () => "unused-id",
    ).elements;
    const aligned = alignSidebarAfterProfileContacts(
      relaid, hidden.contactBandId, "slate",
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
    assert.equal(slot.repeatOnContinuation, false);
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
