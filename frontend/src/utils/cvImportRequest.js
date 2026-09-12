import { t as uiText } from "../i18n/index.js";
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
    uiText("editor:cvImportRequest.importHasTakenMoreThanMinutesAnd");

/**
 * Translate the persisted backend state into a concise request-language UI label.
 *
 * @param {string} status - Snapshot status returned by `/ai/imports`.
 * @returns {string} User-facing status label.
 */
export function cvImportStatusLabel(status) {
    if (status === "succeeded") return uiText("editor:cvImportRequest.dataReady");
    if (status === "processing") return uiText("editor:cvImportRequest.processing");
    return uiText("editor:cvImportRequest.importFailed");
}

/**
 * Convert a persisted, non-sensitive failure code into a recovery instruction.
 *
 * The history endpoint deliberately exposes codes rather than raw provider
 * messages. Grouping them here keeps infrastructure details out of the UI and
 * tells the user whether to wait, replace the PDF, or start a fresh import.
 *
 * @param {string | null | undefined} errorCode - Safe snapshot failure code.
 * @returns {string} A user-facing next step.
 */
export function cvImportRecoveryMessage(errorCode) {
    if (errorCode === "extract_provider_daily_limit" || errorCode === "plan_limit_cv_imports") {
        return uiText("editor:cvImportRequest.yourImportAllowanceIsUsedUpTry");
    }

    if (
        errorCode === "cv_has_no_pages"
        || errorCode === "cv_page_render_failed"
        || errorCode === "extract_provider_invalid_response"
    ) {
        return uiText("editor:cvImportRequest.couldNotReadThisPdfTryAgain");
    }

    if (
        errorCode === "extract_provider_timeout"
        || errorCode === "extract_provider_capacity"
        || errorCode === "extract_provider_rate_limited"
        || errorCode === "extract_provider_unavailable"
        || errorCode === "extract_provider_empty_response"
    ) {
        return uiText("editor:cvImportRequest.theServiceWasTemporarilyUnavailableStartA");
    }

    return uiText("editor:cvImportRequest.thisImportDidNotSucceedStartA");
}
