import { block, bulleted, line, text } from "./helpers";

// Raven — topbar dark theme: a raised masthead band over a fully dark page,
// single column, cool teal accents. No sidebar or theme label is rendered.
const BODY_BG = "#12161C";
const BAND_BG = "#181D25";
const TEAL = "#3FBFA6";
const INK = "#F2F5F4";
const MUTED = "#8B98A1";
const BODY = "#C9D2D6";
const RULE = "#2A3038";
const SANS = "Inter";
const SERIF = "Times-Roman";

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);

export const ravenTemplate = [
    { ...line(0, 0, 595, 842, BODY_BG, 0), fixedToPage: true },
    line(0, 0, 595, 170, BAND_BG, 1),
    line(0, 170, 595, 3, TEAL, 2),
    line(52, 36, 5, 99, TEAL, 2),

    bold(text("Michał Sikorski", 30, SERIF, INK, 76, 43, 3)),
    tracked(text("PARTNER ZARZĄDZAJĄCY", 9.5, SANS, TEAL, 78, 86, 3), 1.65),
    text("michal.sikorski@email.com  ·  +48 600 000 000  ·  Warszawa", 8.7, SANS, MUTED, 78, 119, 3),

    { ...rect(425, 34, 72, 72, TEAL, 1.2, 3), id: "raven-frame-one" },
    { ...rect(455, 63, 78, 78, "#4C5760", 1, 3), id: "raven-frame-two" },
    { ...rect(482, 39, 12, 12, INK, 1, 3), id: "raven-node" },
    line(497, 45, 18, 1, TEAL, 2),
    rect(526, 205, 16, 16, TEAL, 1.2, 2),
    tracked(text("PROFIL", 8.7, SANS, TEAL, 76, 207, 2), 1.55),
    line(76, 226, 466, 1, RULE, 1),
    block(
        "Doradzam zarządom w decyzjach, które łączą strategię, ryzyko i wykonanie. Prowadzę zespoły przez złożone transformacje w sposób spokojny i przejrzysty.",
        76, 243, 466, 45, 10.2, 15, BODY, SANS
    ),

    rect(526, 317, 16, 16, TEAL, 1.2, 2),
    tracked(text("DOŚWIADCZENIE", 8.7, SANS, TEAL, 76, 319, 2), 1.55),
    line(76, 338, 466, 1, RULE, 1),

    bold(text("Partner Zarządzający  /  Northbridge Advisory", 11, SANS, INK, 76, 365, 2)),
    text("2019 – obecnie  ·  Warszawa", 8.7, SANS, MUTED, 76, 383, 2),
    bulleted(block(
        "• Prowadzi portfel klientów strategicznych w sektorze finansowym i przemysłowym.\n• Zbudował praktykę doradztwa transformacyjnego od podstaw.\n• Odpowiada za jakość i etykę realizowanych mandatów.",
        76, 401, 466, 58, 9.5, 13.4, BODY, SANS
    )),

    bold(text("Starszy Konsultant  /  Meridian Consulting", 11, SANS, INK, 76, 489, 2)),
    text("2014 – 2019  ·  Kraków", 8.7, SANS, MUTED, 76, 507, 2),
    bulleted(block(
        "• Prowadził projekty restrukturyzacyjne dla klientów korporacyjnych.\n• Przygotowywał analizy scenariuszowe wspierające decyzje zarządu.",
        76, 525, 466, 42, 9.5, 13.4, BODY, SANS
    )),

    rect(526, 620, 16, 16, TEAL, 1.2, 2),
    tracked(text("EDUKACJA I KOMPETENCJE", 8.7, SANS, TEAL, 76, 622, 2), 1.55),
    line(76, 641, 466, 1, RULE, 1),
    bold(text("Magister Prawa i Ekonomii  /  Uniwersytet Warszawski", 10.3, SANS, INK, 76, 660, 2)),
    text("2009 – 2014  ·  Warszawa", 8.7, SANS, MUTED, 76, 678, 2),
    block(
        "Strategia  ·  Restrukturyzacja  ·  Zarządzanie ryzykiem  ·  Due diligence  ·  Facylitacja zarządów",
        76, 713, 466, 28, 9.4, 13.5, BODY, SANS
    ),

    { ...line(52, 786, 490, 1, RULE, 1), fixedToPage: true },
    { ...line(52, 786, 64, 3, TEAL, 2), fixedToPage: true },
    { ...text("01", 8, SANS, MUTED, 522, 801, 2), fixedToPage: true },
];
