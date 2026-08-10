/**
 * Cardinal template (`layouts: ["icons"]`).
 *
 * A single-column, editorial CV that reserves a "noble red" (cardinal) purely
 * for typography — the name accent and every section heading — while all
 * decoration stays neutral grey: generated line-art icons begin on the same
 * left edge as body copy, while each heading's rule continues from the optical
 * centre of its cap line. Header/footer keylines remain understated.
 *
 * Icon glyphs come from the shared icon pipeline
 * (`scripts/generate_iconic_icons.py`), rendered in grey under the dedicated
 * `cardinal` theme so the red is never spent on ornament.
 */
import API_BASE_URL from "../services/api.js";
import { block, bulleted, line, text } from "./helpers.js";

// ── Colour system ───────────────────────────────────────────────────────────
const PAPER = "#FCFBF9"; // warm off-white document surface
const CARDINAL = "#9E2532"; // "szlachetna czerwień" — headings + role only
const INK = "#24201E"; // near-black for the name and role/company titles
const BODY = "#333333"; // dark grey body copy ("tekst ciemno szary")
const META = "#6E6E6E"; // secondary grey for dates and locations
const GREY = "#8A8A8A"; // icons + decorative rules (matches the cardinal icon theme)

const SERIF = "Times-Roman"; // the name, in the Classic serif convention
const SANS = "Helvetica"; // labels, contact, dates and body copy

// ── Layout geometry (A4 at 595×842 pt) ──────────────────────────────────────
const TEXT_X = 72; // body, contact icons and section compositions share this edge
const HEADING_X = TEXT_X + 22; // icon occupies the first 15 pt of the heading row
const RIGHT = 545; // content right edge (≈72 pt symmetric margins)
const CONTENT_W = RIGHT - TEXT_X; // 473 pt usable text column
const SECTION_ICON = 16.5; // slightly larger than the caps without dominating them
const CONTACT_ICON = 13; // slightly smaller glyph for the contact row
const HEAD_FS = 11.2; // remains above the requested 11 px minimum
const HEAD_TRACKING = 1.05;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });

/**
 * A grey line-art glyph from the `cardinal` icon theme.
 *
 * `top` stores the companion label's CSS top (not a pre-shifted image top);
 * `alignWithText` lets the canvas and PDF centre the glyph on that text line so
 * the icon reads level with the caps rather than floating above them.
 */
const icon = (name, left, top, size) => ({
    category: "image",
    src: `${API_BASE_URL}/template-assets/iconic/cardinal/${name}.png`,
    width: size,
    height: size,
    left,
    top,
    zIndex: 3,
    alignWithText: true,
});

/**
 * A section heading: grey icon aligned to the body edge, cardinal-red tracked
 * label, and a trailing rule on the cap midline. Grouped as `section-chrome` so
 * reflow keeps the horizontal composition intact across page breaks.
 */
const sectionHead = (iconName, label, top) => {
    // The tracked-width estimate is used only for decoration placement. Keeping
    // a 14 pt gap prevents the hairline from touching long Polish labels.
    const labelWidth = label.length * (HEAD_FS * 0.58 + HEAD_TRACKING);
    const ruleLeft = Math.min(HEADING_X + labelWidth + 14, RIGHT - 54);
    return [
        { ...icon(iconName, TEXT_X, top, SECTION_ICON), flowRole: "section-chrome" },
        {
            ...bold(tracked(text(label, HEAD_FS, SANS, CARDINAL, HEADING_X, top, 3), HEAD_TRACKING)),
            flowRole: "section-chrome",
        },
        {
            ...line(ruleLeft, top + HEAD_FS / 2, RIGHT - ruleLeft, 0.8, GREY, 2),
            flowRole: "section-chrome",
        },
    ];
};

/**
 * One contact detail: grey icon plus its dark-grey label on a shared text line.
 * `textLeft` is passed explicitly because the three details sit on one row at
 * different x positions rather than stacking.
 */
const contact = (iconName, iconLeft, textLeft, label, top) => [
    icon(iconName, iconLeft, top, CONTACT_ICON),
    text(label, 8.6, SANS, BODY, textLeft, top, 3),
];

