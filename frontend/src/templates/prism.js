// Prism — colourful & artistic. Bold purple header band, teal accent strip,
// and a rotating 10 × 10 colour square before every section heading.
import { text, line, block, bulleted } from "./helpers";

const PURPLE  = "#6B21A8";
const TEAL    = "#0D9488";
const ORANGE  = "#F26B2E";
const MAGENTA = "#D63384";
const WHITE   = "#FFFFFF";
const INK     = "#1A1A1A";
const GRAY    = "#6B7280";
const LGRAY   = "#9CA3AF";

// Section accent squares — each section gets the next colour in the cycle.
// The square shares the same `top` as the heading text so they sit side-by-side.
const sq = (top, color) => line(50, top, 10, 10, color, 2);

const bold = el => ({ ...el, bold: true });
const ital = el => ({ ...el, italic: true });

export const prismTemplate = [
    // ── DECORATIVE HEADER ────────────────────────────────────────
    line(0, 0, 595, 118, PURPLE, 0),       // purple band
    line(0, 118, 595, 6, TEAL, 1),          // teal accent strip
    line(0, 124, 595, 3, ORANGE, 1),        // orange micro-strip

    bold(text("MAGDALENA SZYMA", 30, "Inter", WHITE, 50, 38)),
    ital(text("Projektantka UX i Liderka Kreatywna", 13, "Inter", "#E9D5FF", 50, 80)),

    // ── CONTACT / DIVIDER ────────────────────────────────────────
    text("magdalena.szyma@email.com   ·   +48 600 890 123   ·   Warszawa", 9.5, "Inter", LGRAY, 50, 150),
    line(50, 168, 495, 1.5, ORANGE),

    // ── PROFILE ─────────────────────────────────────────────────
    sq(190, PURPLE), bold(text("PROFIL", 12, "Inter", INK, 68, 190)),
    block("Projektantka UX z 8-letnim doświadczeniem w tworzeniu angażujących produktów cyfrowych — od wczesnych startupów po korporacje z listy Fortune 500. Pasjonuje się dostępnością i systemami projektowymi.", 50, 214, 495, 52, 10.5, 15, GRAY, "Inter"),

    // ── EXPERIENCE ──────────────────────────────────────────────
    sq(280, ORANGE), bold(text("DOŚWIADCZENIE", 12, "Inter", INK, 68, 280)),
    bold(text("Starsza Projektantka UX", 11, "Inter", INK, 50, 306)),
    text("Allegro   ·   Warszawa   ·   2021 – obecnie", 9.5, "Inter", GRAY, 50, 322),
    bulleted(block("• Poprowadziła projekt globalnego panelu płatności używanego przez ponad 2 mln sprzedawców.\n• Zbudowała system projektowy wdrożony przez 6 zespołów produktowych.\n• Wspierała rozwój 3 młodszych projektantów do poziomu seniora.", 50, 338, 495, 50, 10, 14, GRAY, "Inter")),

    bold(text("Projektantka UX", 11, "Inter", INK, 50, 402)),
    text("Booking.com   ·   2018 – 2021", 9.5, "Inter", GRAY, 50, 418),
    bulleted(block("• Przeprojektowała onboarding hostów, poprawiając ukończenie o 34%.\n• Przeprowadziła ponad 20 badań użyteczności w 8 krajach.", 50, 434, 495, 36, 10, 14, GRAY, "Inter")),

    // ── EDUCATION ────────────────────────────────────────────────
    sq(486, TEAL), bold(text("EDUKACJA", 12, "Inter", INK, 68, 486)),
    bold(text("Licencjat Projektowania Interakcji — ASP w Warszawie", 11, "Inter", INK, 50, 512)),
    text("2013 – 2017", 9.5, "Inter", GRAY, 50, 528),

    // ── SKILLS ───────────────────────────────────────────────────
    sq(560, MAGENTA), bold(text("UMIEJĘTNOŚCI", 12, "Inter", INK, 68, 560)),
    block("Figma · Prototypowanie · Systemy projektowe · Badania użytkowników · Dostępność · HTML / CSS · React", 50, 584, 495, 36, 10, 15, GRAY, "Inter"),
];
