/**
 * Icon-driven static layouts (Nova, Ridge, Loom, Volt).
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

    bold(text("ANNA KOWALSKA", 34, NOVA_DISP, NOVA_INK, 48, 42, 3)),
    tracked(text("DYREKTORKA STRATEGII I ROZWOJU", 9.2, NOVA_SANS, NOVA_ACCENT, 50, 88, 3), 1.8),

    iconBeside("nova", "email", 50, 118, NOVA_CONTACT_FS, NOVA_ICON),
    text("anna.kowalska@email.com", NOVA_CONTACT_FS, NOVA_SANS, NOVA_MUTE, 66, 118, 3),
    iconBeside("nova", "phone", 230, 118, NOVA_CONTACT_FS, NOVA_ICON),
    text("+48 600 000 000", NOVA_CONTACT_FS, NOVA_SANS, NOVA_MUTE, 246, 118, 3),
    iconBeside("nova", "location", 370, 118, NOVA_CONTACT_FS, NOVA_ICON),
    text("Warszawa", NOVA_CONTACT_FS, NOVA_SANS, NOVA_MUTE, 386, 118, 3),

    line(48, 144, 499, 1, NOVA_RULE, 2),

    iconBeside("nova", "summary", 48, 169, NOVA_HEAD_FS, NOVA_ICON),
    tracked(text("PODSUMOWANIE ZAWODOWE", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 66, 169, 3), 1.5),
    line(66, 186, 481, 1, NOVA_RULE, 1),
    block(
        "Łączę strategię biznesową z dyscypliną wykonania. Buduję zespoły, które podejmują czytelne decyzje i dowożą mierzalne rezultaty bez utraty jakości relacji.",
        66, 200, 481, 44, 10.2, 15, NOVA_BODY, NOVA_SANS
    ),

    iconBeside("nova", "experience", 48, 269, NOVA_HEAD_FS, NOVA_ICON),
    tracked(text("DOŚWIADCZENIE ZAWODOWE", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 66, 269, 3), 1.5),
    line(66, 286, 481, 1, NOVA_RULE, 1),
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

    iconBeside("nova", "education", 48, 521, NOVA_HEAD_FS, NOVA_ICON),
    tracked(text("WYKSZTAŁCENIE", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 66, 521, 3), 1.5),
    line(66, 538, 481, 1, NOVA_RULE, 1),
    bold(text("Magister Zarządzania  /  SGH Warszawa", 10.5, NOVA_SANS, NOVA_INK, 66, 556, 3)),
    text("2011 – 2016", 8.6, NOVA_SANS, NOVA_MUTE, 66, 574, 3),

    iconBeside("nova", "skills", 48, 611, NOVA_HEAD_FS, NOVA_ICON),
    tracked(text("UMIEJĘTNOŚCI", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 66, 611, 3), 1.5),
    line(66, 628, 481, 1, NOVA_RULE, 1),
    block("Strategia  ·  Leadership  ·  P&L  ·  Negocjacje  ·  Transformacja organizacyjna", 66, 644, 481, 24, 9.4, 13.5, NOVA_BODY, NOVA_SANS),

    iconBeside("nova", "languages", 48, 689, NOVA_HEAD_FS, NOVA_ICON),
    tracked(text("JĘZYKI", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 66, 689, 3), 1.5),
    line(66, 706, 481, 1, NOVA_RULE, 1),
    block("Polski — ojczysty  ·  Angielski — C1  ·  Francuski — B2", 66, 722, 481, 20, 9.4, 13.5, NOVA_BODY, NOVA_SANS),
];

// ── Ridge — cool teal spine with icons on the rail, Lora + Montserrat ───────
const RIDGE_PAPER = "#F3F6F8";
const RIDGE_INK = "#15202B";
const RIDGE_ACCENT = "#1F7A6C";
const RIDGE_MUTE = "#5A6B75";
const RIDGE_BODY = "#24323A";
const RIDGE_RULE = "#D0DADF";
const RIDGE_DISP = "Lora";
const RIDGE_SANS = "Montserrat";
const RIDGE_CONTACT_FS = 8.3;
const RIDGE_HEAD_FS = 8.5;
const RIDGE_ICON = 14;
const RIDGE_RAIL_ICON = 15;

export const ridgeTemplate = [
    fixed(line(0, 0, 595, 842, RIDGE_PAPER, 0)),
    fixed(line(0, 0, 28, 842, RIDGE_ACCENT, 1)),
    fixed(line(28, 0, 3, 842, "#9BCFC5", 1)),
    fixed(line(56, 800, 483, 1, RIDGE_RULE, 1)),
    fixed(text("01", 8, RIDGE_SANS, RIDGE_MUTE, 520, 808, 2)),

    bold(text("TOMASZ NOWAK", 30, RIDGE_DISP, RIDGE_INK, 56, 40, 3)),
    tracked(text("KIEROWNIK PROGRAMÓW TRANSFORMACJI", 8.8, RIDGE_SANS, RIDGE_ACCENT, 58, 82, 3), 1.4),

    iconBeside("ridge", "email", 56, 112, RIDGE_CONTACT_FS, RIDGE_ICON),
    text("tomasz.nowak@email.com", RIDGE_CONTACT_FS, RIDGE_SANS, RIDGE_MUTE, 72, 112, 3),
    iconBeside("ridge", "phone", 56, 130, RIDGE_CONTACT_FS, RIDGE_ICON),
    text("+48 600 000 000", RIDGE_CONTACT_FS, RIDGE_SANS, RIDGE_MUTE, 72, 130, 3),
    iconBeside("ridge", "location", 56, 148, RIDGE_CONTACT_FS, RIDGE_ICON),
    text("Gdańsk, Polska", RIDGE_CONTACT_FS, RIDGE_SANS, RIDGE_MUTE, 72, 148, 3),

    // Rail icons: same top as heading, centered in the 28px teal spine
    iconBeside("ridge", "summary", 8, 190, RIDGE_HEAD_FS, RIDGE_RAIL_ICON),
    tracked(text("PODSUMOWANIE ZAWODOWE", RIDGE_HEAD_FS, RIDGE_SANS, RIDGE_ACCENT, 56, 190, 3), 1.45),
    line(56, 207, 483, 1, RIDGE_RULE, 1),
    block(
        "Prowadzę złożone programy zmiany tak, aby strategia, ludzie i procesy szły w tym samym kierunku. Cenię spokojną precyzję i odpowiedzialność za efekt.",
        56, 222, 483, 42, 10, 14.8, RIDGE_BODY, RIDGE_SANS
    ),

    iconBeside("ridge", "experience", 8, 290, RIDGE_HEAD_FS, RIDGE_RAIL_ICON),
    tracked(text("DOŚWIADCZENIE ZAWODOWE", RIDGE_HEAD_FS, RIDGE_SANS, RIDGE_ACCENT, 56, 290, 3), 1.45),
    line(56, 307, 483, 1, RIDGE_RULE, 1),
    bold(text("Kierownik Programu  /  Baltic Systems", 11, RIDGE_SANS, RIDGE_INK, 56, 324, 3)),
    text("2020 – obecnie  ·  Gdańsk", 8.5, RIDGE_SANS, RIDGE_MUTE, 56, 342, 3),
    bulleted(block(
        "• Zsynchronizował roadmapy trzech pionów operacyjnych.\n• Wdrożył model zarządzania ryzykiem programowym.\n• Skrócił czas decyzji inwestycyjnych poprzez klarowny rytm raportowania.",
        56, 360, 483, 54, 9.4, 13.4, RIDGE_BODY, RIDGE_SANS
    )),
    bold(text("Starszy Konsultant  /  Harbour Advisory", 11, RIDGE_SANS, RIDGE_INK, 56, 434, 3)),
    text("2015 – 2020  ·  Warszawa", 8.5, RIDGE_SANS, RIDGE_MUTE, 56, 452, 3),
    bulleted(block(
        "• Wspierał transformacje operacyjne w sektorze usług.\n• Budował ramy współpracy między zarządem a zespołami wykonawczymi.",
        56, 470, 483, 40, 9.4, 13.4, RIDGE_BODY, RIDGE_SANS
    )),

    iconBeside("ridge", "education", 8, 536, RIDGE_HEAD_FS, RIDGE_RAIL_ICON),
    tracked(text("WYKSZTAŁCENIE", RIDGE_HEAD_FS, RIDGE_SANS, RIDGE_ACCENT, 56, 536, 3), 1.45),
    line(56, 553, 483, 1, RIDGE_RULE, 1),
    bold(text("Inżynieria Zarządzania  /  Politechnika Gdańska", 10.4, RIDGE_SANS, RIDGE_INK, 56, 570, 3)),
    text("2010 – 2015", 8.5, RIDGE_SANS, RIDGE_MUTE, 56, 588, 3),

    iconBeside("ridge", "skills", 8, 626, RIDGE_HEAD_FS, RIDGE_RAIL_ICON),
    tracked(text("UMIEJĘTNOŚCI", RIDGE_HEAD_FS, RIDGE_SANS, RIDGE_ACCENT, 56, 626, 3), 1.45),
    line(56, 643, 483, 1, RIDGE_RULE, 1),
    block("Program management  ·  Change  ·  Stakeholder leadership  ·  Lean  ·  Risk", 56, 658, 483, 22, 9.3, 13.4, RIDGE_BODY, RIDGE_SANS),

    iconBeside("ridge", "interests", 8, 702, RIDGE_HEAD_FS, RIDGE_RAIL_ICON),
    tracked(text("ZAINTERESOWANIA", RIDGE_HEAD_FS, RIDGE_SANS, RIDGE_ACCENT, 56, 702, 3), 1.45),
    line(56, 719, 483, 1, RIDGE_RULE, 1),
    block("Żeglarstwo  ·  Fotografia dokumentalna  ·  Literatura faktu", 56, 734, 483, 20, 9.3, 13.4, RIDGE_BODY, RIDGE_SANS),
];

// ── Loom — forest sidebar + gold accents, Cormorant + Montserrat ────────────
const LOOM_PAPER = "#FAF8F4";
const LOOM_SIDE = "#24352B";
const LOOM_GOLD = "#C4A35A";
const LOOM_INK = "#1C241E";
const LOOM_MUTE = "#6B7368";
const LOOM_BODY = "#2A322C";
const LOOM_RULE = "#DDD6C8";
const LOOM_LIGHT = "#F3E6C8";
const LOOM_DISP = "CormorantGaramond";
const LOOM_SANS = "Montserrat";
const LOOM_CONTACT_FS = 7.6;
const LOOM_SIDE_HEAD_FS = 7.4;
const LOOM_HEAD_FS = 8.5;
const LOOM_ICON = 14;
// Contact lines are ~7.6pt; a 9px glyph centres cleanly on the same top as the
// label without the optical section-head shift (which overshoots small type).
const LOOM_CONTACT_ICON = 11;

const LOOM_SIDE_TEXT_X = 40;
const LOOM_SIDE_BODY_W = 120;
const LOOM_SIDE_SECTION_GAP = 16;

/**
 * One Loom sidebar contact row: icon + single-line text on a shared baseline.
 * Uses geometric centring (`alignWithText: false`) so the three rows stay even.
 */
