import test from "node:test";
import assert from "node:assert/strict";
import { adoptGuestWizardDraftForAccount } from "./claimGuestWizardDraft.js";
import {
    clearGuestWizardDraft,
    hasGuestWizardDraft,
    saveGuestWizardDraft,
} from "./guestWizardDraft.js";
import { createEmptyBioCvData } from "./bioCvData.js";

function fakeLocalStorage() {
    const store = new Map();
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
    };
}

function createApiMock({ getCvData = {}, putImpl } = {}) {
    const calls = [];
    return {
        calls,
        httpRequest: async (endpoint, method, body) => {
            calls.push({ endpoint, method, body });
            if (method === "GET") {
                return { cv_data: getCvData, updated_at: null };
            }
            if (method === "PUT") {
                if (putImpl) return putImpl(body);
                return { cv_data: JSON.parse(body).cv_data, updated_at: "now" };
            }
            throw new Error(`Unexpected ${method} ${endpoint}`);
        },
    };
}

test("adoptGuestWizardDraftForAccount uploads guest draft when account is empty", async () => {
    globalThis.localStorage = fakeLocalStorage();
    saveGuestWizardDraft({
        step: 3,
        profile: {
            ...createEmptyBioCvData(),
            name: "Anna Kowalska",
            title: "Analyst",
        },
        selectedTemplateId: "harbor",
    });

    const api = createApiMock({ getCvData: createEmptyBioCvData() });
    const result = await adoptGuestWizardDraftForAccount(api);

    assert.equal(result.adopted, true);
    assert.equal(result.profile.name, "Anna Kowalska");
    assert.equal(result.step, 3);
    assert.equal(result.selectedTemplateId, "harbor");
    assert.equal(hasGuestWizardDraft(), false);
    assert.equal(api.calls.some((call) => call.method === "PUT"), true);
});

test("adoptGuestWizardDraftForAccount never overwrites a non-empty account draft", async () => {
    globalThis.localStorage = fakeLocalStorage();
    saveGuestWizardDraft({
        step: 2,
        profile: { ...createEmptyBioCvData(), name: "Guest Person" },
    });

    const api = createApiMock({
        getCvData: { ...createEmptyBioCvData(), name: "Account Person" },
    });
    const result = await adoptGuestWizardDraftForAccount(api);

    assert.equal(result.adopted, false);
    assert.equal(result.guestCleared, true);
    assert.equal(hasGuestWizardDraft(), false);
    assert.equal(api.calls.some((call) => call.method === "PUT"), false);
});

test("adoptGuestWizardDraftForAccount is a no-op without a guest draft", async () => {
    globalThis.localStorage = fakeLocalStorage();
    clearGuestWizardDraft();
    const api = createApiMock();
    const result = await adoptGuestWizardDraftForAccount(api);
    assert.equal(result.adopted, false);
    assert.equal(api.calls.length, 0);
});
