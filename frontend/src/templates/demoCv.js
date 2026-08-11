import { block, bulleted, line, text } from "./helpers";

// Guest-mode demo CV: a realistic, fully fictional single-column document a
// visitor can click around with zero account and zero backend cost. Uses the
// same element-spec shape and helpers as every real starter template, so it
// flows through the exact same handleLoadTemplate/materializeElementSpecs
// path — no special-cased rendering anywhere in the canvas. Persona matches
// the shared Jan Kowalski starter used across template mockups.
const INK = "#1F2933";
const MUTED = "#5A6472";
const ACCENT = "#2E5E86";
const RULE = "#C7D2DA";
const SANS = "Inter";

export const demoCvTemplate = [
    text("JAN KOWALSKI", 24, SANS, INK, 52, 48, 2),
    text("DYREKTOR STRATEGII I ROZWOJU", 11, SANS, ACCENT, 52, 80, 2),
    text("jan.kowalski@email.com  ·  +48 600 000 000  ·  Warszawa", 9, SANS, MUTED, 52, 100, 2),

    line(52, 128, 490, 1, RULE, 1),

    text("PODSUMOWANIE", 9, SANS, ACCENT, 52, 146, 2),
    block(
        "Lider strategii łączący perspektywę biznesową z dyscypliną wykonania. Buduję zespoły, które podejmują czytelne decyzje i konsekwentnie dowożą mierzalne rezultaty bez utraty jakości relacji.",
        52, 164, 490, 44, 10, 15, INK, SANS,
    ),

    text("DOŚWIADCZENIE", 9, SANS, ACCENT, 52, 232, 2),
    line(52, 248, 490, 1, RULE, 1),
    { ...text("Dyrektor Strategii  /  Northbridge Partners", 11, SANS, INK, 52, 264, 2), bold: true },
    text("2021 – obecnie  ·  Warszawa", 9, SANS, MUTED, 52, 281, 2),
    bulleted(block(
        "• Zaprojektował model wzrostu łączący cele finansowe z inicjatywami produktowymi.\n• Uporządkował rytm decyzji zarządu oraz raportowanie strategiczne.\n• Prowadzi mentoring liderów odpowiedzialnych za kluczowe programy.",
        52, 300, 490, 56, 9.6, 13.5, INK, SANS,
    )),
    { ...text("Menedżer Rozwoju  /  Meridian Group", 11, SANS, INK, 52, 380, 2), bold: true },
    text("2016 – 2021  ·  Kraków", 9, SANS, MUTED, 52, 397, 2),
    bulleted(block(
        "• Rozwinął portfel projektów ekspansji na rynkach europejskich.\n• Wprowadził standardy współpracy między sprzedażą, produktem i finansami.",
        52, 416, 490, 40, 9.6, 13.5, INK, SANS,
    )),
    { ...text("Konsultant Strategiczny  /  Alpine Consulting", 11, SANS, INK, 52, 480, 2), bold: true },
    text("2013 – 2016  ·  Kraków", 9, SANS, MUTED, 52, 497, 2),
    bulleted(block(
        "• Prowadził projekty doradcze dla klientów z sektora finansowego i przemysłowego.",
        52, 516, 490, 24, 9.6, 13.5, INK, SANS,
    )),

    text("WYKSZTAŁCENIE", 9, SANS, ACCENT, 52, 564, 2),
    line(52, 580, 490, 1, RULE, 1),
    { ...text("Magister Zarządzania", 10.5, SANS, INK, 52, 596, 2), bold: true },
    text("SGH Warszawa  ·  Warszawa", 9.5, SANS, INK, 52, 613, 2),
    text("2011 – 2016", 9, SANS, MUTED, 52, 629, 2),

    text("UMIEJĘTNOŚCI", 9, SANS, ACCENT, 52, 662, 2),
    line(52, 678, 490, 1, RULE, 1),
    block(
        "Strategia  ·  Leadership  ·  P&L  ·  Negocjacje  ·  Transformacja organizacyjna",
        52, 694, 490, 28, 9.3, 13, INK, SANS,
    ),
];
