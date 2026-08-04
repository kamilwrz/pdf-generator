/**
 * Monument template.
 *
 * A monochrome editorial CV built around framed section titles and offset
 * rectangular markers. Body copy bottoms out at 9 px; the summary uses the
 * same size as body text so it does not read as a larger paragraph.
 */
import { block, bulleted, line, text } from "./helpers.js";

const PAPER = "#F7F7F7";
const WHITE = "#FFFFFF";
const INK = "#111111";
const GRAPHITE = "#343434";
const MUTED = "#6D6D6D";
const RULE = "#C8C8C8";
const PALE = "#E8E8E8";
const DISPLAY = "CormorantGaramond";
const SANS = "Montserrat";

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => ({
    category: "rectangle",
    left,
    top,
    width,
    height,
    backgroundColor: color,
    borderWidth,
    zIndex,
});
const sectionChrome = (element) => ({ ...element, flowRole: "section-chrome" });

const sectionHeading = (number, label, top, id) => [
    sectionChrome(line(66, top, 32, 32, INK, 2)),
    sectionChrome(bold(text(number, 11, SANS, WHITE, 74, top + 8, 5))),
    sectionChrome({ ...rect(106, top, 251, 32, INK, 1.2, 2), id: `monument-${id}-frame` }),
    sectionChrome(bold(tracked(text(label, 12.5, DISPLAY, INK, 118, top + 8, 5), 0.35))),
    sectionChrome(line(369, top + 15, 160, 2, RULE, 1)),
];

const monumentElements = [
    { ...line(0, 0, 595, 842, PAPER, 0), fixedToPage: true },
    { ...rect(34, 32, 527, 778, RULE, 0.8, 1), fixedToPage: true },
    {
        ...line(51, 54, 8, 111, INK, 2),
        fixedToPage: true,
        repeatOnContinuation: false,
    },
    {
        ...line(529, 54, 8, 111, PALE, 2),
        fixedToPage: true,
        repeatOnContinuation: false,
    },

    bold(text("MARTA ZALEWSKA", 33, DISPLAY, INK, 74, 59, 3)),
    bold(tracked(text("DYREKTORKA KREATYWNA", 12.5, SANS, GRAPHITE, 76, 104, 3), 1.1)),
    text("marta.zalewska@email.com  ·  +48 600 000 000  ·  Warszawa", 9, SANS, MUTED, 76, 136, 3),

    { ...rect(425, 54, 84, 84, INK, 1.5, 3), id: "monument-masthead-frame" },
    line(441, 70, 52, 11, INK, 3),
    line(441, 88, 34, 11, GRAPHITE, 3),
    line(441, 106, 52, 11, RULE, 3),
    text("CV / 01", 9, SANS, MUTED, 449, 145, 3),

    ...sectionHeading("01", "PROFIL", 190, "profile"),
    // Summary matches body size (9 px). It must not sit one step above the
    // surrounding copy the way a lead paragraph often does in editorial layouts.
    block(
        "Łączę strategiczne myślenie z wyczuciem formy. Projektuję marki i komunikację, które porządkują złożone idee, budują zaufanie i pozostają czytelne w każdym punkcie kontaktu.",
        102, 236, 427, 50, 9, 14, GRAPHITE, SANS
    ),

    ...sectionHeading("02", "DOŚWIADCZENIE", 316, "experience"),
    bold(text("Dyrektorka Kreatywna  /  Northline Studio", 11, SANS, INK, 102, 362, 3)),
    text("2021 – obecnie  ·  Warszawa", 9, SANS, MUTED, 102, 383, 3),
    bulleted(block(
        "• Prowadziłam kierunek kreatywny marek z sektorów technologii i kultury.\n• Zbudowałam system projektowy skracający przygotowanie kampanii o 35%.\n• Łączyłam strategię, język i identyfikację w jeden spójny standard.",
        102, 405, 427, 64, 9, 14, GRAPHITE, SANS
    )),

    bold(text("Senior Brand Designer  /  Form Office", 11, SANS, INK, 102, 492, 3)),
    text("2017 – 2021  ·  Kraków", 9, SANS, MUTED, 102, 513, 3),
    bulleted(block(
        "• Tworzyłam identyfikacje, publikacje i narzędzia komunikacji dla zespołów produktowych.",
        102, 535, 427, 32, 9, 14, GRAPHITE, SANS
    )),

    ...sectionHeading("03", "WYKSZTAŁCENIE I KOMPETENCJE", 602, "expertise"),
    bold(text("Projektowanie komunikacji  /  Akademia Sztuk Pięknych", 10, SANS, INK, 102, 648, 3)),
    text("2012 – 2017  ·  Warszawa", 9, SANS, MUTED, 102, 668, 3),
    block(
        "Kierunek kreatywny  ·  Systemy identyfikacji  ·  Editorial design\nStrategia marki  ·  Warsztaty  ·  Zarządzanie zespołem",
        102, 704, 427, 36, 9, 14, GRAPHITE, SANS
    ),

    { ...line(66, 779, 463, 1, RULE, 2), fixedToPage: true },
    { ...line(66, 792, 28, 8, INK, 2), fixedToPage: true },
    { ...text("01", 9, SANS, MUTED, 512, 787, 3), fixedToPage: true },
];

export const monumentTemplate = monumentElements.map((element) => (
    element.fixedToPage || element.flowRole
        ? element
        : {
            ...element,
            flowRole: "content",
            ...(element.category === "textarea" ? { preserveInitialLayout: true } : {}),
        }
));
