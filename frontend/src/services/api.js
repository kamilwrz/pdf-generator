const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

//ENDPOINTS
export const ENDPOINTS = {
    PDF: {
        CREATE: "/pdf/create_pdf",
        FETCH: "/pdf/fetch_pdfs",
        DELETE: "/pdf/delete_pdf",
        SHOW: "/pdf/show_pdf",
        UPDATE: "/pdf/update_pdf"
    },
    IMG: {
        UPLOAD: "/images/upload_image",
        FETCH: "/images/fetch_images",
        DELETE: "/images/delete_image"
    },
    AUTH: {
        LOGIN: "/auth/token",
        REGISTER: "/auth/register",
        TOKEN: "/auth/verify-token/"
    }
}

export default API_BASE_URL;

export class ApiClient {
    constructor(headers) {
        this.baseUrl = API_BASE_URL,
        this.headers = { 'Content-Type': 'application/json', ...headers }
    }

    async httpRequest(endpoint, method, body, errorMessage) {

        const headers = { ...this.headers };
        if (body instanceof FormData) delete headers['Content-Type'];

        try {
            const response = await fetch(this.baseUrl + endpoint, {
                method: method,
                headers: headers,
                body: body
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || errorMessage);
            }

            const data = await response.json();
            return data;

        } catch (error) {
            throw new Error(error?.message || errorMessage);
        }
    }
}