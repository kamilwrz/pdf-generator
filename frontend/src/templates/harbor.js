/**
 * Harbor template (Sidebar collection).
 *
 * A two-column resume modelled on the popular "double column" layout: a wide
 * main column on the left (summary + experience) and a narrower sidebar on the
 * right (education, skills, languages, tools). A single teal accent carries the
 * role line, company names, tool-list diamonds and filled proficiency dots;
 * everything else is charcoal on white.
 *
 * The sidebar uses three widgets not found in other templates:
 *   - rounded skill pills (rectangles with `borderRadius`, wrapped by width),
 *   - language rows with five proficiency dots (filled = level, outline = rest),
 *   - a tools list bulleted with teal diamond glyphs.
 * Contact and meta icons come from the grey `harbor` icon theme; the diamond
 * comes from the teal `harbor-accent` variant (see scripts/generate_iconic_icons.py).
 */
import API_BASE_URL from "../services/api";
import { block, bulleted, circle, line, text } from "./helpers";

// ── Colour system ───────────────────────────────────────────────────────────
const PAPER = "#FFFFFF";
const ACCENT = "#17A2B8"; // teal: role, company, diamonds, filled dots
const INK = "#2B2B2B"; // name, section headings, titles
const BODY = "#3A3A3A"; // body copy and bullets
const META = "#7A7A7A"; // dates and locations
const RULE = "#C4C9CE"; // heading underlines and header/footer keylines
const PILL = "#CBD0D6"; // skill-pill borders + empty proficiency dots
const PHOTO_BG = "#ECEEF1"; // circular photo placeholder fill
const SANS = "Inter";

// ── Two-column geometry (A4 at 595×842 pt) ──────────────────────────────────
const MAIN_X = 44; // main column left edge
const MAIN_W = 292; // main column width (right edge 336)
const MAIN_R = MAIN_X + MAIN_W;
const SIDE_X = 364; // sidebar left edge
const SIDE_W = 187; // sidebar width (right edge 551)
const PHOTO_D = 58; // circular photo placeholder diameter
const PHOTO_X = 493;
const PHOTO_Y = 36;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });

/**
 * A bordered rectangle with optional rounded corners. `borderRadius` drives the
 * pill/tag shape on both the canvas (CSS) and the PDF (ReportLab roundRect).
 */
const rect = (left, top, width, height, color, borderWidth = 0.9, borderRadius = 0, zIndex = 1) => ({
    category: "rectangle",
    left, top, width, height,
    backgroundColor: color,
    borderWidth,
    borderRadius,
    zIndex,
});

/**
 * A line-art glyph. `theme` is "harbor" (grey contact/meta) or "harbor-accent"
 * (teal diamond). `alignWithText` centres the glyph on the companion text line;
 * pass geometric=false for icons that must sit at an exact geometric position
 * (the photo person mark), not aligned to a text baseline.
 */
const icon = (theme, name, left, top, size, alignWithText = true) => ({
    category: "image",
    src: `${API_BASE_URL}/template-assets/iconic/${theme}/${name}.png`,
    width: size, height: size, left, top, zIndex: 3,
    alignWithText,
});

/** Section heading: charcoal tracked label + a grey rule spanning the column. */
const heading = (label, left, width, top) => [
    tracked(text(label, 8.8, SANS, INK, left, top, 3), 1.1),
    line(left, top + 13, width, 1, RULE, 2),
];

/** One header contact detail: grey icon + label on a shared text line. */
const contact = (name, iconLeft, textLeft, label, top) => [
    icon("harbor", name, iconLeft, top, 9),
    text(label, 8.4, SANS, BODY, textLeft, top, 3),
];

/**
 * Right-aligned date + location for an experience record, sat on the company
 * line. Both use grey meta icons so the row reads as secondary information.
 */
const jobMeta = (date, place, top) => [
    icon("harbor", "calendar", MAIN_R - 98, top, 9),
    text(date, 8.2, SANS, META, MAIN_R - 84, top, 3),
    icon("harbor", "location", MAIN_R - 52, top, 9),
    text(place, 8.2, SANS, META, MAIN_R - 38, top, 3),
];

/**
 * Lay out skill pills, wrapping greedily within the sidebar column. Pill widths
 * are estimated from label length (there is no measurement pass for static
 * specs); the estimate slightly over-provisions so text never clips, and the
 * rounded rectangle plus centred label read as a tag.
 *
 * @returns {{ els: object[], bottom: number }} elements and the y just below
 *          the final pill row, so following sidebar sections can stack under it.
 */
