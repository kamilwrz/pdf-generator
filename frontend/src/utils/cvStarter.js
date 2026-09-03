/**
 * Pure adapter between the one-screen CV setup and the existing deterministic
 * template generator. Marker values force the generator to materialize empty
 * editor fields; they are removed before the elements reach the canvas.
 */

export const STARTER_TEMPLATE_ID = "meridian";

export const STARTER_CONTACTS = Object.freeze([
  { key: "phone", label: "Telefon", defaultSelected: true, placeholder: "+48 000 000 000" },
  { key: "email", label: "E-mail", defaultSelected: true, placeholder: "imie.nazwisko@email.com" },
  { key: "location", label: "Lokalizacja", defaultSelected: true, placeholder: "Miasto, kraj" },
  { key: "linkedin", label: "LinkedIn", defaultSelected: false, placeholder: "linkedin.com/in/profil" },
  { key: "github", label: "GitHub", defaultSelected: false, placeholder: "github.com/profil" },
  { key: "website", label: "Strona WWW", defaultSelected: false, placeholder: "twojastrona.pl" },
]);

export const STARTER_SECTIONS = Object.freeze([
  { key: "summary", label: "Podsumowanie", defaultSelected: true },
  { key: "experience", label: "Doświadczenie", defaultSelected: true },
  { key: "education", label: "Wykształcenie", defaultSelected: true },
  { key: "skills", label: "Umiejętności", defaultSelected: true },
  { key: "languages", label: "Języki", defaultSelected: false },
  { key: "projects", label: "Projekty", defaultSelected: false, customKind: "projects" },
  { key: "certifications", label: "Certyfikaty", defaultSelected: false, customKind: "certifications" },
  { key: "courses", label: "Kursy", defaultSelected: false, customKind: "other" },
  { key: "volunteering", label: "Wolontariat", defaultSelected: false, customKind: "volunteering" },
  { key: "publications", label: "Publikacje", defaultSelected: false, customKind: "publications" },
  { key: "interests", label: "Zainteresowania", defaultSelected: false, customKind: "interests" },
]);

export const PHOTO_TEMPLATE_IDS = new Set(["monument", "slate", "atrium", "linden", "vellum"]);

const MARKER_PREFIX = "CVSTART";
const MARKER_VALUES = Object.freeze({
  // The fill endpoint validates non-empty e-mail values before the template
  // generator runs. Keep this sentinel syntactically valid while retaining a
  // reserved `.invalid` domain that can never point at a real mailbox.
  email: "cvstart-email@example.invalid",
});
const marker = (id) => MARKER_VALUES[id] ?? `__${MARKER_PREFIX}_${id.toUpperCase()}__`;

const FIELD_DEFINITIONS = Object.freeze({
  name: { path: ["name"], placeholder: "Imię i nazwisko" },
  title: { path: ["title"], placeholder: "Tytuł zawodowy" },
  phone: { path: ["phone"], placeholder: "+48 000 000 000" },
  email: { path: ["email"], placeholder: "imie.nazwisko@email.com" },
  location: { path: ["location"], placeholder: "Miasto, kraj" },
  linkedin: { path: ["linkedin"], placeholder: "linkedin.com/in/profil" },
  github: { path: ["github"], placeholder: "github.com/profil" },
  website: { path: ["website"], placeholder: "twojastrona.pl" },
  summary: { path: ["summary"], placeholder: "Napisz 2–3 zdania o swoim doświadczeniu i celu zawodowym." },
  experience_title: { path: ["experience", 0, "title"], placeholder: "Stanowisko" },
  experience_company: { path: ["experience", 0, "company"], placeholder: "Nazwa firmy" },
  experience_city: { path: ["experience", 0, "city"], placeholder: "Miasto" },
  experience_period: { path: ["experience", 0, "period"], placeholder: "MM RRRR – obecnie" },
  experience_bullet: { path: ["experience", 0, "bullets", 0], placeholder: "Opisz najważniejsze osiągnięcie lub odpowiedzialność." },
  education_degree: { path: ["education", 0, "degree"], placeholder: "Kierunek lub dyplom" },
  education_school: { path: ["education", 0, "school"], placeholder: "Nazwa uczelni lub szkoły" },
  education_city: { path: ["education", 0, "city"], placeholder: "Miasto" },
  education_period: { path: ["education", 0, "period"], placeholder: "RRRR – RRRR" },
  education_description: { path: ["education", 0, "description"], placeholder: "Specjalizacja, wyróżnienia lub istotne zajęcia." },
  skill: { path: ["skills", 0], placeholder: "Umiejętność" },
  language_name: { path: ["languages", 0, "name"], placeholder: "Język" },
  language_level: { path: ["languages", 0, "level"], placeholder: "Poziom" },
});

