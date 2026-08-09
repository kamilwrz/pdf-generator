/**
 * Portico template (`layouts: ["icons"]`).
 *
 * The only template that combines centered typography with icon chrome: the
 * name, title, contact row, and summary paragraph are all centered on the
 * page (an "Ivy League" masthead), while Experience / Education / Skills /
 * Languages stay left-aligned single-column with icon-in-gutter section
 * headings, matching the Cardinal / Nova body structure. The summary keeps
 * the same icon+heading chrome as every other section for stylistic
 * consistency — only its paragraph body is centered.
 *
 * Geometry mirrors the backend generator
 * (`backend/app/services/cv_templates/templates/portico.py`) exactly: these
 * coordinates were read off that generator's own output for equivalent demo
 * content, so the static picker preview matches what `/ai/fill_template`
 * produces for a real CV.
 *
 * Icon glyphs come from the shared icon pipeline
 * (`scripts/generate_iconic_icons.py`), rendered under the dedicated
 * `portico` theme in a warm bronze/taupe that matches the accent color.
 */
import API_BASE_URL from "../services/api.js";
import { block, bulleted, line, text } from "./helpers.js";

// ── Colour system ───────────────────────────────────────────────────────────
const PAPER = "#FCFBF8";
const INK = "#22221F";
const ACCENT = "#7C6A52"; // warm bronze/taupe — title, section labels, icons
const MUTE = "#83786B";
const BODY = "#2A2A28";
const RULE = "#E4DED2";

const SERIF = "Lora"; // display name only
const SANS = "Inter"; // everything else

// ── Layout geometry (A4 at 595×842 pt) ──────────────────────────────────────
const L = 76; // left/right symmetric margin — page center sits at 297.5
const W = 443; // content column width (595 - 2×76)
const ICON_X = 54; // section-heading icon gutter
const SECTION_ICON = 14;
const CONTACT_ICON = 12;
const HEAD_FS = 8.5;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const fixed = (element) => ({ ...element, fixedToPage: true });
const masthead = (element) => ({ ...element, flowRole: "masthead" });
const chrome = (element) => ({ ...element, flowRole: "section-chrome" });

/**
 * A bronze line-art glyph from the `portico` icon theme.
 *
 * `top` stores the companion label's CSS top (not a pre-shifted image top);
 * `alignWithText` lets the canvas and PDF center the glyph on that text line
 * so it reads level with the caps rather than floating above them.
 */
const icon = (name, left, top, size) => ({
    category: "image",
    src: `${API_BASE_URL}/template-assets/iconic/portico/${name}.png`,
    width: size,
    height: size,
    left,
    top,
    zIndex: 3,
    alignWithText: true,
});

/**
 * A section heading: bronze icon in the gutter, tracked label, and a hairline
 * rule beneath. Grouped as `section-chrome` so the reflow engine keeps the
 * three parts together when content pushes a heading to the next page.
 */
const sectionHead = (iconName, label, top) => [
    chrome(icon(iconName, ICON_X, top, SECTION_ICON)),
    chrome(tracked(text(label, HEAD_FS, SANS, ACCENT, L, top, 3), 1.45)),
    chrome(line(L, top + 13.5, W, 1, RULE, 1)),
];

/** One masthead contact detail: icon plus its muted label on a shared row. */
const contact = (iconName, left, textLeft, label, top) => [
    masthead(icon(iconName, left, top, CONTACT_ICON)),
    masthead(text(label, 8.4, SANS, MUTE, textLeft, top, 3)),
];

