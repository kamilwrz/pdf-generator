import { block, bulleted, circle, ellipse, line, text } from "./helpers";

const PAPER = "#FBFAF6";
const INK = "#1C2B3A";
const NAVY = "#34516A";
const SLATE = "#687782";
const STONE = "#C7CBC7";
const SANS = "Helvetica";
const SERIF = "Times-Roman";

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);

// Scribe — a formal Word-style document with a restrained double keyline and
// a precise blue-black typographic hierarchy.
export const scribeTemplate = [
    { ...line(0, 0, 595, 842, PAPER, 0), fixedToPage: true },
    { ...rect(30, 28, 535, 786, STONE, 0.8, 1), fixedToPage: true },
    { ...rect(38, 36, 519, 770, "#E7E6DF", 0.5, 1), fixedToPage: true },

    tracked(text("ANNA KOWALSKA", 30, SERIF, INK, 72, 66, 3), 0.15),
    tracked(text("SENIOR PRODUCT MANAGER", 9.2, SANS, NAVY, 74, 106, 3), 1.25),
    text("anna.kowalska@email.com  ·  +48 600 000 000  ·  Warszawa", 8.6, SANS, SLATE, 74, 132, 3),
    line(72, 157, 451, 1, STONE, 2),

    { ...rect(461, 60, 58, 58, NAVY, 0.9, 3), id: "scribe-frame" },
    { ...ellipse(473, 70, 34, 17, NAVY, false, 0.9, 3), id: "scribe-orbit" },
    { ...circle(484, 91, 11, NAVY, true, 1, 3), id: "scribe-seal" },
    line(528, 86, 14, 1, NAVY, 2),
    { ...circle(72, 196, 8, NAVY, true, 1, 3), id: "scribe-profile" },
    tracked(text("PROFIL", 8.4, SANS, NAVY, 94, 194, 3), 1.55),
    line(94, 212, 429, 1, STONE, 2),
    block(
        "Liderka produktów cyfrowych, która łączy potrzebę użytkownika, strategię oraz rygor realizacji. Prowadzę zespoły przez złożone decyzje do prostych i mierzalnych rezultatów.",
        94, 229, 429, 42, 10, 14.5, INK, SANS
    ),

    { ...circle(72, 310, 8, NAVY, true, 1, 3), id: "scribe-experience" },
    tracked(text("DOŚWIADCZENIE", 8.4, SANS, NAVY, 94, 308, 3), 1.55),
    line(94, 326, 429, 1, STONE, 2),
    bold(text("Senior Product Manager  /  Northstar", 10.8, SANS, INK, 94, 346, 3)),
    text("2021 – obecnie  ·  Digital Products", 8.6, SANS, SLATE, 94, 364, 3),
    bulleted(block(
        "• Prowadziła rozwój usług cyfrowych od strategii po stabilne wdrożenia.\n• Uporządkowała sposób pracy zespołów produktowych wokół potrzeb klienta.\n• Zbudowała rytm decyzji opartych na danych, jakości i odpowiedzialności.",
        94, 382, 429, 60, 9.3, 13.2, INK, SANS
    )),
    bold(text("Product Owner  /  Alder Studio", 10.8, SANS, INK, 94, 469, 3)),
    text("2017 – 2021  ·  Service Design", 8.6, SANS, SLATE, 94, 487, 3),
    bulleted(block(
        "• Projektowała produkty i procesy dla usług działających na wielu rynkach.\n• Łączyła pracę projektantów, analityków oraz zespołów technologicznych.",
        94, 505, 429, 44, 9.3, 13.2, INK, SANS
    )),

    { ...ellipse(70, 603, 12, 12, NAVY, false, 0.9, 3), id: "scribe-merit" },
    tracked(text("EDUKACJA I KOMPETENCJE", 8.4, SANS, NAVY, 94, 604, 3), 1.4),
    line(94, 622, 429, 1, STONE, 2),
    bold(text("Zarządzanie  /  Uniwersytet Warszawski", 10.2, SANS, INK, 94, 641, 3)),
    text("2012 – 2017", 8.5, SANS, SLATE, 94, 659, 3),
    block(
        "Product strategy  ·  Discovery  ·  Roadmaps  ·  Research  ·  Analytics\nLeadership  ·  Service design  ·  Stakeholder management",
        94, 692, 429, 32, 9.1, 13, INK, SANS
    ),

    { ...line(72, 783, 451, 1, STONE, 2), fixedToPage: true },
    { ...circle(72, 796, 6, NAVY, true, 1, 3), fixedToPage: true },
    { ...text("01", 8, SANS, SLATE, 508, 791, 3), fixedToPage: true },
];
