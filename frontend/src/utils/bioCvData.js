export const BIO_CV_STEPS = [
    "Dane osobowe",
    "Doświadczenie",
    "Wykształcenie",
    "Umiejętności",
    "Języki",
    "Sekcje własne",
    "Podsumowanie",
];

const DEFAULT_LABELS = {
    summary: "PODSUMOWANIE ZAWODOWE",
    experience: "DOŚWIADCZENIE ZAWODOWE",
    education: "WYKSZTAŁCENIE",
    skills: "UMIEJĘTNOŚCI",
};

const clean = (value) => String(value || "").trim();

function uniqueStrings(values) {
    const seen = new Set();
    return values.reduce((result, value) => {
        const item = clean(value);
        const key = item.toLocaleLowerCase();
        if (item && !seen.has(key)) {
            result.push(item);
            seen.add(key);
        }
        return result;
    }, []);
}

export function createEmptyBioCvData() {
    return {
        name: "",
        title: "",
        address: "",
        location: "",
        phone: "",
        email: "",
        summary: "",
        experience: [],
        education: [],
        skills: [],
        languages: [],
        custom_sections: [],
        language: "Polish",
        labels: { ...DEFAULT_LABELS },
        extra_sections: [],
    };
}

export function createExperience() {
    return { company: "", city: "", period: "", title: "", bullets: [] };
}

export function createEducation() {
    return { school: "", city: "", period: "", degree: "", description: "" };
}

export function createLanguage() {
    return { name: "", level: "" };
}

export function createCustomSection() {
    return { title: "", items: [], kind: "other", placement: "after_skills" };
}

// Keep raw input while the user is typing. Normalization intentionally trims
// values and must run only when restoring, saving, validating, or generating.
export function applyBioCvDraftUpdate(current, updater) {
    return typeof updater === "function" ? updater(current) : updater;
}

export function parseList(value) {
    if (Array.isArray(value)) return uniqueStrings(value);
    return uniqueStrings(String(value || "").replace(/\r\n/g, "\n").split(/[\n,]/));
}

export function normalizeBioCvData(value) {
    const source = value && typeof value === "object" ? value : {};
    const fallback = createEmptyBioCvData();
    const sourceLanguages = Array.isArray(source.languages) ? source.languages : [];
    const sourceCustom = Array.isArray(source.custom_sections) ? source.custom_sections : [];

    return {
        ...fallback,
        ...source,
        name: clean(source.name),
        title: clean(source.title || source.professional_title),
        address: clean(source.address || source.location),
        location: clean(source.address || source.location),
        phone: clean(source.phone),
        email: clean(source.email),
        summary: clean(source.summary),
        experience: (Array.isArray(source.experience) ? source.experience : [])
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => ({
                company: clean(entry.company || entry.employer),
                city: clean(entry.city),
                period: clean(entry.period || entry.date),
                title: clean(entry.title || entry.position),
                bullets: parseList(entry.bullets?.length ? entry.bullets : entry.description),
            })),
        education: (Array.isArray(source.education) ? source.education : [])
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => ({
                school: clean(entry.school || entry.university),
                city: clean(entry.city),
                period: clean(entry.period || entry.date),
                degree: clean(entry.degree || entry.diploma),
                description: clean(entry.description || ""),
            })),
        skills: parseList(source.skills),
        languages: sourceLanguages
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => ({
                name: clean(entry.name || entry.language),
                level: clean(entry.level || entry.proficiency),
            })),
        custom_sections: sourceCustom
            .filter((section) => section && typeof section === "object")
            .map((section) => ({
                title: clean(section.title),
                items: parseList(section.items || section.data),
                kind: ["languages", "certifications", "interests", "other"].includes(section.kind)
                    ? section.kind
                    : "other",
                placement: section.placement === "after_experience"
                    ? "after_experience"
                    : "after_skills",
            })),
        language: clean(source.language) || "Polish",
        labels: { ...DEFAULT_LABELS, ...(source.labels || {}) },
    };
}

function hasValues(entry) {
    return Object.values(entry).some((value) => (
        Array.isArray(value) ? value.length > 0 : clean(value)
    ));
}

export function validateBioCvStep(step, data) {
    const profile = normalizeBioCvData(data);
    if (step === 0) {
        if (!profile.name) return "Podaj imię i nazwisko.";
        if (profile.email && !profile.email.includes("@")) return "Podaj poprawny adres e-mail.";
    }
    if (step === 1) {
        const invalid = profile.experience.find((entry) => hasValues(entry) && (!entry.company || !entry.title));
        if (invalid) return "Przy każdym stanowisku podaj pracodawcę i nazwę stanowiska.";
    }
    if (step === 2) {
        const invalid = profile.education.find((entry) => hasValues(entry) && (!entry.school || !entry.degree));
        if (invalid) return "Przy każdej edukacji podaj uczelnię i dyplom lub kierunek.";
    }
    if (step === 4) {
        const invalid = profile.languages.find((entry) => entry.level && !entry.name);
        if (invalid) return "Wpisz język albo usuń pusty wiersz.";
    }
    if (step === 5) {
        const invalid = profile.custom_sections.find((section) => hasValues(section) && (!section.title || !section.items.length));
        if (invalid) return "Sekcja własna potrzebuje tytułu i co najmniej jednej pozycji.";
    }
    return null;
}

export function buildBioCvPayload(data) {
    const profile = normalizeBioCvData(data);
    return {
        ...profile,
        experience: profile.experience.filter(hasValues),
        education: profile.education.filter(hasValues),
        languages: profile.languages.filter((entry) => entry.name),
        custom_sections: profile.custom_sections.filter((section) => section.title && section.items.length),
    };
}
