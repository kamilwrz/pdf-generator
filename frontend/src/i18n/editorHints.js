import { t } from './index.js';

// This registry recognises legacy editor-only metadata, never document content.
// It allows old saved drafts to display new hints without mutating their snapshot.
const keys = {
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