const cardinalElements = [
    // Page surface. Fixed so it never participates in content reflow.
    { ...line(0, 0, 595, 842, PAPER, 0), fixedToPage: true },

    // Masthead: serif name, cardinal role line, and a single grey contact row.
    tracked(text("ANNA KOWALSKA", 30, SERIF, INK, TEXT_X, 50, 3), 0.15),
    tracked(text("DYREKTORKA STRATEGII I ROZWOJU", 9.6, SANS, CARDINAL, TEXT_X, 92, 3), 1.55),
    ...contact("email", TEXT_X, 88, "anna.kowalska@email.com", 118),
    ...contact("phone", 250, 266, "+48 600 000 000", 118),
    ...contact("location", 420, 436, "Warszawa", 118),
    ...contact("linkedin", TEXT_X, 88, "linkedin.com/in/akowalska", 134),
    ...contact("github", 250, 266, "github.com/akowalska", 134),
    line(TEXT_X, 158, CONTENT_W, 1, GREY, 2),

    // ── Podsumowanie zawodowe ───────────────────────────────────────────────
    ...sectionHead("summary", "PODSUMOWANIE ZAWODOWE", 170),
    block(
        "Liderka strategii łącząca perspektywę biznesową z dyscypliną wykonania. "
        + "Buduję zespoły, które podejmują czytelne decyzje i konsekwentnie dowożą "
        + "mierzalne rezultaty bez utraty jakości relacji.",
        TEXT_X, 198, CONTENT_W, 43, 9.6, 13.8, BODY, SANS,
    ),

    // ── Doświadczenie zawodowe ──────────────────────────────────────────────
    ...sectionHead("experience", "DOŚWIADCZENIE ZAWODOWE", 268),
    bold(text("Dyrektorka Strategii  /  Northbridge Partners", 11.2, SANS, INK, TEXT_X, 296, 3)),
    text("2021 – obecnie  ·  Warszawa", 8.6, SANS, META, TEXT_X, 315, 3),
    bulleted(block(
        "• Zaprojektowała model wzrostu łączący cele finansowe z inicjatywami produktowymi.\n"
        + "• Uporządkowała rytm decyzji zarządu oraz raportowanie strategiczne.\n"
        + "• Prowadzi mentoring liderów odpowiedzialnych za kluczowe programy.",
        TEXT_X, 331, CONTENT_W, 43, 9.6, 13.8, BODY, SANS,
    )),
    bold(text("Menedżerka Rozwoju  /  Meridian Group", 11.2, SANS, INK, TEXT_X, 397, 3)),
    text("2016 – 2021  ·  Kraków", 8.6, SANS, META, TEXT_X, 416, 3),
    bulleted(block(
        "• Rozwinęła portfel projektów ekspansji na rynkach europejskich.\n"
        + "• Wprowadziła standardy współpracy między sprzedażą, produktem i finansami.",
        TEXT_X, 432, CONTENT_W, 29, 9.6, 13.8, BODY, SANS,
    )),

    // ── Wykształcenie ───────────────────────────────────────────────────────
    ...sectionHead("education", "WYKSZTAŁCENIE", 512),
    bold(text("Magister Zarządzania  /  SGH Warszawa", 10.6, SANS, INK, TEXT_X, 540, 3)),
    text("2011 – 2016", 8.6, SANS, META, TEXT_X, 559, 3),

    // ── Umiejętności ────────────────────────────────────────────────────────
    ...sectionHead("skills", "UMIEJĘTNOŚCI", 602),
    block(
        "Strategia  ·  Leadership  ·  P&L  ·  Negocjacje  ·  Transformacja organizacyjna",
        TEXT_X, 630, CONTENT_W, 24, 9.6, 13.8, BODY, SANS,
    ),

    // ── Języki ──────────────────────────────────────────────────────────────
    ...sectionHead("languages", "JĘZYKI", 680),
    block(
        "Polski — ojczysty  ·  Angielski — C1  ·  Francuski — B2",
        TEXT_X, 708, CONTENT_W, 20, 9.6, 13.8, BODY, SANS,
    ),

    // Footer keyline + page marker. Fixed so they anchor to every page bottom.
    { ...line(TEXT_X, 800, CONTENT_W, 1, GREY, 2), fixedToPage: true },
    { ...text("01", 8, SANS, META, 522, 806, 3), fixedToPage: true },
];

/**
 * Tag content for the reflow engine. Elements that already declare their role
 * (`fixedToPage` chrome, `section-chrome` headings) are preserved as authored;
 * everything else becomes flowing `content`, and textareas keep their measured
 * initial geometry so the loaded layout matches this authored spec exactly.
 */
export const cardinalTemplate = cardinalElements.map((element) => (
    element.fixedToPage || element.flowRole
        ? element
        : {
            ...element,
            flowRole: "content",
            ...(element.category === "textarea" ? { preserveInitialLayout: true } : {}),
        }
));
