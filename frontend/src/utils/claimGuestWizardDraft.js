/**
 * Promote a demo/guest bio-wizard draft into the authenticated account draft.
 *
 * Guest wizard data lives in `localStorage` (`cvstudio.guest.wizardDraft`).
 * After register/login the account uses `GET/PUT /ai/bio_cv_draft`. Without
 * this bridge, opening the wizard while logged in used to call
 * `clearGuestWizardDraft()` and load an empty server draft — dropping the
 * Demo funnel work. Plan choice (Free today; more plans later) does not
 * affect the transfer: the draft API is plan-agnostic.
 *
 * Ownership rule (same spirit as canvas `ClaimGuestDocumentModal`):
 * - If the account draft is empty and the browser has a meaningful guest
 *   wizard draft, upload it and clear localStorage.
 * - If the account already has content, never overwrite it; clear the guest
 *   snapshot so it cannot leak into a later session on this browser.
 */

import { ENDPOINTS } from "../services/api.js";
import { buildBioCvPayload, normalizeBioCvData } from "./bioCvData.js";
import {
    clearGuestWizardDraft,
    guestWizardProfileHasContent,
    hasGuestWizardDraft,
    loadGuestWizardDraft,
} from "./guestWizardDraft.js";

/**
 * @typedef {{
 *   adopted: boolean,
 *   profile: object|null,
 *   step: number,
 *   selectedTemplateId: string|null,
 *   guestCleared: boolean,
 *   serverChecked: boolean,
 * }} ClaimGuestWizardResult
 */

/**
 * @param {{
 *   httpRequest: (
 *     endpoint: string,
 *     method: string,
 *     body?: string|null,
 *     errorMessage?: string,
 *   ) => Promise<any>,
 * }} api
 * @returns {Promise<ClaimGuestWizardResult>}
 */
export async function adoptGuestWizardDraftForAccount(api) {
    const emptyResult = {
        adopted: false,
        profile: null,
        step: 0,
        selectedTemplateId: null,
        guestCleared: false,
        serverChecked: false,
    };

    if (!hasGuestWizardDraft()) {
        return emptyResult;
    }

    const guest = loadGuestWizardDraft();
    if (!guest || !guestWizardProfileHasContent(guest.profile)) {
        // Step-only / empty shells are not worth promoting.
        clearGuestWizardDraft();
        return { ...emptyResult, guestCleared: true };
    }

    const serverResponse = await api.httpRequest(
        ENDPOINTS.AI.BIO_CV_DRAFT,
        "GET",
        null,
        "Nie udało się pobrać szkicu.",
    );
    const serverProfile = normalizeBioCvData(serverResponse?.cv_data);

    if (guestWizardProfileHasContent(serverProfile)) {
        // Keep the account draft. Drop the browser guest copy so a later
        // login on this device cannot mix unrelated demo data into PUT paths.
        clearGuestWizardDraft();
        return {
            adopted: false,
            profile: serverProfile,
            step: 0,
            selectedTemplateId: null,
            guestCleared: true,
            serverChecked: true,
        };
    }

    const payload = buildBioCvPayload(guest.profile);
    await api.httpRequest(
        ENDPOINTS.AI.BIO_CV_DRAFT,
        "PUT",
        JSON.stringify({ cv_data: payload }),
        "Nie udało się przenieść szkicu kreatora na konto.",
    );
    clearGuestWizardDraft();

    return {
        adopted: true,
        profile: normalizeBioCvData(payload),
        step: guest.step ?? 0,
        selectedTemplateId: guest.selectedTemplateId ?? null,
        guestCleared: true,
        serverChecked: true,
    };
}
