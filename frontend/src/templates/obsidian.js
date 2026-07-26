import { block, bulleted, circle, ellipse, line, text } from "./helpers";

// Obsidian — sidebar dark theme: a near-black sidecar beside a charcoal main
// field, signed with a single warm-gold accent. Both panels stay dark.
const SIDEBAR_BG = "#0B0D10";
const MAIN_BG = "#15181C";
const GOLD = "#C9A24B";
const INK = "#F4F1EA";
const MUTED = "#9AA1AC";
const BODY = "#D7DAE0";
const RULE = "#33383F";
const SANS = "Inter";
const SERIF = "Times-Roman";
const SIDE = 184;
const L = 222;
const W = 337;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);
const connector = (source_id, target_id, color = GOLD) => (
    { category: "connector", source_id, target_id, backgroundColor: color, borderWidth: 0.9, arrow: false, zIndex: 3 }
);

export const obsidianTemplate = [
    { ...line(0, 0, SIDE, 842, SIDEBAR_BG, 0), fixedToPage: true },
    { ...line(SIDE, 0, 2, 842, GOLD, 1), fixedToPage: true },
    { ...line(SIDE + 2, 0, 595 - SIDE - 2, 842, MAIN_BG, 0), fixedToPage: true },

    bold(text("Katarzyna Zielińska", 29, SERIF, INK, L, 52, 3)),
    tracked(text("DYREKTORKA OPERACYJNA", 9, SANS, GOLD, L + 2, 92, 3), 1.4),
    line(L, 116, W, 1, RULE, 2),

    { ...rect(464, 50, 56, 52, GOLD, 1, 3), id: "obsidian-frame" },
    { ...ellipse(474, 60, 32, 15, GOLD, false, 1, 3), id: "obsidian-orbit" },
    { ...circle(484, 79, 11, GOLD, true, 1, 3), id: "obsidian-node" },
    connector("obsidian-frame", "obsidian-orbit", RULE),
    connector("obsidian-orbit", "obsidian-node"),

    tracked(text("KONTAKT", 8, SANS, GOLD, 24, 60, 3), 1.3),
    block("Warszawa\nkatarzyna.zielinska@email.com\n+48 600 000 000", 24, 80, 136, 46, 8, 12.5, BODY, SANS),
    tracked(text("OBSZARY", 8, SANS, GOLD, 24, 200, 3), 1.3),
    block("Strategia operacyjna\nZarządzanie zmianą\nOptymalizacja procesów\nBudżetowanie\nPrzywództwo zespołowe", 24, 220, 136, 90, 8.2, 13, BODY, SANS),

    circle(L - 18, 152, 7, GOLD, true, 1, 3),
    tracked(text("PROFIL", 8.6, SANS, INK, L, 150, 3), 1.2),
    line(L, 166, W, 1, RULE, 2),
    block(
        "Buduję organizacje, które działają spokojnie nawet w czasie zmiany. Łączę dyscyplinę operacyjną z uważnym przywództwem, aby decyzje przekładały się na trwałe wyniki.",
        L, 183, W, 46, 10, 15, BODY, SANS
    ),

    circle(L - 18, 246, 7, GOLD, true, 1, 3),
    tracked(text("DOŚWIADCZENIE", 8.6, SANS, INK, L, 244, 3), 1.2),
    line(L, 260, W, 1, RULE, 2),

    bold(text("Dyrektorka Operacyjna  /  Northbridge Group", 11, SANS, INK, L, 277, 2)),
    text("2021 – obecnie  ·  Warszawa", 8.7, SANS, MUTED, L, 295, 2),
    bulleted(block(
        "• Zbudowała spójny model operacyjny obejmujący kilkanaście zespołów.\n• Wprowadziła rytm decyzyjny łączący dane, priorytety i odpowiedzialność.\n• Skróciła czas wdrażania inicjatyw strategicznych o ponad jedną trzecią.",
        L, 313, W, 58, 9.4, 13.3, BODY, SANS
    )),

    bold(text("Menedżerka ds. Transformacji  /  Meridian Holding", 11, SANS, INK, L, 401, 2)),
    text("2016 – 2021  ·  Kraków", 8.7, SANS, MUTED, L, 419, 2),
    bulleted(block(
        "• Prowadziła program restrukturyzacji procesów operacyjnych.\n• Przygotowywała rekomendacje decyzyjne dla zarządu.",
        L, 437, W, 42, 9.4, 13.3, BODY, SANS
    )),

    circle(L - 18, 505, 7, GOLD, true, 1, 3),
    tracked(text("EDUKACJA I KOMPETENCJE", 8.6, SANS, INK, L, 503, 3), 1.2),
    line(L, 519, W, 1, RULE, 2),
    bold(text("MBA  /  Akademia Leona Koźmińskiego", 10.3, SANS, INK, L, 538, 2)),
    text("2013 – 2015  ·  Warszawa", 8.7, SANS, MUTED, L, 556, 2),
    block(
        "Zarządzanie operacyjne  ·  Transformacja  ·  Lean  ·  Budżetowanie  ·  Przywództwo",
        L, 591, W, 28, 9.4, 13.3, BODY, SANS
    ),

    { ...line(L, 783, W, 1, RULE, 2), fixedToPage: true },
    { ...circle(L, 796, 6, GOLD, true, 1, 3), fixedToPage: true },
    { ...text("01", 8, SANS, MUTED, L + W - 15, 791, 3), fixedToPage: true },
];
