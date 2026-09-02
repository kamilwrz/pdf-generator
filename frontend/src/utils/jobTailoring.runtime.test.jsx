import { describe, expect, it } from "vitest";
import { requirementStatusLabel, validateJobOfferInput } from "./jobTailoring";

describe("job tailoring form", () => {
    it("accepts an HTTPS URL or a manual fallback description", () => {
        expect(validateJobOfferInput("https://example.com/jobs/123", "")).toBe("");
        expect(validateJobOfferInput("", "Wymagamy Python i SQL.")).toBe("");
    });

    it("rejects empty, malformed, and non-HTTPS links", () => {
        expect(validateJobOfferInput("", "")).toContain("link");
        expect(validateJobOfferInput("example.com/job", "")).toContain("https://");
        expect(validateJobOfferInput("http://example.com/job", "")).toContain("https://");
    });

    it("renders stable Polish requirement statuses", () => {
        expect(requirementStatusLabel("matched")).toBe("Potwierdzone");
        expect(requirementStatusLabel("partial")).toBe("Częściowo");
        expect(requirementStatusLabel("missing")).toBe("Brak dowodu");
    });
});
