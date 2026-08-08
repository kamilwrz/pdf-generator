/**
 * Client-side persistence for the bio/CV wizard while the visitor has no
 * account. Mirrors `guestDocument.js` for the canvas: guests keep edits in
 * localStorage across wizard close and template fill so they can generate
 * another look without retyping. Drafts are removed on explicit clear
 * ("Zacznij od nowa" / clear draft), after a successful adopt into the
 * account draft (`claimGuestWizardDraft.js`), or when the account already
 * has its own non-empty draft (guest snapshot is dropped so stores do not mix).
 *
 * Authenticated users continue to use GET/PUT/DELETE `/ai/bio_cv_draft`
 * instead of this key once the guest snapshot has been adopted or discarded.
 */

import { BIO_CV_SUMMARY_STEP, normalizeBioCvData } from "./bioCvData.js";

const STORAGE_KEY = "cvstudio.guest.wizardDraft";
export const GUEST_WIZARD_DRAFT_VERSION = 1;

/**
 * @typedef {{
 *   version: number,
 *   step: number,
 *   profile: object,
 *   selectedTemplateId?: string|null,
 *   updatedAt: number,
 * }} GuestWizardDraft
 */

/**
 * Clamp a stored step index into the current wizard range.
 * Older drafts may still carry a 7-step index after the UI merged to 5 steps.
 *
 * @param {unknown} step
 * @returns {number}
 */
export function clampWizardStep(step) {
    const numeric = Number(step);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return Math.min(Math.floor(numeric), BIO_CV_SUMMARY_STEP);
}

/**
 * True when the profile has any user-entered content worth keeping.
 *
 * @param {object|null|undefined} profile
 * @returns {boolean}
 */
export function guestWizardProfileHasContent(profile) {
    if (!profile) return false;
    if (String(profile.name || "").trim()) return true;
    if (String(profile.title || "").trim()) return true;
    if (String(profile.email || "").trim()) return true;
    if (String(profile.linkedin || "").trim()) return true;
    if (String(profile.github || "").trim()) return true;
    if (String(profile.website || "").trim()) return true;
    if (String(profile.summary || "").trim()) return true;
    if (profile.experience?.length) return true;
    if (profile.education?.length) return true;
    if (profile.skills?.length) return true;
    if (profile.languages?.some((entry) => entry?.name)) return true;
    if (profile.custom_sections?.some((section) => section?.title || section?.items?.length)) {
        return true;
    }
    return false;
}

/**
 * Persist a wizard snapshot for guests.
 *
 * Refuses to overwrite a meaningful stored draft with an empty step-0 shell.
 * That guards against resume-screen state (or a close race) accidentally
 * wiping localStorage. Intentional resets must call `clearGuestWizardDraft`
 * first.
 *
 * @param {{
 *   step?: number,
 *   profile: object,
 *   selectedTemplateId?: string|null,
 * }} draft
 */
export function saveGuestWizardDraft(draft) {
    try {
        const step = clampWizardStep(draft?.step);
        const profile = normalizeBioCvData(draft?.profile);
        // Never let an empty in-memory shell replace a real draft. Callers that
        // mean to discard must use `clearGuestWizardDraft` explicitly.
        if (!guestWizardProfileHasContent(profile) && step === 0) {
            const existing = loadGuestWizardDraft();
            if (existing && (
                guestWizardProfileHasContent(existing.profile) || existing.step > 0
            )) {
                return;
            }
        }
        const snapshot = {
            version: GUEST_WIZARD_DRAFT_VERSION,
            step,
            profile,
            selectedTemplateId: draft?.selectedTemplateId ?? null,
            updatedAt: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
        // Storage can be full or unavailable; the in-memory wizard state still
        // works for the current tab.
    }
}

/** @returns {GuestWizardDraft|null} */
export function loadGuestWizardDraft() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        return {
            version: Number(parsed.version) || GUEST_WIZARD_DRAFT_VERSION,
            step: clampWizardStep(parsed.step),
            profile: normalizeBioCvData(parsed.profile),
            selectedTemplateId: parsed.selectedTemplateId ?? null,
            updatedAt: Number(parsed.updatedAt) || 0,
        };
    } catch {
        return null;
    }
}

export function clearGuestWizardDraft() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // No-op: the next save overwrites if removal fails.
    }
}

/**
 * True when a stored draft has any user-entered content worth offering to
 * resume (not only an empty shell written by an accidental autosave).
 */
export function hasGuestWizardDraft() {
    const draft = loadGuestWizardDraft();
    if (!draft) return false;
    if (guestWizardProfileHasContent(draft.profile)) return true;
    return draft.step > 0;
}
