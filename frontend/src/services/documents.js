import { t as uiText } from "../i18n/index.js";
/** Owned-document reads shared by the library, deep links, and quick-open dialog. */
import { ApiClient, ENDPOINTS } from './api.js';
import { getAccessToken } from '../utils/authSession.js';
import { parseDocumentId } from '../utils/siteRoutes.js';
import { hydratePersistedCanvasElement } from '../utils/persistedCanvasElement.js';
import { normalizeSterlingFamilyPersistence } from '../utils/sterlingAppearance.js';
import { normalizeProfilePhotoVisibilityPersistence } from '../utils/profilePhotoVisibility.js';

function ownedApi() {
  return new ApiClient({ Authorization: `Bearer ${getAccessToken()}` });
}

/** List only documents returned by the authenticated backend; 404 means an empty legacy list. */
export async function listOwnedDocuments() {
  try {
    const data = await ownedApi().httpRequest(ENDPOINTS.PDF.FETCH, 'GET', null, uiText("errors:documents.couldNotLoadDocuments"));
    if (!Array.isArray(data)) throw new Error(uiText("errors:documents.invalidDocumentListResponse"));
    return data;
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

/**
 * Fetch and hydrate a complete snapshot without mutating editor state.
 * Callers must reject stale responses immediately before committing it.
 * Legacy array responses require metadata from the owned list.
 */
export async function loadOwnedDocument(value, knownDocuments) {
  const id = parseDocumentId(value);
  if (id === null) throw new Error(uiText("errors:documents.invalidDocumentAddress"));
  const data = await ownedApi().httpRequest(ENDPOINTS.PDF.SHOW, 'POST', JSON.stringify(id), uiText("errors:documents.couldNotOpenTheDocument"));
  const metadata = Array.isArray(data)
    ? (knownDocuments || await listOwnedDocuments()).find((item) => Number(item.id) === id)
    : data?.document;
  const elements = Array.isArray(data) ? data : data?.elements;
  if (!metadata || Number(metadata.id) !== id || !Array.isArray(elements)) {
    throw new Error(uiText("errors:documents.couldNotReadTheCompleteDocument"));
  }
  const templateId = metadata.template_id ?? metadata.templateId;
  const hydrated = elements.map(hydratePersistedCanvasElement).filter((element) => element.category !== 'title');
  const normalized = normalizeProfilePhotoVisibilityPersistence(normalizeSterlingFamilyPersistence(hydrated, templateId), templateId, null, (metadata.cv_data ?? metadata.cvData)?.language);
  return { ...metadata, elements: normalized, deletedElements: [], title: metadata.title || '', currentPage: 1, pdfId: id, serverRevision: metadata.revision ?? null, isDemoContent: false };
}
