/**
 * Request and recovery rules for the long-running CV extraction workflow.
 *
 * Cloudflare vision inference can legitimately take longer than the generic
 * API timeout, especially after a Render cold start. Automatic retries stay
 * disabled because the original provider call can continue after the browser
 * stops waiting. The caller keeps one Idempotency-Key for the selected file;
 * the backend reservation prevents any manual retry from starting a duplicate
 * provider call while that first attempt is active.
 */
export const CV_IMPORT_REQUEST_OPTIONS = Object.freeze({
    timeoutMs: 240_000,
    retries: 0,
    retryOnTimeout: false,
});

export const CV_IMPORT_TIMEOUT_MESSAGE =
    "Import trwa dłużej niż 4 minuty i może nadal kończyć się na serwerze. Nie uruchamiaj go ponownie — odśwież status w historii importów.";

/**
 * Translate the persisted backend state into a concise Polish UI label.
 *
 * @param {string} status - Snapshot status returned by `/ai/imports`.
 * @returns {string} User-facing status label.
 */
export function cvImportStatusLabel(status) {
    if (status === "succeeded") return "Dane gotowe";
    if (status === "processing") return "Przetwarzanie…";
    return "Import nieudany";
}
