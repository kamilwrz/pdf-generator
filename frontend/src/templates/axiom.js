// Axiom — a precise, architectural one-column CV. Nested outline rectangles
// create a blueprint-like frame, while the compact header badge and square
// section markers add structure without any filled decorative surfaces.
import { text, line, block, bulleted } from "./helpers";

const INK = "#182A33";
const ACCENT = "#0D6E72";
const SLATE = "#60757B";
const PALE = "#C8D7D6";
const BODY = "#2E3E44";
const SANS = "Inter";
const SERIF = "Times-Roman";

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) =>
    ({ category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex });

const section = (label, top) => [
    rect(64, top + 1, 18, 18, ACCENT, 1.4, 1),
    tracked(bold(text(label, 11, SANS, INK, 96, top + 2, 2)), 1.1),
    line(96, top + 18, 435, 0.75, PALE, 1),
];

export const axiomTemplate = [
    // ── architectural outline frame ──────────────────────────────
    rect(22, 22, 551, 798, "#8EA3A2", 1.25, 1),
    rect(30, 30, 535, 782, PALE, 0.75, 1),
    rect(44, 44, 507, 120, INK, 1.2, 1),
    rect(56, 56, 38, 38, ACCENT, 1.4, 1),
    rect(64, 64, 22, 22, PALE, 0.9, 1),
    text("01", 8, SANS, ACCENT, 68, 71, 2),

    // ── header ───────────────────────────────────────────────────
    bold(text("MARTA RUTKOWSKA", 27, SERIF, INK, 112, 68, 2)),
    tracked(text("STRATEŻKA OPERACYJNA · SYSTEMY I SKALA", 10, SANS, ACCENT, 114, 108, 2), 1.35),
    text("marta.rutkowska@email.com  ·  +48 600 312 768  ·  Gdynia", 9.2, SANS, SLATE, 114, 134, 2),
    line(112, 151, 400, 1, PALE, 1),

    // ── profile ──────────────────────────────────────────────────
    ...section("PROFIL", 188),
    block(
        "Łączę strategię operacyjną z uważnym projektowaniem usług. Pomagam zespołom zamieniać złożone procesy w czytelne systemy, które działają dla ludzi i biznesu.",
        64, 218, 467, 46, 10.4, 15, BODY, SANS
    ),

    // ── experience ───────────────────────────────────────────────
    ...section("DOŚWIADCZENIE", 284),
    bold(text("Dyrektorka Operacyjna — Forma Studio", 11, SANS, INK, 64, 314, 2)),
    text("2021 – obecnie  ·  Gdańsk", 9, SANS, SLATE, 64, 330, 2),
    bulleted(block(
        "• Zaprojektowała model operacyjny dla czterech zespołów produktowych, skracając czas realizacji o 28%.\n• Wprowadziła rytuały decyzyjne zwiększające przejrzystość priorytetów i odpowiedzialności.",
        64, 346, 467, 42, 9.8, 13.5, BODY, SANS
    )),
    bold(text("Menedżerka Programów — Północ Lab", 11, SANS, INK, 64, 408, 2)),
    text("2017 – 2021  ·  Sopot", 9, SANS, SLATE, 64, 424, 2),
    bulleted(block(
        "• Prowadziła portfel dziewięciu inicjatyw transformacyjnych od diagnozy do wdrożenia.\n• Stworzyła bibliotekę wzorców usług używaną przez 120 pracowników.",
        64, 440, 467, 42, 9.8, 13.5, BODY, SANS
    )),

    // ── education and skills ─────────────────────────────────────
    ...section("EDUKACJA", 506),
    bold(text("Magister Zarządzania — Uniwersytet Gdański", 10.6, SANS, INK, 64, 536, 2)),
    text("2015 – 2017  ·  specjalizacja: innowacje usługowe", 9, SANS, SLATE, 64, 552, 2),

    ...section("UMIEJĘTNOŚCI", 590),
    block(
        "Strategia operacyjna · Projektowanie usług · Facylitacja · Zarządzanie zmianą · Analiza procesów · OKR · Notion · Miro",
        64, 620, 467, 32, 10, 15, BODY, SANS
    ),

    // ── closing register mark ────────────────────────────────────
    rect(64, 700, 467, 54, PALE, 1, 1),
    rect(76, 712, 30, 30, ACCENT, 1.2, 1),
    text("A", 12, SERIF, ACCENT, 86, 719, 2),
    tracked(text("REFERENCJE I CASE STUDIES DOSTĘPNE NA ŻYCZENIE", 8.5, SANS, SLATE, 122, 723, 2), 0.85),
];
