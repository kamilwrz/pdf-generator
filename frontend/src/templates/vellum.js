// Vellum — a warm editorial one-column CV. Fine burgundy and clay outline
// rectangles form calm nested panels, like a carefully typeset exhibition card.
// Every decorative rectangle is intentionally transparent in the canvas/PDF.
import { text, line, block, bulleted } from "./helpers";

const INK = "#312724";
const WINE = "#7C3B42";
const CLAY = "#B8765A";
const SAND = "#DCCFC0";
const GRAY = "#786E68";
const BODY = "#493D37";
const SERIF = "Times-Roman";
const SANS = "Inter";

const bold = (element) => ({ ...element, bold: true });
const centered = (element) => ({ ...element, align: "center" });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) =>
    ({ category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex });

const section = (label, top) => [
    rect(60, top, 475, 26, CLAY, 1, 1),
    tracked(bold(text(label, 11, SANS, WINE, 76, top + 6, 2)), 1),
];

export const vellumTemplate = [
    // ── nested editorial frames ──────────────────────────────────
    rect(28, 26, 539, 790, WINE, 1.2, 1),
    rect(36, 34, 523, 774, SAND, 0.75, 1),
    rect(60, 54, 475, 106, CLAY, 1.15, 1),
    rect(70, 64, 455, 86, SAND, 0.75, 1),

    // ── header ───────────────────────────────────────────────────
    centered(bold(block("ALEKSANDRA MAJEWSKA", 70, 72, 455, 30, 26, 30, INK, SERIF))),
    centered(tracked(block("KURATORKA TREŚCI I STRATEGII MARKI", 70, 108, 455, 14, 9.5, 12, WINE, SANS), 1.45)),
    centered(block("aleksandra.majewska@email.com  ·  +48 600 845 219  ·  Warszawa", 70, 132, 455, 14, 9, 12, GRAY, SANS)),

    // ── profile ──────────────────────────────────────────────────
    ...section("PROFIL", 186),
    block(
        "Tworzę wyraziste narracje dla marek, instytucji kultury i produktów cyfrowych. Łączę badania, język i kierunek kreatywny, aby każda decyzja była jednocześnie piękna i użyteczna.",
        60, 224, 475, 48, 10.3, 15, BODY, SANS
    ),

    // ── experience ───────────────────────────────────────────────
    ...section("DOŚWIADCZENIE", 294),
    bold(text("Dyrektorka ds. Treści — Studio Opowieści", 11, SANS, INK, 60, 332, 2)),
    text("2020 – obecnie  ·  Warszawa", 9, SANS, GRAY, 60, 348, 2),
    bulleted(block(
        "• Stworzyła język marki i system redakcyjny dla produktów używanych przez ponad milion osób.\n• Prowadziła interdyscyplinarny zespół pisarek, projektantów i badaczy w sześciu premierach.",
        60, 364, 475, 42, 9.8, 13.5, BODY, SANS
    )),
    bold(text("Starsza Redaktorka — Dom Wydawniczy Sztuka", 11, SANS, INK, 60, 426, 2)),
    text("2016 – 2020  ·  Kraków", 9, SANS, GRAY, 60, 442, 2),
    bulleted(block(
        "• Prowadziła programy wydawnicze i kampanie łączące druk, wydarzenia oraz kanały cyfrowe.\n• Redagowała długie formy dla autorów i partnerów z Polski oraz Europy.",
        60, 458, 475, 42, 9.8, 13.5, BODY, SANS
    )),

    // ── education and skills ─────────────────────────────────────
    ...section("EDUKACJA", 530),
    bold(text("Magister Kulturoznawstwa — Uniwersytet Warszawski", 10.6, SANS, INK, 60, 568, 2)),
    text("2013 – 2015  ·  wyróżnienie", 9, SANS, GRAY, 60, 584, 2),

    ...section("UMIEJĘTNOŚCI", 622),
    block(
        "Strategia treści · Tone of voice · Redakcja · Badania jakościowe · Kierunek kreatywny · Warsztaty · Figma · Adobe InDesign",
        60, 660, 475, 32, 10, 15, BODY, SANS
    ),

    // ── discrete framed footer ───────────────────────────────────
    rect(60, 736, 475, 34, SAND, 0.8, 1),
    centered(tracked(block("DOSTĘPNE PORTFOLIO, PUBLIKACJE I REFERENCJE", 60, 747, 475, 12, 8.4, 10, WINE, SANS), 1)),
];
