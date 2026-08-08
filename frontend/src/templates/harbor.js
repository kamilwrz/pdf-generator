/**
 * Harbor template (`layouts: ["sidebar", "icons"]`).
 *
 * A two-column resume modelled on the popular "double column" layout: a wide
 * main column on the left (summary + experience) and a narrower sidebar on the
 * right (education, skills, languages, tools). A single teal accent carries the
 * role line, company names and teal diamond bullets; everything else is charcoal
 * on white.
 *
 * Skills, languages, tools and education descriptions all use the same teal
 * diamond bullet list. Contact and meta icons come from the grey `harbor` icon
 * theme; the diamond comes from the teal `harbor-accent` variant
 * (see scripts/generate_iconic_icons.py).
 */
import API_BASE_URL from "../services/api.js";
import { block, bulleted, circle, line, text } from "./helpers.js";

// ── Colour system ───────────────────────────────────────────────────────────
const PAPER = "#FFFFFF";
const ACCENT = "#17A2B8"; // teal: role, company, diamond bullets
const INK = "#2B2B2B"; // name, section headings, titles
const BODY = "#3A3A3A"; // body copy and bullets
const META = "#7A7A7A"; // dates and locations
const RULE = "#C4C9CE"; // heading underlines and header/footer keylines
const PHOTO_BG = "#ECEEF1"; // circular photo placeholder fill
const SANS = "Inter";

// ── Two-column geometry (A4 at 595×842 pt) ──────────────────────────────────
const MAIN_X = 44; // main column left edge
const MAIN_W = 292; // main column width (right edge 336)
const SIDE_X = 364; // sidebar left edge
const SIDE_W = 187; // sidebar width (right edge 551)
const PHOTO_D = 58; // circular photo placeholder diameter
const PHOTO_X = 493;
const PHOTO_Y = 36;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });

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
    icon("harbor", name, iconLeft, top, 11),
    text(label, 8.4, SANS, BODY, textLeft, top, 3),
];

/**
 * Date + location row below an experience record's employer.
 *
 * The 8.6/11.5 typography matches Harbor education metadata. Keeping this row
 * separate gives both labels enough width and avoids competing with long
 * employer names.
 */
const jobMeta = (date, place, top) => {
    const fs = 8.6;
    const lh = 11.5;
    const dateWidth = Math.max(1, date.length * fs * 0.52 + 4);
    const placeWidth = Math.max(1, place.length * fs * 0.52 + 4);
    const dateLeft = MAIN_X + 15;
    const locationIconLeft = dateLeft + dateWidth + 10;
    const placeLeft = locationIconLeft + 15;
    return [
        icon("harbor", "calendar", MAIN_X, top + 0.25, 11, false),
        block(date, dateLeft, top, dateWidth, 12, fs, lh, META, SANS),
        icon("harbor", "location", locationIconLeft, top + 0.25, 11, false),
        { ...block(place, placeLeft, top, placeWidth, 12, fs, lh, META, SANS), autoHeight: false },
    ];
};

/** Teal diamond bullet + charcoal label — skills, languages, tools, edu notes. */
const diamondItem = (label, left, top) => [
    icon("harbor-accent", "diamond", left, top, 11),
    text(label, 8.6, SANS, INK, left + 16, top, 4),
];

