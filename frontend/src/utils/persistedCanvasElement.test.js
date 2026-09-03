import assert from "node:assert/strict";
import test from "node:test";
import { lindenTemplate } from "../templates/linden.js";
import { slateTemplate } from "../templates/slate.js";
import { applyChannelRelayout } from "./contactBandOps.js";
import { hydratePersistedCanvasElement } from "./persistedCanvasElement.js";
import {
  insertGridSectionEntry,
  listGridSectionEntryAnchors,
  removeGridSectionEntry,
} from "./gridSection.js";
import {
  alignSidebarAfterProfileContacts,
  hideProfilePhoto,
  isProfilePhotoHidden,
  normalizeProfilePhotoVisibilityPersistence,
  showProfilePhoto,
} from "./profilePhotoVisibility.js";
import { applySlatePalette } from "./slateAppearance.js";
import { listDocumentSections, listSidebarSections } from "./sectionStructure.js";

const COLUMN_KEYS = [
  "element_id", "category", "page", "left", "top", "width", "height",
  "content", "fontFamily", "fontSize", "color", "src", "backgroundColor", "img_id",
];

// Mirrors the flexible editor metadata packed by backend/app/crud/pdfs.py.
// Keeping the fixture at the persistence boundary catches category-specific
// hydration regressions that pure in-memory hide/show tests cannot observe.
const EXTRA_KEYS = [
  "zIndex", "isSelected", "isMove", "contactChannel", "contactBandId", "contactBand",
  "textTransform", "mastheadRole", "mastheadBandId", "mastheadIdentity",
  "appearanceTemplateId", "appearanceSettings", "appearanceTypographyRole",
  "appearanceBaseFontSize", "appearanceBaseLineHeight", "placeholder", "starterPlaceholder",
  "starterSectionKey", "cvDataBindings", "lineHeight", "letterSpacing",
  "bold", "italic", "underline", "runs", "align", "bulletList", "autoHeight",
  "flowRole", "flowLane", "flowGroup", "isDecorativeChromeText",
  "editorAddedSection", "editorSectionId", "editorSectionLayout", "editorSectionType",
  "editorGridColumns", "editorGridRecordWidth", "editorGridBodyLeft",
  "editorGridEntry", "editorAddedGridEntry", "gridSectionId", "gridColumns",
  "gridGutter", "gridWidth", "gridLeft", "gridKind",
  "preserveInitialLayout", "alignWithText", "id", "photoSlot", "photoSlotHidden",
  "photoPlaceholder", "profilePhotoMainContactBand", "profilePhotoMainMastheadIdentity",
  "photoLayoutHome", "photoShape", "objectFit", "fixedToPage", "repeatOnContinuation",
  "locked", "borderWidth", "borderRadius", "filled", "shape", "points", "pathKind",
  "curves", "source_id", "target_id", "arrow",
];

function withIds(elements) {
  return elements.map((element, index) => ({
    ...element,
    element_id: element.element_id || `persisted-element-${index}`,
  }));
}

function persistedRow(element, index) {
  const row = { id: index + 1, extra_properties: {} };
  COLUMN_KEYS.forEach((key) => {
    row[key] = element[key];
  });
  EXTRA_KEYS.forEach((key) => {
    row.extra_properties[key] = element[key];
  });
  // HTTP JSON drops undefined fields and preserves explicit false/null values.
  return JSON.parse(JSON.stringify(row));
}

function relayout(elements, bandId) {
  const relaid = applyChannelRelayout(
    elements,
    bandId,
    (value) => String(value || "").length * 5,
    (part) => `persisted-contact-${part}`,
  ).elements;
  return alignSidebarAfterProfileContacts(relaid, bandId, "slate");
}

function geometry(elements, predicate) {
  return elements
    .filter(predicate)
    .map((element) => [element.element_id, element.left, element.top, element.page]);
}

