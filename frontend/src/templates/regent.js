import { block, bulleted, circle, ellipse, line, text } from "./helpers.js";

const PAPER = "#FCFBF8";
const INK = "#24201E";
const WINE = "#733B43";
const CLAY = "#A66B5B";
const TAUPE = "#D6CCC3";
const GREY = "#756F6B";
const SANS = "Inter";
const SERIF = "CormorantGaramond";

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const flow = (element, flowRole) => ({ ...element, flowRole });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);

/**
 * Regent is a formal executive document with an oxblood page rail, a
 * personalized seal, and a generous single-column reading measure. Decorative
 * primitives stay subtle so the typography carries the hierarchy.
 */
export const regentTemplate = [
    { ...line(0, 0, 595, 842, PAPER, 0), fixedToPage: true },
    { ...line(46, 36, 3, 770, WINE, 1), fixedToPage: true },
    { ...rect(56, 36, 483, 770, TAUPE, 0.7, 1), fixedToPage: true },

    flow(tracked(bold(text("ANNA KOWALSKA", 33, SERIF, INK, 88, 61, 3)), 0.15), "masthead"),
    flow(tracked(text("DIRECTOR OF OPERATIONS", 9, SANS, WINE, 90, 105, 3), 1.65), "masthead"),
    flow(text("anna.kowalska@email.com  ·  +48 600 000 000  ·  Warszawa", 8.5, SANS, GREY, 90, 130, 3), "masthead"),
    flow(line(88, 154, 418, 1, TAUPE, 2), "masthead"),

    flow({ ...ellipse(445, 54, 58, 46, WINE, false, 0.9, 3), id: "regent-seal" }, "masthead"),
    flow({ ...circle(461, 64, 26, CLAY, false, 0.8, 3), id: "regent-signet" }, "masthead"),
    flow({ ...bold(text("AK", 9.5, SANS, WINE, 466, 72, 4)), id: "regent-initials" }, "masthead"),
    flow(line(454, 105, 40, 1, CLAY, 2), "masthead"),

    flow(circle(75, 191.5, 7, WINE, true, 0, 3), "section-chrome"),
    flow(tracked(text("PROFIL", 9, SANS, WINE, 96, 190, 3), 1.5), "section-chrome"),
    flow(line(96, 208, 44, 1.25, WINE, 2), "section-chrome"),
    flow(line(148, 208, 358, 1, TAUPE, 2), "section-chrome"),
    block(
        "Liderka operacyjna budująca spokojne, przejrzyste organizacje. Łączę strategiczną perspektywę z dbałością o decyzje, procesy i ludzi, którzy każdego dnia realizują ambitne cele.",
        96, 222, 410, 43, 9.6, 14, INK, SANS
    ),

    flow(circle(75, 286.5, 7, WINE, true, 0, 3), "section-chrome"),
    flow(tracked(text("DOŚWIADCZENIE", 9, SANS, WINE, 96, 285, 3), 1.5), "section-chrome"),
    flow(line(96, 303, 44, 1.25, WINE, 2), "section-chrome"),
    flow(line(148, 303, 358, 1, TAUPE, 2), "section-chrome"),
    bold(text("Director of Operations  /  Waverly Group", 11.2, SANS, INK, 96, 319, 3)),
    text("2020 – obecnie  ·  Business Operations", 8.5, SANS, GREY, 96, 338, 3),
    bulleted(block(
        "• Zaprojektowała model operacyjny wspierający skalowanie zespołów i usług.\n• Uporządkowała kluczowe procesy, nadając decyzjom właścicieli i mierniki.\n• Wprowadziła praktyki współpracy łączące jakość, tempo oraz odpowiedzialność.",
        96, 354, 410, 43, 9.6, 14, INK, SANS
    )),
    bold(text("Operations Manager  /  Westbury", 11.2, SANS, INK, 96, 417, 3)),
    text("2016 – 2020  ·  Transformation", 8.5, SANS, GREY, 96, 436, 3),
    bulleted(block(
        "• Prowadziła inicjatywy usprawniające pracę między zespołami i regionami.\n• Rozwijała system raportowania oraz rytm pracy dla zarządzających.",
        96, 452, 410, 29, 9.6, 14, INK, SANS
    )),

    flow(circle(75, 523.5, 7, WINE, true, 0, 3), "section-chrome"),
    flow(tracked(text("WYKSZTAŁCENIE", 9, SANS, WINE, 96, 522, 3), 1.5), "section-chrome"),
    flow(line(96, 540, 44, 1.25, WINE, 2), "section-chrome"),
    flow(line(148, 540, 358, 1, TAUPE, 2), "section-chrome"),
    bold(text("Zarządzanie i Strategia  /  SGH", 10.6, SANS, INK, 96, 556, 3)),
    text("2011 – 2016", 8.5, SANS, GREY, 96, 575, 3),

    flow(circle(75, 623.5, 7, WINE, true, 0, 3), "section-chrome"),
    flow(tracked(text("KOMPETENCJE", 9, SANS, WINE, 96, 622, 3), 1.25), "section-chrome"),
    flow(line(96, 640, 44, 1.25, WINE, 2), "section-chrome"),
    flow(line(148, 640, 358, 1, TAUPE, 2), "section-chrome"),
    block(
        "Operating models  ·  Change management  ·  Planning  ·  Governance\nLeadership  ·  Process design  ·  Stakeholder alignment",
        96, 656, 410, 29, 9.5, 13.8, INK, SANS
    ),

    { ...line(88, 783, 411, 1, TAUPE, 2), fixedToPage: true },
    { ...circle(88, 795, 6, WINE, true, 0, 3), fixedToPage: true },
    { ...text("01", 8, SANS, GREY, 484, 791, 3), fixedToPage: true },
];
