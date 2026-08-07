import { block, bulleted, line, text } from "./helpers";

// Guest-mode demo CV: a realistic, fully fictional single-column document a
// visitor can click around with zero account and zero backend cost. Uses the
// same element-spec shape and helpers as every real starter template
// (frontend/src/templates/ledger.js is the closest structural reference), so
// it flows through the exact same handleLoadTemplate/materializeElementSpecs
// path — no special-cased rendering anywhere in the canvas.
const INK = "#1F2933";
const MUTED = "#5A6472";
const ACCENT = "#2E5E86";
const RULE = "#C7D2DA";
const SANS = "Inter";

export const demoCvTemplate = [
    text("ANNA KOWALSKA", 24, SANS, INK, 52, 48, 2),
    text("MENEDŻERKA PRODUKTU", 11, SANS, ACCENT, 52, 80, 2),
    text("anna.kowalska@email.com  ·  +48 600 000 000  ·  Warszawa", 9, SANS, MUTED, 52, 100, 2),

    line(52, 128, 490, 1, RULE, 1),

    text("PODSUMOWANIE", 9, SANS, ACCENT, 52, 146, 2),
    block(
        "Menedżerka produktu z 6-letnim doświadczeniem w tworzeniu narzędzi B2B. Łączę badania użytkowników z pracą zespołów inżynieryjnych, żeby dowozić funkcje, które realnie skracają czas pracy klientów.",
        52, 164, 490, 44, 10, 15, INK, SANS,
    ),

    text("DOŚWIADCZENIE", 9, SANS, ACCENT, 52, 232, 2),
    line(52, 248, 490, 1, RULE, 1),
    { ...text("Senior Product Manager  /  Nordic Software", 11, SANS, INK, 52, 264, 2), bold: true },
    text("2022 – obecnie  ·  Warszawa", 9, SANS, MUTED, 52, 281, 2),
    bulleted(block(
        "• Wprowadziła nowy moduł raportowania, który zwiększył retencję klientów enterprise o 14%.\n• Zbudowała proces odkrywania produktowego łączący wywiady z klientami i dane z telemetrii.\n• Poprowadziła zespół 5 inżynierów przez migrację na nową architekturę mikroserwisów.",
        52, 300, 490, 56, 9.6, 13.5, INK, SANS,
    )),
    { ...text("Product Manager  /  Baltic Apps", 11, SANS, INK, 52, 380, 2), bold: true },
    text("2019 – 2022  ·  Gdańsk", 9, SANS, MUTED, 52, 397, 2),
    bulleted(block(
        "• Odpowiadała za roadmapę aplikacji mobilnej z ponad 200 tys. aktywnych użytkowników.\n• Wprowadziła cykliczne testy A/B, które podniosły konwersję rejestracji o 9%.",
        52, 416, 490, 40, 9.6, 13.5, INK, SANS,
    )),

    text("WYKSZTAŁCENIE", 9, SANS, ACCENT, 52, 480, 2),
    line(52, 496, 490, 1, RULE, 1),
    { ...text("Magister Zarządzania", 10.5, SANS, INK, 52, 512, 2), bold: true },
    text("Uniwersytet Warszawski  ·  Warszawa", 9.5, SANS, INK, 52, 529, 2),
    text("2015 – 2019", 9, SANS, MUTED, 52, 545, 2),

    text("UMIEJĘTNOŚCI", 9, SANS, ACCENT, 52, 578, 2),
    line(52, 594, 490, 1, RULE, 1),
    block(
        "Discovery produktowy  ·  Roadmapping  ·  SQL  ·  Figma  ·  A/B testing  ·  Praca z zespołami inżynieryjnymi",
        52, 610, 490, 28, 9.3, 13, INK, SANS,
    ),
];
