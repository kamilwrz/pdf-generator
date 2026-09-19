import { inferEditorMode, normalizeEditorMode } from "./editorMode.js";
import { removeLegacyLanguageLevelStyling } from "./languagesLayout.js";
import { preserveSavedTextLayouts } from "./savedTextLayout.js";
import { sanitizeElementsContent } from "./sanitizeTextContent.js";
import { createCanvasTextWidthMeasurer, trimTrailingEmptyTextareaPayload } from "./textareaHeight.js";
import { healDecorativeOrdinalBaselines, healFacetRuleAccents, healSkillChipLabelBaselines, normalizeFilledBandSectionMetadata } from "./sectionStructure.js";
import { nanoid } from "nanoid";
import { normalizeVellumContactLayout } from "./vellumTypographyLayout.js";
import { fitMastheadNames } from "./mastheadNameFit.js";
import { resolveTextareaBrowserLines } from "./browserTextLayout.js";
import { createPersistedDocumentSnapshot, persistedDocumentSignature } from "./persistedDocumentSnapshot.js";

function fitSnapshotNames(elements, snapshot, options = {}) {
  if (!elements.some((element) => element.mastheadRole === "name")) return elements;
  return fitMastheadNames(elements, {
    measureTextWidth: Object.hasOwn(options, "measureTextWidth")
      ? options.measureTextWidth : createCanvasTextWidthMeasurer(),
    measureLines: resolveTextareaBrowserLines,
    pageWidth: snapshot.pageSize?.width ?? 595,
    pageHeight: snapshot.pageSize?.height ?? 842,
    spacing: snapshot.flowSpacing ?? snapshot.spacingPx ?? snapshot.spacing_px ?? undefined,
    createId: nanoid,
    ...options,
  });
}

/**
 * Recognize only automatic name fitting of an exact saved snapshot.
 *
 * A font can finish loading after a synchronous document commit. Recompute
 * that saved graph using the loaded browser metrics and compare every authored
 * field against the live snapshot before accepting a clean-baseline repair.
 * Changed text, formatting, content positions, title, spacing and deletions
 * remain dirty. The only ignored identifiers belong to newly generated fixed
 * continuation chrome; those independent fitting passes allocate fresh IDs
 * for otherwise identical page backgrounds and page numbers.
 */
export function matchesAutomaticNameFitSnapshot(baseline, current, options = {}) {
  if (!baseline?.elements?.some((element) => element.mastheadRole === "name")
    || !current?.elements) return false;
  const elements = fitSnapshotNames(baseline.elements, baseline, options);
  const maxPage = Math.max(1, ...elements.map((element) => Number(element.page) || 1));
  const repaginated = elements !== baseline.elements && elements.some((element) => element.nameFit?.repaginate);
  const expected = {
    ...baseline,
    elements,
    pageCount: repaginated ? maxPage : Math.max(baseline.pageCount || 1, maxPage),
  };
  const savedIds = new Set(baseline.elements.map((element) => element.element_id));
  const comparable = (snapshot) => {
    const persisted = createPersistedDocumentSnapshot(snapshot);
    return {
      ...persisted,
      elements: persisted.elements.map((element) => {
        if (!element.fixedToPage || savedIds.has(element.element_id)) return element;
        const { element_id: _generatedId, ...rest } = element;
        return rest;
      }),
    };
  };
  return persistedDocumentSignature(comparable(expected)) === persistedDocumentSignature(comparable(current));
}

/** Apply existing load repairs before both the live graph and clean baseline. */
function normalizeLoadedElements(elements) {
  const cleaned = sanitizeElementsContent(elements).map((element) => {
    if (element.category !== "textarea" || element.content == null) return element;
    const trimmed = trimTrailingEmptyTextareaPayload(element.content, element.runs, { bulletList: !!element.bulletList });
    return trimmed.content === element.content ? element : { ...element, ...trimmed };
  });
  const repaired = normalizeVellumContactLayout(
    healFacetRuleAccents(healSkillChipLabelBaselines(healDecorativeOrdinalBaselines(normalizeFilledBandSectionMetadata(cleaned)))), nanoid,
  );
  return repaired.every((element, index) => element === elements[index]) ? elements : repaired;
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

/**
 * Normalize every field owned by a complete editor-document replacement.
 *
 * Callers may provide API snake_case or editor camelCase metadata. Missing
 * values never inherit from the previous document: this prevents profile,
 * import, template, id, and server-revision state from leaking across A→B.
 *
 * @param {Record<string, unknown>} input Raw saved, guest, template, or AI data.
 * @param {{preserveSavedLayout?: boolean, nameFitOptions?: object}} options - Disable saved-geometry
 * protection for regenerated content that retains an existing document ID.
 * @returns {{
 *   elements: Array,
 *   deletedElements: Array,
 *   title: string,
 *   pageCount: number,
 *   currentPage: number,
 *   templateId: string|null,
 *   editorMode: string,
 *   flowSpacing: unknown,
 *   cvData: unknown,
 *   sourceImportId: number|null,
 *   pdfId: number|null,
 *   serverRevision: number|null,
 *   isDemoContent: boolean,
 * }} Canonical snapshot ready for one synchronous React commit.
 */
export function normalizeCommittedDocumentSnapshot(input = {}, { preserveSavedLayout = true, nameFitOptions = {} } = {}) {
  const repaired = removeLegacyLanguageLevelStyling(
    normalizeLoadedElements(Array.isArray(input.elements) ? input.elements : []),
  );
  // Fit before computing page count, saved textarea protection and the dirty
  // baseline. The live state and the clean snapshot must start from one graph.
  const elements = fitSnapshotNames(repaired, input, nameFitOptions);
  const deletedElements = Array.isArray(input.deletedElements)
    ? input.deletedElements
    : (Array.isArray(input.deletedIds) ? input.deletedIds : []);
  const templateId = input.templateId ?? input.template_id ?? null;
  const requestedPages = positiveInteger(input.pageCount ?? input.pages) ?? 1;
  const elementPages = elements.reduce(
    (maximum, element) => Math.max(maximum, positiveInteger(element?.page) ?? 1),
    1,
  );
  const pageCount = elements !== repaired && elements.some((element) => element.nameFit?.repaginate)
    ? elementPages : Math.max(requestedPages, elementPages);
  const requestedCurrentPage = positiveInteger(input.currentPage) ?? 1;
  const savedMode = input.editorMode ?? input.editor_mode;
  const editorMode = savedMode
    ? normalizeEditorMode(savedMode)
    : inferEditorMode(elements, templateId);
  const rawRevision = input.serverRevision ?? input.revision;
  const sourceImportId = input.sourceImportId ?? input.source_import_id ?? null;
  const pdfId = input.pdfId ?? input.pdf_id ?? null;

  return {
    // A template switch keeps the saved document ID but replaces its layout.
    // Only actual saved geometry may skip the font-ready measurement pass.
    elements: positiveInteger(pdfId) && preserveSavedLayout ? preserveSavedTextLayouts(elements) : elements,
    deletedElements,
    title: String(input.title ?? "").replace(/\.pdf$/i, ""),
    pageCount,
    currentPage: Math.min(requestedCurrentPage, pageCount),
    templateId,
    editorMode,
    flowSpacing: input.flowSpacing ?? input.spacingPx ?? input.spacing_px ?? null,
    cvData: input.cvData ?? input.cv_data ?? null,
    sourceImportId: positiveInteger(sourceImportId),
    pdfId: positiveInteger(pdfId),
    serverRevision: positiveInteger(rawRevision),
    isDemoContent: input.isDemoContent === true,
  };
}
