import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildApiUrl, resolveApiBaseUrl } from "./appConfig.js";

describe("API configuration", () => {
    it("uses the local proxy when development has no explicit URL", () => {
        assert.equal(resolveApiBaseUrl({ MODE: "development" }), "/api");
    });

    it("requires an explicit HTTPS URL for production", () => {
        assert.throws(() => resolveApiBaseUrl({ PROD: true }), /required/);
        assert.throws(
            () => resolveApiBaseUrl({ PROD: true, VITE_API_URL: "http://api.example.test" }),
            /HTTPS/,
        );
        assert.equal(
            resolveApiBaseUrl({ PROD: true, VITE_API_URL: "https://api.example.test/" }),
            "https://api.example.test",
        );
    });

    it("never accepts a caller-controlled absolute endpoint", () => {
        assert.equal(buildApiUrl("/api", "/auth/token"), "/api/auth/token");
        assert.throws(() => buildApiUrl("/api", "https://evil.example/token"), /root-relative/);
        assert.throws(() => buildApiUrl("/api", "//evil.example/token"), /root-relative/);
    });
});
