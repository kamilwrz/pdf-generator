/**
 * Small helpers for the JWT kept in `localStorage` under the key `token`.
 *
 * Guest mode treats a missing/invalid token as the normal state. Callers should
 * use these helpers instead of reading `localStorage` ad hoc so stale values
 * such as the literal strings "null" / "undefined" never look authenticated.
 *
 * The editor URL is personalised as `/cvstudio/{username}` when a JWT is
 * present, or `/cvstudio/guest` otherwise. The slug is cosmetic for deep
 * links and bookmarks — authorisation still comes from the JWT, not the path.
 */

const TOKEN_KEY = "token";
const USERNAME_KEY = "username";

/** Reserved workspace slug used when the visitor has no JWT. */
export const GUEST_WORKSPACE = "guest";

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
 * Persist the authenticated username used for `/cvstudio/{username}` URLs.
 *
 * @param {string} username
 */
export function setSessionUsername(username) {
  if (typeof localStorage === "undefined") return;
  const trimmed = String(username ?? "").trim();
  if (!trimmed) {
    localStorage.removeItem(USERNAME_KEY);
    return;
  }
  localStorage.setItem(USERNAME_KEY, trimmed);
}

/**
 * Read the JWT `sub` claim without verifying the signature.
 *
 * Used only to personalise client-side routes. The backend still validates
 * the token on every authenticated request.
 *
 * @param {string|null|undefined} token
 * @returns {string|null}
 */
export function getUsernameFromToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    // JWT payloads are base64url; normalise to standard base64 for atob.
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    const sub = payload?.sub;
    if (typeof sub !== "string") return null;
    const trimmed = sub.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

/**
 * Return the username for the current session, or `null` for guests.
 *
 * Prefers the value written at login; falls back to decoding the JWT `sub`
 * so existing sessions that only stored `token` still get a personalised URL.
 *
 * @returns {string|null}
 */
export function getSessionUsername() {
  if (!getAccessToken()) return null;
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(USERNAME_KEY);
    if (stored != null) {
      const trimmed = String(stored).trim();
      if (trimmed && trimmed !== "null" && trimmed !== "undefined") {
        return trimmed;
      }
    }
  }
  const fromToken = getUsernameFromToken(getAccessToken());
  if (fromToken) {
    setSessionUsername(fromToken);
    return fromToken;
  }
  return null;
}

/**
 * Build the editor path for the current auth state.
 *
 * Authenticated: `/cvstudio/{username}`
 * Guest (or username not yet known): `/cvstudio/guest`
 *
 * @param {{ start?: string|null }} [options]
 * @returns {string}
 */
export function getEditorPath(options = {}) {
  const start = options.start ?? null;
  const username = getSessionUsername();
  const slug = username ? encodeURIComponent(username) : GUEST_WORKSPACE;
  const base = `/cvstudio/${slug}`;
  if (start) {
    return `${base}?start=${encodeURIComponent(String(start))}`;
  }
  return base;
}

/**
 * Remove the stored JWT (and cached username) so subsequent calls run as a guest.
 */
export function clearAccessToken() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
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
