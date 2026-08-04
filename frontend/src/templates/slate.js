/**
 * Slate — a steel-blue/graphite two-column CV with a rectilinear "blueprint"
 * decoration language.
 *
 * The two-column information hierarchy mirrors Tessera, but the visual language
 * is deliberately distinct: a geometric sans masthead, a filled title pill,
 * solid steel-blue heading badges with white glyphs, a 3x3 precision-grid
 * ornament, and drafting-style corner brackets around the rectangular photo.
 * Slate uses only filled/outlined rectangles — no circles or ellipses — which
 * is the point of difference from Tessera's warm mosaic motif.
 */
import API_BASE_URL from "../services/api.js";
import { block, bulleted, line, text } from "./helpers.js";

const PAPER = "#FFFFFF";
const SIDEBAR = "#F1F4F8";
const INK = "#1C2530";
const BODY = "#3A424C";
const MUTED = "#7A8794";
const ACCENT = "#3E5C76";
const HAIRLINE = "#D3DAE2";
const PHOTO_BG = "#E7ECF2";
const WHITE = "#FFFFFF";
const SANS = "Montserrat";
// White glyphs sit inside filled accent badges; accent glyphs sit bare on paper.
const ICON_WHITE = `${API_BASE_URL}/template-assets/iconic/slate`;
const ICON_ACCENT = `${API_BASE_URL}/template-assets/iconic/slate-accent`;

const MAIN_X = 218;
const MAIN_W = 329;
const SIDE_X = 25;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const fixed = (element) => ({ ...element, fixedToPage: true });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => ({
    category: "rectangle",
    left,
    top,
    width,
    height,
    backgroundColor: color,
    borderWidth,
    zIndex,
});
const icon = (root, name, left, top, size, alignWithText = false) => ({
    category: "image",
    src: `${root}/${name}.png`,
    left,
    top,
    width: size,
    height: size,
    zIndex: 4,
    alignWithText,
});

/** Sidebar heading: filled accent badge, white glyph, label, short accent rule. */
const sideHeading = (label, iconName, top) => [
    line(SIDE_X, top, 16, 16, ACCENT, 2),
    icon(ICON_WHITE, iconName, SIDE_X + 2, top + 2, 12),
    tracked(bold(text(label, 7.6, SANS, INK, SIDE_X + 24, top + 3, 3)), 0.85),
    line(SIDE_X + 24, top + 16, 46, 1, ACCENT, 2),
];

/** Main heading: a larger filled badge and a long hairline keyline. */
const heading = (label, iconName, top) => [
    { ...line(MAIN_X, top, 18, 18, ACCENT, 2), flowRole: "section-chrome" },
    { ...icon(ICON_WHITE, iconName, MAIN_X + 3, top + 3, 12, true), flowRole: "section-chrome" },
    {
        ...tracked(bold(text(label, 8.1, SANS, INK, MAIN_X + 26, top + 4, 3)), 1),
        flowRole: "section-chrome",
    },
    { ...line(MAIN_X + 26, top + 20, MAIN_W - 26, 1, HAIRLINE, 2), flowRole: "section-chrome" },
];

const contact = (name, label, top) => [
    icon(ICON_ACCENT, name, SIDE_X, top, 11),
    text(label, 7.3, SANS, BODY, SIDE_X + 17, top + 1, 3),
];

// 3x3 precision-grid ornament in the masthead's top-right corner.
const gridOrnament = [];
for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
        gridOrnament.push(line(505 + col * 9, 39 + row * 9, 5, 5, ACCENT, 2));
    }
}

