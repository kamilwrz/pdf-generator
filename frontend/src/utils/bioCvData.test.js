import assert from "node:assert/strict";
import test from "node:test";
import {
    applyBioCvDraftUpdate,
    buildBioCvPayload,
    canJumpToBioCvSummary,
    createEmptyBioCvData,
    getBioCvSummaryJumpError,
    LANGUAGE_CEFR_LEVELS,
    normalizeBioCvData,
    normalizeLanguageLevel,
    parseList,
    parseSkills,
    validateBioCvStep,
} from "./bioCvData.js";

test("normalizeLanguageLevel maps CEFR codes and free-text notes", () => {
    assert.deepEqual(LANGUAGE_CEFR_LEVELS, ["A1", "A2", "B1", "B2", "C1", "C2"]);
    assert.equal(normalizeLanguageLevel("c1"), "C1");
    assert.equal(normalizeLanguageLevel("C1 / biegły"), "C1");
    assert.equal(normalizeLanguageLevel("biegły"), "");
    assert.equal(normalizeLanguageLevel(""), "");
});

test("normalizeBioCvData keeps only CEFR language levels", () => {
    const result = normalizeBioCvData({
        languages: [
            { name: "Polski", level: "c2" },
            { name: "Niemiecki", proficiency: "C1 / zaawansowany" },
            { name: "Hiszpański", level: "konwersacyjny" },
        ],
    });
    assert.deepEqual(result.languages, [
        { name: "Polski", level: "C2" },
        { name: "Niemiecki", level: "C1" },
        { name: "Hiszpański", level: "" },
    ]);
});

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

test("preserves an editor-authored custom grid through profile normalization", () => {
    const result = buildBioCvPayload({
        ...createEmptyBioCvData(),
        name: "Anna Kowalska",
        custom_sections: [{
            title: "Linki",
            items: ["Portfolio", "GitHub"],
            kind: "other",
            placement: "after_skills",
            layout: "GRID",
        }],
    });

    assert.equal(result.custom_sections[0].layout, "grid");
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

    const incompleteExtras = normalizeBioCvData({
        name: "Anna",
        custom_sections: [{ title: "Projekty", items: [], kind: "projects", placement: "after_skills" }],
    });
    assert.equal(
        validateBioCvStep(3, incompleteExtras),
        "Sekcja własna potrzebuje tytułu i co najmniej jednej pozycji.",
    );
    assert.equal(validateBioCvStep(3, { ...createEmptyBioCvData(), name: "Anna" }), null);
});

test("allows jumping to summary when required personal fields are filled", () => {
    assert.equal(canJumpToBioCvSummary(createEmptyBioCvData()), false);
    assert.equal(getBioCvSummaryJumpError(createEmptyBioCvData()), "Podaj imię i nazwisko.");

    const ready = {
        ...createEmptyBioCvData(),
        name: "Anna Kowalska",
        email: "anna@example.com",
        experience: [{ company: "Kompoza", title: "PM", city: "", period: "", bullets: [] }],
    };
    assert.equal(canJumpToBioCvSummary(ready), true);
    assert.equal(getBioCvSummaryJumpError(ready), null);

    const blocked = {
        ...ready,
        experience: [{ company: "Kompoza", title: "", city: "", period: "", bullets: [] }],
    };
    assert.equal(canJumpToBioCvSummary(blocked), false);
    assert.match(getBioCvSummaryJumpError(blocked), /stanowisk/);
});

test("parses and deduplicates tag-list input", () => {
    assert.deepEqual(parseList("Figma, figma\nAnaliza danych\n"), ["Figma", "Analiza danych"]);
});

test("parseSkills keeps Category: lines intact and expands skill groups", () => {
    assert.deepEqual(
        parseSkills("Bezpieczeństwo: Wireshark, Nmap\nPython\n"),
        ["Bezpieczeństwo: Wireshark, Nmap", "Python"],
    );
    assert.deepEqual(
        parseSkills([
            { category: "Przemysł / OT", items: ["PLC", "RFID"] },
            "SQL",
        ]),
        ["Przemysł / OT: PLC, RFID", "SQL"],
    );
});

test("preserves spaces while a controlled wizard field is being edited", () => {
    const current = { ...createEmptyBioCvData(), name: "Anna" };
    const edited = applyBioCvDraftUpdate(current, { ...current, name: "Anna Kowalska " });

    assert.equal(edited.name, "Anna Kowalska ");
    assert.equal(buildBioCvPayload(edited).name, "Anna Kowalska");
});

test("keeps LinkedIn, GitHub, and website contact links in the wizard payload", () => {
    const result = buildBioCvPayload({
        ...createEmptyBioCvData(),
        name: "Anna",
        linkedin: " linkedin.com/in/anna ",
        github: "github.com/anna",
        website: "https://anna.dev",
        link: "https://legacy.example",
    });
    assert.equal(result.linkedin, "linkedin.com/in/anna");
    assert.equal(result.github, "github.com/anna");
    assert.equal(result.website, "https://anna.dev");
});
