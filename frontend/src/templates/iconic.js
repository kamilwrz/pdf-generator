/**
 * Icon-driven static layouts (Nova, Volt).
 *
 * Shared frontend specs for templates tagged `layouts: ["icons", …]`. Icons
 * live in /template-assets/iconic/<theme>/. Cardinal and Harbor keep their own
 * files but reuse the same asset pipeline.
 *
 * Alignment rule: icons share the text line's top edge (never float above the
 * label). Icon size stays close to the label size so caps and glyphs read level.
 */
import API_BASE_URL from "../services/api.js";
import { block, bulleted, line, text } from "./helpers.js";

const icon = (theme, name, left, top, size = 11, zIndex = 3) => ({
    category: "image",
    src: `${API_BASE_URL}/template-assets/iconic/${theme}/${name}.png`,
    width: size,
    height: size,
    left,
    top,
    zIndex,
    // `top` is the companion label's CSS top; canvas + PDF centre the glyph on that line.
    alignWithText: true,
    // Default ownership for contact/masthead glyphs; section chrome overwrites.
    flowRole: "masthead",
});

/**
 * Place an icon on the same row as a text label.
 * Stores the label's `top` (not a pre-shifted image top) so PDF/canvas
 * optical alignment can centre the glyph on the caps.
 */
const iconBeside = (theme, name, left, textTop, _textFs, size = 11) =>
    icon(theme, name, left, textTop, size);

const bold = (el) => ({ ...el, bold: true });
const tracked = (el, letterSpacing) => ({ ...el, letterSpacing });
const fixed = (el) => ({ ...el, fixedToPage: true });
const masthead = (el) => ({ ...el, flowRole: "masthead" });
const chrome = (el) => ({ ...el, flowRole: "section-chrome" });

// ── Nova — warm editorial masthead, Playfair + Montserrat ───────────────────
const NOVA_PAPER = "#F7F1E8";
const NOVA_INK = "#1A1612";
const NOVA_ACCENT = "#C45C26";
const NOVA_MUTE = "#7A6550";
const NOVA_BODY = "#2C241C";
const NOVA_RULE = "#E0D2C0";
const NOVA_DISP = "PlayfairDisplay";
const NOVA_SANS = "Montserrat";
const NOVA_CONTACT_FS = 8.4;
const NOVA_HEAD_FS = 8.6;
const NOVA_ICON = 14;

