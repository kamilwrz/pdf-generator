import test from "node:test";
import assert from "node:assert/strict";
import {
    saveGuestWizardDraft,
    loadGuestWizardDraft,
    clearGuestWizardDraft,
    hasGuestWizardDraft,
    guestWizardProfileHasContent,
    clampWizardStep,
} from "./guestWizardDraft.js";
import { BIO_CV_SUMMARY_STEP, createEmptyBioCvData } from "./bioCvData.js";

function fakeLocalStorage() {
    const store = new Map();
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
    };
}

test("saveGuestWizardDraft then loadGuestWizardDraft round-trips profile and step", () => {
    globalThis.localStorage = fakeLocalStorage();
    const profile = {
        ...createEmptyBioCvData(),
        name: "Anna Kowalska",
        title: "Product Manager",
    };

    saveGuestWizardDraft({ step: 2, profile, selectedTemplateId: "ledger" });
    const loaded = loadGuestWizardDraft();

    assert.equal(loaded.step, 2);
    assert.equal(loaded.profile.name, "Anna Kowalska");
    assert.equal(loaded.profile.title, "Product Manager");
    assert.equal(loaded.selectedTemplateId, "ledger");
    assert.ok(loaded.updatedAt > 0);
});

test("loadGuestWizardDraft returns null when nothing was saved or JSON is corrupt", () => {
    globalThis.localStorage = fakeLocalStorage();
    assert.equal(loadGuestWizardDraft(), null);

    globalThis.localStorage.setItem("cvstudio.guest.wizardDraft", "{not json");
    assert.equal(loadGuestWizardDraft(), null);
});

test("clearGuestWizardDraft removes the stored snapshot", () => {
    globalThis.localStorage = fakeLocalStorage();
    saveGuestWizardDraft({
        step: 1,
        profile: { ...createEmptyBioCvData(), name: "Anna" },
    });
    clearGuestWizardDraft();
    assert.equal(loadGuestWizardDraft(), null);
    assert.equal(hasGuestWizardDraft(), false);
});

test("hasGuestWizardDraft is true only when the draft has meaningful content", () => {
    globalThis.localStorage = fakeLocalStorage();
    assert.equal(hasGuestWizardDraft(), false);

    saveGuestWizardDraft({ step: 0, profile: createEmptyBioCvData() });
    assert.equal(hasGuestWizardDraft(), false);

    saveGuestWizardDraft({
        step: 0,
        profile: { ...createEmptyBioCvData(), name: "Anna" },
    });
    assert.equal(hasGuestWizardDraft(), true);
});

test("saveGuestWizardDraft refuses to overwrite a meaningful draft with an empty shell", () => {
    globalThis.localStorage = fakeLocalStorage();
    saveGuestWizardDraft({
        step: 2,
        profile: { ...createEmptyBioCvData(), name: "Anna Kowalska" },
        selectedTemplateId: "harbor",
    });

    saveGuestWizardDraft({ step: 0, profile: createEmptyBioCvData() });

    const loaded = loadGuestWizardDraft();
    assert.equal(loaded.profile.name, "Anna Kowalska");
    assert.equal(loaded.step, 2);
    assert.equal(loaded.selectedTemplateId, "harbor");
});

test("clearGuestWizardDraft still allows a later empty save after intentional reset", () => {
    globalThis.localStorage = fakeLocalStorage();
    saveGuestWizardDraft({
        step: 2,
        profile: { ...createEmptyBioCvData(), name: "Anna" },
    });
    clearGuestWizardDraft();
    saveGuestWizardDraft({ step: 0, profile: createEmptyBioCvData() });
    assert.equal(hasGuestWizardDraft(), false);
});

test("guestWizardProfileHasContent detects entered fields", () => {
    assert.equal(guestWizardProfileHasContent(createEmptyBioCvData()), false);
    assert.equal(
        guestWizardProfileHasContent({ ...createEmptyBioCvData(), email: "a@b.c" }),
        true,
    );
});

test("clampWizardStep keeps indices inside the current wizard range", () => {
    assert.equal(clampWizardStep(-1), 0);
    assert.equal(clampWizardStep(0), 0);
    assert.equal(clampWizardStep(BIO_CV_SUMMARY_STEP), BIO_CV_SUMMARY_STEP);
    assert.equal(clampWizardStep(99), BIO_CV_SUMMARY_STEP);
    assert.equal(clampWizardStep("2"), 2);
});