const skillPills = (skills, left, top, colWidth) => {
    const els = [];
    const fs = 7.5, padX = 7, pillH = 16, gapX = 5, gapY = 6, charW = 4.4;
    let cx = left, cy = top;
    for (const label of skills) {
        const width = Math.min(colWidth, Math.round(label.length * charW + padX * 2));
        // Wrap to the next row when this pill would cross the column's right edge.
        if (cx + width > left + colWidth) {
            cx = left;
            cy += pillH + gapY;
        }
        els.push(rect(cx, cy, width, pillH, PILL, 0.9, 5, 4));
        els.push(text(label, fs, SANS, INK, cx + padX, cy + (pillH - fs) / 2, 4));
        cx += width + gapX;
    }
    return { els, bottom: cy + pillH };
};

/**
 * One language row: name on the left, five proficiency dots, level on the right.
 * Filled teal dots equal the level; the remainder are outlined grey.
 */
const languageRow = (name, filled, level, left, top, colWidth) => {
    const dotD = 5, dotGap = 4, dots = 5, levelW = 16;
    const dotsWidth = dots * dotD + (dots - 1) * dotGap;
    const dotsX = left + colWidth - levelW - dotsWidth - 6;
    const els = [text(name, 8.6, SANS, INK, left, top, 4)];
    for (let i = 0; i < dots; i += 1) {
        const cx = dotsX + i * (dotD + dotGap);
        els.push(circle(cx, top + 1, dotD, i < filled ? ACCENT : PILL, i < filled, 1, 4));
    }
    els.push(text(level, 8.2, SANS, META, left + colWidth - levelW, top, 4));
    return els;
};

/** One tools-list entry: teal diamond bullet + charcoal label. */
const toolItem = (label, left, top) => [
    icon("harbor-accent", "diamond", left, top, 9),
    text(label, 8.6, SANS, INK, left + 16, top, 4),
];

// ── Sidebar (built with a running cursor so pill wrapping cascades cleanly) ──
const sidebar = (() => {
    const els = [];
    let y = 146;

    // Education
    els.push(...heading("EDUKACJA", SIDE_X, SIDE_W, y));
    els.push(bold(text("Bachelor of Laws", 10, SANS, INK, SIDE_X, y + 24, 3)));
    els.push(text("EU Viadrina", 9, SANS, ACCENT, SIDE_X, y + 40, 3));
    els.push(...contact("calendar", SIDE_X, SIDE_X + 15, "2016 – 2019", y + 57));
    els.push(...contact("location", SIDE_X, SIDE_X + 15, "Frankfurt nad Odrą", y + 72));

    // Skills as wrapped pills
    y += 104;
    els.push(...heading("UMIEJĘTNOŚCI", SIDE_X, SIDE_W, y));
    const packed = skillPills(
        [
            "Analiza AML/KYC", "Transaction Monitoring", "CDD / EDD",
            "Screening (PEP / sankcje)", "SAR Reporting", "Analityczne myślenie",
            "Dbałość o szczegóły", "Praca zespołowa",
        ],
        SIDE_X, y + 22, SIDE_W,
    );
    els.push(...packed.els);

    // Languages with proficiency dots
    y = packed.bottom + 20;
    els.push(...heading("JĘZYKI", SIDE_X, SIDE_W, y));
    els.push(...languageRow("Polski", 5, "C2", SIDE_X, y + 24, SIDE_W));
    els.push(...languageRow("Niemiecki", 4, "C1", SIDE_X, y + 42, SIDE_W));
    els.push(...languageRow("Angielski", 4, "B2", SIDE_X, y + 60, SIDE_W));

    // Tools / systems with diamond bullets
    y += 82;
    els.push(...heading("SYSTEMY I NARZĘDZIA", SIDE_X, SIDE_W, y));
    const tools = ["Actimize", "LexisNexis", "SAP / SAP CIC", "MS Office", "SQL", "Python"];
    tools.forEach((label, index) => {
        els.push(...toolItem(label, SIDE_X, y + 24 + index * 15));
    });

    return els;
})();

