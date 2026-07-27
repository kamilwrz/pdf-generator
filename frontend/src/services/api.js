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

export class ApiClient {
    constructor(headers) {
        this.baseUrl = API_BASE_URL,
        this.headers = { 'Content-Type': 'application/json', ...headers },
        this.DATA = []
    }

    async httpRequest(endpoint, method, body, errorMessage) {

        const fallbackMessage = errorMessage || "Wystąpił błąd podczas komunikacji z serwerem.";
        const headers = { ...this.headers };
        if (body instanceof FormData) delete headers['Content-Type'];

        try {
            const response = await fetch(this.baseUrl + endpoint, {
                method: method,
                headers: headers,
                body: body,
                credentials: "include"
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
            else{
                const data = await response.json();
                return data;  
            }

        } catch (error) {
            if (error instanceof Error) throw error;
            throw new Error(fallbackMessage);
        }
    }
    
}