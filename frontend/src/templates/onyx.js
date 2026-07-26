import { block, bulleted, line, text } from "./helpers";

// Onyx — framed diplomatic dark theme: a bronze double frame, a centered
// serif masthead and three formal stat markers. The symmetric counterpart
// to the other, left-aligned dark themes.
const BG = "#0E0E10";
const FRAME = "#B08D57";
const FRAME_INNER = "#3A3227";
const IVORY = "#EDE6D8";
const MUTED = "#8A7550";
const BODY = "#D2C9BA";
const RULE = "#332C22";
const S = "Times-Roman";
const I = "Inter";
const L = 55;
const W = 485;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const center = (element) => ({ ...element, align: "center" });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);

export const onyxTemplate = [
    { ...line(0, 0, 595, 842, BG, 0), fixedToPage: true },
    { ...rect(24, 24, 547, 794, FRAME, 1.5, 1), fixedToPage: true },
    { ...rect(29, 29, 537, 784, FRAME_INNER, 1, 1), fixedToPage: true },

    bold(center(block("JAKUB WOJCIECHOWSKI", 50, 56, 495, 36, 27, 33, IVORY, S))),
    tracked(center(block("RADCA PRAWNY, PARTNER", 50, 96, 495, 18, 11.5, 15, FRAME, I)), 2),
    center(block("jakub.wojciechowski@email.com  ·  +48 600 000 000  ·  Warszawa", 50, 120, 495, 14, 9.3, 13, MUTED, I)),
    rect(255, 139, 8, 8, FRAME, 1),
    line(271, 142, 53, 2, FRAME, 2),
    rect(332, 139, 8, 8, FRAME, 1),

    rect(55, 160, 157, 52, FRAME, 1),
    bold(center(block("18+", 55, 168, 157, 18, 15, 18, IVORY, S))),
    tracked(center(block("LAT DOŚWIADCZENIA", 55, 190, 157, 12, 7.3, 10, MUTED, I)), 1),
    rect(219, 160, 157, 52, FRAME, 1),
    bold(center(block("4", 219, 168, 157, 18, 15, 18, IVORY, S))),
    tracked(center(block("ZAJMOWANYCH STANOWISK", 219, 190, 157, 12, 7.3, 10, MUTED, I)), 1),
    rect(383, 160, 157, 52, FRAME, 1),
    bold(center(block("9", 383, 168, 157, 18, 15, 18, IVORY, S))),
    tracked(center(block("KLUCZOWYCH KOMPETENCJI", 383, 190, 157, 12, 7.3, 10, MUTED, I)), 1),

    rect(55, 246, 9, 9, FRAME, 1.5, 2),
    tracked(text("PROFIL", 11.5, S, IVORY, 72, 244, 2), 1.4),
    line(55, 258, 485, 1, RULE, 2),
    block(
        "Doradzam w transakcjach i sporach, w których precyzja prawna decyduje o wyniku biznesowym. Łączę dyskrecję, rygor analityczny i spokojne prowadzenie klienta przez złożone procesy.",
        55, 274, 485, 44, 10.5, 15, BODY, I
    ),

    rect(55, 336, 9, 9, FRAME, 1.5, 2),
    tracked(text("DOŚWIADCZENIE", 11.5, S, IVORY, 72, 334, 2), 1.4),
    line(55, 348, 485, 1, RULE, 2),

    bold(text("Partner  /  Wojciechowski i Wspólnicy", 11, I, IVORY, 55, 366, 2)),
    text("2016 – obecnie  ·  Warszawa", 9, I, MUTED, 55, 384, 2),
    bulleted(block(
        "• Prowadzi transakcje fuzji i przejęć dla klientów korporacyjnych.\n• Reprezentuje zarządy w sporach o wysokim znaczeniu biznesowym.",
        55, 402, 485, 42, 10, 14, BODY, I
    )),

    bold(text("Starszy Prawnik  /  Kancelaria Meridian", 11, I, IVORY, 55, 460, 2)),
    text("2010 – 2016  ·  Kraków", 9, I, MUTED, 55, 478, 2),
    bulleted(block(
        "• Prowadził due diligence oraz negocjacje umów inwestycyjnych.",
        55, 496, 485, 20, 10, 14, BODY, I
    )),

    rect(55, 536, 9, 9, FRAME, 1.5, 2),
    tracked(text("WYKSZTAŁCENIE I KOMPETENCJE", 11.5, S, IVORY, 72, 534, 2), 1.4),
    line(55, 548, 485, 1, RULE, 2),
    bold(text("Magister Prawa  /  Uniwersytet Jagielloński", 10.5, I, IVORY, 55, 566, 2)),
    text("2005 – 2010  ·  Kraków", 9, I, MUTED, 55, 584, 2),
    block(
        "Prawo spółek  ·  M&A  ·  Postępowania sporne  ·  Compliance  ·  Negocjacje",
        55, 618, 485, 28, 10, 15, BODY, I
    ),

    { ...text("01", 8, I, MUTED, 522, 801, 2), fixedToPage: true },
];
