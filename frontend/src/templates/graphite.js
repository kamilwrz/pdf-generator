import { block, bulleted, line, text } from "./helpers";

// Graphite — ultra-minimalist dark theme: a single cool-silver accent,
// hairline rules and generous whitespace carry the whole hierarchy. No
// bands, frames or sidebars — just quiet typography on a dark field.
const BG = "#101113";
const SILVER = "#B7C3CC";
const INK = "#F5F6F7";
const MUTED = "#8A9099";
const BODY = "#C7CBCF";
const HAIRLINE = "#2B2E32";
const SANS = "Inter";
const SERIF = "Times-Roman";
const L = 56;
const W = 483;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const italic = (element) => ({ ...element, italic: true });

export const graphiteTemplate = [
    { ...line(0, 0, 595, 842, BG, 0), fixedToPage: true },

    bold(text("Ewa Kamińska", 32, SERIF, INK, L, 58, 2)),
    italic(text("Główna Architektka Produktu", 12, SANS, SILVER, L, 98, 2)),
    text("ewa.kaminska@email.com  ·  +48 600 000 000  ·  Poznań", 9, SANS, MUTED, L, 122, 2),
    line(L, 142, W, 0.5, HAIRLINE, 1),

    tracked(text("PODSUMOWANIE", 9, SANS, SILVER, L, 166, 2), 1.6),
    line(L, 180, W, 0.5, HAIRLINE, 1),
    block(
        "Projektuję systemy produktowe, w których dobra architektura jest niewidoczna, a decyzje pozostają czytelne. Łączę spojrzenie inżynierskie z odpowiedzialnością za doświadczenie użytkownika.",
        L, 196, W, 44, 10.5, 16, BODY, SANS
    ),

    tracked(text("DOŚWIADCZENIE", 9, SANS, SILVER, L, 274, 2), 1.6),
    line(L, 288, W, 0.5, HAIRLINE, 1),

    bold(text("Główna Architektka Produktu  /  Northfield Systems", 11, SANS, INK, L, 306, 2)),
    text("2020 – obecnie  ·  Poznań", 9.3, SANS, MUTED, L, 324, 2),
    bulleted(block(
        "• Odpowiada za spójność architektury w wielu zespołach produktowych.\n• Wprowadziła standardy przeglądu decyzji technicznych.\n• Prowadzi mentoring starszych inżynierów i liderów technicznych.",
        L, 342, W, 58, 10, 14.5, BODY, SANS
    )),

    bold(text("Starsza Inżynierka Oprogramowania  /  Vantage Labs", 11, SANS, INK, L, 430, 2)),
    text("2015 – 2020  ·  Wrocław", 9.3, SANS, MUTED, L, 448, 2),
    bulleted(block(
        "• Prowadziła rozwój kluczowych usług backendowych.\n• Współtworzyła standardy jakości kodu i dokumentacji.",
        L, 466, W, 42, 10, 14.5, BODY, SANS
    )),

    tracked(text("WYKSZTAŁCENIE", 9, SANS, SILVER, L, 546, 2), 1.6),
    line(L, 560, W, 0.5, HAIRLINE, 1),
    bold(text("Magister Informatyki  /  Politechnika Poznańska", 10.5, SANS, INK, L, 578, 2)),
    text("2010 – 2015", 9.3, SANS, MUTED, L, 596, 2),

    tracked(text("UMIEJĘTNOŚCI", 9, SANS, SILVER, L, 632, 2), 1.6),
    line(L, 646, W, 0.5, HAIRLINE, 1),
    block(
        "Architektura systemów  ·  TypeScript  ·  Go  ·  Cloud infrastructure  ·  Design systems  ·  Mentoring",
        L, 662, W, 28, 10, 15, BODY, SANS
    ),

    { ...line(L, 784, W, 0.5, HAIRLINE, 1), fixedToPage: true },
    { ...text("01", 8, SANS, MUTED, L + W - 15, 792, 2), fixedToPage: true },
];
