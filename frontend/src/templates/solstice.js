// Solstice — art-deco CV with a midnight sidecar, sun-gold geometry, and
// a generous serif masthead. The ornamental panel creates a memorable first
// impression while the main column keeps experience exceptionally readable.
import { text, line, block, bulleted } from "./helpers";

const MIDNIGHT = "#17283C";
const SUN = "#D99A32";
const CREAM = "#F8F1E4";
const INK = "#26323B";
const MIST = "#697682";
const WHITE = "#FFFFFF";
const SERIF = "Times-Roman";
const SANS = "Inter";

const bold = (element) => ({ ...element, bold: true });
const centered = (element) => ({ ...element, align: "center" });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) =>
    ({ category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex });

const section = (label, top) => [
    line(224, top + 6, 32, 2, SUN, 1),
    tracked(bold(text(label, 11, SANS, MIDNIGHT, 266, top, 2)), 1.35),
    line(266, top + 18, 274, 0.75, "#D8D1C5", 1),
];

export const solsticeTemplate = [
    // ── ART-DECO SIDECAR ──────────────────────────────────────────
    line(0, 0, 184, 842, MIDNIGHT, 0),
    line(184, 0, 8, 842, SUN, 1),
    rect(36, 42, 112, 112, SUN, 1.2, 2),
    rect(43, 49, 98, 98, CREAM, 1, 2),
    centered(bold(block("CV", 43, 74, 98, 28, 23, 28, MIDNIGHT, SERIF))),
    centered(tracked(block("SOLSTICE", 43, 110, 98, 14, 8, 10, MIDNIGHT, SANS), 2)),

    tracked(text("CONTACT", 9, SANS, SUN, 36, 196, 2), 1.4),
    line(36, 211, 76, 1, "#5D6E7D", 2),
    block("mira.hart@email.com\n+44 20 7946 0210\nLondon, United Kingdom\nlinkedin.com/in/mirahart", 36, 226, 112, 76, 8.5, 14, "#E9E5DE", SANS),

    tracked(text("SPECIALTIES", 9, SANS, SUN, 36, 342, 2), 1.4),
    line(36, 357, 76, 1, "#5D6E7D", 2),
    block("Brand Strategy\nCreative Direction\nExperience Design\nTeam Leadership\nEditorial Systems", 36, 372, 112, 92, 8.6, 15, "#E9E5DE", SANS),

    tracked(text("RECOGNITION", 9, SANS, SUN, 36, 520, 2), 1.4),
    line(36, 535, 76, 1, "#5D6E7D", 2),
    block("D&AD Graphite\nCannes Lions\nFast Company\nWorld Changing Ideas", 36, 550, 112, 70, 8.6, 15, "#E9E5DE", SANS),

    // ── MASTHEAD ─────────────────────────────────────────────────
    tracked(text("MIRA HART", 34, SERIF, MIDNIGHT, 224, 54, 2), 0.6),
    tracked(text("BRAND STRATEGIST & CREATIVE DIRECTOR", 10.5, SANS, SUN, 226, 98, 2), 1.5),
    line(224, 126, 316, 1.5, MIDNIGHT, 1),
    line(224, 132, 104, 2, SUN, 1),

    // ── PROFILE ──────────────────────────────────────────────────
    ...section("PROFILE", 162),
    block("I turn complex businesses into coherent brands — creating the strategy, systems and stories that make ambitious organisations impossible to ignore.", 224, 192, 316, 48, 10.5, 15, MIST, SANS),

    // ── EXPERIENCE ───────────────────────────────────────────────
    ...section("EXPERIENCE", 270),
    bold(text("Creative Strategy Director", 11.5, SANS, INK, 224, 302, 2)),
    text("Northline Studio  ·  2020 – Present", 9.2, SANS, MIST, 224, 319, 2),
    bulleted(block("• Led rebrands for 14 global organisations across culture, climate and technology.\n• Built an 18-person strategy practice with 96% client retention.\n• Directed a campaign platform that reached 40M people in its first quarter.", 224, 337, 316, 58, 10, 14, INK, SANS)),

    bold(text("Senior Brand Strategist", 11.5, SANS, INK, 224, 420, 2)),
    text("Studio 49  ·  2016 – 2020", 9.2, SANS, MIST, 224, 437, 2),
    bulleted(block("• Developed launch strategy for a circular-economy venture now operating in six markets.\n• Facilitated leadership workshops for executive teams across Europe and North America.", 224, 455, 316, 44, 10, 14, INK, SANS)),

    // ── EDUCATION ────────────────────────────────────────────────
    ...section("EDUCATION", 532),
    bold(text("M.A. Design Strategy — Goldsmiths", 10.8, SANS, INK, 224, 564, 2)),
    text("2014 – 2016  ·  Distinction", 9.2, SANS, MIST, 224, 580, 2),
    bold(text("B.A. Visual Communication — UAL", 10.8, SANS, INK, 224, 608, 2)),
    text("2011 – 2014  ·  First Class Honours", 9.2, SANS, MIST, 224, 624, 2),

    // ── SELECTED NOTE ────────────────────────────────────────────
    line(224, 680, 316, 0.75, "#D8D1C5", 1),
    centered(tracked(block("MAKE THE WORK MEAN SOMETHING.", 224, 704, 316, 18, 9, 12, MIDNIGHT, SANS), 1.6)),
    centered(block("Selected portfolio and references available on request", 224, 734, 316, 16, 8.5, 11, MIST, SANS)),
];
