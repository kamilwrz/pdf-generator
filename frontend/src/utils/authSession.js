/**
 * Small helpers for the JWT kept in `localStorage` under the key `token`.
 *
 * Guest mode treats a missing/invalid token as the normal state. Callers should
 * use these helpers instead of reading `localStorage` ad hoc so stale values
 * such as the literal strings "null" / "undefined" never look authenticated.
 */

const TOKEN_KEY = "token";

/**
 * Return the current access token, or `null` when the visitor is a guest.
 *
 * @returns {string|null}
 */
export function getAccessToken() {
  if (typeof localStorage === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  if (token == null) return null;
  const trimmed = String(token).trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
  return trimmed;
}

/**
 * Remove the stored JWT so subsequent calls run as a guest.
 */
export function clearAccessToken() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Whether an ApiClient / fetch error represents a missing or rejected JWT.
 *
 * Matches both HTTP status and the English FastAPI default detail
 * ("Not authenticated") so guest UI can recover even when `error.status`
 * is missing for any reason.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isAuthFailure(error) {
  if (!error || typeof error !== "object") return false;
  const status = error.status;
  if (status === 401 || status === 403) return true;
  const message = String(error.message || error.detail || "").toLowerCase();
  return (
    message.includes("not authenticated")
    || message.includes("token jest nieprawidłowy")
    || message.includes("token jest nieprawidlowy")
    || message.includes("wygasł")
    || message.includes("wygasl")
    || message.includes("could not validate credentials")
  );
}