const porticoElements = [
    // Page surface + footer chrome. Fixed so they never participate in reflow.
    fixed(line(0, 0, 595, 842, PAPER, 0)),
    fixed(line(L, 800, W, 1, RULE, 1)),
    fixed(text("01", 8, SANS, MUTE, 504, 808, 2)),

    // ── Masthead: centered name, title, and a two-row centered contact band ──
    masthead(bold(block("Anna Kowalska", L, 58, W, 33, 29, 33, INK, SERIF, 0, 3, "center"))),
    masthead(tracked(block(
        "Dyrektorka Strategii i Rozwoju", L, 101, W, 14, 10, 14, ACCENT, SANS, 0, 3, "center",
    ), 2.0)),
    ...contact("phone", 90.2, 103.2, "+48 600 000 000", 129),
    ...contact("email", 197.2, 210.2, "anna.kowalska@email.com", 129),
    ...contact("linkedin", 345.8, 358.8, "linkedin.com/in/akowalska", 129),
    ...contact("github", 195.7, 208.7, "github.com/akowalska", 144),
    ...contact("location", 328.7, 341.7, "Warszawa", 144),
    masthead(line(L, 166, W, 1, RULE, 2)),

    // ── Podsumowanie zawodowe (centered paragraph, icon+heading chrome) ─────
    ...sectionHead("summary", "PODSUMOWANIE ZAWODOWE", 203),
    block(
        "Liderka strategii łącząca perspektywę biznesową z dyscypliną wykonania. "
        + "Buduję zespoły, które podejmują czytelne decyzje i konsekwentnie dowożą "
        + "mierzalne rezultaty bez utraty jakości relacji.",
        L, 224.5, W, 27, 9.4, 13.4, BODY, SANS, 0, 2, "center",
    ),

    // ── Doświadczenie zawodowe ───────────────────────────────────────────────
    ...sectionHead("experience", "DOŚWIADCZENIE ZAWODOWE", 272.5),
    bold(text("Dyrektorka Strategii  /  Northbridge Partners", 11, SANS, INK, L, 294, 3)),
    text("2021 – obecnie  ·  Warszawa", 8.5, SANS, MUTE, L, 313, 3),
    bulleted(block(
        "• Zaprojektowała model wzrostu łączący cele finansowe z inicjatywami produktowymi.\n"
        + "• Uporządkowała rytm decyzji zarządu oraz raportowanie strategiczne.\n"
        + "• Prowadzi mentoring liderów odpowiedzialnych za kluczowe programy.",
        L, 329, W, 41, 9.4, 13.4, BODY, SANS,
    )),
    bold(text("Menedżerka Rozwoju  /  Meridian Group", 11, SANS, INK, L, 380, 3)),
    text("2016 – 2021  ·  Kraków", 8.5, SANS, MUTE, L, 399, 3),
    bulleted(block(
        "• Rozwinęła portfel projektów ekspansji na rynkach europejskich.\n"
        + "• Wprowadziła standardy współpracy między sprzedażą, produktem i finansami.",
        L, 415, W, 27, 9.4, 13.4, BODY, SANS,
    )),

    // ── Wykształcenie ───────────────────────────────────────────────────────
    ...sectionHead("education", "WYKSZTAŁCENIE", 463),
    bold(text("Magister Zarządzania  /  SGH Warszawa", 10.4, SANS, INK, L, 484.4, 3)),
    text("2011 – 2016", 8.5, SANS, MUTE, L, 501.4, 3),

    // ── Umiejętności ────────────────────────────────────────────────────────
    ...sectionHead("skills", "UMIEJĘTNOŚCI", 534.4),
    block(
        "Strategia  ·  Leadership  ·  P&L  ·  Negocjacje  ·  Transformacja organizacyjna",
        L, 555.9, W, 14, 9.3, 13.4, BODY, SANS,
    ),

    // ── Języki ──────────────────────────────────────────────────────────────
    ...sectionHead("languages", "JĘZYKI", 590.9),
    bulleted(block(
        "• Polski — ojczysty\n• Angielski — C1\n• Francuski — B2",
        L, 612.4, W, 41, 9.3, 13.4, BODY, SANS,
    )),
];

/**
 * Tag content for the reflow engine. Elements that already declare their role
 * (`fixedToPage` chrome, `masthead`/`section-chrome` chrome) are preserved as
 * authored; everything else becomes flowing `content`, and textareas keep
 * their measured initial geometry so the loaded layout matches this authored
 * spec exactly.
 */
export const porticoTemplate = porticoElements.map((element) => (
    element.fixedToPage || element.flowRole
        ? element
        : {
            ...element,
            flowRole: "content",
            ...(element.category === "textarea" ? { preserveInitialLayout: true } : {}),
        }
));
