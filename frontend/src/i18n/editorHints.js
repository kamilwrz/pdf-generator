import { t } from './index.js';

// This registry recognises legacy editor-only metadata, never document content.
// It allows old saved drafts to display new hints without mutating their snapshot.
const keys = {
  // Recognise English metadata saved by older editor versions as well.
  "Skill category": "editor:hints.skillCategory",
  "Add content": "editor:hints.addContent",
  "Section content…": "editor:hints.sectionContent",
  "Name — value": "editor:hints.nameValue",
  "Content…": "editor:hints.content",
  "Text…": "editor:hints.text",
  "Language — level": "editor:hints.languageLevel",
  "firstname.lastname@example.com": "editor:hints.emailExample",
  // Compact guidance fits existing contact bands measured from Polish metadata.
  // Keep the older alias above so saved drafts receive the same display repair.
  "name@example.com": "editor:hints.emailExample",
  "City, country": "editor:hints.cityCountry",
  "Enter a job title…": "editor:hints.enterJobTitle",
  "Full name": "editor:hints.fullName",
  "Professional title": "editor:hints.jobTitle",
  "Write 2–3 sentences about your experience and career goal.": "editor:hints.summary",
  "Job title": "editor:hints.role",
  "Company name": "editor:hints.company",
  "City": "editor:hints.city",
  "MM YYYY – present": "editor:hints.currentPeriod",
  "Describe your main achievement or responsibility.": "editor:hints.achievement",
  "Subject or qualification": "editor:hints.degree",
  "University or school name": "editor:hints.school",
  "YYYY – YYYY": "editor:hints.years",
  "Specialisation, honours or relevant coursework.": "editor:hints.specialisation",
  "Skill": "editor:hints.skill",
  "Language": "editor:hints.language",
  "Level": "editor:hints.level",
  "Phone": "editor:hints.phone",
  "Location": "editor:hints.location",
  "Website": "editor:hints.website",

  "Kategoria umiejętności": "editor:hints.skillCategory",
  "Dodaj treść": "editor:hints.addContent",
  "Treść sekcji…": "editor:hints.sectionContent",
  "Nazwa — wartość": "editor:hints.nameValue",
  "Treść…": "editor:hints.content",
  "Tekst…": "editor:hints.text",
  "Język — poziom": "editor:hints.languageLevel",
  "imie.nazwisko@email.com": "editor:hints.emailExample",

  "Miasto, kraj": "editor:hints.cityCountry",
  "Wpisz stanowisko…": "editor:hints.enterJobTitle",
  "Imię i nazwisko": "editor:hints.fullName",
  "Tytuł zawodowy": "editor:hints.jobTitle",
  "Napisz 2–3 zdania o swoim doświadczeniu i celu zawodowym.": "editor:hints.summary",
  "Stanowisko": "editor:hints.role",
  "Nazwa firmy": "editor:hints.company",
  "Miasto": "editor:hints.city",
  "MM RRRR – obecnie": "editor:hints.currentPeriod",
  "Opisz najważniejsze osiągnięcie lub odpowiedzialność.": "editor:hints.achievement",
  "Kierunek lub dyplom": "editor:hints.degree",
  "Nazwa uczelni lub szkoły": "editor:hints.school",
  "RRRR – RRRR": "editor:hints.years",
  "Specjalizacja, wyróżnienia lub istotne zajęcia.": "editor:hints.specialisation",
  "Umiejętność": "editor:hints.skill",
  "Język": "editor:hints.language",
  "Poziom": "editor:hints.level",
  "Telefon": "editor:hints.phone",
  "Lokalizacja": "editor:hints.location",
  "Strona WWW": "editor:hints.website"
};
export function editorHint(value) {
  if (keys[value]) return t(keys[value]);
  return typeof value === "string" && value.includes(" · ") ? value.split(" · ").map(editorHint).join(" · ") : value;
}
