// Aria — ultra-minimalist. No accent bars, no coloured elements, no decoration
// beyond hairline rules. All hierarchy comes from size and weight alone.
// The name is deliberately large and regular-weight; section headings are
// smaller than body text and spaced generously to let the page breathe.
import { text, line, block } from "./helpers";

const INK  = "#1A1A1A";
const MID  = "#666666";
const SOFT = "#BBBBBB";   // hairline rules

const bold = el => ({ ...el, bold: true });
const ital = el => ({ ...el, italic: true });

export const ariaTemplate = [
    // ── HEADER ───────────────────────────────────────────────────
    // name: large, regular weight — no bold
    text("ELENA MARCHETTI", 36, "Inter", INK, 50, 60),
    ital(text("Brand Strategist & Creative Director", 12, "Inter", MID, 50, 108)),
    text("elena@email.com   ·   +39 02 000 0000   ·   Milan, Italy", 9, "Inter", MID, 50, 126),
    line(50, 148, 495, 0.5, SOFT),            // single hairline under header

    // ── EXPERIENCE ───────────────────────────────────────────────
    // section heading: 9 px, light grey — smaller than body text
    text("EXPERIENCE", 9, "Inter", MID, 50, 176),
    line(50, 190, 495, 0.5, SOFT),

    bold(text("Senior Brand Strategist", 11, "Inter", INK, 50, 208)),
    text("Luxury Agency Milano   ·   2020 – Present", 9.5, "Inter", MID, 50, 224),
    block("• Developed brand strategy for 12 luxury clients across 5 European markets.\n• Led a full rebranding initiative that increased brand equity 35%.\n• Managed team of 6 creatives and 2 strategists.", 50, 240, 495, 52, 10.5, 16, MID, "Inter"),

    bold(text("Brand Manager", 11, "Inter", INK, 50, 308)),
    text("Creative Studio   ·   2016 – 2020", 9.5, "Inter", MID, 50, 324),
    block("• Managed brand guidelines for 8 international clients.\n• Coordinated global campaigns across 12 countries.\n• Introduced quarterly brand-health tracking framework.", 50, 340, 495, 52, 10.5, 16, MID, "Inter"),

    // ── EDUCATION ────────────────────────────────────────────────
    text("EDUCATION", 9, "Inter", MID, 50, 412),
    line(50, 426, 495, 0.5, SOFT),

    bold(text("M.A. Design & Communication — Politecnico di Milano", 11, "Inter", INK, 50, 444)),
    text("2013 – 2015", 9.5, "Inter", MID, 50, 460),

    // ── SKILLS ───────────────────────────────────────────────────
    text("SKILLS", 9, "Inter", MID, 50, 504),
    line(50, 518, 495, 0.5, SOFT),

    block("Brand Strategy · Visual Identity · Campaign Management · Typography · Adobe Creative Suite · Art Direction · Market Research · Copywriting", 50, 536, 495, 36, 10.5, 16, MID, "Inter"),
];
