/**
 * Resolve the backend origin from Vite's build-time environment.
 *
 * Development deliberately defaults to the same-origin `/api` proxy so a
 * missing local file can never send private editor data to production.
 * Production must name an HTTPS origin explicitly; failing the build early is
 * safer than silently deploying a client pointed at an unintended backend.
 *
 * @param {Record<string, unknown>} env Vite-like environment values.
 * @returns {string} A base without a trailing slash.
 */
export function resolveApiBaseUrl(env = {}) {
    const configured = String(env.VITE_API_URL || "").trim().replace(/\/+$/, "");
    const isProduction = env.PROD === true || env.MODE === "production";

    if (!configured) {
        if (isProduction) {
            throw new Error("VITE_API_URL is required for a production build.");
        }
        return "/api";
    }

    let parsed;
    try {
        parsed = new URL(configured);
    } catch (error) {
        if (!isProduction && configured.startsWith("/")) {
            return configured;
        }
        throw new Error("VITE_API_URL must be an absolute HTTP(S) URL.", { cause: error });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error("VITE_API_URL must use HTTP or HTTPS.");
    }
    if (isProduction && parsed.protocol !== "https:") {
        throw new Error("VITE_API_URL must use HTTPS in production.");
    }
    return configured;
}


/**
 * Join a trusted application route to the configured API origin.
 *
 * Absolute URLs are rejected so a compromised or accidentally user-controlled
 * endpoint cannot bypass the backend origin policy.
 */
export function buildApiUrl(baseUrl, endpoint) {
    if (typeof endpoint !== "string" || !endpoint.startsWith("/") || endpoint.startsWith("//")) {
        throw new Error("API endpoint must be a root-relative path.");
    }
    return `${baseUrl}${endpoint}`;
}
