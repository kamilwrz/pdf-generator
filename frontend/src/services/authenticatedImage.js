/**
 * Load a private library image as a blob URL (Authorization header required).
 *
 * Browser <img src> cannot send Bearer tokens, so gallery thumbnails and canvas
 * user photos fetch `/images/{id}/content` and display an object URL instead.
 */
import API_BASE_URL, { ENDPOINTS } from "./api";

/**
 * @param {string|number} imgId
 * @param {string} [token] - JWT; defaults to localStorage token.
 * @returns {Promise<string>} object URL — caller must revoke when done.
 */
export async function fetchAuthenticatedImageObjectUrl(imgId, token) {
  const auth = token ?? localStorage.getItem("token");
  if (!auth) {
    throw new Error("Brak sesji — zaloguj się ponownie.");
  }
  const path = ENDPOINTS.IMG.CONTENT(imgId);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${auth}` },
  });
  if (!response.ok) {
    throw new Error("Nie udało się pobrać obrazu.");
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * True when `src` is the authenticated content route (not a template asset).
 * @param {string|null|undefined} src
 */
export function isAuthenticatedImageSrc(src) {
  return /\/images\/\d+\/content(?:\?|$)/.test(String(src || ""));
}
