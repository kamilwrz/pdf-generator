/** Shared account-only PDF extraction and read-only source recovery. */
import { ApiClient, ENDPOINTS } from './api';
import { getAccessToken } from '../utils/authSession';
import { CV_IMPORT_REQUEST_OPTIONS } from '../utils/cvImportRequest';
import { loadOwnedDocument } from './documents';
import { t } from '../i18n';

export const MAX_CV_PDF_BYTES = 10 * 1024 * 1024;

/** Validate before upload; the API independently validates actual PDF bytes and page limits. */
export function validateCvPdf(file) {
  if (!file || !file.name?.toLowerCase().endsWith('.pdf')) return 'onboarding:pdfOnly';
  if (file.size === 0 || file.size > MAX_CV_PDF_BYTES) return 'onboarding:pdfSize';
  return null;
}

/** Upload once with caller-owned idempotency. A browser timeout never retries inference. */
export async function extractCvPdf(file, key) {
  const invalid = validateCvPdf(file);
  if (invalid) throw new Error(t(invalid));
  const api = new ApiClient({ Authorization: `Bearer ${getAccessToken()}` });
  const form = new FormData(); form.append('file', file);
  return api.httpRequest(ENDPOINTS.AI.EXTRACT_CV, 'POST', form, t('onboarding:importError'), {
    ...CV_IMPORT_REQUEST_OPTIONS, headers: { 'Idempotency-Key': key },
  });
}

/** Fetch the complete owned source only after selection; never starts AI or edits a CV. */
export async function readCvSource(source) {
  let data;
  if (source.kind === 'document') {
    const snapshot = await loadOwnedDocument(source.id);
    data = { cvData: snapshot.cv_data ?? snapshot.cvData, title: snapshot.title };
  } else if (source.kind === 'import') {
    const api = new ApiClient({ Authorization: `Bearer ${getAccessToken()}` });
    const snapshot = await api.httpRequest(ENDPOINTS.AI.IMPORT(source.id), 'GET', undefined, t('onboarding:sourceError'));
    if (snapshot.status !== 'succeeded') throw new Error(t('onboarding:sourceUnavailable'));
    data = { cvData: snapshot.cv_data, title: snapshot.filename || snapshot.source_filename };
  }
  if (!data?.cvData?.name?.trim()) throw new Error(t('onboarding:sourceUnavailable'));
  return data;
}
