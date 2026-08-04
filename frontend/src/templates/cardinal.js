/**
 * Cardinal template (`layouts: ["icons"]`).
 *
 * A single-column, editorial CV that reserves a "noble red" (cardinal) purely
 * for typography — the name accent and every section heading — while all
 * decoration stays neutral grey: the generated line-art icons that sit beside
 * each section heading and contact detail, plus the decorative rules under the
 * headings and the header/footer keylines. Body copy is dark grey.
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
const ICON_X = 50; // left gutter that carries every icon
const TEXT_X = 72; // heading labels, rules and body share this left edge
const RIGHT = 545; // content right edge (≈72 pt symmetric margins)
const CONTENT_W = RIGHT - TEXT_X; // 473 pt usable text column
const SECTION_ICON = 15; // section-heading glyph size (+25% for optical weight)
const CONTACT_ICON = 13; // slightly smaller glyph for the contact row
const HEAD_FS = 8.8; // section-heading label size

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
 * A section heading: grey icon in the gutter, cardinal-red tracked label, and a
 * grey rule beneath. Grouped as `section-chrome` so the reflow engine keeps the
 * three parts together when content pushes a heading to the next page.
 */
const sectionHead = (iconName, label, top) => [
    { ...icon(iconName, ICON_X, top, SECTION_ICON), flowRole: "section-chrome" },
    { ...tracked(text(label, HEAD_FS, SANS, CARDINAL, TEXT_X, top, 3), 1.5), flowRole: "section-chrome" },
    { ...line(TEXT_X, top + 17, CONTENT_W, 1, GREY, 2), flowRole: "section-chrome" },
];

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
    tracked(text("ANNA KOWALSKA", 28, SERIF, INK, TEXT_X, 52, 3), 0.15),
    tracked(text("DYREKTORKA STRATEGII I ROZWOJU", 9.4, SANS, CARDINAL, TEXT_X, 92, 3), 1.55),
    ...contact("email", ICON_X, TEXT_X, "anna.kowalska@email.com", 118),
    ...contact("phone", 250, 266, "+48 600 000 000", 118),
    ...contact("location", 420, 436, "Warszawa", 118),
    line(TEXT_X, 142, CONTENT_W, 1, GREY, 2),

    // ── Podsumowanie zawodowe ───────────────────────────────────────────────
    ...sectionHead("summary", "PODSUMOWANIE ZAWODOWE", 170),
    block(
        "Liderka strategii łącząca perspektywę biznesową z dyscypliną wykonania. "
        + "Buduję zespoły, które podejmują czytelne decyzje i konsekwentnie dowożą "
        + "mierzalne rezultaty bez utraty jakości relacji.",
        TEXT_X, 202, CONTENT_W, 44, 10.2, 15, BODY, SANS,
    ),

    // ── Doświadczenie zawodowe ──────────────────────────────────────────────
    ...sectionHead("experience", "DOŚWIADCZENIE ZAWODOWE", 268),
    bold(text("Dyrektorka Strategii  /  Northbridge Partners", 11, SANS, INK, TEXT_X, 303, 3)),
    text("2021 – obecnie  ·  Warszawa", 8.6, SANS, META, TEXT_X, 321, 3),
    bulleted(block(
        "• Zaprojektowała model wzrostu łączący cele finansowe z inicjatywami produktowymi.\n"
        + "• Uporządkowała rytm decyzji zarządu oraz raportowanie strategiczne.\n"
        + "• Prowadzi mentoring liderów odpowiedzialnych za kluczowe programy.",
        TEXT_X, 339, CONTENT_W, 54, 9.6, 13.6, BODY, SANS,
    )),
    bold(text("Menedżerka Rozwoju  /  Meridian Group", 11, SANS, INK, TEXT_X, 407, 3)),
    text("2016 – 2021  ·  Kraków", 8.6, SANS, META, TEXT_X, 425, 3),
    bulleted(block(
        "• Rozwinęła portfel projektów ekspansji na rynkach europejskich.\n"
        + "• Wprowadziła standardy współpracy między sprzedażą, produktem i finansami.",
        TEXT_X, 443, CONTENT_W, 38, 9.6, 13.6, BODY, SANS,
    )),

    // ── Wykształcenie ───────────────────────────────────────────────────────
    ...sectionHead("education", "WYKSZTAŁCENIE", 512),
    bold(text("Magister Zarządzania  /  SGH Warszawa", 10.6, SANS, INK, TEXT_X, 547, 3)),
    text("2011 – 2016", 8.6, SANS, META, TEXT_X, 565, 3),

    // ── Umiejętności ────────────────────────────────────────────────────────
    ...sectionHead("skills", "UMIEJĘTNOŚCI", 602),
    block(
        "Strategia  ·  Leadership  ·  P&L  ·  Negocjacje  ·  Transformacja organizacyjna",
        TEXT_X, 634, CONTENT_W, 24, 9.6, 13.6, BODY, SANS,
    ),

    // ── Języki ──────────────────────────────────────────────────────────────
    ...sectionHead("languages", "JĘZYKI", 680),
    block(
        "Polski — ojczysty  ·  Angielski — C1  ·  Francuski — B2",
        TEXT_X, 712, CONTENT_W, 20, 9.6, 13.6, BODY, SANS,
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
