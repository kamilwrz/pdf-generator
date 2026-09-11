import { inferEditorMode, normalizeEditorMode } from "./editorMode.js";
import { removeLegacyLanguageLevelStyling } from "./languagesLayout.js";
import { preserveSavedTextLayouts } from "./savedTextLayout.js";
import { sanitizeElementsContent } from "./sanitizeTextContent.js";
import { trimTrailingEmptyTextareaPayload } from "./textareaHeight.js";
import { healDecorativeOrdinalBaselines, healSkillChipLabelBaselines } from "./sectionStructure.js";
import { nanoid } from "nanoid";
import { normalizeVellumContactLayout } from "./vellumTypographyLayout.js";

/** Apply existing load repairs before both the live graph and clean baseline. */
function normalizeLoadedElements(elements) {
  const cleaned = sanitizeElementsContent(elements).map((element) => {
    if (element.category !== "textarea" || element.content == null) return element;
    const trimmed = trimTrailingEmptyTextareaPayload(element.content, element.runs, { bulletList: !!element.bulletList });
    return trimmed.content === element.content ? element : { ...element, ...trimmed };
  });
  const repaired = normalizeVellumContactLayout(
    healSkillChipLabelBaselines(healDecorativeOrdinalBaselines(cleaned)), nanoid,
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
export function normalizeCommittedDocumentSnapshot(input = {}) {
  const elements = removeLegacyLanguageLevelStyling(
    normalizeLoadedElements(Array.isArray(input.elements) ? input.elements : []),
  );
  const deletedElements = Array.isArray(input.deletedElements)
    ? input.deletedElements
    : (Array.isArray(input.deletedIds) ? input.deletedIds : []);
  const templateId = input.templateId ?? input.template_id ?? null;
  const requestedPages = positiveInteger(input.pageCount ?? input.pages) ?? 1;
  const elementPages = elements.reduce(
    (maximum, element) => Math.max(maximum, positiveInteger(element?.page) ?? 1),
    1,
  );
  const pageCount = Math.max(requestedPages, elementPages);
  const requestedCurrentPage = positiveInteger(input.currentPage) ?? 1;
  const savedMode = input.editorMode ?? input.editor_mode;
  const editorMode = savedMode
    ? normalizeEditorMode(savedMode)
    : inferEditorMode(elements, templateId);
  const rawRevision = input.serverRevision ?? input.revision;
  const sourceImportId = input.sourceImportId ?? input.source_import_id ?? null;
  const pdfId = input.pdfId ?? input.pdf_id ?? null;

  return {
    elements: positiveInteger(pdfId) ? preserveSavedTextLayouts(elements) : elements,
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
