import { block, bulleted, line, text } from "./helpers";

// Guest-mode demo CV: a realistic, fully fictional single-column document a
// visitor can click around with zero account and zero backend cost. Uses the
// same element-spec shape and helpers as every real starter template, so it
// flows through the exact same handleLoadTemplate/materializeElementSpecs
// path — no special-cased rendering anywhere in the canvas. Persona matches
// the shared Julia Bernat starter used across template mockups.
const INK = "#1F2933";
const MUTED = "#5A6472";
const ACCENT = "#2E5E86";
const RULE = "#C7D2DA";
const SANS = "Inter";

export const demoCvTemplate = [
    text("JULIA BERNAT", 24, SANS, INK, 52, 48, 2),
    text("ANALITYCZKA AML I COMPLIANCE", 11, SANS, ACCENT, 52, 80, 2),
    text("julia.bernat@email.com  ·  +48 512 340 780  ·  Warszawa", 9, SANS, MUTED, 52, 100, 2),

    line(52, 128, 490, 1, RULE, 1),

    text("PODSUMOWANIE", 9, SANS, ACCENT, 52, 146, 2),
    block(
        "Analityczka AML łącząca wiedzę regulacyjną z dyscypliną wykonania. Prowadzę monitoring transakcji i raporty SAR, dbając o jakość analiz oraz terminowość decyzji bez utraty dokładności.",
        52, 164, 490, 44, 10, 15, INK, SANS,
    ),

    text("DOŚWIADCZENIE", 9, SANS, ACCENT, 52, 232, 2),
    line(52, 248, 490, 1, RULE, 1),
    { ...text("Analityczka AML  /  Crestmont Advisory", 11, SANS, INK, 52, 264, 2), bold: true },
    text("2022 – obecnie  ·  Warszawa", 9, SANS, MUTED, 52, 281, 2),
    bulleted(block(
        "• Prowadzi monitoring transakcji i analizę alertów AML dla klientów firmowych.\n• Realizuje CDD/EDD oraz przygotowuje dokumentację zgodną z wymogami FIU.\n• Wspiera zespół L2 przy eskalacjach spraw o podwyższonym ryzyku AML.",
        52, 300, 490, 56, 9.6, 13.5, INK, SANS,
    )),
    { ...text("Analityczka KYC  /  Baltic Trust Bank", 11, SANS, INK, 52, 380, 2), bold: true },
    text("2019 – 2022  ·  Warszawa", 9, SANS, MUTED, 52, 397, 2),
    bulleted(block(
        "• Weryfikowała profile klientów oraz screening PEP, sanctions i media.\n• Utrzymywała jakość raportów SAR oraz terminowość odpowiedzi na RFI.",
        52, 416, 490, 40, 9.6, 13.5, INK, SANS,
    )),
    { ...text("Specjalistka Obsługi Klienta  /  Helios Services", 11, SANS, INK, 52, 480, 2), bold: true },
    text("2016 – 2019  ·  Kraków", 9, SANS, MUTED, 52, 497, 2),
    bulleted(block(
        "• Obsługiwała zamówienia i weryfikację danych klientów na rynkach DACH.",
        52, 516, 490, 24, 9.6, 13.5, INK, SANS,
    )),

    text("WYKSZTAŁCENIE", 9, SANS, ACCENT, 52, 564, 2),
    line(52, 580, 490, 1, RULE, 1),
    { ...text("Licencjat Prawa", 10.5, SANS, INK, 52, 596, 2), bold: true },
    text("UW Warszawa  ·  Warszawa", 9.5, SANS, INK, 52, 613, 2),
    text("2012 – 2016", 9, SANS, MUTED, 52, 629, 2),

    text("UMIEJĘTNOŚCI", 9, SANS, ACCENT, 52, 662, 2),
    line(52, 678, 490, 1, RULE, 1),
    block(
        "AML/KYC  ·  Monitoring  ·  CDD/EDD  ·  Raporty SAR  ·  Analiza transakcyjna",
        52, 694, 490, 28, 9.3, 13, INK, SANS,
    ),
];