const starter = [
    fixed(line(0, 0, 595, 842, PAPER, 0)),
    fixed(line(0, 0, 178, 842, SIDEBAR, 1)),
    fixed(line(178, 0, 2, 842, ACCENT, 2)),

    // Rectangular photo placeholder with drafting-style decoration.
    line(33, 40, 112, 126, PHOTO_BG, 1),
    rect(39, 46, 112, 126, HAIRLINE, 0.9, 1),
    { ...rect(33, 40, 112, 126, INK, 1.3, 3), id: "slate-photo-frame" },
    icon(ICON_ACCENT, "portrait", 66, 80, 46),
    line(29, 36, 9, 9, ACCENT, 4),
    line(140, 161, 9, 9, ACCENT, 4),
    line(33, 170, 112, 4, ACCENT, 2),

    // Main masthead: geometric sans name + filled accent role pill.
    tracked(bold(text("ANNA KOWALSKA", 24, SANS, INK, MAIN_X, 48, 3)), 0.4),
    line(MAIN_X, 86, 132, 20, ACCENT, 1),
    tracked(bold(text("AML / KYC ANALYST", 8.2, SANS, WHITE, MAIN_X + 12, 92, 3)), 1.15),
    text("anna.kowalska@email.com  ·  +48 600 000 000  ·  Warszawa", 7.8, SANS, MUTED, MAIN_X, 119, 3),
    line(MAIN_X, 141, MAIN_W, 1, HAIRLINE, 2),
    ...gridOrnament,

    // Left information rail.
    ...sideHeading("KONTAKT", "references", 194),
    ...contact("phone", "+48 600 000 000", 222),
    ...contact("email", "anna.kowalska@email.com", 241),
    ...contact("github", "linkedin.com/in/akowalska", 260),
    ...contact("location", "Warszawa, Polska", 279),

    ...sideHeading("WYKSZTAŁCENIE", "education", 318),
    bold(block("Bachelor of Laws (LL.B.)", SIDE_X, 345, 128, 14, 8.2, 11.5, INK, SANS)),
    block("Europa-Universität Viadrina", SIDE_X, 362, 128, 13, 7.7, 11, INK, SANS),
    block("Frankfurt (Oder)  ·  2018–2022", SIDE_X, 378, 128, 13, 7.4, 11, MUTED, SANS),

    ...sideHeading("KOMPETENCJE", "skills", 412),
    bulleted(block(
        "• Analiza AML/KYC\n• Transaction Monitoring\n• CDD / EDD\n"
        + "• Screening (PEP, sankcje)\n• SAR Reporting\n• Analiza danych",
        SIDE_X, 439, 128, 78, 8, 11.6, BODY, SANS,
    )),

    ...sideHeading("JĘZYKI", "languages", 546),
    bulleted(block(
        "• Polski — C2\n• Niemiecki — C1\n• Angielski — B2",
        SIDE_X, 573, 128, 43, 8, 11.6, BODY, SANS,
    )),

    ...sideHeading("SYSTEMY I NARZĘDZIA", "other", 645),
    bulleted(block(
        "• Actimize\n• LexisNexis\n• SAP\n• SQL / Python",
        SIDE_X, 672, 128, 56, 8, 11.6, BODY, SANS,
    )),

    // Main profile and experience flow.
    ...heading("PODSUMOWANIE", "summary", 179),
    block(
        "Analityk AML/KYC z doświadczeniem w monitorowaniu transakcji, tworzeniu "
        + "profili KYC oraz przygotowywaniu raportów SAR. Łączy wiedzę regulacyjną "
        + "z praktyczną znajomością SQL i Pythona oraz dbałością o jakość.",
        MAIN_X, 212, MAIN_W, 55, 9, 13.2, BODY, SANS,
    ),

    ...heading("DOŚWIADCZENIE", "experience", 296),
    bold(block("Senior AML Analyst", MAIN_X, 329, MAIN_W, 15, 10.4, 13.4, INK, SANS)),
    block("Northbridge Bank  ·  Warszawa  ·  2022–obecnie", MAIN_X, 348, MAIN_W, 12, 8.3, 11.4, ACCENT, SANS),
    bulleted(block(
        "• Tworzenie i aktualizacja profili KYC klientów indywidualnych i korporacyjnych.\n"
        + "• Przeprowadzanie procesów CDD oraz EDD w podejściu opartym na ryzyku.\n"
        + "• Sporządzanie zawiadomień o podejrzanych transakcjach (SAR).",
        MAIN_X, 364, MAIN_W, 62, 9, 13.2, BODY, SANS,
    )),

    bold(block("AML Analyst", MAIN_X, 448, MAIN_W, 15, 10.4, 13.4, INK, SANS)),
    block("Citibank Europe  ·  Warszawa  ·  2019–2022", MAIN_X, 467, MAIN_W, 12, 8.3, 11.4, ACCENT, SANS),
    bulleted(block(
        "• Monitorowanie transakcji i analiza alertów zgodnie z procedurami AML.\n"
        + "• Kontrole PEP, list sankcyjnych oraz analizy negatywnych informacji medialnych.",
        MAIN_X, 483, MAIN_W, 45, 9, 13.2, BODY, SANS,
    )),

    ...heading("WYBRANE PROJEKTY", "certifications", 559),
    bold(block("Optymalizacja procesu przeglądów okresowych", MAIN_X, 592, MAIN_W, 15, 10.2, 13, INK, SANS)),
    block(
        "Uproszczenie ścieżki EDD i skrócenie czasu obsługi alertów o wysokim ryzyku.",
        MAIN_X, 611, MAIN_W, 28, 8.8, 13, BODY, SANS,
    ),
    bold(block("Automatyzacja raportowania SAR", MAIN_X, 657, MAIN_W, 15, 10.2, 13, INK, SANS)),
    block(
        "Standaryzacja szablonów zawiadomień i kontrola jakości dokumentacji.",
        MAIN_X, 676, MAIN_W, 28, 8.8, 13, BODY, SANS,
    ),

    fixed(line(MAIN_X, 798, MAIN_W, 1, HAIRLINE, 2)),
    fixed(line(514, 802, 20, 15, ACCENT, 2)),
    fixed(text("01", 7.6, SANS, WHITE, 519, 805, 3)),
    fixed(line(24, 800, 9, 9, ACCENT, 3)),
];

export const slateTemplate = starter.map((element) => ({
    ...element,
    flowRole: element.flowRole || "content",
    ...(element.category === "textarea" ? { preserveInitialLayout: true } : {}),
}));
