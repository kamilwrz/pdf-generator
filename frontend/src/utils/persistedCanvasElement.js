/**
 * Hydration for rows returned by the saved-document API.
 *
 * The database keeps common geometry in columns and evolving editor metadata
 * in `extra_properties`. Every category must receive the same semantic layer:
 * a zero-size text anchor can own the contact descriptor just as an image can
 * own a photo placeholder. Category-specific mapping previously dropped those
 * fields from text and textarea rows, which made a hidden Slate document lose
 * its exact show-photo restoration contract after reopening.
 */
import { sanitizeTextContent } from "./sanitizeTextContent.js";

function hydratedDimension(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : value;
}

/**
 * Rebuild one flat canvas element from an API row.
 *
 * This is the client-side inverse of the `extra_properties` packing performed
 * by `backend/app/crud/pdfs.py`. The function is intentionally pure so saved
 * document migrations can be regression-tested without mounting the modal.
 *
 * @param {object} element - Persisted API row with optional extra_properties.
 * @returns {object} Renderer-ready canvas element.
 */
export function hydratePersistedCanvasElement(element = {}) {
  const extra = element.extra_properties || {};
  const fixedToPage = extra.fixedToPage ?? false;
  const common = {
    ...element,
    // `element.id` is the numeric PdfElements primary key. Canvas `id` is a
    // semantic template key and lives only in extra_properties.
    id: extra.id,
    zIndex: extra.zIndex,
    // Selection and drag state are session-only. Persisted truthy values can
    // be left behind when autosave runs during an interaction, but reopening a
    // document must never render a stale selection overlay or moving guides.
    isSelected: false,
    isMove: false,
    contactChannel: extra.contactChannel,
    contactBandId: extra.contactBandId,
    contactBand: extra.contactBand,
    textTransform: extra.textTransform,
    mastheadRole: extra.mastheadRole,
    mastheadBandId: extra.mastheadBandId,
    mastheadIdentity: extra.mastheadIdentity,
    appearanceTemplateId: extra.appearanceTemplateId,
    appearanceSettings: extra.appearanceSettings,
    appearanceTypographyRole: extra.appearanceTypographyRole,
    appearanceBaseFontSize: extra.appearanceBaseFontSize,
    appearanceBaseLineHeight: extra.appearanceBaseLineHeight,
    placeholder: extra.placeholder,
    starterPlaceholder: extra.starterPlaceholder ?? false,
    starterSectionKey: extra.starterSectionKey,
    cvDataBindings: extra.cvDataBindings,
    flowRole: extra.flowRole,
    flowLane: extra.flowLane,
    flowGroup: extra.flowGroup,
    editorAddedSection: extra.editorAddedSection ?? false,
    editorSectionId: extra.editorSectionId,
    editorSectionLayout: extra.editorSectionLayout,
    editorGridColumns: extra.editorGridColumns,
    editorGridRecordWidth: extra.editorGridRecordWidth,
    editorGridBodyLeft: extra.editorGridBodyLeft,
    editorGridEntry: extra.editorGridEntry ?? false,
    editorAddedGridEntry: extra.editorAddedGridEntry ?? false,
    gridSectionId: extra.gridSectionId,
    gridColumns: extra.gridColumns,
    gridGutter: extra.gridGutter,
    gridWidth: extra.gridWidth,
    gridLeft: extra.gridLeft,
    gridKind: extra.gridKind,
    isDecorativeChromeText: extra.isDecorativeChromeText ?? false,
    preserveInitialLayout: extra.preserveInitialLayout ?? false,
    alignWithText: extra.alignWithText,
    photoSlot: extra.photoSlot,
    photoSlotHidden: extra.photoSlotHidden ?? false,
    photoPlaceholder: extra.photoPlaceholder,
    profilePhotoMainContactBand: extra.profilePhotoMainContactBand,
    profilePhotoMainMastheadIdentity: extra.profilePhotoMainMastheadIdentity,
    photoLayoutHome: extra.photoLayoutHome,
    photoShape: extra.photoShape,
    objectFit: extra.objectFit,
    fixedToPage,
    repeatOnContinuation: extra.repeatOnContinuation ?? true,
    locked: extra.locked ?? fixedToPage,
    borderWidth: extra.borderWidth,
    borderRadius: extra.borderRadius,
    filled: extra.filled ?? false,
    shape: extra.shape,
    points: extra.points,
    pathKind: extra.pathKind,
    curves: extra.curves,
    source_id: extra.source_id,
    target_id: extra.target_id,
    arrow: extra.arrow ?? false,
    width: hydratedDimension(element.width),
    height: hydratedDimension(element.height),
  };

  if (element.category !== "text" && element.category !== "textarea") {
    return common;
  }

  return {
    ...common,
    content: sanitizeTextContent(element.content),
    lineHeight: extra.lineHeight,
    letterSpacing: extra.letterSpacing,
    bold: extra.bold ?? false,
    italic: extra.italic ?? false,
    underline: extra.underline ?? false,
    runs: extra.runs ?? null,
    align: extra.align ?? "left",
    bulletList: extra.bulletList ?? false,
    autoHeight: extra.autoHeight ?? false,
    // Editing state is as volatile as selection and is reset for both text
    // categories before the restored document enters the canvas.
    isEditing: false,
  };
}