const loomContact = (name, label, y) => [
    {
        ...icon(
            "loom-light",
            name,
            24,
            y + (LOOM_CONTACT_FS - LOOM_CONTACT_ICON) / 2,
            LOOM_CONTACT_ICON,
        ),
        alignWithText: false,
    },
    text(label, LOOM_CONTACT_FS, LOOM_SANS, LOOM_LIGHT, LOOM_SIDE_TEXT_X, y, 3),
];

/**
 * Sidebar section heading: same geometric icon alignment as contact rows, and
 * the same text x as bodies so skills / interests / languages share one column.
 */
const loomSideHead = (name, label, y) => [
    {
        ...icon(
            "loom-light",
            name,
            24,
            y + (LOOM_SIDE_HEAD_FS - LOOM_ICON) / 2,
            LOOM_ICON,
        ),
        alignWithText: false,
    },
    tracked(text(label, LOOM_SIDE_HEAD_FS, LOOM_SANS, LOOM_GOLD, LOOM_SIDE_TEXT_X, y, 3), 1.2),
];

export const loomTemplate = [
    fixed(line(0, 0, 595, 842, LOOM_PAPER, 0)),
    fixed(line(0, 0, 176, 842, LOOM_SIDE, 1)),
    fixed(line(176, 0, 3, 842, LOOM_GOLD, 2)),
    fixed(line(204, 800, 343, 1, LOOM_RULE, 1)),
    fixed(text("01", 8, LOOM_SANS, LOOM_MUTE, 522, 808, 2)),

    bold(text("EWA", 22, LOOM_DISP, LOOM_LIGHT, 24, 42, 3)),
    bold(text("KAMIŃSKA", 22, LOOM_DISP, LOOM_GOLD, 24, 68, 3)),
    tracked(text("PRODUCT DESIGN LEAD", 7.8, LOOM_SANS, LOOM_GOLD, 24, 104, 3), 1.3),

    ...loomContact("email", "ewa.kaminska@email.com", 140),
    ...loomContact("phone", "+48 600 000 000", 162),
    ...loomContact("location", "Poznań", 184),

    // Packed sidebar stack: head → body → gap (same rhythm as the Python filler).
    ...(() => {
        const headAdvance = LOOM_SIDE_HEAD_FS * 1.35 + 6;
        let y = 240;
        const skillsHead = y;
        const skillsBody = y + headAdvance;
        const skillsH = 66;
        y = skillsBody + skillsH + LOOM_SIDE_SECTION_GAP;
        const langHead = y;
        const langBody = y + headAdvance;
        const langH = 42;
        y = langBody + langH + LOOM_SIDE_SECTION_GAP;
        const refHead = y;
        const refBody = y + headAdvance;
        return [
            ...loomSideHead("skills", "UMIEJĘTNOŚCI", skillsHead),
            bulleted(block(
                "• Design systems\n• Facylitacja\n• Research\n• Prototypowanie\n• Leadership",
                LOOM_SIDE_TEXT_X, skillsBody, LOOM_SIDE_BODY_W, skillsH, 7.8, 12, LOOM_LIGHT, LOOM_SANS,
            )),
            ...loomSideHead("languages", "JĘZYKI", langHead),
            bulleted(block(
                "• Polski — ojczysty\n• Angielski — C1\n• Niemiecki — B1",
                LOOM_SIDE_TEXT_X, langBody, LOOM_SIDE_BODY_W, langH, 7.8, 12, LOOM_LIGHT, LOOM_SANS,
            )),
            ...loomSideHead("references", "REFERENCJE", refHead),
            block(
                "Dostępne na życzenie",
                LOOM_SIDE_TEXT_X, refBody, LOOM_SIDE_BODY_W, 18, 7.8, 12, LOOM_LIGHT, LOOM_SANS,
            ),
        ];
    })(),

    iconBeside("loom", "summary", 204, 49, LOOM_HEAD_FS, LOOM_ICON),
    tracked(text("PODSUMOWANIE ZAWODOWE", LOOM_HEAD_FS, LOOM_SANS, LOOM_GOLD, 222, 49, 3), 1.4),
    line(222, 66, 325, 1, LOOM_RULE, 1),
    block(
        "Projektuję doświadczenia produktowe, w których estetyka służy klarowności decyzji. Łączę research, systemy projektowe i partnerską pracę z inżynierią.",
        222, 80, 325, 48, 9.8, 14.4, LOOM_BODY, LOOM_SANS
    ),

    iconBeside("loom", "experience", 204, 153, LOOM_HEAD_FS, LOOM_ICON),
    tracked(text("DOŚWIADCZENIE ZAWODOWE", LOOM_HEAD_FS, LOOM_SANS, LOOM_GOLD, 222, 153, 3), 1.4),
    line(222, 170, 325, 1, LOOM_RULE, 1),
    bold(text("Product Design Lead  /  Northfield", 10.8, LOOM_SANS, LOOM_INK, 222, 188, 3)),
    text("2021 – obecnie  ·  Poznań", 8.4, LOOM_SANS, LOOM_MUTE, 222, 206, 3),
    bulleted(block(
        "• Zbudowała design system używany przez kilka zespołów produktowych.\n• Uporządkowała proces discovery → delivery.\n• Prowadzi mentoring projektantów mid/senior.",
        222, 224, 325, 54, 9.2, 13.2, LOOM_BODY, LOOM_SANS
    )),
    bold(text("Senior Product Designer  /  Vantage", 10.8, LOOM_SANS, LOOM_INK, 222, 298, 3)),
    text("2016 – 2021  ·  Wrocław", 8.4, LOOM_SANS, LOOM_MUTE, 222, 316, 3),
    bulleted(block(
        "• Projektowała kluczowe ścieżki onboardingowe B2B.\n• Współtworzyła standardy badań jakościowych.",
        222, 334, 325, 40, 9.2, 13.2, LOOM_BODY, LOOM_SANS
    )),

    iconBeside("loom", "education", 204, 401, LOOM_HEAD_FS, LOOM_ICON),
    tracked(text("WYKSZTAŁCENIE", LOOM_HEAD_FS, LOOM_SANS, LOOM_GOLD, 222, 401, 3), 1.4),
    line(222, 418, 325, 1, LOOM_RULE, 1),
    bold(text("Wzornictwo  /  UAP Poznań", 10.4, LOOM_SANS, LOOM_INK, 222, 436, 3)),
    text("2011 – 2016", 8.4, LOOM_SANS, LOOM_MUTE, 222, 454, 3),

    iconBeside("loom", "interests", 204, 501, LOOM_HEAD_FS, LOOM_ICON),
    tracked(text("ZAINTERESOWANIA", LOOM_HEAD_FS, LOOM_SANS, LOOM_GOLD, 222, 501, 3), 1.4),
    line(222, 518, 325, 1, LOOM_RULE, 1),
    block("Typografia  ·  Ceramika  ·  Architektura wnętrz", 222, 534, 325, 22, 9.2, 13.2, LOOM_BODY, LOOM_SANS),

    iconBeside("loom", "certifications", 204, 581, LOOM_HEAD_FS, LOOM_ICON),
    tracked(text("CERTYFIKATY", LOOM_HEAD_FS, LOOM_SANS, LOOM_GOLD, 222, 581, 3), 1.4),
    line(222, 598, 325, 1, LOOM_RULE, 1),
    bulleted(block(
        "• NN/g UX Certification\n• Facilitation for Product Teams",
        222, 614, 325, 36, 9.2, 13.2, LOOM_BODY, LOOM_SANS
    )),
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
        chip(48, y, VOLT_CHIP_SIZE, VOLT_CHIP_SIZE),
        icon("volt", name, iconLeft, textTop, VOLT_ICON),
        tracked(text(label, VOLT_HEAD_FS, VOLT_SANS, VOLT_ACCENT, 78, textTop, 3), 1.35),
    ];
};