/**
 * Canonical field guidance shared by the empty-CV wizard and structural editor.
 *
 * Consumers must render these strings as placeholder metadata, never as saved
 * CV content. Keeping one exported source prevents newly inserted sections from
 * drifting away from the guidance shown by “Utwórz nowe CV”.
 */
export const STARTER_FIELD_PLACEHOLDERS = Object.freeze(
  Object.fromEntries(
    Object.entries(FIELD_DEFINITIONS).map(([key, definition]) => [
      key,
      definition.placeholder,
    ]),
  ),
);

function selectedKeys(items) {
  return (items || []).filter((item) => item?.selected !== false).map((item) => item.key);
}

/** Build the setup state used by the modal and its reset action. */
export function createDefaultStarterConfig() {
  return {
    templateId: STARTER_TEMPLATE_ID,
    includeTitle: true,
    includePhoto: false,
    contacts: STARTER_CONTACTS.map((item) => ({ key: item.key, selected: item.defaultSelected })),
    sections: STARTER_SECTIONS.map((item) => ({
      key: item.key,
      label: item.label,
      selected: item.defaultSelected,
      custom: false,
    })),
  };
}

function bindingValue(id) {
  return marker(id);
}

function customSectionMarker(key, index) {
  return {
    title: key,
    items: [marker(`custom_${index}`)],
    kind: "other",
    placement: "after_skills",
  };
}

/**
 * Convert setup choices into generator data plus the empty semantic profile
 * retained by the editor. The generator profile is temporary and must never
 * be persisted because it contains marker tokens.
 */
export function buildStarterDocument(config) {
  const contacts = new Set(selectedKeys(config?.contacts));
  const selectedSections = (config?.sections || []).filter((item) => item.selected !== false);
  const sectionKeys = new Set(selectedSections.map((item) => item.key));
  const customSections = selectedSections.filter((item) => item.custom);
  const knownCustomSections = selectedSections.filter((item) => {
    const definition = STARTER_SECTIONS.find((candidate) => candidate.key === item.key);
    return definition?.customKind;
  });

  const emptyProfile = {
    name: "",
    title: "",
    address: "",
    location: "",
    phone: "",
    email: "",
    linkedin: "",
    github: "",
    website: "",
    summary: "",
    experience: sectionKeys.has("experience")
      ? [{ company: "", city: "", period: "", title: "", bullets: [""] }]
      : [],
    education: sectionKeys.has("education")
      ? [{ school: "", city: "", period: "", degree: "", description: "" }]
      : [],
    skills: sectionKeys.has("skills") ? [""] : [],
    languages: sectionKeys.has("languages") ? [{ name: "", level: "" }] : [],
    custom_sections: [
      ...knownCustomSections.map((item) => {
        const definition = STARTER_SECTIONS.find((candidate) => candidate.key === item.key);
        return { title: item.label, items: [""], kind: definition.customKind, placement: "after_skills" };
      }),
      ...customSections.map((item) => ({ title: item.label, items: [""], kind: "other", placement: "after_skills" })),
    ],
    language: "Polish",
    labels: {
      summary: "PODSUMOWANIE ZAWODOWE",
      experience: "DOŚWIADCZENIE ZAWODOWE",
      education: "WYKSZTAŁCENIE",
      skills: "UMIEJĘTNOŚCI",
    },
    starter_structure: {
      version: 1,
      contacts: [...contacts],
      sections: selectedSections.map((item) => ({ key: item.key, title: item.label, custom: Boolean(item.custom) })),
      includeTitle: config?.includeTitle !== false,
      includePhoto: Boolean(config?.includePhoto && PHOTO_TEMPLATE_IDS.has(config?.templateId)),
    },
  };

  const fillProfile = {
    ...emptyProfile,
    name: bindingValue("name"),
    title: config?.includeTitle === false ? "" : bindingValue("title"),
    phone: contacts.has("phone") ? bindingValue("phone") : "",
    email: contacts.has("email") ? bindingValue("email") : "",
    location: contacts.has("location") ? bindingValue("location") : "",
    address: contacts.has("location") ? bindingValue("location") : "",
    linkedin: contacts.has("linkedin") ? bindingValue("linkedin") : "",
    github: contacts.has("github") ? bindingValue("github") : "",
    website: contacts.has("website") ? bindingValue("website") : "",
    summary: sectionKeys.has("summary") ? bindingValue("summary") : "",
    experience: sectionKeys.has("experience") ? [{
      title: bindingValue("experience_title"),
      company: bindingValue("experience_company"),
      city: bindingValue("experience_city"),
      period: bindingValue("experience_period"),
      bullets: [bindingValue("experience_bullet")],
    }] : [],
    education: sectionKeys.has("education") ? [{
      degree: bindingValue("education_degree"),
      school: bindingValue("education_school"),
      city: bindingValue("education_city"),
      period: bindingValue("education_period"),
      description: bindingValue("education_description"),
    }] : [],
    skills: sectionKeys.has("skills") ? [bindingValue("skill")] : [],
    languages: sectionKeys.has("languages")
      ? [{ name: bindingValue("language_name"), level: bindingValue("language_level") }]
      : [],
    custom_sections: [
      ...knownCustomSections.map((item, index) => {
        const definition = STARTER_SECTIONS.find((candidate) => candidate.key === item.key);
        return { ...customSectionMarker(item.label, index), kind: definition.customKind };
      }),
      ...customSections.map((item, index) => customSectionMarker(item.label, knownCustomSections.length + index)),
    ],
  };

  return { cvData: emptyProfile, fillProfile };
}

