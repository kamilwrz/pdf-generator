/**
 * Shared POST /ai/fill_template client used by import, the A4 starter, and
 * change-template flows. Callers keep their own loading UI and apply path
 * (loadAiElements vs replaceActiveElements).
 */
import { ApiClient, ENDPOINTS } from "./api";
import { getAccessToken } from "../utils/authSession";
import { flowSpacingToPayload } from "../utils/flowSpacing";

/**
 * Request a deterministic Python layout for `cvData` + `templateId`.
 *
 * @param {object} cvData - Normalised CV payload for the backend generator.
 * @param {string} templateId - Registry id (must exist in `_GENERATORS`).
 * @param {object} [options]
 * @param {ApiClient} [options.api] - Reuse a caller-built client when provided;
 *   otherwise a client is created with a Bearer header only when a JWT exists.
 * @param {string} [options.errorMessage] - Fallback Polish message for ApiClient.
 * @param {object} [options.spacing] - Optional SPACE_* rhythm override.
 * @returns {Promise<{elements: object[]}>}
 */
export async function fillTemplate(cvData, templateId, options = {}) {
  if (!cvData || typeof cvData !== "object") {
    throw new Error("Brak danych CV do wypełnienia szablonu.");
  }
  if (!templateId) {
    throw new Error("Nie wybrano szablonu.");
  }
  // Guests call the same endpoint without a Bearer header. Sending
  // `Authorization: Bearer null` looks like a malformed JWT and surfaces a
  // false auth error even though the route accepts anonymous Free-tier fills.
  const token = getAccessToken();
  const api = options.api
    ?? new ApiClient(token ? { Authorization: `Bearer ${token}` } : {});
  const errorMessage = options.errorMessage || "Generowanie szablonu nie powiodło się";
  const body = { cv_data: cvData, template_id: templateId };
  if (options.spacing) {
    body.spacing_px = flowSpacingToPayload(options.spacing);
  }
  return api.httpRequest(
    ENDPOINTS.AI.FILL_TEMPLATE,
    "POST",
    JSON.stringify(body),
    errorMessage,
  );
}
