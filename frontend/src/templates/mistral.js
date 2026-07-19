// Mistral — a coastal editorial CV: sea-glass blue, warm paper, and an
// asymmetric information column. Designed for writers, researchers, and
// multidisciplinary professionals who want quiet distinction over ornament.
import { text, line, block, bulleted } from "./helpers";

const DEEP = "#173F4C";
const SEA = "#4D9AA6";
const FOAM = "#E8F0ED";
const PAPER = "#FBFAF5";
const INK = "#29363A";
const DRIFT = "#748184";
const SERIF = "Times-Roman";
const SANS = "Inter";

const bold = (element) => ({ ...element, bold: true });
const ital = (element) => ({ ...element, italic: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) =>
    ({ category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex });

const sideLabel = (label, top) => [
    tracked(bold(text(label, 8.5, SANS, SEA, 48, top, 2)), 1.45),
    line(48, top + 15, 104, 1, "#C7D7D4", 1),
];

const section = (label, top) => [
    line(188, top + 4, 5, 16, SEA, 2),
    tracked(bold(text(label, 10.5, SANS, DEEP, 204, top, 2)), 1.25),
    line(204, top + 22, 340, 0.75, "#D9E1DE", 1),
];

export const mistralTemplate = [
    // ── PAPER + HEADER FIELD ──────────────────────────────────────
    line(0, 0, 595, 842, PAPER, 0),
    line(0, 0, 595, 150, DEEP, 1),
    line(0, 150, 595, 7, SEA, 1),
    rect(48, 42, 88, 58, FOAM, 1, 2),
    tracked(block("MISTRAL", 48, 57, 88, 14, 8.5, 11, DEEP, SANS), 1.7),
    line(62, 80, 60, 1, SEA, 2),

    tracked(text("TOMASZ MORIN", 32, SERIF, "#FFFFFF", 188, 46, 2), 0.4),
    ital(text("Badacz, pisarz i myśliciel systemowy", 12.5, SANS, "#CBE3DF", 190, 91, 2)),
    text("Kraków · +48 600 111 222 · tomasz.morin@email.com", 9.2, SANS, "#B4D5D0", 190, 118, 2),

    // ── LEFT REFERENCE COLUMN ─────────────────────────────────────
    ...sideLabel("PROFIL", 198),
    block("Pracuję tam, gdzie spotykają się badania, język i systemy publiczne — tłumacząc trudne pytania w użyteczną, ludzką skalę pracy.", 48, 222, 104, 104, 9, 14, INK, SANS),

    ...sideLabel("PRAKTYKA", 364),
    block("Badania jakościowe\nKierownictwo redakcyjne\nProjektowanie polityk\nFacilitacja\nProjektowanie informacji", 48, 388, 104, 92, 8.8, 15, INK, SANS),

    ...sideLabel("JĘZYKI", 532),
    block("Polski — ojczysty\nAngielski — biegły\nWłoski — komunikatywny", 48, 556, 104, 54, 8.8, 15, INK, SANS),

    ...sideLabel("WYBRANE", 658),
    block("Nowa Europa\nRada Designu\nPublic Digital\nField Notes", 48, 682, 104, 70, 8.8, 15, INK, SANS),

    // ── MAIN NARRATIVE COLUMN ─────────────────────────────────────
    ...section("DOŚWIADCZENIE", 194),
    bold(text("Główny Badacz", 11.5, SANS, INK, 204, 230, 2)),
    text("Civic Lab  ·  Kraków  ·  2021 – obecnie", 9.2, SANS, DRIFT, 204, 247, 2),
    bulleted(block("• Poprowadził badania terenowe w 11 miastach, przeprojektowując dostęp do usług publicznych.\n• Przekształcił 380 wywiadów w krajowy projekt usług przyjęty przez trzy ministerstwa.\n• Zbudował praktykę badań partycypacyjnych dla 24-osobowego studia multidyscyplinarnego.", 204, 265, 340, 58, 10, 14, INK, SANS)),

    bold(text("Strateg Redakcyjny", 11.5, SANS, INK, 204, 350, 2)),
    text("North Star Review  ·  Warszawa  ·  2017 – 2021", 9.2, SANS, DRIFT, 204, 367, 2),
    bulleted(block("• Zlecał długie reportaże i badania dla publiczności 180 tys. czytelników.\n• Zaprojektował systemy redakcyjne skracające czas produkcji o 31% bez utraty jakości.", 204, 385, 340, 44, 10, 14, INK, SANS)),

    ...section("EDUKACJA", 466),
    bold(text("Magister Miast, Przestrzeni i Społeczeństwa — LSE", 10.8, SANS, INK, 204, 502, 2)),
    text("2015 – 2017  ·  wyróżnienie", 9.2, SANS, DRIFT, 204, 518, 2),
    bold(text("Licencjat Polityki i Historii Nowożytnej — Uniwersytet Warszawski", 10.8, SANS, INK, 204, 548, 2)),
    text("2012 – 2015  ·  z wyróżnieniem", 9.2, SANS, DRIFT, 204, 564, 2),

    ...section("NOTATKA", 610),
    block("Dobra praca zaczyna się od uwagi: na ludzi, na miejsce i na drobne sygnały, które ujawniają, co system naprawdę robi.", 204, 646, 340, 42, 11, 16, DEEP, SERIF),
    line(204, 716, 340, 1, SEA, 1),
    tracked(text("PORTFOLIO · TOMASZMORIN.PL", 9, SANS, DEEP, 204, 738, 2), 1.1),
];
