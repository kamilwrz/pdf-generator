// Sterling — finance CV with an engraved share-certificate feel. The first
// template built around the OUTLINE RECTANGLE element: a double hairline frame
// around the page, a row of outlined KPI stat boxes under the header, and
// small outline-square section markers. Navy & steel blues over cool greys;
// Times-Roman display, Inter body. Centered header via align:"center"
// textareas (metric-exact on canvas + PDF, no eyeballed centering).
import { text, line, block, bulleted } from "./helpers";

const NAVY = "#1B2A41";   // display ink
const ACCENT = "#2E5E9E"; // steel blue
const STEEL = "#7C8CA0";  // grey-blue details
const GRAY = "#66707E";   // secondary text
const PALE = "#D9E0E9";   // hairlines
const BODY = "#33404F";   // body text
const S = "Times-Roman";
const I = "Inter";

const bold = (el) => ({ ...el, bold: true });
const centered = (el) => ({ ...el, align: "center" });
const spaced = (el, ls) => ({ ...el, letterSpacing: ls });

const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) =>
    ({ category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex });

// Section heading: outline-square marker + serif title + hairline to the frame.
const section = (title, y, hairlineFrom) => [
    rect(55, y + 2, 9, 9, ACCENT, 1.5, 2),
    bold(text(title, 11.5, S, NAVY, 72, y, 2)),
    line(hairlineFrom, y + 6, 540 - hairlineFrom, 1, PALE, 1),
];

// Outlined KPI stat box: figure (serif) over an uppercase label.
const kpi = (left, figure, label) => [
    rect(left, 160, 157, 52, STEEL, 1.2, 1),
    bold(centered(block(figure, left, 168, 157, 18, 15, 18, NAVY, S))),
    spaced(centered(block(label, left, 190, 157, 12, 7.5, 10, GRAY, I)), 1),
];

export const sterlingTemplate = [
    // ---- engraved double frame around the page ----
    rect(24, 24, 547, 794, STEEL, 1.5, 1),
    rect(29, 29, 537, 784, PALE, 1, 1),

    // ---- centered header ----
    bold(centered(block("JAKUB ZIELIŃSKI", 50, 56, 495, 36, 28, 34, NAVY, S))),
    spaced(centered(block("GŁÓWNY ANALITYK INWESTYCYJNY", 50, 96, 495, 18, 12, 16, ACCENT, I)), 2),
    centered(block("warszawa · +48 22 000 00 00 · jakub.zielinski@email.com", 50, 120, 495, 14, 9.5, 13, GRAY, I)),

    // ornament: accent bar flanked by two outline squares
    rect(255, 139, 8, 8, STEEL, 1, 1),
    line(271, 142, 53, 2, ACCENT, 1),
    rect(332, 139, 8, 8, STEEL, 1, 1),

    // ---- KPI strip (outline stat boxes — Sterling's signature) ----
    ...kpi(55,  "8+",    "LAT W ZARZĄDZANIU AKTYWAMI"),
    ...kpi(219, "2,4 mld zł", "PORTFEL POD DORADZTWEM"),
    ...kpi(383, "CFA",   "CHARTERHOLDER · 2020"),

    // ---- profile ----
    ...section("PROFIL", 238, 152),
    block(
        "Analityk inwestycyjny specjalizujący się w akcjach europejskich i instrumentach dłużnych. Buduję przekonanie na podstawie badań od pierwszych zasad i komunikuję je prosto — komitetom, klientom i regulatorom.",
        55, 258, 485, 48, 10.5, 15, BODY, I
    ),

    // ---- experience ----
    ...section("DOŚWIADCZENIE", 322, 186),
    bold(text("Główny Analityk Inwestycyjny — Hartwell Capital", 11, I, NAVY, 55, 344, 2)),
    text("2019 – obecnie · Warszawa", 9, I, GRAY, 55, 360, 2),
    bulleted(block(
        "• Główny analityk portfela akcji europejskich o wartości 640 mln zł; +310 bps względem benchmarku przez trzy lata.\n• Zbudował bibliotekę modeli DCF i scenariuszy używaną w czterech strategiach.\n• Prezentuje kwartalnie komitetowi inwestycyjnemu i 20 największym klientom.\n• Rozwija dwóch młodszych analityków; prowadzi program letnich analityków.",
        55, 376, 485, 62, 10, 14, BODY, I
    )),
    bold(text("Analityk Inwestycyjny — Berkeley & Marsh", 11, I, NAVY, 55, 450, 2)),
    text("2016 – 2019 · Warszawa", 9, I, GRAY, 55, 466, 2),
    bulleted(block(
        "• Pokrywał sektor przemysłowy i finansowy w indeksie WIG20.\n• Napisał ponad 40 raportów inicjacyjnych; 68% trafności prognoz 12-miesięcznych.\n• Zautomatyzował tygodniowy pakiet ryzyka, oszczędzając zespołowi jeden dzień tygodniowo.",
        55, 482, 485, 48, 10, 14, BODY, I
    )),
    bold(text("Młodszy Analityk — Crown Asset Management", 11, I, NAVY, 55, 542, 2)),
    text("2014 – 2016 · Kraków", 9, I, GRAY, 55, 558, 2),
    bulleted(block(
        "• Wspierał zespół multi-asset w atrybucji wyników.\n• Przebudował pipeline factsheetów funduszy w Pythonie.",
        55, 574, 485, 34, 10, 14, BODY, I
    )),

    // ---- education ----
    ...section("EDUKACJA", 622, 182),
    bold(text("Magister Finansów — SGH w Warszawie", 10.5, I, NAVY, 55, 644, 2)),
    text("2013 – 2014 · wyróżnienie", 9, I, GRAY, 55, 660, 2),
    bold(text("Licencjat Ekonomii — Uniwersytet Warszawski", 10.5, I, NAVY, 55, 680, 2)),
    text("2009 – 2013 · z wyróżnieniem", 9, I, GRAY, 55, 696, 2),

    // ---- skills ----
    ...section("UMIEJĘTNOŚCI", 724, 140),
    block(
        "Wycena i modelowanie DCF · Analityka portfelowa · Instrumenty dłużne · Python i SQL · MSSF · Raportowanie dla klientów · Bloomberg / FactSet",
        55, 746, 485, 30, 10, 15, BODY, I
    ),

    // ---- footer ----
    spaced(centered(block("REFERENCJE DOSTĘPNE NA ŻYCZENIE", 50, 788, 495, 12, 8, 11, STEEL, I)), 1.5),
];
