/**
 * Backend HTTP client and route constants for CV Studio.
 *
 * VITE_API_URL overrides the default for local/prod builds. Falls back to the
 * deployed Render backend so a fresh clone without `.env` still works.
 *
 * Auth calls should pass long timeouts and retries: free-tier dynos often need
 * 30–60s on cold start; short aborts previously made login look broken.
 */
// VITE_API_URL overrides this for local dev (see .env.example / .env.development)
// and for production builds (see .env.production). Falls back to the deployed
// backend so a fresh clone with no .env file still works out of the box.
// `import.meta.env` is injected by Vite but is absent when source-driven
// template utilities import this module directly in Node.js.
const API_BASE_URL = import.meta.env?.VITE_API_URL || 'https://pdf-generator-07cb.onrender.com';

/** Path constants relative to API_BASE_URL (no trailing slash on base). */
export const ENDPOINTS = {
    PDF: {
        CREATE: "/pdf/create_pdf",
        FETCH: "/pdf/fetch_pdfs",
        DELETE: "/pdf/delete_pdf",
        SHOW: "/pdf/show_pdf",
        UPDATE: "/pdf/update_pdf",
        SAVE_ELEMENTS: "/pdf/save_elements",
        DOWNLOAD: "/pdf/download_pdf",
    },
    IMG: {
        UPLOAD: "/images/upload_image",
        FETCH: "/images/fetch_images",
        DELETE: "/images/delete_image",
        /** Ownership-checked byte stream — replaces public /uploads URLs. */
        CONTENT: (imgId) => `/images/${imgId}/content`,
    },
    AUTH: {
        LOGIN: "/auth/token",
        REGISTER: "/auth/register",
        TOKEN: "/auth/verify-token/",
        ENTITLEMENTS: "/auth/me/entitlements",
    },
    AI: {
        EXTRACT_CV: "/ai/extract_cv",
        FILL_TEMPLATE: "/ai/fill_template",
        BIO_CV_DRAFT: "/ai/bio_cv_draft",
        ASSISTANT: "/ai/assistant",
    },
    EVENTS: {
        LOG: "/events/log",
    },
    BILLING: {
        PLANS: "/billing/plans",
        SELECT_PLAN: "/billing/select-plan",
    },
}

export default API_BASE_URL;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True for cold-start / proxy blips browsers report as "Failed to fetch". */
export function isTransientNetworkError(error) {
    if (!error) return false;
    if (error.name === "AbortError") return true;
    if ([502, 503, 504].includes(error.status)) return true;
    const message = String(error.message || "").toLowerCase();
    return (
        message.includes("failed to fetch")
        || message.includes("networkerror")
        || message.includes("network request failed")
        || message.includes("load failed")
        || message.includes("serwer nie odpowiada")
        || message.includes("nie udało się połączyć")
        || message.includes("przekroczono czas")
    );
}

/**
 * Errors worth retrying. Client AbortError (our timeout) is excluded — a long
 * AI call that already ran should not be billed/retried blindly.
 */
export function isRetryableNetworkError(error) {
    if (!error || error.name === "AbortError") return false;
    return isTransientNetworkError(error);
}

/**
 * Kick a sleeping Render dyno. Long timeout — free-tier cold start often
 * needs 30–60s before the first byte; short aborts caused endless failures.
 */
export function wakeBackend() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);
    return fetch(`${API_BASE_URL}/health`, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
    })
        .catch(() => null)
        .finally(() => clearTimeout(timeoutId));
}

export class ApiClient {
    /**
     * @param {Record<string, string>} headers - Merged over JSON Content-Type
     *   (e.g. `{ Authorization: "Bearer …" }`). FormData bodies drop Content-Type
     *   so the browser can set the multipart boundary.
     */
    constructor(headers) {
        this.baseUrl = API_BASE_URL;
        this.headers = { 'Content-Type': 'application/json', ...headers };
        this.DATA = [];
    }

    /**
     * Perform an HTTP call with optional retries on transient network errors.
     *
     * Side effects: network I/O only. Plan-limit responses attach `status`,
     * `code`, and `upgradeRequired` on the thrown Error for UI upgrade prompts.
     */
    async httpRequest(endpoint, method, body, errorMessage, options = {}) {
        const retries = Math.max(0, options.retries ?? 0);
        const retryDelayMs = options.retryDelayMs ?? 2_500;
        let lastError = null;

        for (let attempt = 0; attempt <= retries; attempt += 1) {
            if (attempt > 0) {
                options.onRetry?.(attempt);
                await sleep(retryDelayMs * Math.min(attempt, 4));
            }
            try {
                return await this._httpRequestOnce(endpoint, method, body, errorMessage, options);
            } catch (error) {
                lastError = error;
                // Auth keeps retrying AbortError (short cold-start waits). Long AI calls
                // pass retryOnTimeout: false so a finished/hung model request is not re-billed.
                const retryable = options.retryOnTimeout === false
                    ? isRetryableNetworkError(error)
                    : isTransientNetworkError(error);
                if (!retryable || attempt === retries) {
                    // Keep timeout wording; only map opaque fetch failures to cold-start copy.
                    if (error?.name === "AbortError") {
                        throw error;
                    }
                    if (isTransientNetworkError(error) && !error.status) {
                        throw new Error(
                            "Nie udało się połączyć z serwerem (trwa uruchamianie). Spróbuj ponownie za chwilę.",
                        );
                    }
                    throw error;
                }
            }
        }
        throw lastError || new Error(errorMessage || "Wystąpił błąd podczas komunikacji z serwerem.");
    }

    async _httpRequestOnce(endpoint, method, body, errorMessage, options = {}) {
        const fallbackMessage = errorMessage || "Wystąpił błąd podczas komunikacji z serwerem.";
        const headers = { ...this.headers };
        if (body instanceof FormData) delete headers['Content-Type'];

        // Cold start can exceed a minute; default high for auth-style calls.
        const timeoutMs = options.timeoutMs ?? 90_000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            // omit credentials — auth is Bearer JWT in localStorage, not cookies.
            // include + missing ACAO on cold-start error pages made login look broken.
            const response = await fetch(this.baseUrl + endpoint, {
                method: method,
                headers: headers,
                body: body,
                credentials: "omit",
                signal: controller.signal,
            });

            if (!response.ok) {
                let payload = null;
                try {
                    payload = await response.json();
                } catch {
                    payload = null;
                }
                const detail = payload?.detail;
                const message = typeof detail === "string"
                    ? detail
                    : (detail?.message || fallbackMessage);
                const requestError = new Error(message);
                requestError.status = response.status;
                requestError.code = typeof detail === "object" && detail ? detail.code : undefined;
                requestError.upgradeRequired = typeof detail === "object" && detail
                    ? detail.upgrade_required
                    : undefined;
                requestError.planMessage = typeof detail === "object" && detail
                    ? detail.message
                    : undefined;
                requestError.detail = detail;
                throw requestError;
            }

            return await response.json();
        } catch (error) {
            if (error?.name === "AbortError") {
                const seconds = Math.round(timeoutMs / 1000);
                const abortError = new Error(
                    `Przekroczono czas oczekiwania (${seconds} s). Serwer lub model AI nadal pracuje — spróbuj ponownie za chwilę.`,
                );
                abortError.name = "AbortError";
                throw abortError;
            }
            if (error instanceof Error) throw error;
            throw new Error(fallbackMessage);
        } finally {
            clearTimeout(timeoutId);
        }
    }
}
