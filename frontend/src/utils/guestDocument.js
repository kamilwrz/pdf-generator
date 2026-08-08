/**
 * Client-side persistence for a canvas that has not been saved to the backend
 * yet — the guest-mode counterpart to the elements the backend stores per
 * `Pdf`/`PdfElements` row. Guests edit fully client-side (no account, no
 * OpenAI cost); this is the only place that state lives until they register
 * and confirm loading it onto the authenticated A4 canvas (see PdfCanvas's
 * claim effect — hydrate only, no automatic `create_pdf`).
 */

const STORAGE_KEY = "cvstudio.guest.doc";

/**
 * @param {{
 *   elements: object[],
 *   deletedIds: string[],
 *   title: string,
 *   pageCount: number,
 *   editorMode: string,
 *   templateId: string|null,
 *   spacingPx: object|null,
 *   isDemoContent: boolean,
 *   cvData?: object|null,
 *   updatedAt: number,
 * }} snapshot
 *
 * `cvData` is the structured bio/wizard profile used by Topbar
 * "Zmień szablon" (`activeCvData`). Persisting it here survives the
 * register/login navigation that otherwise clears React state.
 */
export function saveGuestDocument(snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage can be full or unavailable (private browsing); guest editing
    // still works in-memory for the current tab, it just won't survive a
    // reload. Not worth surfacing to the user for a best-effort cache.
  }
}

/** @returns {object|null} The last saved snapshot, or null if none/corrupt. */
export function loadGuestDocument() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearGuestDocument() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No-op: if removal fails, the next saveGuestDocument overwrites anyway.
  }
}

/** True when there is a saved snapshot with at least one live element. */
export function hasGuestDocument() {
  const doc = loadGuestDocument();
  return Boolean(doc && Array.isArray(doc.elements) && doc.elements.length > 0);
}
