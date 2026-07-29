/**
 * Iconic family — four layouts that pair section/contact icons with distinct
 * typography and colour systems. Icons live in /template-assets/iconic/<theme>/.
 *
 * Icon tops are optically centered on the accompanying text line
 * (`textTop + (fontSize - iconSize) / 2`) so glyphs sit level with caps.
 */
import API_BASE_URL from "../services/api";
import { block, bulleted, line, text } from "./helpers";

const icon = (theme, name, left, top, size = 12, zIndex = 3) => ({
    category: "image",
    src: `${API_BASE_URL}/template-assets/iconic/${theme}/${name}.png`,
    width: size,
    height: size,
    left,
    top,
    zIndex,
});

/** Place icon vertically centered on a text line. */
const iconBeside = (theme, name, left, textTop, textFs, size = 12) =>
    icon(theme, name, left, textTop + (textFs - size) / 2, size);

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
const NOVA_ICON = 12;
const NOVA_SECTION_ICON = 13;

export const novaTemplate = [
    fixed(line(0, 0, 595, 842, NOVA_PAPER, 0)),
    fixed(line(0, 0, 595, 6, NOVA_ACCENT, 2)),
    fixed(line(48, 800, 499, 1, NOVA_RULE, 1)),
    fixed(text("01", 8, NOVA_SANS, NOVA_MUTE, 522, 808, 2)),

    bold(text("ANNA KOWALSKA", 34, NOVA_DISP, NOVA_INK, 48, 42, 3)),
    tracked(text("DYREKTORKA STRATEGII I ROZWOJU", 9.2, NOVA_SANS, NOVA_ACCENT, 50, 88, 3), 1.8),

    iconBeside("nova", "email", 50, 118, NOVA_CONTACT_FS, NOVA_ICON),
    text("anna.kowalska@email.com", NOVA_CONTACT_FS, NOVA_SANS, NOVA_MUTE, 68, 118, 3),
    iconBeside("nova", "phone", 230, 118, NOVA_CONTACT_FS, NOVA_ICON),
    text("+48 600 000 000", NOVA_CONTACT_FS, NOVA_SANS, NOVA_MUTE, 248, 118, 3),
    iconBeside("nova", "location", 370, 118, NOVA_CONTACT_FS, NOVA_ICON),
    text("Warszawa", NOVA_CONTACT_FS, NOVA_SANS, NOVA_MUTE, 388, 118, 3),

    line(48, 144, 499, 1, NOVA_RULE, 2),

    iconBeside("nova", "summary", 48, 169, NOVA_HEAD_FS, NOVA_SECTION_ICON),
    tracked(text("PODSUMOWANIE ZAWODOWE", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 68, 169, 3), 1.5),
    line(68, 186, 479, 1, NOVA_RULE, 1),
    block(
        "Łączę strategię biznesową z dyscypliną wykonania. Buduję zespoły, które podejmują czytelne decyzje i dowożą mierzalne rezultaty bez utraty jakości relacji.",
        68, 200, 479, 44, 10.2, 15, NOVA_BODY, NOVA_SANS
    ),

    iconBeside("nova", "experience", 48, 269, NOVA_HEAD_FS, NOVA_SECTION_ICON),
    tracked(text("DOŚWIADCZENIE ZAWODOWE", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 68, 269, 3), 1.5),
    line(68, 286, 479, 1, NOVA_RULE, 1),
    bold(text("Dyrektorka Strategii  /  Northbridge Partners", 11, NOVA_SANS, NOVA_INK, 68, 304, 3)),
    text("2021 – obecnie  ·  Warszawa", 8.6, NOVA_SANS, NOVA_MUTE, 68, 322, 3),
    bulleted(block(
        "• Zaprojektowała model wzrostu łączący cele finansowe z inicjatywami produktowymi.\n• Uporządkowała rytm decyzji zarządu i raportowanie strategiczne.\n• Prowadzi mentoring liderów odpowiedzialnych za kluczowe programy.",
        68, 340, 479, 56, 9.5, 13.5, NOVA_BODY, NOVA_SANS
    )),
    bold(text("Menedżerka Rozwoju  /  Meridian Group", 11, NOVA_SANS, NOVA_INK, 68, 416, 3)),
    text("2016 – 2021  ·  Kraków", 8.6, NOVA_SANS, NOVA_MUTE, 68, 434, 3),
    bulleted(block(
        "• Rozwinęła portfel projektów ekspansji na rynkach europejskich.\n• Wprowadziła standardy współpracy między sprzedażą, produktem i finansami.",
        68, 452, 479, 42, 9.5, 13.5, NOVA_BODY, NOVA_SANS
    )),

    iconBeside("nova", "education", 48, 521, NOVA_HEAD_FS, NOVA_SECTION_ICON),
    tracked(text("WYKSZTAŁCENIE", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 68, 521, 3), 1.5),
    line(68, 538, 479, 1, NOVA_RULE, 1),
    bold(text("Magister Zarządzania  /  SGH Warszawa", 10.5, NOVA_SANS, NOVA_INK, 68, 556, 3)),
    text("2011 – 2016", 8.6, NOVA_SANS, NOVA_MUTE, 68, 574, 3),

    iconBeside("nova", "skills", 48, 611, NOVA_HEAD_FS, NOVA_SECTION_ICON),
    tracked(text("UMIEJĘTNOŚCI", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 68, 611, 3), 1.5),
    line(68, 628, 479, 1, NOVA_RULE, 1),
    block("Strategia  ·  Leadership  ·  P&L  ·  Negocjacje  ·  Transformacja organizacyjna", 68, 644, 479, 24, 9.4, 13.5, NOVA_BODY, NOVA_SANS),

    iconBeside("nova", "languages", 48, 689, NOVA_HEAD_FS, NOVA_SECTION_ICON),
    tracked(text("JĘZYKI", NOVA_HEAD_FS, NOVA_SANS, NOVA_ACCENT, 68, 689, 3), 1.5),
    line(68, 706, 479, 1, NOVA_RULE, 1),
    block("Polski — ojczysty  ·  Angielski — C1  ·  Francuski — B2", 68, 722, 479, 20, 9.4, 13.5, NOVA_BODY, NOVA_SANS),
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
const RIDGE_ICON = 12;
const RIDGE_SECTION_ICON = 14;

export const ridgeTemplate = [
    fixed(line(0, 0, 595, 842, RIDGE_PAPER, 0)),
    fixed(line(0, 0, 28, 842, RIDGE_ACCENT, 1)),
    fixed(line(28, 0, 3, 842, "#9BCFC5", 1)),
    fixed(line(56, 800, 483, 1, RIDGE_RULE, 1)),
    fixed(text("01", 8, RIDGE_SANS, RIDGE_MUTE, 520, 808, 2)),

    bold(text("TOMASZ NOWAK", 30, RIDGE_DISP, RIDGE_INK, 56, 40, 3)),
    tracked(text("KIEROWNIK PROGRAMÓW TRANSFORMACJI", 8.8, RIDGE_SANS, RIDGE_ACCENT, 58, 82, 3), 1.4),

    iconBeside("ridge", "email", 56, 112, RIDGE_CONTACT_FS, RIDGE_ICON),
    text("tomasz.nowak@email.com", RIDGE_CONTACT_FS, RIDGE_SANS, RIDGE_MUTE, 74, 112, 3),
    iconBeside("ridge", "phone", 56, 130, RIDGE_CONTACT_FS, RIDGE_ICON),
    text("+48 600 000 000", RIDGE_CONTACT_FS, RIDGE_SANS, RIDGE_MUTE, 74, 130, 3),
    iconBeside("ridge", "location", 56, 148, RIDGE_CONTACT_FS, RIDGE_ICON),
    text("Gdańsk, Polska", RIDGE_CONTACT_FS, RIDGE_SANS, RIDGE_MUTE, 74, 148, 3),

    // Rail icons centered on the teal spine (31px wide → mid ≈ 14)
    iconBeside("ridge", "summary", 8, 190, RIDGE_HEAD_FS, RIDGE_SECTION_ICON),
    tracked(text("PODSUMOWANIE ZAWODOWE", RIDGE_HEAD_FS, RIDGE_SANS, RIDGE_ACCENT, 56, 190, 3), 1.45),
    line(56, 207, 483, 1, RIDGE_RULE, 1),
    block(
        "Prowadzę złożone programy zmiany tak, aby strategia, ludzie i procesy szły w tym samym kierunku. Cenię spokojną precyzję i odpowiedzialność za efekt.",
        56, 222, 483, 42, 10, 14.8, RIDGE_BODY, RIDGE_SANS
    ),

    iconBeside("ridge", "experience", 8, 290, RIDGE_HEAD_FS, RIDGE_SECTION_ICON),
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

    iconBeside("ridge", "education", 8, 536, RIDGE_HEAD_FS, RIDGE_SECTION_ICON),
    tracked(text("WYKSZTAŁCENIE", RIDGE_HEAD_FS, RIDGE_SANS, RIDGE_ACCENT, 56, 536, 3), 1.45),
    line(56, 553, 483, 1, RIDGE_RULE, 1),
    bold(text("Inżynieria Zarządzania  /  Politechnika Gdańska", 10.4, RIDGE_SANS, RIDGE_INK, 56, 570, 3)),
    text("2010 – 2015", 8.5, RIDGE_SANS, RIDGE_MUTE, 56, 588, 3),

    iconBeside("ridge", "skills", 8, 626, RIDGE_HEAD_FS, RIDGE_SECTION_ICON),
    tracked(text("UMIEJĘTNOŚCI", RIDGE_HEAD_FS, RIDGE_SANS, RIDGE_ACCENT, 56, 626, 3), 1.45),
    line(56, 643, 483, 1, RIDGE_RULE, 1),
    block("Program management  ·  Change  ·  Stakeholder leadership  ·  Lean  ·  Risk", 56, 658, 483, 22, 9.3, 13.4, RIDGE_BODY, RIDGE_SANS),

    iconBeside("ridge", "interests", 8, 702, RIDGE_HEAD_FS, RIDGE_SECTION_ICON),
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
const LOOM_ICON = 12;
const LOOM_SECTION_ICON = 13;

export const loomTemplate = [
    fixed(line(0, 0, 595, 842, LOOM_PAPER, 0)),
    fixed(line(0, 0, 176, 842, LOOM_SIDE, 1)),
    fixed(line(176, 0, 3, 842, LOOM_GOLD, 2)),
    fixed(line(204, 800, 343, 1, LOOM_RULE, 1)),
    fixed(text("01", 8, LOOM_SANS, LOOM_MUTE, 522, 808, 2)),

    bold(text("EWA", 22, LOOM_DISP, LOOM_LIGHT, 24, 42, 3)),
    bold(text("KAMIŃSKA", 22, LOOM_DISP, LOOM_GOLD, 24, 68, 3)),
    tracked(text("PRODUCT DESIGN LEAD", 7.8, LOOM_SANS, LOOM_GOLD, 24, 104, 3), 1.3),

    iconBeside("loom-light", "email", 24, 140, LOOM_CONTACT_FS, LOOM_ICON),
    block("ewa.kaminska@email.com", 42, 138, 118, 20, LOOM_CONTACT_FS, 11, LOOM_LIGHT, LOOM_SANS),
    iconBeside("loom-light", "phone", 24, 168, LOOM_CONTACT_FS, LOOM_ICON),
    text("+48 600 000 000", LOOM_CONTACT_FS, LOOM_SANS, LOOM_LIGHT, 42, 168, 3),
    iconBeside("loom-light", "location", 24, 196, LOOM_CONTACT_FS, LOOM_ICON),
    text("Poznań", LOOM_CONTACT_FS, LOOM_SANS, LOOM_LIGHT, 42, 196, 3),

    iconBeside("loom-light", "skills", 24, 251, LOOM_SIDE_HEAD_FS, LOOM_ICON),
    tracked(text("UMIEJĘTNOŚCI", LOOM_SIDE_HEAD_FS, LOOM_SANS, LOOM_GOLD, 42, 251, 3), 1.2),
    bulleted(block(
        "• Design systems\n• Facylitacja\n• Research\n• Prototypowanie\n• Leadership",
        24, 274, 132, 78, 7.8, 12, LOOM_LIGHT, LOOM_SANS
    )),

    iconBeside("loom-light", "languages", 24, 381, LOOM_SIDE_HEAD_FS, LOOM_ICON),
    tracked(text("JĘZYKI", LOOM_SIDE_HEAD_FS, LOOM_SANS, LOOM_GOLD, 42, 381, 3), 1.2),
    bulleted(block("• Polski — ojczysty\n• Angielski — C1\n• Niemiecki — B1", 24, 404, 132, 48, 7.8, 12, LOOM_LIGHT, LOOM_SANS)),

    iconBeside("loom-light", "references", 24, 481, LOOM_SIDE_HEAD_FS, LOOM_ICON),
    tracked(text("REFERENCJE", LOOM_SIDE_HEAD_FS, LOOM_SANS, LOOM_GOLD, 42, 481, 3), 1.2),
    block("Dostępne na życzenie", 24, 504, 132, 18, 7.8, 12, LOOM_LIGHT, LOOM_SANS),

    iconBeside("loom", "summary", 204, 49, LOOM_HEAD_FS, LOOM_SECTION_ICON),
    tracked(text("PODSUMOWANIE ZAWODOWE", LOOM_HEAD_FS, LOOM_SANS, LOOM_GOLD, 224, 49, 3), 1.4),
    line(224, 66, 323, 1, LOOM_RULE, 1),
    block(
        "Projektuję doświadczenia produktowe, w których estetyka służy klarowności decyzji. Łączę research, systemy projektowe i partnerską pracę z inżynierią.",
        224, 80, 323, 48, 9.8, 14.4, LOOM_BODY, LOOM_SANS
    ),

    iconBeside("loom", "experience", 204, 153, LOOM_HEAD_FS, LOOM_SECTION_ICON),
    tracked(text("DOŚWIADCZENIE ZAWODOWE", LOOM_HEAD_FS, LOOM_SANS, LOOM_GOLD, 224, 153, 3), 1.4),
    line(224, 170, 323, 1, LOOM_RULE, 1),
    bold(text("Product Design Lead  /  Northfield", 10.8, LOOM_SANS, LOOM_INK, 224, 188, 3)),
    text("2021 – obecnie  ·  Poznań", 8.4, LOOM_SANS, LOOM_MUTE, 224, 206, 3),
    bulleted(block(
        "• Zbudowała design system używany przez kilka zespołów produktowych.\n• Uporządkowała proces discovery → delivery.\n• Prowadzi mentoring projektantów mid/senior.",
        224, 224, 323, 54, 9.2, 13.2, LOOM_BODY, LOOM_SANS
    )),
    bold(text("Senior Product Designer  /  Vantage", 10.8, LOOM_SANS, LOOM_INK, 224, 298, 3)),
    text("2016 – 2021  ·  Wrocław", 8.4, LOOM_SANS, LOOM_MUTE, 224, 316, 3),
    bulleted(block(
        "• Projektowała kluczowe ścieżki onboardingowe B2B.\n• Współtworzyła standardy badań jakościowych.",
        224, 334, 323, 40, 9.2, 13.2, LOOM_BODY, LOOM_SANS
    )),

    iconBeside("loom", "education", 204, 401, LOOM_HEAD_FS, LOOM_SECTION_ICON),
    tracked(text("WYKSZTAŁCENIE", LOOM_HEAD_FS, LOOM_SANS, LOOM_GOLD, 224, 401, 3), 1.4),
    line(224, 418, 323, 1, LOOM_RULE, 1),
    bold(text("Wzornictwo  /  UAP Poznań", 10.4, LOOM_SANS, LOOM_INK, 224, 436, 3)),
    text("2011 – 2016", 8.4, LOOM_SANS, LOOM_MUTE, 224, 454, 3),

    iconBeside("loom", "interests", 204, 501, LOOM_HEAD_FS, LOOM_SECTION_ICON),
    tracked(text("ZAINTERESOWANIA", LOOM_HEAD_FS, LOOM_SANS, LOOM_GOLD, 224, 501, 3), 1.4),
    line(224, 518, 323, 1, LOOM_RULE, 1),
    block("Typografia  ·  Ceramika  ·  Architektura wnętrz", 224, 534, 323, 22, 9.2, 13.2, LOOM_BODY, LOOM_SANS),

    iconBeside("loom", "certifications", 204, 581, LOOM_HEAD_FS, LOOM_SECTION_ICON),
    tracked(text("CERTYFIKATY", LOOM_HEAD_FS, LOOM_SANS, LOOM_GOLD, 224, 581, 3), 1.4),
    line(224, 598, 323, 1, LOOM_RULE, 1),
    bulleted(block(
        "• NN/g UX Certification\n• Facilitation for Product Teams",
        224, 614, 323, 36, 9.2, 13.2, LOOM_BODY, LOOM_SANS
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
const VOLT_CHIP_SIZE = 28;
const VOLT_ICON = 14;
const VOLT_CONTACT_ICON = 12;

const chip = (left, top, w, h) => ({
    category: "rectangle",
    left, top, width: w, height: h,
    backgroundColor: VOLT_CHIP,
    borderWidth: 1,
    zIndex: 1,
});

/** Chip + icon centered on a text line's vertical midpoint. */
const voltSection = (name, textTop) => {
    const mid = textTop + VOLT_HEAD_FS / 2;
    const chipTop = mid - VOLT_CHIP_SIZE / 2;
    const chipLeft = 48;
    return [
        chip(chipLeft, chipTop, VOLT_CHIP_SIZE, VOLT_CHIP_SIZE),
        icon("volt", name, chipLeft + (VOLT_CHIP_SIZE - VOLT_ICON) / 2, mid - VOLT_ICON / 2, VOLT_ICON),
    ];
};

const voltContact = (name, chipLeft, chipTop, chipW, label) => {
    const mid = chipTop + VOLT_CHIP_SIZE / 2;
    const textTop = mid - VOLT_CONTACT_FS / 2;
    const iconLeft = chipLeft + 8;
    const textLeft = iconLeft + VOLT_CONTACT_ICON + 6;
    return [
        chip(chipLeft, chipTop, chipW, VOLT_CHIP_SIZE),
        icon("volt", name, iconLeft, mid - VOLT_CONTACT_ICON / 2, VOLT_CONTACT_ICON),
        text(label, VOLT_CONTACT_FS, VOLT_MONO, VOLT_BODY, textLeft, textTop, 3),
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

    ...voltSection("summary", 166),
    tracked(text("PODSUMOWANIE ZAWODOWE", VOLT_HEAD_FS, VOLT_SANS, VOLT_ACCENT, 86, 166, 3), 1.35),
    line(86, 184, 461, 1, VOLT_RULE, 1),
    block(
        "Buduję platformy, które zdejmują złożoność z zespołów produktowych. Łączę architekturę, observability i kulturę właścicielstwa usług.",
        86, 198, 461, 42, 10, 14.6, VOLT_BODY, VOLT_SANS
    ),

    ...voltSection("experience", 268),
    tracked(text("DOŚWIADCZENIE ZAWODOWE", VOLT_HEAD_FS, VOLT_SANS, VOLT_ACCENT, 86, 268, 3), 1.35),
    line(86, 286, 461, 1, VOLT_RULE, 1),
    bold(text("Staff Engineer  /  Northstar Cloud", 11, VOLT_SANS, VOLT_INK, 86, 304, 3)),
    text("2021 – obecnie  ·  Platform Engineering", 8.4, VOLT_MONO, VOLT_MUTE, 86, 322, 3),
    bulleted(block(
        "• Zaprojektował warstwę eventową dla krytycznych procesów.\n• Ujednolicił standardy SLO i on-call w kilku teamach.\n• Skrócił czas wdrożeń poprzez platformę self-service.",
        86, 340, 461, 54, 9.4, 13.4, VOLT_BODY, VOLT_SANS
    )),
    bold(text("Senior Backend Engineer  /  Orbit Labs", 11, VOLT_SANS, VOLT_INK, 86, 414, 3)),
    text("2016 – 2021  ·  Distributed Systems", 8.4, VOLT_MONO, VOLT_MUTE, 86, 432, 3),
    bulleted(block(
        "• Rozwijał API i pipeline’y danych dla produktu multi-market.\n• Współtworzył praktyki code review i dokumentacji architektonicznej.",
        86, 450, 461, 40, 9.4, 13.4, VOLT_BODY, VOLT_SANS
    )),

    ...voltSection("education", 520),
    tracked(text("WYKSZTAŁCENIE", VOLT_HEAD_FS, VOLT_SANS, VOLT_ACCENT, 86, 520, 3), 1.35),
    line(86, 538, 461, 1, VOLT_RULE, 1),
    bold(text("Informatyka  /  Politechnika Warszawska", 10.4, VOLT_SANS, VOLT_INK, 86, 556, 3)),
    text("2011 – 2016", 8.4, VOLT_MONO, VOLT_MUTE, 86, 574, 3),

    ...voltSection("skills", 616),
    tracked(text("UMIEJĘTNOŚCI", VOLT_HEAD_FS, VOLT_SANS, VOLT_ACCENT, 86, 616, 3), 1.35),
    line(86, 634, 461, 1, VOLT_RULE, 1),
    block("Go  ·  TypeScript  ·  Kubernetes  ·  AWS  ·  Observability  ·  System design", 86, 650, 461, 22, 9.3, 13.4, VOLT_BODY, VOLT_SANS),

    ...voltSection("languages", 698),
    tracked(text("JĘZYKI", VOLT_HEAD_FS, VOLT_SANS, VOLT_ACCENT, 86, 698, 3), 1.35),
    line(86, 716, 461, 1, VOLT_RULE, 1),
    block("Polski — ojczysty  ·  Angielski — C1", 86, 732, 461, 18, 9.3, 13.4, VOLT_BODY, VOLT_SANS),
];
