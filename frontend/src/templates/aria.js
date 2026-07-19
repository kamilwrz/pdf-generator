// Aria — ultra-minimalist. No accent bars, no coloured elements, no decoration
// beyond hairline rules. All hierarchy comes from size and weight alone.
// The name is deliberately large and regular-weight; section headings are
// smaller than body text and spaced generously to let the page breathe.
import { text, line, block, bulleted } from "./helpers";

const INK  = "#1A1A1A";
const MID  = "#666666";
const SOFT = "#BBBBBB";   // hairline rules

const bold = el => ({ ...el, bold: true });
const ital = el => ({ ...el, italic: true });

export const ariaTemplate = [
    // ── HEADER ───────────────────────────────────────────────────
    // name: large, regular weight — no bold
    text("EWA LEWANDOWSKA", 36, "Inter", INK, 50, 60),
    ital(text("Strateg Marki i Dyrektorka Kreatywna", 12, "Inter", MID, 50, 108)),
    text("ewa.lewandowska@email.com   ·   +48 600 901 234   ·   Warszawa", 9, "Inter", MID, 50, 126),
    line(50, 148, 495, 0.5, SOFT),            // single hairline under header

    // ── EXPERIENCE ───────────────────────────────────────────────
    // section heading: 9 px, light grey — smaller than body text
    text("DOŚWIADCZENIE", 9, "Inter", MID, 50, 176),
    line(50, 190, 495, 0.5, SOFT),

    bold(text("Starsza Strateg Marki", 11, "Inter", INK, 50, 208)),
    text("Agencja Premium Warszawa   ·   2020 – obecnie", 9.5, "Inter", MID, 50, 224),
    bulleted(block("• Opracowała strategie marki dla 12 klientów premium na 5 rynkach europejskich.\n• Poprowadziła pełne odświeżenie marki, zwiększając jej wartość o 35%.\n• Zarządzała zespołem 6 twórców i 2 strategów.", 50, 240, 495, 52, 10.5, 16, MID, "Inter")),

    bold(text("Menadżer marki", 11, "Inter", INK, 50, 308)),
    text("Creative Studio   ·   2016 – 2020", 9.5, "Inter", MID, 50, 324),
    bulleted(block("• Zarządzała wytycznymi brandu dla 8 klientów międzynarodowych.\n• Koordynowała globalne kampanie w 12 krajach.\n• Wprowadziła kwartalne śledzenie zdrowia marki.", 50, 340, 495, 52, 10.5, 16, MID, "Inter")),

    // ── EDUCATION ────────────────────────────────────────────────
    text("EDUKACJA", 9, "Inter", MID, 50, 412),
    line(50, 426, 495, 0.5, SOFT),

    bold(text("Magister Projektowania i Komunikacji — Politechnika Warszawska", 11, "Inter", INK, 50, 444)),
    text("2013 – 2015", 9.5, "Inter", MID, 50, 460),

    // ── SKILLS ───────────────────────────────────────────────────
    text("UMIEJĘTNOŚCI", 9, "Inter", MID, 50, 504),
    line(50, 518, 495, 0.5, SOFT),

    block("Strategia marki · Identyfikacja wizualna · Zarządzanie kampaniami · Typografia · Adobe Creative Suite · Kierownictwo artystyczne · Badania rynku · Tworzenie tekstów", 50, 536, 495, 36, 10.5, 16, MID, "Inter"),
];
