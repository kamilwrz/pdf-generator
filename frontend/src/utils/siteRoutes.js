/** Route builders preserve task intent without accepting arbitrary redirect URLs. */
import { getEditorPath } from './authSession.js';
import { loadGuestDocument } from './guestDocument.js';

export const DOCUMENTS_PATH = '/app/documents';

/** Saved documents have positive database IDs; malformed paths never reach the API. */
export function parseDocumentId(value) {
  const text = String(value ?? '');
  if (!/^[1-9]\d*$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;
}

/** Return the private editor URL; authorization always remains server-owned. */
export function getDocumentPath(id) {
  const parsed = parseDocumentId(id);
  if (parsed === null) throw new Error('Invalid document ID');
  return `${DOCUMENTS_PATH}/${parsed}`;
}

/** Only known application destinations may survive authentication. */
export function safeReturnTo(value) {
  if (['/app', DOCUMENTS_PATH, '/app/account', '/app/import', '/app/new'].includes(value)) return value;
  if (typeof value === 'string' && value.startsWith(`${DOCUMENTS_PATH}/`)) {
    const id = parseDocumentId(value.slice(DOCUMENTS_PATH.length + 1));
    if (id !== null) return getDocumentPath(id);
  }
  return null;
}

/** Preserve only recognized task parameters when switching between auth forms. */
export function authLink(path, params) {
  const next = new URLSearchParams();
  for (const name of ['start', 'template', 'plan']) {
    if (params.get(name)) next.set(name, params.get(name));
  }
  const destination = safeReturnTo(params.get('returnTo'));
  if (destination) next.set('returnTo', destination);
  return `${path}${next.size ? `?${next}` : ''}`;
}

/** Explicit tasks win; a browser draft retains its existing ownership-claim flow. */
export function postAuthPath(params) {
  const destination = safeReturnTo(params.get('returnTo'));
  if (destination) return destination;
  const start = params.get('start');
  if (['import', 'new', 'wizard', 'templates', 'download'].includes(start)) {
    return getEditorPath({ start, template: params.get('template') });
  }
  const draft = loadGuestDocument();
  return draft?.elements?.length && !draft.isDemoContent ? getEditorPath() : DOCUMENTS_PATH;
}