test("hydration resets volatile editor state and applies legacy text defaults", () => {
  const hydrated = hydratePersistedCanvasElement({
    id: 42,
    category: "text",
    content: "Contact",
    width: "120.5",
    height: "16",
    extra_properties: {
      id: "contact-anchor",
      isSelected: true,
      isMove: true,
    },
  });

  assert.equal(hydrated.id, "contact-anchor");
  assert.equal(hydrated.isSelected, false);
  assert.equal(hydrated.isMove, false);
  assert.equal(hydrated.isEditing, false);
  assert.equal(hydrated.bold, false);
  assert.equal(hydrated.italic, false);
  assert.equal(hydrated.underline, false);
  assert.equal(hydrated.align, "left");
  assert.equal(hydrated.width, 120.5);
  assert.equal(hydrated.height, 16);
});

test("saved custom grid keeps add/delete semantics and fixed geometry after reopening", () => {
  const source = [
    {
      element_id: "grid-heading",
      category: "text",
      content: "JĘZYKI OBCE",
      page: 1,
      left: 84,
      top: 100,
      width: 400,
      height: 14,
      fontSize: 10,
      flowRole: "section-chrome",
      editorAddedSection: true,
      editorSectionId: "grid-heading",
      editorSectionLayout: "grid",
      editorSectionType: "languages",
      editorGridColumns: 4,
      editorGridRecordWidth: 400,
      editorGridBodyLeft: 84,
    },
    {
      element_id: "grid-rule",
      category: "line",
      page: 1,
      left: 84,
      top: 116,
      width: 400,
      height: 1,
      flowRole: "section-chrome",
    },
    {
      element_id: "grid-cell",
      category: "textarea",
      content: "Polski — C2",
      placeholder: "Język · Poziom",
      starterPlaceholder: true,
      page: 1,
      left: 84,
      top: 128,
      width: 92,
      height: 19,
      fontSize: 9,
      lineHeight: 13,
      color: "#242424",
      autoHeight: true,
      flowRole: "grid-member",
      flowGroup: "grid-row-1",
      editorAddedSection: true,
      editorSectionId: "grid-heading",
      editorGridEntry: true,
      gridSectionId: "grid-heading",
    },
  ];
  const reopened = source
    .map(persistedRow)
    .map(hydratePersistedCanvasElement);

  assert.equal(reopened[0].editorSectionType, "languages");
  assert.equal(reopened[2].placeholder, "Język · Poziom");
  assert.equal(reopened[2].starterPlaceholder, true);

  const [anchor] = listGridSectionEntryAnchors(reopened);
  assert.equal(anchor.elementId, "grid-cell");
  assert.equal(anchor.columns, 4);
  assert.equal(anchor.canDelete, false);

  const inserted = insertGridSectionEntry(reopened, "grid-cell", 842, {
    idFactory: () => "grid-cell-2",
  });
  assert.ok(inserted);
  assert.equal(inserted.elements.find((element) => element.element_id === "grid-cell-2").left, 184);

  const removableAnchor = listGridSectionEntryAnchors(inserted.elements)
    .find((entry) => entry.elementId === "grid-cell-2");
  assert.equal(removableAnchor.canDelete, true);
  const removed = removeGridSectionEntry(inserted.elements, "grid-cell");
  assert.ok(removed);
  assert.equal(removed.elements.some((element) => element.element_id === "grid-cell"), false);
  assert.equal(
    removed.elements.find((element) => element.element_id === "grid-cell-2").left,
    84,
  );
});

test("saved Linden keeps Languages in the sidebar structure after reopening", () => {
  const reopened = withIds(lindenTemplate)
    .map(persistedRow)
    .map(hydratePersistedCanvasElement);
  const sidebarTitles = listSidebarSections(reopened).map((section) => section.title);
  const mainTitles = listDocumentSections(reopened).map((section) => section.title);

  assert.ok(sidebarTitles.includes("JĘZYKI"));
  assert.equal(mainTitles.includes("JĘZYKI"), false);
  const languageHeading = reopened.find((element) => element.content === "JĘZYKI");
  assert.equal(languageHeading.flowLane, "sidebar");
  assert.equal(languageHeading.flowRole, "sidebar-chrome");
});

