// VITE_API_URL overrides this for local dev (see .env.example / .env.development)
// and for production builds (see .env.production). Falls back to the deployed
// backend so a fresh clone with no .env file still works out of the box.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://pdf-generator-07cb.onrender.com';

//ENDPOINTS
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
    );
}

function networkErrorMessage(fallbackMessage) {
    return "Nie udało się połączyć z serwerem (trwa uruchamianie). Spróbuj ponownie za chwilę.";
}

/**
 * Poll /health until the Render dyno accepts requests.
 * Returns true when ready, false on timeout.
 */
export async function waitForBackend({
    timeoutMs = 100_000,
    intervalMs = 2_500,
    onProgress,
} = {}) {
    const started = Date.now();
    let attempt = 0;

    while (Date.now() - started < timeoutMs) {
        attempt += 1;
        onProgress?.(attempt);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8_000);
        try {
            // omit credentials — cold-start error pages often lack CORS ACAO
            const response = await fetch(`${API_BASE_URL}/health`, {
                method: "GET",
                cache: "no-store",
                credentials: "omit",
                signal: controller.signal,
            });
            if (response.ok) {
                const contentType = response.headers.get("content-type") || "";
                if (contentType.includes("application/json")) {
                    const body = await response.json().catch(() => null);
                    if (body?.status === "ok") return true;
                }
                // Any HTTP 200 means the process is listening (SPA fallback on older deploys).
                return true;
            }
        } catch {
            // Dyno still sleeping / starting — keep polling.
        } finally {
            clearTimeout(timeoutId);
        }
        await sleep(intervalMs);
    }
    return false;
}

/** Fire-and-forget warmup so a sleeping Render dyno starts before login/register. */
export function wakeBackend() {
    waitForBackend({ timeoutMs: 100_000 }).catch(() => null);
    return fetch(`${API_BASE_URL}/health`, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
    }).catch(() => null);
}

export class ApiClient {
    constructor(headers) {
        this.baseUrl = API_BASE_URL;
        this.headers = { 'Content-Type': 'application/json', ...headers };
        this.DATA = [];
    }

    async httpRequest(endpoint, method, body, errorMessage, options = {}) {
        const retries = Math.max(0, options.retries ?? 0);
        const retryDelayMs = options.retryDelayMs ?? 2_000;
        let lastError = null;

        for (let attempt = 0; attempt <= retries; attempt += 1) {
            if (attempt > 0) {
                options.onRetry?.(attempt);
                await sleep(retryDelayMs * attempt);
            }
            try {
                return await this._httpRequestOnce(endpoint, method, body, errorMessage, options);
            } catch (error) {
                lastError = error;
                const retryable = isTransientNetworkError(error);
                if (!retryable || attempt === retries) {
                    if (isTransientNetworkError(error) && !error.status) {
                        throw new Error(networkErrorMessage(errorMessage));
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

        const timeoutMs = options.timeoutMs;
        const controller = timeoutMs != null ? new AbortController() : null;
        const timeoutId = controller
            ? setTimeout(() => controller.abort(), timeoutMs)
            : null;

        try {
            const response = await fetch(this.baseUrl + endpoint, {
                method: method,
                headers: headers,
                body: body,
                credentials: "include",
                ...(controller ? { signal: controller.signal } : {}),
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
                const abortError = new Error("Serwer nie odpowiada. Odśwież stronę i spróbuj ponownie.");
                abortError.name = "AbortError";
                throw abortError;
            }
            if (error instanceof Error) throw error;
            throw new Error(fallbackMessage);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }
}