export const novaTemplate = [
    fixed(line(0, 0, 595, 842, NOVA_PAPER, 0)),
    fixed(line(0, 0, 595, 6, NOVA_ACCENT, 2)),
    fixed(line(48, 800, 499, 1, NOVA_RULE, 1)),
    fixed(text("01", 8, NOVA_SANS, NOVA_MUTE, 522, 808, 2)),

    masthead(bold(text("ANNA KOWALSKA", 34, NOVA_DISP, NOVA_INK, 48, 42, 3))),
    masthead(tracked(text("DYREKTORKA STRATEGII I ROZWOJU", 9.2, NOVA_SANS, NOVA_ACCENT, 50, 88, 3), 1.8)),

    iconBeside("nova", "email", 50, 118, NOVA_CONTACT_FS, NOVA_ICON),
    masthead(text("anna.kowalska@email.com", NOVA_CONTACT_FS, NOVA_SANS, NOVA_MUTE, 66, 118, 3)),
    iconBeside("nova", "phone", 230, 118, NOVA_CONTACT_FS, NOVA_ICON),
    masthead(text("+48 600 000 000", NOVA_CONTACT_FS, NOVA_SANS, NOVA_MUTE, 246, 118, 3)),
    iconBeside("nova", "location", 370, 118, NOVA_CONTACT_FS, NOVA_ICON),
    masthead(text("Warszawa", NOVA_CONTACT_FS, NOVA_SANS, NOVA_MUTE, 386, 118, 3)),
    iconBeside("nova", "linkedin", 50, 134, NOVA_CONTACT_FS, NOVA_ICON),
    masthead(text("linkedin.com/in/akowalska", NOVA_CONTACT_FS, NOVA_SANS, NOVA_MUTE, 66, 134, 3)),
    iconBeside("nova", "github", 230, 134, NOVA_CONTACT_FS, NOVA_ICON),
    masthead(text("github.com/akowalska", NOVA_CONTACT_FS, NOVA_SANS, NOVA_MUTE, 246, 134, 3)),

    masthead(line(48, 160, 499, 1, NOVA_RULE, 2)),

    chrome(iconBeside("nova", "summary", 48, 169, NOVA_HEAD_FS, NOVA_ICON)),
    chrome(tracked(text("PODSUMOWANIE ZAWODOWE", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 66, 169, 3), 1.5)),
    chrome(line(66, 186, 481, 1, NOVA_RULE, 1)),
    block(
        "Łączę strategię biznesową z dyscypliną wykonania. Buduję zespoły, które podejmują czytelne decyzje i dowożą mierzalne rezultaty bez utraty jakości relacji.",
        66, 200, 481, 44, 10.2, 15, NOVA_BODY, NOVA_SANS
    ),

    chrome(iconBeside("nova", "experience", 48, 269, NOVA_HEAD_FS, NOVA_ICON)),
    chrome(tracked(text("DOŚWIADCZENIE ZAWODOWE", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 66, 269, 3), 1.5)),
    chrome(line(66, 286, 481, 1, NOVA_RULE, 1)),
    bold(text("Dyrektorka Strategii  /  Northbridge Partners", 11, NOVA_SANS, NOVA_INK, 66, 304, 3)),
    text("2021 – obecnie  ·  Warszawa", 8.6, NOVA_SANS, NOVA_MUTE, 66, 322, 3),
    bulleted(block(
        "• Zaprojektowała model wzrostu łączący cele finansowe z inicjatywami produktowymi.\n• Uporządkowała rytm decyzji zarządu i raportowanie strategiczne.\n• Prowadzi mentoring liderów odpowiedzialnych za kluczowe programy.",
        66, 340, 481, 56, 9.5, 13.5, NOVA_BODY, NOVA_SANS
    )),
    bold(text("Menedżerka Rozwoju  /  Meridian Group", 11, NOVA_SANS, NOVA_INK, 66, 416, 3)),
    text("2016 – 2021  ·  Kraków", 8.6, NOVA_SANS, NOVA_MUTE, 66, 434, 3),
    bulleted(block(
        "• Rozwinęła portfel projektów ekspansji na rynkach europejskich.\n• Wprowadziła standardy współpracy między sprzedażą, produktem i finansami.",
        66, 452, 481, 42, 9.5, 13.5, NOVA_BODY, NOVA_SANS
    )),

    chrome(iconBeside("nova", "education", 48, 521, NOVA_HEAD_FS, NOVA_ICON)),
    chrome(tracked(text("WYKSZTAŁCENIE", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 66, 521, 3), 1.5)),
    chrome(line(66, 538, 481, 1, NOVA_RULE, 1)),
    bold(text("Magister Zarządzania  /  SGH Warszawa", 10.5, NOVA_SANS, NOVA_INK, 66, 556, 3)),
    text("2011 – 2016", 8.6, NOVA_SANS, NOVA_MUTE, 66, 574, 3),

    chrome(iconBeside("nova", "skills", 48, 611, NOVA_HEAD_FS, NOVA_ICON)),
    chrome(tracked(text("UMIEJĘTNOŚCI", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 66, 611, 3), 1.5)),
    chrome(line(66, 628, 481, 1, NOVA_RULE, 1)),
    block("Strategia  ·  Leadership  ·  P&L  ·  Negocjacje  ·  Transformacja organizacyjna", 66, 644, 481, 24, 9.4, 13.5, NOVA_BODY, NOVA_SANS),

    chrome(iconBeside("nova", "languages", 48, 689, NOVA_HEAD_FS, NOVA_ICON)),
    chrome(tracked(text("JĘZYKI", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 66, 689, 3), 1.5)),
    chrome(line(66, 706, 481, 1, NOVA_RULE, 1)),
    block("Polski — ojczysty  ·  Angielski — C1  ·  Francuski — B2", 66, 722, 481, 20, 9.4, 13.5, NOVA_BODY, NOVA_SANS),
];

// ── Volt — dark amber signal chips, Montserrat + JetBrains Mono ─────────────
const VOLT_BG = "#0F1218";
const VOLT_ACCENT = "#E8A838";
const VOLT_INK = "#E8ECF0";
const VOLT_MUTE = "#8B93A0";
const VOLT_BODY = "#C5CCD6";
const VOLT_RULE = "#2A3140";
const VOLT_CHIP = "#1A2030";
const VOLT_SANS = "Montserrat";
const VOLT_MONO = "JetBrainsMono";
const VOLT_CONTACT_FS = 7.8;
const VOLT_HEAD_FS = 8.4;
const VOLT_CHIP_SIZE = 20;
const VOLT_ICON = 15;

const chip = (left, top, w, h) => ({
    category: "rectangle",
    left, top, width: w, height: h,
    backgroundColor: VOLT_CHIP,
    borderWidth: 1,
    zIndex: 1,
});

/**
 * One section mark: chip + icon + label on a single baseline.
 * Icon and label share the same logical `top` (text line); the chip frames them.
 */
