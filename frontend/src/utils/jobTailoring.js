/**
 * Validate the local job-offer form before the request reaches the server.
 * The backend repeats URL and network validation because browser checks are a
 * usability aid, not a security boundary.
 */
export function validateJobOfferInput(jobOfferUrl, fallbackDescription) {
    const url = String(jobOfferUrl || "").trim();
    const description = String(fallbackDescription || "").trim();
    if (!url && !description) return "Wklej link do oferty lub jej opis.";
    if (!url) return "";
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:"
            ? ""
            : "Podaj pełny link zaczynający się od https://.";
    } catch {
        return "Podaj pełny link zaczynający się od https://.";
    }
}

/** Translate the stable backend status enum into concise Polish UI copy. */
export function requirementStatusLabel(status) {
    if (status === "matched") return "Potwierdzone";
    if (status === "partial") return "Częściowo";
    return "Brak dowodu";
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
