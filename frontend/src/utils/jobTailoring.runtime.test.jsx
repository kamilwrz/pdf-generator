import { describe, expect, it } from "vitest";
import {
    canvasEvidenceElementIds,
    isIndirectMatch,
    relatedCanvasEvidenceElementIds,
    requirementIndirectLabel,
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

    it("recognises an indirect (transferable) match only with related evidence", () => {
        expect(isIndirectMatch({ match_status: "missing", related_evidence_refs: ["canvas:summary"] })).toBe(true);
        expect(isIndirectMatch({ match_status: "partial", related_evidence_refs: ["note:1"] })).toBe(true);
        // A direct match, or a partial/missing requirement without related
        // evidence, is not an indirect match.
        expect(isIndirectMatch({ match_status: "matched", related_evidence_refs: ["canvas:summary"] })).toBe(false);
        expect(isIndirectMatch({ match_status: "missing", related_evidence_refs: [] })).toBe(false);
        expect(isIndirectMatch({ match_status: "missing" })).toBe(false);
        expect(isIndirectMatch(null)).toBe(false);
    });

    it("maps related canvas evidence for an indirect match and ignores non-canvas refs", () => {
        expect(relatedCanvasEvidenceElementIds({
            match_status: "missing",
            related_evidence_refs: ["canvas:experience:0", "note:1", "cv:/summary", "canvas:experience:0"],
        })).toEqual(["experience:0"]);
        // Direct matches expose their evidence through the direct mapper, not here.
        expect(relatedCanvasEvidenceElementIds({
            match_status: "matched",
            related_evidence_refs: ["canvas:summary"],
        })).toEqual([]);
    });

    it("labels the indirect match in Polish", () => {
        expect(requirementIndirectLabel()).toBe("Dopasowanie pośrednie");
    });
});
