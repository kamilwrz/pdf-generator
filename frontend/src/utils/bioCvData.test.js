import assert from "node:assert/strict";
import test from "node:test";
import {
    applyBioCvDraftUpdate,
    buildBioCvPayload,
    createEmptyBioCvData,
    normalizeBioCvData,
    parseList,
    validateBioCvStep,
} from "./bioCvData.js";

test("builds a clean manual CV payload with structured entries", () => {
    const data = {
        ...createEmptyBioCvData(),
        name: " Anna Kowalska ",
        address: "Warszawa",
        experience: [{
            employer: "Kompoza",
            position: "Product Manager",
            city: "Warszawa",
            period: "2024 – obecnie",
            description: "Strategia\nBadania",
        }],
        education: [{
            school: "Uniwersytet Warszawski",
            city: "Warszawa",
            degree: "Magister zarządzania",
            period: "2017 – 2022",
            description: "Specjalizacja: innowacje",
        }],
        languages: [{ language: "Angielski", proficiency: "C1" }],
        custom_sections: [{
            title: "Certyfikaty",
            items: ["PSM I", "PSM I"],
            kind: "certifications",
            placement: "after_experience",
        }],
    };

    const result = buildBioCvPayload(data);

    assert.equal(result.name, "Anna Kowalska");
    assert.equal(result.location, "Warszawa");
    assert.deepEqual(result.experience[0].bullets, ["Strategia", "Badania"]);
    assert.equal(result.education[0].city, "Warszawa");
    assert.deepEqual(result.languages, [{ name: "Angielski", level: "C1" }]);
    assert.deepEqual(result.custom_sections[0].items, ["PSM I"]);
});

test("validates only completed repeater cards and email syntax", () => {
    const incompleteExperience = normalizeBioCvData({
        name: "Anna",
        experience: [{ company: "Kompoza", title: "" }],
    });
    assert.equal(
        validateBioCvStep(1, incompleteExperience),
        "Przy każdym stanowisku podaj pracodawcę i nazwę stanowiska.",
    );
    assert.equal(validateBioCvStep(0, { ...createEmptyBioCvData(), name: "Anna", email: "bad" }), "Podaj poprawny adres e-mail.");
    assert.equal(validateBioCvStep(0, { ...createEmptyBioCvData(), name: "Anna", email: "anna@example.com" }), null);
});

test("parses and deduplicates tag-list input", () => {
    assert.deepEqual(parseList("Figma, figma\nAnaliza danych\n"), ["Figma", "Analiza danych"]);
});

test("preserves spaces while a controlled wizard field is being edited", () => {
    const current = { ...createEmptyBioCvData(), name: "Anna" };
    const edited = applyBioCvDraftUpdate(current, { ...current, name: "Anna Kowalska " });

    assert.equal(edited.name, "Anna Kowalska ");
    assert.equal(buildBioCvPayload(edited).name, "Anna Kowalska");
});
