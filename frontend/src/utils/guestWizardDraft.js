/**
 * Client-side persistence for the bio/CV wizard while the visitor has no
 * account. Mirrors `guestDocument.js` for the canvas: guests keep edits in
 * localStorage until they register or finish a template fill.
 *
 * Authenticated users continue to use GET/PUT/DELETE `/ai/bio_cv_draft`
 * instead of this key.
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
 * @param {{
 *   step?: number,
 *   profile: object,
 *   selectedTemplateId?: string|null,
 * }} draft
 */
export function saveGuestWizardDraft(draft) {
    try {
        const snapshot = {
            version: GUEST_WIZARD_DRAFT_VERSION,
            step: clampWizardStep(draft?.step),
            profile: normalizeBioCvData(draft?.profile),
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
    const profile = draft.profile;
    if (!profile) return false;
    if (String(profile.name || "").trim()) return true;
    if (String(profile.title || "").trim()) return true;
    if (String(profile.email || "").trim()) return true;
    if (String(profile.summary || "").trim()) return true;
    if (profile.experience?.length) return true;
    if (profile.education?.length) return true;
    if (profile.skills?.length) return true;
    if (profile.languages?.some((entry) => entry?.name)) return true;
    if (profile.custom_sections?.some((section) => section?.title || section?.items?.length)) {
        return true;
    }
    return draft.step > 0;
}