// ── Sidebar (running cursor; diamond lists stack with a fixed 15 px rhythm) ──
const sidebar = (() => {
    const els = [];
    let y = 146;

    // Education: bold diploma, accent school, meta icons, diamond description.
    els.push(...heading("EDUKACJA", SIDE_X, SIDE_W, y));
    els.push(bold(text("Bachelor of Laws", 10, SANS, INK, SIDE_X, y + 24, 3)));
    els.push(text("EU Viadrina", 9, SANS, ACCENT, SIDE_X, y + 40, 3));
    els.push(...contact("calendar", SIDE_X, SIDE_X + 15, "2016 – 2019", y + 57));
    els.push(...contact("location", SIDE_X, SIDE_X + 15, "Frankfurt nad Odrą", y + 72));
    els.push(...diamondItem("Specjalizacja: prawo europejskie", SIDE_X, y + 90));

    const skills = [
        "Analiza AML/KYC", "Transaction Monitoring", "CDD / EDD",
        "Screening (PEP / sankcje)", "SAR Reporting", "Analityczne myślenie",
        "Dbałość o szczegóły", "Praca zespołowa",
    ];
    y += 122;
    els.push(...heading("UMIEJĘTNOŚCI", SIDE_X, SIDE_W, y));
    skills.forEach((label, index) => {
        els.push(...diamondItem(label, SIDE_X, y + 24 + index * 15));
    });

    const languages = ["Polski — C2", "Niemiecki — C1", "Angielski — B2"];
    y += 24 + skills.length * 15 + 20;
    els.push(...heading("JĘZYKI", SIDE_X, SIDE_W, y));
    languages.forEach((label, index) => {
        els.push(...diamondItem(label, SIDE_X, y + 24 + index * 15));
    });

    const tools = ["Actimize", "LexisNexis", "SAP / SAP CIC", "MS Office", "SQL", "Python"];
    y += 24 + languages.length * 15 + 20;
    els.push(...heading("SYSTEMY I NARZĘDZIA", SIDE_X, SIDE_W, y));
    tools.forEach((label, index) => {
        els.push(...diamondItem(label, SIDE_X, y + 24 + index * 15));
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
    // `photoSlot` lets gallery upload replace the glyph and cover the disc.
    {
        ...circle(PHOTO_X, PHOTO_Y, PHOTO_D, PHOTO_BG, true, 1, 2),
        id: "harbor-photo-frame",
        photoSlot: "frame",
        photoShape: "circle",
    },
    {
        ...icon("harbor", "references", PHOTO_X + (PHOTO_D - 30) / 2, PHOTO_Y + (PHOTO_D - 30) / 2, 30, false),
        id: "harbor-photo-glyph",
        photoSlot: "glyph",
    },

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
    ...jobMeta("06/2025", "Warszawa", 303),
    bulleted(block(
        "• Tworzenie i aktualizacja profili KYC klientów indywidualnych i korporacyjnych.\n"
        + "• Procesy Customer Due Diligence (CDD) i Enhanced Due Diligence (EDD).\n"
        + "• Sporządzanie i zgłaszanie zawiadomień o podejrzanych transakcjach (SAR).",
        MAIN_X, 319, MAIN_W, 70, 9, 13.4, BODY, SANS,
    )),

    bold(text("AML Analyst", 10.5, SANS, INK, MAIN_X, 404, 3)),
    text("Citibank Europe", 9.2, SANS, ACCENT, MAIN_X, 421, 3),
    ...jobMeta("07/2022", "Warszawa", 435),
    bulleted(block(
        "• Monitorowanie transakcji pod kątem ryzyka prania pieniędzy.\n"
        + "• Analiza alertów oraz ocena ich zasadności zgodnie z procedurami AML.\n"
        + "• Kontrole PEP, list sankcyjnych oraz analiza negatywnych informacji medialnych.",
        MAIN_X, 451, MAIN_W, 70, 9, 13.4, BODY, SANS,
    )),

    bold(text("Customer Service Specialist", 10.5, SANS, INK, MAIN_X, 536, 3)),
    text("Amazon VCS Poland", 9.2, SANS, ACCENT, MAIN_X, 553, 3),
    ...jobMeta("08/2020", "Zdalnie", 567),
    bulleted(block(
        "• Obsługa klientów rynku niemieckiego z zachowaniem wysokich standardów.\n"
        + "• Wewnętrzne szkolenia dla nowo zatrudnionych pracowników.",
        MAIN_X, 583, MAIN_W, 48, 9, 13.4, BODY, SANS,
    )),

    ...sidebar,

    // Footer keyline + page marker.
    { ...line(MAIN_X, 806, SIDE_X + SIDE_W - MAIN_X, 1, RULE, 2), fixedToPage: true },
    { ...text("01", 8, SANS, META, 535, 812, 3), fixedToPage: true },
];
