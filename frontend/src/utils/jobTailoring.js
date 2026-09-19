import { t as uiText } from "../i18n/index.js";
/**
 * Validate the local job-offer form before the request reaches the server.
 * The backend repeats URL and network validation because browser checks are a
 * usability aid, not a security boundary.
 */
export function validateJobOfferInput(jobOfferUrl, fallbackDescription) {
    const url = String(jobOfferUrl || "").trim();
    const description = String(fallbackDescription || "").trim();
    if (!url && !description) return uiText("editor:jobTailoring.pasteAJobLinkOrDescription");
    if (!url) return "";
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:"
            ? ""
            : uiText("editor:jobTailoring.enterACompleteLinkStartingWithHttps");
    } catch {
        return uiText("editor:jobTailoring.enterACompleteLinkStartingWithHttps");
    }
}

/** Translate the stable backend status enum into concise Polish UI copy. */
export function requirementStatusLabel(status) {
    if (status === "matched") return uiText("interview:interviewFlow.confirmed");
    if (status === "partial") return uiText("editor:jobTailoring.partial");
    return uiText("editor:jobTailoring.noEvidence");
}

/**
 * Whether a requirement is supported only indirectly (transferable evidence).
 *
 * The server marks these as `partial`/`missing` (a transfer never becomes a
 * direct match) while attaching validated `related_evidence_refs` and a
 * one-sentence `transfer_note` naming the residual gap. The label lets the
 * report present related experience without implying the requirement is met.
 *
 * @param {object|null|undefined} requirement - Normalised job requirement.
 * @returns {boolean}
 */
export function isIndirectMatch(requirement) {
    return Boolean(requirement
        && ["partial", "missing"].includes(requirement.match_status)
        && Array.isArray(requirement.related_evidence_refs)
        && requirement.related_evidence_refs.length > 0);
}

/** Concise label for a transferable/indirect match badge. */
export function requirementIndirectLabel() {
    return uiText("editor:jobTailoring.indirect");
}

/**
 * Canvas element ids for the transferable evidence of an indirect match.
 *
 * Mirrors `canvasEvidenceElementIds` but reads `related_evidence_refs`, so the
 * report can highlight the related CV text even though the requirement is not a
 * direct match. Non-canvas references (notes, profile paths) have no visual
 * target and are ignored.
 *
 * @param {object|null|undefined} requirement - Normalised job requirement.
 * @returns {string[]} Unique canvas element ids in source order.
 */
export function relatedCanvasEvidenceElementIds(requirement) {
    if (!isIndirectMatch(requirement)) return [];
    const ids = [];
    const seen = new Set();
    for (const rawReference of requirement.related_evidence_refs) {
        const reference = String(rawReference || "");
        if (!reference.startsWith("canvas:")) continue;
        const elementId = reference.slice("canvas:".length);
        if (!elementId || seen.has(elementId)) continue;
        seen.add(elementId);
        ids.push(elementId);
    }
    return ids;
}

/**
 * Return the stable canvas element ids referenced as evidence for a requirement.
 *
 * The server has already validated the references against the document snapshot
 * used for the analysis. This client-side mapper deliberately ignores `note:*`
 * references because candidate notes do not have a visual target on the CV.
 * Current-document membership is checked by the assistant immediately before it
 * sends the ids to the canvas overlay, which also makes stale references harmless.
 *
 * @param {object|null|undefined} requirement - Normalised job requirement from the API.
 * @returns {string[]} Unique canvas element ids in source order.
 */
export function canvasEvidenceElementIds(requirement) {
    if (!requirement || !["matched", "partial"].includes(requirement.match_status)) {
        return [];
    }

    const ids = [];
    const seen = new Set();
    const references = Array.isArray(requirement.evidence_refs)
        ? requirement.evidence_refs
        : [];
    for (const rawReference of references) {
        const reference = String(rawReference || "");
        if (!reference.startsWith("canvas:")) continue;

        // Slice only the known prefix because stable element ids may themselves
        // contain colons; splitting would silently point at the wrong element.
        const elementId = reference.slice("canvas:".length);
        if (!elementId || seen.has(elementId)) continue;
        seen.add(elementId);
        ids.push(elementId);
    }
    return ids;
}
