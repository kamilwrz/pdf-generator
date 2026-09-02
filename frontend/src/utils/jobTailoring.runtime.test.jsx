import { describe, expect, it } from "vitest";
import {
    canvasEvidenceElementIds,
    requirementStatusLabel,
    validateJobOfferInput,
} from "./jobTailoring";

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

    it("maps matched and partial canvas evidence without duplicates", () => {
        expect(canvasEvidenceElementIds({
            match_status: "matched",
            evidence_refs: [
                "canvas:experience:citibank",
                "note:0",
                "canvas:experience:citibank",
                "canvas:summary",
                "canvas:",
            ],
        })).toEqual(["experience:citibank", "summary"]);

        expect(canvasEvidenceElementIds({
            match_status: "partial",
            evidence_refs: ["canvas:skills"],
        })).toEqual(["skills"]);
    });

    it("does not expose missing, note-only, or malformed evidence as canvas targets", () => {
        expect(canvasEvidenceElementIds({
            match_status: "missing",
            evidence_refs: ["canvas:experience"],
        })).toEqual([]);
        expect(canvasEvidenceElementIds({
            match_status: "matched",
            evidence_refs: ["note:0", null, "element-without-prefix"],
        })).toEqual([]);
        expect(canvasEvidenceElementIds({
            match_status: "matched",
            evidence_refs: "canvas:not-an-array",
        })).toEqual([]);
        expect(canvasEvidenceElementIds(null)).toEqual([]);
    });
});
