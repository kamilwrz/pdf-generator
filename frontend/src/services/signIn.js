import { ApiClient, ENDPOINTS } from "./api";
import { setSessionUsername } from "../utils/authSession";

/**
 * Establishes the same session for login and immediate post-registration login.
 * Credentials stay in memory and travel only to the existing token endpoint.
 * Persists a validated token and the cosmetic route username; rejects on API
 * failure without treating a successful registration as a failed registration.
 */
export async function signIn(username, password, options = {}) {
  const form = new URLSearchParams({ username: username.trim(), password });
  const api = new ApiClient({ "Content-Type": "application/x-www-form-urlencoded" });
  const data = await api.httpRequest(ENDPOINTS.AUTH.LOGIN, "POST", form,
    "Logowanie nie powiodło się", { timeoutMs: 90_000, retries: 4, retryDelayMs: 3_000, ...options });
  if (typeof data?.access_token !== "string" || !data.access_token.trim()) {
    throw new Error("Nie otrzymano sesji. Zaloguj się ponownie.");
  }
  localStorage.setItem("token", data.access_token);
  setSessionUsername(username);
}