test("saved hidden Linden restores sidebar sections added before reopening", () => {
  const source = withIds(lindenTemplate);
  const hiddenResult = hideProfilePhoto(source, "linden");
  const relaid = applyChannelRelayout(
    hiddenResult.elements,
    hiddenResult.contactBandId,
    (value) => String(value || "").length * 5,
    (part) => `persisted-linden-${part}`,
  ).elements;
  const hidden = alignSidebarAfterProfileContacts(
    relaid,
    hiddenResult.contactBandId,
    "linden",
  );
  const anchor = hidden.find((element) => (
    element.flowRole === "masthead-anchor"
    && element.contactBandId === hiddenResult.contactBandId
  ));
  const sidebarShift = Number(anchor.photoLayoutHome?.sidebarShift);
  assert.ok(Number.isFinite(sidebarShift) && Math.abs(sidebarShift) > 0);

  const addedTop = 730;
  const saved = [
    ...hidden,
    {
      element_id: "saved-hidden-linden-section",
      category: "text",
      content: "CERTYFIKATY",
      page: 1,
      left: 34,
      top: addedTop,
      width: 120,
      height: 12,
      flowRole: "sidebar-chrome",
      flowLane: "sidebar",
    },
  ]
    .map(persistedRow)
    .map(hydratePersistedCanvasElement);

  const shown = showProfilePhoto(saved, "linden").elements;
  const restored = shown.find((element) => (
    element.element_id === "saved-hidden-linden-section"
  ));
  assert.equal(restored.top, addedTop - sidebarShift);
  assert.equal(restored.photoLayoutHome, undefined);
  assert.ok(listSidebarSections(shown).some((section) => section.title === "JĘZYKI"));
});

test("saved hidden Slate hydrates every semantic field and restores exact geometry", () => {
  const source = applySlatePalette(withIds(slateTemplate), "copper");
  const hiddenResult = hideProfilePhoto(source, "slate", (part) => `hidden-${part}`);
  const hidden = relayout(hiddenResult.elements, hiddenResult.contactBandId);

  // Simulate a document saved before the photo-less heading existed. The
  // persisted palette and restoration descriptors must be enough to rebuild
  // copper chrome and later return to the authored visible-photo composition.
  const legacyRows = hidden
    .filter((element) => element.flowRole !== "photo-contact-header")
    .map(persistedRow);
  const hydrated = legacyRows.map(hydratePersistedCanvasElement);
  const hydratedAnchor = hydrated.find((element) => element.contactBand?.id === "contact-main");
  const hydratedSidebarBody = hydrated.find((element) => (
    element.category === "textarea" && element.photoLayoutHome
  ));

  assert.equal(hydratedAnchor.category, "text");
  assert.equal(hydratedAnchor.contactBand.icon.theme, "slate-copper-accent");
  assert.equal(hydratedAnchor.profilePhotoMainContactBand.icon.theme, "slate-copper-accent");
  assert.ok(hydratedSidebarBody);
  assert.ok(hydrated.some((element) => element.category === "text" && element.contactChannel));
  assert.ok(hydrated.some((element) => element.category === "image" && element.contactChannel));

  const normalized = normalizeProfilePhotoVisibilityPersistence(hydrated, "slate");
  const header = normalized.filter((element) => element.flowRole === "photo-contact-header");
  assert.equal(header.length, 4);
  assert.match(
    header.find((element) => element.category === "image").src,
    /\/slate\/contact\.png$/,
  );
  assert.equal(header.find((element) => element.category === "text").color, "#33251D");
  assert.equal(
    header.find((element) => element.element_id === "slate-contact-header-badge").backgroundColor,
    "#A14F2B",
  );
  assert.equal(
    header.find((element) => element.element_id === "slate-contact-header-rule").backgroundColor,
    "#A14F2B",
  );

  const shownResult = showProfilePhoto(normalized, "slate");
  const shown = relayout(shownResult.elements, shownResult.contactBandId);
  assert.equal(isProfilePhotoHidden(shown), false);
  assert.equal(shown.some((element) => element.flowRole === "photo-contact-header"), false);
  assert.deepEqual(
    geometry(shown, (element) => Boolean(element.contactChannel)),
    geometry(source, (element) => Boolean(element.contactChannel)),
  );
  assert.deepEqual(
    geometry(shown, (element) => element.flowRole === "sidebar-chrome"),
    geometry(source, (element) => element.flowRole === "sidebar-chrome"),
  );
  assert.equal(
    shown.find((element) => element.contactBand?.id === "contact-main").contactBand.icon.theme,
    "slate-copper-accent",
  );
});