export const harborTemplate = [
    // Page surface (white). Fixed so it never moves.
    { ...line(0, 0, 595, 842, PAPER, 0), fixedToPage: true },

    // Masthead: name, teal role line, single contact row, circular photo.
    tracked(bold(text("ANNA KOWALSKA", 23, SANS, INK, MAIN_X, 44, 3)), 0.3),
    text("Starszy Analityk AML / KYC", 11, SANS, ACCENT, MAIN_X, 80, 3),
    ...contact("phone", MAIN_X, MAIN_X + 15, "+48 600 000 000", 104),
    ...contact("email", 168, 183, "anna.kowalska@email.com", 104),
    ...contact("github", 320, 335, "github.com/akowalska", 104),
    ...contact("location", 470, 485, "Warszawa", 104),

    // Circular photo placeholder: soft-grey disc + centred grey person glyph.
    circle(PHOTO_X, PHOTO_Y, PHOTO_D, PHOTO_BG, true, 1, 2),
    icon("harbor", "references", PHOTO_X + (PHOTO_D - 30) / 2, PHOTO_Y + (PHOTO_D - 30) / 2, 30, false),

    { ...line(MAIN_X, 126, SIDE_X + SIDE_W - MAIN_X, 1, RULE, 2) },

    // ── Main column: summary ────────────────────────────────────────────────
    ...heading("PODSUMOWANIE", MAIN_X, MAIN_W, 146),
    // Summary shares the experience-bullet size (9 pt) so the lead paragraph
    // does not read a step larger than the records beneath it.
    block(
        "Starszy analityk AML/KYC z blisko 4-letnim doświadczeniem w bankowości "
        + "i doradztwie. Specjalizuję się w monitorowaniu transakcji, tworzeniu "
        + "profili KYC, screeningu oraz raportowaniu SAR do jednostek analityki finansowej.",
        MAIN_X, 170, MAIN_W, 58, 9, 13.4, BODY, SANS,
    ),

    // ── Main column: experience ─────────────────────────────────────────────
    ...heading("DOŚWIADCZENIE", MAIN_X, MAIN_W, 244),
    bold(text("Senior AML Analyst", 10.5, SANS, INK, MAIN_X, 272, 3)),
    text("Price Waterhouse Coopers", 9.2, SANS, ACCENT, MAIN_X, 289, 3),
    ...jobMeta("06/2025", "Warszawa", 289),
    bulleted(block(
        "• Tworzenie i aktualizacja profili KYC klientów indywidualnych i korporacyjnych.\n"
        + "• Procesy Customer Due Diligence (CDD) i Enhanced Due Diligence (EDD).\n"
        + "• Sporządzanie i zgłaszanie zawiadomień o podejrzanych transakcjach (SAR).",
        MAIN_X, 307, MAIN_W, 70, 9, 13.4, BODY, SANS,
    )),

    bold(text("AML Analyst", 10.5, SANS, INK, MAIN_X, 392, 3)),
    text("Citibank Europe", 9.2, SANS, ACCENT, MAIN_X, 409, 3),
    ...jobMeta("07/2022", "Warszawa", 409),
    bulleted(block(
        "• Monitorowanie transakcji pod kątem ryzyka prania pieniędzy.\n"
        + "• Analiza alertów oraz ocena ich zasadności zgodnie z procedurami AML.\n"
        + "• Kontrole PEP, list sankcyjnych oraz analiza negatywnych informacji medialnych.",
        MAIN_X, 427, MAIN_W, 70, 9, 13.4, BODY, SANS,
    )),

    bold(text("Customer Service Specialist", 10.5, SANS, INK, MAIN_X, 512, 3)),
    text("Amazon VCS Poland", 9.2, SANS, ACCENT, MAIN_X, 529, 3),
    ...jobMeta("08/2020", "Zdalnie", 529),
    bulleted(block(
        "• Obsługa klientów rynku niemieckiego z zachowaniem wysokich standardów.\n"
        + "• Wewnętrzne szkolenia dla nowo zatrudnionych pracowników.",
        MAIN_X, 547, MAIN_W, 48, 9, 13.4, BODY, SANS,
    )),

    ...sidebar,

    // Footer keyline + page marker.
    { ...line(MAIN_X, 806, SIDE_X + SIDE_W - MAIN_X, 1, RULE, 2), fixedToPage: true },
    { ...text("01", 8, SANS, META, 535, 812, 3), fixedToPage: true },
];
