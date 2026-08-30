import assert from "node:assert/strict";
import test from "node:test";
import { slateTemplate } from "../templates/slate.js";
import { applyChannelRelayout } from "./contactBandOps.js";
import { hydratePersistedCanvasElement } from "./persistedCanvasElement.js";
import {
  alignSidebarAfterProfileContacts,
  hideProfilePhoto,
  isProfilePhotoHidden,
  normalizeProfilePhotoVisibilityPersistence,
  showProfilePhoto,
} from "./profilePhotoVisibility.js";
import { applySlatePalette } from "./slateAppearance.js";

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
  "appearanceBaseFontSize", "appearanceBaseLineHeight", "lineHeight", "letterSpacing",
  "bold", "italic", "underline", "runs", "align", "bulletList", "autoHeight",
  "flowRole", "flowLane", "flowGroup", "isDecorativeChromeText",
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
  assert.equal(header.length, 3);
  assert.match(
    header.find((element) => element.category === "image").src,
    /\/slate-copper-accent\/contact\.png$/,
  );
  assert.equal(header.find((element) => element.category === "text").color, "#33251D");
  assert.equal(header.find((element) => element.category === "line").backgroundColor, "#A14F2B");

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
