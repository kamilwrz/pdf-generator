/**
 * Tessera — an original aubergine/coral editorial CV with a mosaic icon rail.
 *
 * The two-column information hierarchy is familiar, but the visual language is
 * deliberately distinct: serif masthead, rectangular offset photo frame,
 * asymmetric tile badges, warm paper, and geometric footer ornaments.
 */
import API_BASE_URL from "../services/api.js";
import { block, bulleted, circle, ellipse, line, text } from "./helpers.js";

const PAPER = "#FCF8F2";
const SIDEBAR = "#F2DDD2";
const INK = "#2D2530";
const BODY = "#463E47";
const MUTED = "#806F78";
const AUBERGINE = "#4A2347";
const CORAL = "#E15D4F";
const OCHRE = "#DCA65A";
const TILE = "#F7E9DF";
const RULE = "#D8C5C7";
const WHITE = "#FFFDFC";
const SANS = "Montserrat";
const DISPLAY = "PlayfairDisplay";
const ICON_ROOT = `${API_BASE_URL}/template-assets/iconic/tessera`;

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
const icon = (name, left, top, size, alignWithText = false) => ({
    category: "image",
    src: `${ICON_ROOT}/${name}.png`,
    left,
    top,
    width: size,
    height: size,
    zIndex: 4,
    alignWithText,
});

/** Sidebar heading: offset white/coral tile, custom glyph, label, short rule. */
const sideHeading = (label, iconName, top) => [
    line(SIDE_X, top - 2, 18, 18, WHITE, 2),
    rect(SIDE_X + 2, top, 18, 18, CORAL, 0.8, 3),
    icon(iconName, SIDE_X + 4, top + 2, 12),
    tracked(bold(text(label, 7.6, SANS, AUBERGINE, SIDE_X + 26, top + 3, 3)), 0.85),
    line(SIDE_X + 26, top + 16, 50, 1, CORAL, 2),
];

/** Main heading: a larger tile badge and a long warm-grey keyline. */
const heading = (label, iconName, top) => [
    { ...line(MAIN_X, top - 2, 20, 20, TILE, 1), flowRole: "section-chrome" },
    { ...rect(MAIN_X + 2, top, 20, 20, CORAL, 0.8, 2), flowRole: "section-chrome" },
    { ...circle(MAIN_X + 16, top - 3, 7, OCHRE, true, 1, 3), flowRole: "section-chrome" },
    { ...icon(iconName, MAIN_X + 5, top + 3, 12, true), flowRole: "section-chrome" },
    {
        ...tracked(bold(text(label, 8.1, SANS, AUBERGINE, MAIN_X + 30, top + 3, 3)), 1),
        flowRole: "section-chrome",
    },
    { ...line(MAIN_X + 30, top + 21, MAIN_W - 30, 1, RULE, 2), flowRole: "section-chrome" },
];

const contact = (name, label, top) => [
    icon(name, SIDE_X, top, 11),
    text(label, 7.3, SANS, BODY, SIDE_X + 17, top + 1, 3),
];

