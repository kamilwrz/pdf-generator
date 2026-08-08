/**
 * Contact / social link helpers for the bio wizard and canvas fill payloads.
 *
 * First-class fields: linkedin, github, website. Display labels stay short so
 * masthead contact rows do not overflow A4 templates.
 */

export const CONTACT_LINK_KINDS = Object.freeze(["linkedin", "github", "website"]);

export const CONTACT_LINK_OPTIONS = Object.freeze([
    { kind: "github", label: "GitHub" },
    { kind: "website", label: "Strona WWW" },
]);

const clean = (value) => String(value || "").trim().replace(/\s+/g, " ");

/**
 * @param {unknown} value
 * @returns {string}
 */
export function cleanContactUrl(value) {
    return clean(value);
}

/**
 * @param {unknown} value
 * @returns {"linkedin"|"github"|"website"|null}
 */
export function categorizeContactUrl(value) {
    const raw = cleanContactUrl(value);
    if (!raw) return null;
    const lowered = raw.toLowerCase();
    if (lowered.includes("linkedin.com")) return "linkedin";
    if (lowered.includes("github.com")) return "github";
    return "website";
}

/**
 * @param {"linkedin"|"github"|"website"} kind
 * @param {unknown} value
 * @param {{ limit?: number }} [options]
 */
export function contactDisplayLabel(kind, value, options = {}) {
    const limit = options.limit ?? 36;
    const raw = cleanContactUrl(value);
    if (!raw) return "";

    const withoutScheme = raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    let label = withoutScheme;

    if (kind === "linkedin") {
        if (!loweredIncludes(raw, "linkedin.com")) {
            label = `linkedin.com/in/${raw.replace(/^@/, "")}`;
        } else {
            label = withoutScheme;
        }
    } else if (kind === "github") {
        if (!loweredIncludes(raw, "github.com")) {
            label = `github.com/${raw.replace(/^@/, "")}`;
        } else {
            label = withoutScheme;
        }
    }

    label = label.replace(/\/+$/, "");
    if (label.length <= limit) return label;
    return `${label.slice(0, Math.max(limit - 1, 1)).replace(/[…/]+$/, "")}…`;
}

function loweredIncludes(value, needle) {
    return String(value || "").toLowerCase().includes(needle);
}

/**
 * Optional link slots the wizard can still add (GitHub / website only).
 * LinkedIn is always shown as a dedicated field.
 *
 * @param {{ github?: string, website?: string }} profile
 */
export function availableExtraContactKinds(profile) {
    return CONTACT_LINK_OPTIONS.filter((option) => !cleanContactUrl(profile?.[option.kind]));
}
