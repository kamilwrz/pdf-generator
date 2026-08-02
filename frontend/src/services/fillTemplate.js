/**
 * Shared POST /ai/fill_template client used by import, bio wizard, and
 * change-template flows. Callers keep their own loading UI and apply path
 * (loadAiElements vs replaceActiveElements).
 */
import { ApiClient, ENDPOINTS } from "./api";

/**
 * Request a deterministic Python layout for `cvData` + `templateId`.
 *
 * @param {object} cvData - Normalised CV payload for the backend generator.
 * @param {string} templateId - Registry id (must exist in `_GENERATORS`).
 * @param {object} [options]
 * @param {ApiClient} [options.api] - Reuse an authenticated client when the
 *   caller already constructed one; otherwise a Bearer client is created.
 * @param {string} [options.errorMessage] - Fallback Polish message for ApiClient.
 * @returns {Promise<{elements: object[]}>}
 */
export async function fillTemplate(cvData, templateId, options = {}) {
  if (!cvData || typeof cvData !== "object") {
    throw new Error("Brak danych CV do wypełnienia szablonu.");
  }
  if (!templateId) {
    throw new Error("Nie wybrano szablonu.");
  }
  const api = options.api
    ?? new ApiClient({ Authorization: `Bearer ${localStorage.getItem("token")}` });
  const errorMessage = options.errorMessage || "Generowanie szablonu nie powiodło się";
  return api.httpRequest(
    ENDPOINTS.AI.FILL_TEMPLATE,
    "POST",
    JSON.stringify({ cv_data: cvData, template_id: templateId }),
    errorMessage,
  );
}
