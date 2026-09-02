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
