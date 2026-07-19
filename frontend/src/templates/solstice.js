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

    tracked(text("KONTAKT", 9, SANS, SUN, 36, 196, 2), 1.4),
    line(36, 211, 76, 1, "#5D6E7D", 2),
    block("natalia.nowicka@email.com\n+48 22 000 00 00\nWarszawa, Polska\nlinkedin.com/in/nnowicka", 36, 226, 112, 76, 8.5, 14, "#E9E5DE", SANS),

    tracked(text("SPECJALIZACJE", 9, SANS, SUN, 36, 342, 2), 1.4),
    line(36, 357, 76, 1, "#5D6E7D", 2),
    block("Strategia marki\nKierownictwo kreatywne\nProjektowanie doświadczeń\nPrzywództwo zespołowe\nSystemy redakcyjne", 36, 372, 112, 92, 8.6, 15, "#E9E5DE", SANS),

    tracked(text("WYRÓŻNIENIA", 9, SANS, SUN, 36, 520, 2), 1.4),
    line(36, 535, 76, 1, "#5D6E7D", 2),
    block("D&AD Graphite\nCannes Lions\nFast Company\nWorld Changing Ideas", 36, 550, 112, 70, 8.6, 15, "#E9E5DE", SANS),

    // ── MASTHEAD ─────────────────────────────────────────────────
    tracked(text("NATALIA NOWICKA", 34, SERIF, MIDNIGHT, 224, 54, 2), 0.6),
    tracked(text("STRATEG MARKI I DYREKTORKA KREATYWNA", 10.5, SANS, SUN, 226, 98, 2), 1.5),
    line(224, 126, 316, 1.5, MIDNIGHT, 1),
    line(224, 132, 104, 2, SUN, 1),

    // ── PROFILE ──────────────────────────────────────────────────
    ...section("PROFIL", 162),
    block("Zamieniam złożone biznesy w spójne marki — tworząc strategię, systemy i historie, które czynią ambitne organizacje niemożliwymi do zignorowania.", 224, 192, 316, 48, 10.5, 15, MIST, SANS),

    // ── EXPERIENCE ───────────────────────────────────────────────
    ...section("DOŚWIADCZENIE", 270),
    bold(text("Dyrektor Strategii Kreatywnej", 11.5, SANS, INK, 224, 302, 2)),
    text("Northline Studio  ·  2020 – obecnie", 9.2, SANS, MIST, 224, 319, 2),
    bulleted(block("• Poprowadziła rebrandy 14 globalnych organizacji w kulturze, klimacie i technologii.\n• Zbudowała 18-osobową praktykę strategii z 96% retencją klientów.\n• Kierowała platformą kampanii, która dotarła do 40 mln osób w pierwszym kwartale.", 224, 337, 316, 58, 10, 14, INK, SANS)),

    bold(text("Starsza Strateg Marki", 11.5, SANS, INK, 224, 420, 2)),
    text("Studio 49  ·  2016 – 2020", 9.2, SANS, MIST, 224, 437, 2),
    bulleted(block("• Opracowała strategię launchu venture gospodarki obiegu zamkniętego działającego obecnie na sześciu rynkach.\n• Prowadziła warsztaty dla zespołów zarządzających w Europie i Ameryce Północnej.", 224, 455, 316, 44, 10, 14, INK, SANS)),

    // ── EDUCATION ────────────────────────────────────────────────
    ...section("EDUKACJA", 532),
    bold(text("Magister Strategii Projektowania — ASP w Warszawie", 10.8, SANS, INK, 224, 564, 2)),
    text("2014 – 2016  ·  wyróżnienie", 9.2, SANS, MIST, 224, 580, 2),
    bold(text("Licencjat Komunikacji Wizualnej — ASP w Krakowie", 10.8, SANS, INK, 224, 608, 2)),
    text("2011 – 2014  ·  z wyróżnieniem", 9.2, SANS, MIST, 224, 624, 2),

    // ── SELECTED NOTE ────────────────────────────────────────────
    line(224, 680, 316, 0.75, "#D8D1C5", 1),
    centered(tracked(block("NIECH PRACA MA ZNACZENIE.", 224, 704, 316, 18, 9, 12, MIDNIGHT, SANS), 1.6)),
    centered(block("Wybrane portfolio i referencje dostępne na życzenie", 224, 734, 316, 16, 8.5, 11, MIST, SANS)),
];