const voltSection = (name, label, y) => {
    const textTop = y + (VOLT_CHIP_SIZE - VOLT_HEAD_FS) / 2;
    const iconLeft = 48 + (VOLT_CHIP_SIZE - VOLT_ICON) / 2;
    return [
        chrome(chip(48, y, VOLT_CHIP_SIZE, VOLT_CHIP_SIZE)),
        chrome(icon("volt", name, iconLeft, textTop, VOLT_ICON)),
        chrome(tracked(text(label, VOLT_HEAD_FS, VOLT_SANS, VOLT_ACCENT, 78, textTop, 3), 1.35)),
    ];
};

const voltContact = (name, chipLeft, y, chipW, label) => {
    const textTop = y + (VOLT_CHIP_SIZE - VOLT_CONTACT_FS) / 2;
    const iconLeft = chipLeft + 6;
    return [
        masthead(chip(chipLeft, y, chipW, VOLT_CHIP_SIZE)),
        icon("volt", name, iconLeft, textTop, VOLT_ICON),
        masthead(text(label, VOLT_CONTACT_FS, VOLT_MONO, VOLT_BODY, iconLeft + VOLT_ICON + 6, textTop, 3)),
    ];
};

export const voltTemplate = [
    fixed(line(0, 0, 595, 842, VOLT_BG, 0)),
    fixed(line(0, 0, 595, 4, VOLT_ACCENT, 2)),
    fixed(line(48, 800, 499, 1, VOLT_RULE, 1)),
    fixed(text("01", 8, VOLT_MONO, VOLT_MUTE, 522, 808, 2)),

    masthead(bold(text("MAREK LIS", 32, VOLT_SANS, VOLT_INK, 48, 36, 3))),
    masthead(tracked(text("STAFF ENGINEER · PLATFORM", 9, VOLT_MONO, VOLT_ACCENT, 50, 78, 3), 1.2)),

    ...voltContact("email", 48, 108, 168, "marek.lis@email.com"),
    ...voltContact("phone", 224, 108, 148, "+48 600 000 000"),
    ...voltContact("location", 380, 108, 120, "Warszawa"),
    ...voltContact("linkedin", 48, 136, 168, "linkedin.com/in/mlis"),
    ...voltContact("github", 224, 136, 148, "github.com/mlis"),

    ...voltSection("summary", "PODSUMOWANIE ZAWODOWE", 176),
    line(78, 174, 469, 1, VOLT_RULE, 1),
    block(
        "Buduję platformy, które zdejmują złożoność z zespołów produktowych. Łączę architekturę, observability i kulturę właścicielstwa usług.",
        78, 188, 469, 42, 10, 14.6, VOLT_BODY, VOLT_SANS
    ),

    ...voltSection("experience", "DOŚWIADCZENIE ZAWODOWE", 250),
    line(78, 276, 469, 1, VOLT_RULE, 1),
    bold(text("Staff Engineer  /  Northstar Cloud", 11, VOLT_SANS, VOLT_INK, 78, 294, 3)),
    text("2021 – obecnie  ·  Platform Engineering", 8.4, VOLT_MONO, VOLT_MUTE, 78, 312, 3),
    bulleted(block(
        "• Zaprojektował warstwę eventową dla krytycznych procesów.\n• Ujednolicił standardy SLO i on-call w kilku teamach.\n• Skrócił czas wdrożeń poprzez platformę self-service.",
        78, 330, 469, 54, 9.4, 13.4, VOLT_BODY, VOLT_SANS
    )),
    bold(text("Senior Backend Engineer  /  Orbit Labs", 11, VOLT_SANS, VOLT_INK, 78, 404, 3)),
    text("2016 – 2021  ·  Distributed Systems", 8.4, VOLT_MONO, VOLT_MUTE, 78, 422, 3),
    bulleted(block(
        "• Rozwijał API i pipeline’y danych dla produktu multi-market.\n• Współtworzył praktyki code review i dokumentacji architektonicznej.",
        78, 440, 469, 40, 9.4, 13.4, VOLT_BODY, VOLT_SANS
    )),

    ...voltSection("education", "WYKSZTAŁCENIE", 504),
    line(78, 530, 469, 1, VOLT_RULE, 1),
    bold(text("Informatyka  /  Politechnika Warszawska", 10.4, VOLT_SANS, VOLT_INK, 78, 548, 3)),
    text("2011 – 2016", 8.4, VOLT_MONO, VOLT_MUTE, 78, 566, 3),

    ...voltSection("skills", "UMIEJĘTNOŚCI", 600),
    line(78, 626, 469, 1, VOLT_RULE, 1),
    block("Go  ·  TypeScript  ·  Kubernetes  ·  AWS  ·  Observability  ·  System design", 78, 642, 469, 22, 9.3, 13.4, VOLT_BODY, VOLT_SANS),

    ...voltSection("languages", "JĘZYKI", 682),
    line(78, 708, 469, 1, VOLT_RULE, 1),
    block("Polski — ojczysty  ·  Angielski — C1", 78, 724, 469, 18, 9.3, 13.4, VOLT_BODY, VOLT_SANS),
];
