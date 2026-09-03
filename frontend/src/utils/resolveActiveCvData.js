/**
 * Resolve structured CV profile data for Topbar "Zmień szablon".
 *
 * `activeCvData` is set in-memory after a successful wizard/import fill, but
 * that React state is lost on register/login navigation. After a guest-canvas
 * claim we rebuild it from (in order):
 * 1. `cvData` embedded in the guest document snapshot,
 * 2. the guest wizard draft (`cvstudio.guest.wizardDraft`),
 * 3. the authenticated `/ai/bio_cv_draft` (Demo answers adopted on login).
 */

import { ENDPOINTS } from "../services/api.js";
import { buildBioCvPayload, normalizeBioCvData } from "./bioCvData.js";
import {
    guestWizardProfileHasContent,
    loadGuestWizardDraft,
} from "./guestWizardDraft.js";

/**
 * @param {object|null|undefined} candidate
 * @returns {object|null}
 */
export function normalizeActiveCvData(candidate) {
    if (!candidate || typeof candidate !== "object") return null;
    // Starter profiles are intentionally empty until the author edits A4. Keep
    // their structure verbatim; legacy wizard validation would otherwise drop
    // the profile during a guest-document claim or page refresh.
    if (candidate.starter_structure?.version === 1) {
        return JSON.parse(JSON.stringify(candidate));
    }
    const profile = normalizeBioCvData(candidate);
    if (!guestWizardProfileHasContent(profile)) return null;
    return buildBioCvPayload(profile);
}

/**
 * @param {{
 *   guestCvData?: object|null,
 *   api?: { httpRequest: Function }|null,
 * }} options
 * @returns {Promise<object|null>}
 */
export async function resolveActiveCvData(options = {}) {
    const fromGuestDoc = normalizeActiveCvData(options.guestCvData);
    if (fromGuestDoc) return fromGuestDoc;

    const wizardDraft = loadGuestWizardDraft();
    const fromWizard = normalizeActiveCvData(wizardDraft?.profile);
    if (fromWizard) return fromWizard;

    if (!options.api?.httpRequest) return null;

    try {
        const response = await options.api.httpRequest(
            ENDPOINTS.AI.BIO_CV_DRAFT,
            "GET",
            null,
            "Nie udało się pobrać szkicu.",
        );
        return normalizeActiveCvData(response?.cv_data);
    } catch {
        return null;
    }
}