const starter = [
    fixed(line(0, 0, 595, 842, PAPER, 0)),
    fixed(line(0, 0, 178, 842, SIDEBAR, 1)),
    fixed(line(178, 0, 4, 842, CORAL, 2)),

    // Rectangular portrait placeholder and offset geometric frame.
    // `photoSlot` marks the frame/glyph so gallery upload can fit a user photo
    // inside the outline without removing the mosaic chrome.
    ellipse(20, 25, 138, 80, OCHRE, false, 1.1, 1),
    circle(136, 26, 19, CORAL, true, 1, 2),
    line(26, 48, 112, 126, TILE, 1),
    { ...rect(33, 40, 112, 126, AUBERGINE, 1.2, 3), id: "tessera-photo-frame", photoSlot: "frame" },
    { ...icon("portrait", 65, 79, 48), id: "tessera-photo-glyph", photoSlot: "glyph" },
    circle(28, 158, 12, CORAL, true, 1, 4),

    // Main masthead: serif name + compact coral role tile.
    tracked(bold(text("ALEKSANDRA NOWAK", 24, DISPLAY, AUBERGINE, MAIN_X, 48, 3)), 0.2),
    line(MAIN_X, 88, 164, 22, CORAL, 1),
    tracked(bold(text("STRATEGY & OPERATIONS LEAD", 8.2, SANS, WHITE, MAIN_X + 10, 94, 3)), 1.15),
    text("aleksandra.nowak@email.com  ·  +48 600 000 000  ·  Warszawa", 7.8, SANS, MUTED, MAIN_X, 121, 3),
    line(MAIN_X, 143, MAIN_W, 1, RULE, 2),
    rect(491, 42, 41, 41, AUBERGINE, 1.1, 2),
    line(499, 50, 41, 41, TILE, 1),
    circle(506, 58, 13, CORAL, true, 1, 3),
    ellipse(487, 90, 56, 15, OCHRE, false, 1, 2),

    // Left information rail.
    ...sideHeading("KONTAKT", "references", 194),
    ...contact("phone", "+48 600 000 000", 222),
    ...contact("email", "aleksandra@email.com", 241),
    ...contact("linkedin", "linkedin.com/in/aleksandra", 260),
    ...contact("github", "github.com/aleksandra", 279),
    ...contact("website", "aleksandra.dev", 298),
    ...contact("location", "Warszawa, Polska", 317),

    ...sideHeading("WYKSZTAŁCENIE", "education", 356),
    bold(block("MA — Service Design", SIDE_X, 383, 128, 14, 8.2, 11.5, INK, SANS)),
    block("Uniwersytet SWPS", SIDE_X, 400, 128, 13, 7.7, 11, CORAL, SANS),
    block("Warszawa  ·  2014–2016", SIDE_X, 416, 128, 13, 7.4, 11, MUTED, SANS),

    ...sideHeading("KOMPETENCJE", "skills", 450),
    bulleted(block(
        "• Strategia produktu\n• Service design\n• Badania jakościowe\n"
        + "• Facylitacja\n• Operating models\n• Zarządzanie zmianą",
        SIDE_X, 477, 128, 78, 8, 11.6, BODY, SANS,
    )),

    ...sideHeading("JĘZYKI", "languages", 584),
    bulleted(block(
        "• Polski — ojczysty\n• Angielski — C1\n• Niemiecki — B1",
        SIDE_X, 611, 128, 43, 8, 11.6, BODY, SANS,
    )),

    ...sideHeading("NARZĘDZIA", "other", 683),
    bulleted(block(
        "• Miro / FigJam\n• Notion\n• Power BI\n• Jira",
        SIDE_X, 710, 128, 56, 8, 11.6, BODY, SANS,
    )),

    // Main profile and experience flow.
    ...heading("PODSUMOWANIE", "summary", 179),
    block(
        "Liderka strategii i operacji, która przekłada złożone potrzeby klientów "
        + "na czytelne modele usług. Łączy badania, projektowanie oraz wdrożenie, "
        + "dbając o mierzalny wpływ i partnerską współpracę zespołów.",
        MAIN_X, 212, MAIN_W, 55, 9, 13.2, BODY, SANS,
    ),

    ...heading("DOŚWIADCZENIE", "experience", 296),
    bold(block("Head of Strategy & Operations", MAIN_X, 329, MAIN_W, 15, 10.4, 13.4, INK, SANS)),
    block("Northline Studio  ·  Warszawa  ·  2021–obecnie", MAIN_X, 348, MAIN_W, 12, 8.3, 11.4, CORAL, SANS),
    bulleted(block(
        "• Prowadziła portfel inicjatyw transformacyjnych od diagnozy po wdrożenie.\n"
        + "• Zbudowała rytm współpracy między strategią, badaniami i technologią.\n"
        + "• Uporządkowała mierniki jakości usług i proces podejmowania decyzji.",
        MAIN_X, 364, MAIN_W, 62, 9, 13.2, BODY, SANS,
    )),

    bold(block("Senior Service Designer", MAIN_X, 448, MAIN_W, 15, 10.4, 13.4, INK, SANS)),
    block("Fieldworks  ·  Kraków  ·  2017–2021", MAIN_X, 467, MAIN_W, 12, 8.3, 11.4, CORAL, SANS),
    bulleted(block(
        "• Projektowała doświadczenia i modele operacyjne dla usług cyfrowych.\n"
        + "• Facylitowała warsztaty strategiczne z zespołami zarządczymi.",
        MAIN_X, 483, MAIN_W, 45, 9, 13.2, BODY, SANS,
    )),

    ...heading("WYBRANE PROJEKTY", "certifications", 559),
    bold(block("Service blueprint dla platformy B2B", MAIN_X, 592, MAIN_W, 15, 10.2, 13, INK, SANS)),
    block(
        "Badania, blueprint oraz roadmapa zmian dla sześciu zespołów produktowych.",
        MAIN_X, 611, MAIN_W, 28, 8.8, 13, BODY, SANS,
    ),
    bold(block("Model obsługi omnichannel", MAIN_X, 657, MAIN_W, 15, 10.2, 13, INK, SANS)),
    block(
        "Docelowy model operacyjny i standardy jakości dla punktów cyfrowych i fizycznych.",
        MAIN_X, 676, MAIN_W, 28, 8.8, 13, BODY, SANS,
    ),

    fixed(line(MAIN_X, 798, MAIN_W, 1, RULE, 2)),
    fixed(text("01", 8, SANS, MUTED, 524, 807, 3)),
    fixed(circle(24, 800, 8, CORAL, true, 1, 3)),
    fixed(ellipse(42, 797, 44, 10, OCHRE, false, 1, 2)),
];

export const tesseraTemplate = starter.map((element) => ({
    ...element,
    flowRole: element.flowRole || "content",
    ...(element.category === "textarea" ? { preserveInitialLayout: true } : {}),
}));
