import { t as uiText } from "../i18n/index.js";
import { ApiClient, ENDPOINTS } from "./api";
import { setSessionUsername } from "../utils/authSession";

/** Persist a backend-validated session returned by password or Google auth. */
export function establishSession(data) {
  if (typeof data?.access_token !== "string" || !data.access_token.trim()) {
    throw new Error(uiText("errors:signIn.noSessionReceivedPleaseSignInAgain"));
  }
  localStorage.setItem("token", data.access_token);
  setSessionUsername(data.username || "");
}

/**
 * Establishes a password session after the account email has been verified.
 * Credentials stay in memory and travel only to the token endpoint.
 * Persists a validated token and the cosmetic route username; rejects on API
 * failure without treating a successful registration as a failed registration.
 */
export async function signIn(username, password, options = {}) {
  const form = new URLSearchParams({ username: username.trim(), password });
  const api = new ApiClient({ "Content-Type": "application/x-www-form-urlencoded" });
  const data = await api.httpRequest(ENDPOINTS.AUTH.LOGIN, "POST", form,
    uiText("auth:login.signInFailed"), { timeoutMs: 90_000, retries: 4, retryDelayMs: 3_000, ...options });
  establishSession({ ...data, username: data.username || username.trim() });
}
