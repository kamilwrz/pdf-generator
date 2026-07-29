/**
 * Iconic family — four layouts that pair section/contact icons with distinct
 * typography and colour systems. Icons live in /template-assets/iconic/<theme>/.
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

export const novaTemplate = [
    fixed(line(0, 0, 595, 842, NOVA_PAPER, 0)),
    fixed(line(0, 0, 595, 6, NOVA_ACCENT, 2)),
    fixed(line(48, 800, 499, 1, NOVA_RULE, 1)),
    fixed(text("01", 8, NOVA_SANS, NOVA_MUTE, 522, 808, 2)),

    bold(text("ANNA KOWALSKA", 34, NOVA_DISP, NOVA_INK, 48, 42, 3)),
    tracked(text("DYREKTORKA STRATEGII I ROZWOJU", 9.2, NOVA_SANS, NOVA_ACCENT, 50, 88, 3), 1.8),

    icon("nova", "email", 50, 118, 11),
    text("anna.kowalska@email.com", 8.4, NOVA_SANS, NOVA_MUTE, 66, 118, 3),
    icon("nova", "phone", 230, 118, 11),
    text("+48 600 000 000", 8.4, NOVA_SANS, NOVA_MUTE, 246, 118, 3),
    icon("nova", "location", 370, 118, 11),
    text("Warszawa", 8.4, NOVA_SANS, NOVA_MUTE, 386, 118, 3),

    line(48, 144, 499, 1, NOVA_RULE, 2),

    icon("nova", "summary", 48, 168, 13),
    tracked(text("PODSUMOWANIE ZAWODOWE", 8.6, NOVA_SANS, NOVA_ACCENT, 68, 169, 3), 1.5),
    line(68, 186, 479, 1, NOVA_RULE, 1),
    block(
        "Łączę strategię biznesową z dyscypliną wykonania. Buduję zespoły, które podejmują czytelne decyzje i dowożą mierzalne rezultaty bez utraty jakości relacji.",
        68, 200, 479, 44, 10.2, 15, NOVA_BODY, NOVA_SANS
    ),

    icon("nova", "experience", 48, 268, 13),
    tracked(text("DOŚWIADCZENIE ZAWODOWE", 8.6, NOVA_SANS, NOVA_ACCENT, 68, 269, 3), 1.5),
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

    icon("nova", "education", 48, 520, 13),
    tracked(text("WYKSZTAŁCENIE", 8.6, NOVA_SANS, NOVA_ACCENT, 68, 521, 3), 1.5),
    line(68, 538, 479, 1, NOVA_RULE, 1),
    bold(text("Magister Zarządzania  /  SGH Warszawa", 10.5, NOVA_SANS, NOVA_INK, 68, 556, 3)),
    text("2011 – 2016", 8.6, NOVA_SANS, NOVA_MUTE, 68, 574, 3),

    icon("nova", "skills", 48, 610, 13),
    tracked(text("UMIEJĘTNOŚCI", 8.6, NOVA_SANS, NOVA_ACCENT, 68, 611, 3), 1.5),
    line(68, 628, 479, 1, NOVA_RULE, 1),
    block("Strategia  ·  Leadership  ·  P&L  ·  Negocjacje  ·  Transformacja organizacyjna", 68, 644, 479, 24, 9.4, 13.5, NOVA_BODY, NOVA_SANS),

    icon("nova", "languages", 48, 688, 13),
    tracked(text("JĘZYKI", 8.6, NOVA_SANS, NOVA_ACCENT, 68, 689, 3), 1.5),
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

export const ridgeTemplate = [
    fixed(line(0, 0, 595, 842, RIDGE_PAPER, 0)),
    fixed(line(0, 0, 28, 842, RIDGE_ACCENT, 1)),
    fixed(line(28, 0, 3, 842, "#9BCFC5", 1)),
    fixed(line(56, 800, 483, 1, RIDGE_RULE, 1)),
    fixed(text("01", 8, RIDGE_SANS, RIDGE_MUTE, 520, 808, 2)),

    bold(text("TOMASZ NOWAK", 30, RIDGE_DISP, RIDGE_INK, 56, 40, 3)),
    tracked(text("KIEROWNIK PROGRAMÓW TRANSFORMACJI", 8.8, RIDGE_SANS, RIDGE_ACCENT, 58, 82, 3), 1.4),

    icon("ridge", "email", 56, 112, 11),
    text("tomasz.nowak@email.com", 8.3, RIDGE_SANS, RIDGE_MUTE, 72, 112, 3),
    icon("ridge", "phone", 56, 130, 11),
    text("+48 600 000 000", 8.3, RIDGE_SANS, RIDGE_MUTE, 72, 130, 3),
    icon("ridge", "location", 56, 148, 11),
    text("Gdańsk, Polska", 8.3, RIDGE_SANS, RIDGE_MUTE, 72, 148, 3),

    icon("ridge", "summary", 8, 188, 14),
    tracked(text("PODSUMOWANIE ZAWODOWE", 8.5, RIDGE_SANS, RIDGE_ACCENT, 56, 190, 3), 1.45),
    line(56, 207, 483, 1, RIDGE_RULE, 1),
    block(
        "Prowadzę złożone programy zmiany tak, aby strategia, ludzie i procesy szły w tym samym kierunku. Cenię spokojną precyzję i odpowiedzialność za efekt.",
        56, 222, 483, 42, 10, 14.8, RIDGE_BODY, RIDGE_SANS
    ),

    icon("ridge", "experience", 8, 288, 14),
    tracked(text("DOŚWIADCZENIE ZAWODOWE", 8.5, RIDGE_SANS, RIDGE_ACCENT, 56, 290, 3), 1.45),
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

    icon("ridge", "education", 8, 534, 14),
    tracked(text("WYKSZTAŁCENIE", 8.5, RIDGE_SANS, RIDGE_ACCENT, 56, 536, 3), 1.45),
    line(56, 553, 483, 1, RIDGE_RULE, 1),
    bold(text("Inżynieria Zarządzania  /  Politechnika Gdańska", 10.4, RIDGE_SANS, RIDGE_INK, 56, 570, 3)),
    text("2010 – 2015", 8.5, RIDGE_SANS, RIDGE_MUTE, 56, 588, 3),

    icon("ridge", "skills", 8, 624, 14),
    tracked(text("UMIEJĘTNOŚCI", 8.5, RIDGE_SANS, RIDGE_ACCENT, 56, 626, 3), 1.45),
    line(56, 643, 483, 1, RIDGE_RULE, 1),
    block("Program management  ·  Change  ·  Stakeholder leadership  ·  Lean  ·  Risk", 56, 658, 483, 22, 9.3, 13.4, RIDGE_BODY, RIDGE_SANS),

    icon("ridge", "interests", 8, 700, 14),
    tracked(text("ZAINTERESOWANIA", 8.5, RIDGE_SANS, RIDGE_ACCENT, 56, 702, 3), 1.45),
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

export const loomTemplate = [
    fixed(line(0, 0, 595, 842, LOOM_PAPER, 0)),
    fixed(line(0, 0, 176, 842, LOOM_SIDE, 1)),
    fixed(line(176, 0, 3, 842, LOOM_GOLD, 2)),
    fixed(line(204, 800, 343, 1, LOOM_RULE, 1)),
    fixed(text("01", 8, LOOM_SANS, LOOM_MUTE, 522, 808, 2)),

    // Sidebar identity
    bold(text("EWA", 22, LOOM_DISP, LOOM_LIGHT, 24, 42, 3)),
    bold(text("KAMIŃSKA", 22, LOOM_DISP, LOOM_GOLD, 24, 68, 3)),
    tracked(text("PRODUCT DESIGN LEAD", 7.8, LOOM_SANS, LOOM_GOLD, 24, 104, 3), 1.3),

    icon("loom-light", "email", 24, 140, 11),
    block("ewa.kaminska@email.com", 42, 138, 118, 20, 7.6, 11, LOOM_LIGHT, LOOM_SANS),
    icon("loom-light", "phone", 24, 168, 11),
    text("+48 600 000 000", 7.6, LOOM_SANS, LOOM_LIGHT, 42, 168, 3),
    icon("loom-light", "location", 24, 196, 11),
    text("Poznań", 7.6, LOOM_SANS, LOOM_LIGHT, 42, 196, 3),

    icon("loom-light", "skills", 24, 250, 12),
    tracked(text("UMIEJĘTNOŚCI", 7.4, LOOM_SANS, LOOM_GOLD, 42, 251, 3), 1.2),
    bulleted(block(
        "• Design systems\n• Facylitacja\n• Research\n• Prototypowanie\n• Leadership",
        24, 274, 132, 78, 7.8, 12, LOOM_LIGHT, LOOM_SANS
    )),

    icon("loom-light", "languages", 24, 380, 12),
    tracked(text("JĘZYKI", 7.4, LOOM_SANS, LOOM_GOLD, 42, 381, 3), 1.2),
    bulleted(block("• Polski — ojczysty\n• Angielski — C1\n• Niemiecki — B1", 24, 404, 132, 48, 7.8, 12, LOOM_LIGHT, LOOM_SANS)),

    icon("loom-light", "references", 24, 480, 12),
    tracked(text("REFERENCJE", 7.4, LOOM_SANS, LOOM_GOLD, 42, 481, 3), 1.2),
    block("Dostępne na życzenie", 24, 504, 132, 18, 7.8, 12, LOOM_LIGHT, LOOM_SANS),

    // Main column
    icon("loom", "summary", 204, 48, 13),
    tracked(text("PODSUMOWANIE ZAWODOWE", 8.5, LOOM_SANS, LOOM_GOLD, 224, 49, 3), 1.4),
    line(224, 66, 323, 1, LOOM_RULE, 1),
    block(
        "Projektuję doświadczenia produktowe, w których estetyka służy klarowności decyzji. Łączę research, systemy projektowe i partnerską pracę z inżynierią.",
        224, 80, 323, 48, 9.8, 14.4, LOOM_BODY, LOOM_SANS
    ),

    icon("loom", "experience", 204, 152, 13),
    tracked(text("DOŚWIADCZENIE ZAWODOWE", 8.5, LOOM_SANS, LOOM_GOLD, 224, 153, 3), 1.4),
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

    icon("loom", "education", 204, 400, 13),
    tracked(text("WYKSZTAŁCENIE", 8.5, LOOM_SANS, LOOM_GOLD, 224, 401, 3), 1.4),
    line(224, 418, 323, 1, LOOM_RULE, 1),
    bold(text("Wzornictwo  /  UAP Poznań", 10.4, LOOM_SANS, LOOM_INK, 224, 436, 3)),
    text("2011 – 2016", 8.4, LOOM_SANS, LOOM_MUTE, 224, 454, 3),

    icon("loom", "interests", 204, 500, 13),
    tracked(text("ZAINTERESOWANIA", 8.5, LOOM_SANS, LOOM_GOLD, 224, 501, 3), 1.4),
    line(224, 518, 323, 1, LOOM_RULE, 1),
    block("Typografia  ·  Ceramika  ·  Architektura wnętrz", 224, 534, 323, 22, 9.2, 13.2, LOOM_BODY, LOOM_SANS),

    icon("loom", "certifications", 204, 580, 13),
    tracked(text("CERTYFIKATY", 8.5, LOOM_SANS, LOOM_GOLD, 224, 581, 3), 1.4),
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

const chip = (left, top, w, h) => ({
    category: "rectangle",
    left, top, width: w, height: h,
    backgroundColor: VOLT_CHIP,
    borderWidth: 1,
    zIndex: 1,
});

export const voltTemplate = [
    fixed(line(0, 0, 595, 842, VOLT_BG, 0)),
    fixed(line(0, 0, 595, 4, VOLT_ACCENT, 2)),
    fixed(line(48, 800, 499, 1, VOLT_RULE, 1)),
    fixed(text("01", 8, VOLT_MONO, VOLT_MUTE, 522, 808, 2)),

    bold(text("MAREK LIS", 32, VOLT_SANS, VOLT_INK, 48, 36, 3)),
    tracked(text("STAFF ENGINEER · PLATFORM", 9, VOLT_MONO, VOLT_ACCENT, 50, 78, 3), 1.2),

    chip(48, 108, 168, 28),
    icon("volt", "email", 56, 115, 12),
    text("marek.lis@email.com", 7.8, VOLT_MONO, VOLT_BODY, 74, 115, 3),
    chip(224, 108, 148, 28),
    icon("volt", "phone", 232, 115, 12),
    text("+48 600 000 000", 7.8, VOLT_MONO, VOLT_BODY, 250, 115, 3),
    chip(380, 108, 120, 28),
    icon("volt", "location", 388, 115, 12),
    text("Warszawa", 7.8, VOLT_MONO, VOLT_BODY, 406, 115, 3),

    chip(48, 160, 28, 28),
    icon("volt", "summary", 54, 166, 14),
    tracked(text("PODSUMOWANIE ZAWODOWE", 8.4, VOLT_SANS, VOLT_ACCENT, 86, 166, 3), 1.35),
    line(86, 184, 461, 1, VOLT_RULE, 1),
    block(
        "Buduję platformy, które zdejmują złożoność z zespołów produktowych. Łączę architekturę, observability i kulturę właścicielstwa usług.",
        86, 198, 461, 42, 10, 14.6, VOLT_BODY, VOLT_SANS
    ),

    chip(48, 262, 28, 28),
    icon("volt", "experience", 54, 268, 14),
    tracked(text("DOŚWIADCZENIE ZAWODOWE", 8.4, VOLT_SANS, VOLT_ACCENT, 86, 268, 3), 1.35),
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

    chip(48, 514, 28, 28),
    icon("volt", "education", 54, 520, 14),
    tracked(text("WYKSZTAŁCENIE", 8.4, VOLT_SANS, VOLT_ACCENT, 86, 520, 3), 1.35),
    line(86, 538, 461, 1, VOLT_RULE, 1),
    bold(text("Informatyka  /  Politechnika Warszawska", 10.4, VOLT_SANS, VOLT_INK, 86, 556, 3)),
    text("2011 – 2016", 8.4, VOLT_MONO, VOLT_MUTE, 86, 574, 3),

    chip(48, 610, 28, 28),
    icon("volt", "skills", 54, 616, 14),
    tracked(text("UMIEJĘTNOŚCI", 8.4, VOLT_SANS, VOLT_ACCENT, 86, 616, 3), 1.35),
    line(86, 634, 461, 1, VOLT_RULE, 1),
    block("Go  ·  TypeScript  ·  Kubernetes  ·  AWS  ·  Observability  ·  System design", 86, 650, 461, 22, 9.3, 13.4, VOLT_BODY, VOLT_SANS),

    chip(48, 692, 28, 28),
    icon("volt", "languages", 54, 698, 14),
    tracked(text("JĘZYKI", 8.4, VOLT_SANS, VOLT_ACCENT, 86, 698, 3), 1.35),
    line(86, 716, 461, 1, VOLT_RULE, 1),
    block("Polski — ojczysty  ·  Angielski — C1", 86, 732, 461, 18, 9.3, 13.4, VOLT_BODY, VOLT_SANS),
];
