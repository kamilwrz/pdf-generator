import test from "node:test";
import assert from "node:assert/strict";
import {
    normalizeActiveCvData,
    resolveActiveCvData,
} from "./resolveActiveCvData.js";
import { saveGuestWizardDraft, clearGuestWizardDraft } from "./guestWizardDraft.js";
import { createEmptyBioCvData } from "./bioCvData.js";

function fakeLocalStorage() {
    const store = new Map();
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
    };
}

test("normalizeActiveCvData returns null for empty profiles", () => {
    assert.equal(normalizeActiveCvData(null), null);
    assert.equal(normalizeActiveCvData(createEmptyBioCvData()), null);
});

test("normalizeActiveCvData keeps a filled profile payload", () => {
    const result = normalizeActiveCvData({
        ...createEmptyBioCvData(),
        name: "Anna",
        title: "PM",
    });
    assert.equal(result.name, "Anna");
    assert.equal(result.title, "PM");
});

test("resolveActiveCvData prefers guest document cvData over wizard draft", async () => {
    globalThis.localStorage = fakeLocalStorage();
    saveGuestWizardDraft({
        step: 2,
        profile: { ...createEmptyBioCvData(), name: "From Wizard" },
    });

    const result = await resolveActiveCvData({
        guestCvData: { ...createEmptyBioCvData(), name: "From Guest Doc" },
    });

    assert.equal(result.name, "From Guest Doc");
});

test("resolveActiveCvData falls back to wizard draft then bio API", async () => {
    globalThis.localStorage = fakeLocalStorage();
    clearGuestWizardDraft();

    let result = await resolveActiveCvData({ guestCvData: null });
    assert.equal(result, null);

    saveGuestWizardDraft({
        step: 1,
        profile: { ...createEmptyBioCvData(), name: "Wizard Anna" },
    });
    result = await resolveActiveCvData({ guestCvData: null });
    assert.equal(result.name, "Wizard Anna");

    clearGuestWizardDraft();
    result = await resolveActiveCvData({
        guestCvData: null,
        api: {
            httpRequest: async () => ({
                cv_data: { ...createEmptyBioCvData(), name: "Account Anna" },
            }),
        },
    });
    assert.equal(result.name, "Account Anna");
});