/** Restore marker values for still-empty starter fields before changing template. */
export function prepareStarterProfileForTemplate(cvData) {
  if (!cvData?.starter_structure) return cvData;
  const draft = JSON.parse(JSON.stringify(cvData));
  for (const [id, definition] of Object.entries(FIELD_DEFINITIONS)) {
    let cursor = draft;
    const path = definition.path;
    for (let index = 0; index < path.length - 1; index += 1) {
      if (cursor?.[path[index]] == null) {
        cursor = null;
        break;
      }
      cursor = cursor[path[index]];
    }
    const last = path[path.length - 1];
    if (cursor && String(cursor[last] ?? "").trim() === "") cursor[last] = marker(id);
  }
  (draft.custom_sections || []).forEach((section, index) => {
    if (!Array.isArray(section.items) || section.items.every((item) => !String(item || "").trim())) {
      section.items = [marker(`custom_${index}`)];
    }
  });
  return draft;
}

function markerBindings(content) {
  const bindings = [];
  for (const [id, definition] of Object.entries(FIELD_DEFINITIONS)) {
    if (content.includes(marker(id))) bindings.push({ ...definition, marker: marker(id) });
  }
  const customPattern = new RegExp(`__${MARKER_PREFIX}_CUSTOM_(\\d+)__`, "g");
  for (const match of content.matchAll(customPattern)) {
    const index = Number.parseInt(match[1], 10);
    bindings.push({ path: ["custom_sections", index, "items", 0], placeholder: "Dodaj treść", marker: match[0] });
  }
  return bindings;
}

/** Remove generator markers and attach persistent editor binding metadata. */
export function finalizeStarterElements(elements) {
  return (elements || []).map((element) => {
    if (!["text", "textarea"].includes(element?.category)) return { ...element };
    const content = String(element.content || "");
    const bindings = markerBindings(content);
    if (bindings.length === 0) return { ...element };
    let cleaned = content;
    bindings.forEach((binding) => { cleaned = cleaned.replaceAll(binding.marker, ""); });
    cleaned = cleaned.replace(/^\s*[·|–—,-]+\s*|\s*[·|–—,-]+\s*$/g, "").trim();
    const placeholder = bindings.map((binding) => binding.placeholder).join(" · ");
    return {
      ...element,
      content: cleaned,
      placeholder,
      starterPlaceholder: !cleaned,
      cvDataBindings: bindings.map(({ path, placeholder: bindingPlaceholder }) => ({
        path,
        placeholder: bindingPlaceholder,
      })),
    };
  });
}

/** Whether an element still represents untouched starter guidance. */
export function isEmptyStarterElement(element) {
  return Boolean(element?.starterPlaceholder && !String(element?.content || "").trim());
}
