const API_BASE_URL = 'https://pdf-generator-07cb.onrender.com';

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
        TOKEN: "/auth/verify-token/"
    },
    AI: {
        EXTRACT_CV: "/ai/extract_cv",
        FILL_TEMPLATE: "/ai/fill_template",
        GENERATE_DECK: "/ai/generate_deck",
        GENERATE_ARTICLE: "/ai/generate_article",
        ASSISTANT: "/ai/assistant",
    }
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
                const error = await response.json();
                const requestError = new Error(error.detail || fallbackMessage);
                requestError.status = response.status;
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