const voltContact = (name, chipLeft, y, chipW, label) => {
    const textTop = y + (VOLT_CHIP_SIZE - VOLT_CONTACT_FS) / 2;
    const iconLeft = chipLeft + 6;
    return [
        chip(chipLeft, y, chipW, VOLT_CHIP_SIZE),
        icon("volt", name, iconLeft, textTop, VOLT_ICON),
        text(label, VOLT_CONTACT_FS, VOLT_MONO, VOLT_BODY, iconLeft + VOLT_ICON + 6, textTop, 3),
    ];
};

export const voltTemplate = [
    fixed(line(0, 0, 595, 842, VOLT_BG, 0)),
    fixed(line(0, 0, 595, 4, VOLT_ACCENT, 2)),
    fixed(line(48, 800, 499, 1, VOLT_RULE, 1)),
    fixed(text("01", 8, VOLT_MONO, VOLT_MUTE, 522, 808, 2)),

    bold(text("MAREK LIS", 32, VOLT_SANS, VOLT_INK, 48, 36, 3)),
    tracked(text("STAFF ENGINEER · PLATFORM", 9, VOLT_MONO, VOLT_ACCENT, 50, 78, 3), 1.2),

    ...voltContact("email", 48, 108, 168, "marek.lis@email.com"),
    ...voltContact("phone", 224, 108, 148, "+48 600 000 000"),
    ...voltContact("location", 380, 108, 120, "Warszawa"),

    ...voltSection("summary", "PODSUMOWANIE ZAWODOWE", 148),
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
