import { block, bulleted, circle, ellipse, line, text } from "./helpers";

const PAPER = "#FCFBF8";
const INK = "#24201E";
const WINE = "#733B43";
const CLAY = "#A66B5B";
const TAUPE = "#BFB4AA";
const GREY = "#756F6B";
const SANS = "Helvetica";
const SERIF = "Times-Roman";

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);
const connector = (source_id, target_id, color = WINE) => (
    { category: "connector", source_id, target_id, backgroundColor: color, borderWidth: 0.8, arrow: false, zIndex: 3 }
);

// Regent — a measured executive document: oxblood accents, broad margins and
// a discreet signet construction rather than a contemporary graphic header.
export const regentTemplate = [
    { ...line(0, 0, 595, 842, PAPER, 0), fixedToPage: true },
    { ...line(46, 36, 3, 770, WINE, 1), fixedToPage: true },
    { ...rect(56, 36, 483, 770, TAUPE, 0.75, 1), fixedToPage: true },

    tracked(text("ANNA KOWALSKA", 29, SERIF, INK, 88, 67, 3), 0.1),
    tracked(text("DIRECTOR OF OPERATIONS", 8.8, SANS, WINE, 90, 107, 3), 1.45),
    text("anna.kowalska@email.com  ·  +48 600 000 000  ·  Warszawa", 8.6, SANS, GREY, 90, 133, 3),
    line(88, 158, 411, 1, TAUPE, 2),

    { ...rect(442, 57, 57, 57, WINE, 0.9, 3), id: "regent-square" },
    { ...circle(458, 73, 25, WINE, false, 1.1, 3), id: "regent-signet" },
    { ...ellipse(451, 91, 39, 13, CLAY, false, 0.8, 3), id: "regent-rule" },
    connector("regent-square", "regent-signet", TAUPE),
    connector("regent-signet", "regent-rule", CLAY),

    { ...rect(88, 194, 8, 8, WINE, 0.9, 3), id: "regent-profile" },
    tracked(text("PROFIL", 8.4, SANS, WINE, 113, 193, 3), 1.65),
    line(113, 211, 386, 1, TAUPE, 2),
    block(
        "Liderka operacyjna budująca spokojne, przejrzyste organizacje. Łączę strategiczną perspektywę z dbałością o decyzje, procesy i ludzi, którzy każdego dnia realizują ambitne cele.",
        113, 228, 386, 45, 10, 14.5, INK, SANS
    ),

    { ...rect(88, 313, 8, 8, WINE, 0.9, 3), id: "regent-experience" },
    tracked(text("DOŚWIADCZENIE", 8.4, SANS, WINE, 113, 312, 3), 1.65),
    line(113, 330, 386, 1, TAUPE, 2),
    bold(text("Director of Operations  /  Waverly Group", 10.8, SANS, INK, 113, 350, 3)),
    text("2020 – obecnie  ·  Business Operations", 8.6, SANS, GREY, 113, 368, 3),
    bulleted(block(
        "• Zaprojektowała model operacyjny wspierający skalowanie zespołów i usług.\n• Uporządkowała kluczowe procesy, nadając decyzjom właścicieli i mierniki.\n• Wprowadziła praktyki współpracy łączące jakość, tempo oraz odpowiedzialność.",
        113, 386, 386, 60, 9.3, 13.2, INK, SANS
    )),
    bold(text("Operations Manager  /  Westbury", 10.8, SANS, INK, 113, 473, 3)),
    text("2016 – 2020  ·  Transformation", 8.6, SANS, GREY, 113, 491, 3),
    bulleted(block(
        "• Prowadziła inicjatywy usprawniające pracę między zespołami i regionami.\n• Rozwijała system raportowania oraz rytm pracy dla zarządzających.",
        113, 509, 386, 44, 9.3, 13.2, INK, SANS
    )),

    { ...ellipse(87, 606, 11, 11, WINE, false, 0.9, 3), id: "regent-education" },
    tracked(text("EDUKACJA I KOMPETENCJE", 8.4, SANS, WINE, 113, 606, 3), 1.35),
    line(113, 624, 386, 1, TAUPE, 2),
    bold(text("Zarządzanie i Strategia  /  SGH", 10.2, SANS, INK, 113, 643, 3)),
    text("2011 – 2016", 8.5, SANS, GREY, 113, 661, 3),
    block(
        "Operating models  ·  Change management  ·  Planning  ·  Governance\nLeadership  ·  Process design  ·  Stakeholder alignment",
        113, 694, 386, 32, 9.1, 13, INK, SANS
    ),

    { ...line(88, 783, 411, 1, TAUPE, 2), fixedToPage: true },
    { ...rect(88, 795, 6, 6, WINE, 0.8, 3), fixedToPage: true },
    { ...text("01", 8, SANS, GREY, 484, 791, 3), fixedToPage: true },
];
