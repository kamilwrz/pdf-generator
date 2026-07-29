import { block, bulleted, circle, ellipse, line, text } from "./helpers";

const PAPER = "#FAFAF8";
const INK = "#262A31";
const STEEL = "#4F6679";
const BLUEGREY = "#7F909C";
const SILVER = "#CED4D5";
const PALE = "#E9EEEE";
const SANS = "Helvetica";
const SERIF = "Times-Roman";

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);

// Merit — a cool, diplomatic document with a formal report-like cadence.
// Pale outlines and small geometric cues are deliberately secondary to type.
export const meritTemplate = [
    { ...line(0, 0, 595, 842, PAPER, 0), fixedToPage: true },
    { ...rect(35, 34, 525, 774, SILVER, 0.7, 1), fixedToPage: true },
    { ...line(35, 34, 525, 3, STEEL, 2), fixedToPage: true },

    tracked(text("ANNA KOWALSKA", 30, SERIF, INK, 77, 68, 3), 0.1),
    tracked(text("PROGRAMME & POLICY LEAD", 8.9, SANS, STEEL, 79, 108, 3), 1.45),
    text("anna.kowalska@email.com  ·  +48 600 000 000  ·  Warszawa", 8.6, SANS, BLUEGREY, 79, 134, 3),
    line(77, 159, 443, 1, SILVER, 2),

    { ...rect(452, 58, 67, 58, STEEL, 0.8, 3), id: "merit-panel" },
    { ...ellipse(462, 69, 47, 18, STEEL, false, 1, 3), id: "merit-capsule" },
    line(522, 70, 14, 1, SILVER, 2),
    { ...circle(476, 93, 12, STEEL, true, 1, 3), id: "merit-dot-one" },
    { ...circle(497, 93, 12, BLUEGREY, false, 1, 3), id: "merit-dot-two" },
    line(488, 98, 9, 1, STEEL, 2),
    { ...ellipse(76, 194, 13, 13, STEEL, false, 0.9, 3), id: "merit-profile" },
    tracked(text("PROFIL", 8.4, SANS, STEEL, 102, 193, 3), 1.6),
    line(102, 211, 418, 1, SILVER, 2),
    block(
        "Liderka programów i polityk publicznych, która buduje porozumienie w złożonym otoczeniu. Łączę analizę, klarowną komunikację oraz sprawne przeprowadzanie inicjatyw przez organizację.",
        102, 228, 418, 45, 10, 14.5, INK, SANS
    ),

    { ...circle(78, 313, 8, STEEL, true, 1, 3), id: "merit-experience" },
    tracked(text("DOŚWIADCZENIE", 8.4, SANS, STEEL, 102, 312, 3), 1.6),
    line(102, 330, 418, 1, SILVER, 2),
    bold(text("Programme Director  /  Civic Foundation", 10.8, SANS, INK, 102, 350, 3)),
    text("2020 – obecnie  ·  Strategy & Programmes", 8.6, SANS, BLUEGREY, 102, 368, 3),
    bulleted(block(
        "• Prowadziła złożone programy realizowane z partnerami publicznymi i prywatnymi.\n• Zbudowała system raportowania, który porządkuje decyzje, ryzyka i rezultaty.\n• Usprawniła pracę zespołów wokół wspólnej strategii oraz jakości wykonania.",
        102, 386, 418, 60, 9.3, 13.2, INK, SANS
    )),
    bold(text("Senior Manager  /  Arc & Co.", 10.8, SANS, INK, 102, 473, 3)),
    text("2016 – 2020  ·  Transformation", 8.6, SANS, BLUEGREY, 102, 491, 3),
    bulleted(block(
        "• Koordynowała projekty zmian w organizacjach o złożonej strukturze.\n• Tworzyła materiały i procesy wspierające pracę decydentów.",
        102, 509, 418, 44, 9.3, 13.2, INK, SANS
    )),

    { ...ellipse(76, 606, 13, 13, STEEL, false, 0.9, 3), id: "merit-education" },
    tracked(text("EDUKACJA I KOMPETENCJE", 8.4, SANS, STEEL, 102, 606, 3), 1.35),
    line(102, 624, 418, 1, SILVER, 2),
    bold(text("Nauki Polityczne  /  Uniwersytet Warszawski", 10.2, SANS, INK, 102, 643, 3)),
    text("2011 – 2016", 8.5, SANS, BLUEGREY, 102, 661, 3),
    block(
        "Programme design  ·  Policy analysis  ·  Governance  ·  Facilitation\nStakeholder engagement  ·  Research  ·  Executive communication",
        102, 694, 418, 32, 9.1, 13, INK, SANS
    ),

    { ...line(77, 783, 443, 1, SILVER, 2), fixedToPage: true },
    { ...circle(77, 796, 6, STEEL, true, 1, 3), fixedToPage: true },
    { ...text("01", 8, SANS, BLUEGREY, 505, 791, 3), fixedToPage: true },
];
