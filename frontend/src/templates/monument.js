/**
 * Monument template.
 *
 * A monochrome editorial CV built around framed section titles and offset
 * rectangular markers. Every text element is at least 10 px so the template
 * remains readable both on the canvas and in the exported A4 PDF.
 */
import { block, bulleted, line, text } from "./helpers";

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
    sectionChrome(line(66, top, 32, 32, INK, 3)),
    sectionChrome(bold(text(number, 10, SANS, WHITE, 75, top + 9, 4))),
    sectionChrome({ ...rect(106, top, 251, 32, INK, 1.2, 3), id: `monument-${id}-frame` }),
    sectionChrome(bold(tracked(text(label, 13.5, DISPLAY, INK, 118, top + 8, 4), 0.35))),
    sectionChrome(line(369, top + 15, 160, 2, RULE, 2)),
];

const monumentElements = [
    { ...line(0, 0, 595, 842, PAPER, 0), fixedToPage: true },
    { ...rect(34, 32, 527, 778, RULE, 0.8, 1), fixedToPage: true },
    { ...line(51, 54, 8, 111, INK, 2), fixedToPage: true },
    { ...line(529, 54, 8, 111, PALE, 2), fixedToPage: true },

    bold(text("MARTA ZALEWSKA", 34, DISPLAY, INK, 74, 59, 3)),
    bold(tracked(text("DYREKTORKA KREATYWNA", 13.5, SANS, GRAPHITE, 76, 104, 3), 1.1)),
    text("marta.zalewska@email.com  ·  +48 600 000 000  ·  Warszawa", 10, SANS, MUTED, 76, 136, 3),

    { ...rect(425, 54, 84, 84, INK, 1.5, 3), id: "monument-masthead-frame" },
    line(441, 70, 52, 11, INK, 3),
    line(441, 88, 34, 11, GRAPHITE, 3),
    line(441, 106, 52, 11, RULE, 3),
    text("CV / 01", 10, SANS, MUTED, 449, 145, 3),

    ...sectionHeading("01", "PROFIL", 190, "profile"),
    block(
        "Łączę strategiczne myślenie z wyczuciem formy. Projektuję marki i komunikację, które porządkują złożone idee, budują zaufanie i pozostają czytelne w każdym punkcie kontaktu.",
        102, 236, 427, 50, 11, 16, GRAPHITE, SANS
    ),

    ...sectionHeading("02", "DOŚWIADCZENIE", 316, "experience"),
    bold(text("Dyrektorka Kreatywna  /  Northline Studio", 12, SANS, INK, 102, 362, 3)),
    text("2021 – obecnie  ·  Warszawa", 10, SANS, MUTED, 102, 383, 3),
    bulleted(block(
        "• Prowadziłam kierunek kreatywny marek z sektorów technologii i kultury.\n• Zbudowałam system projektowy skracający przygotowanie kampanii o 35%.\n• Łączyłam strategię, język i identyfikację w jeden spójny standard.",
        102, 405, 427, 64, 10, 15, GRAPHITE, SANS
    )),

    bold(text("Senior Brand Designer  /  Form Office", 12, SANS, INK, 102, 492, 3)),
    text("2017 – 2021  ·  Kraków", 10, SANS, MUTED, 102, 513, 3),
    bulleted(block(
        "• Tworzyłam identyfikacje, publikacje i narzędzia komunikacji dla zespołów produktowych.",
        102, 535, 427, 32, 10, 15, GRAPHITE, SANS
    )),

    ...sectionHeading("03", "WYKSZTAŁCENIE I KOMPETENCJE", 602, "expertise"),
    bold(text("Projektowanie komunikacji  /  Akademia Sztuk Pięknych", 11, SANS, INK, 102, 648, 3)),
    text("2012 – 2017  ·  Warszawa", 10, SANS, MUTED, 102, 668, 3),
    block(
        "Kierunek kreatywny  ·  Systemy identyfikacji  ·  Editorial design\nStrategia marki  ·  Warsztaty  ·  Zarządzanie zespołem",
        102, 704, 427, 36, 10, 15, GRAPHITE, SANS
    ),

    { ...line(66, 779, 463, 1, RULE, 2), fixedToPage: true },
    { ...line(66, 792, 28, 8, INK, 2), fixedToPage: true },
    { ...text("01", 10, SANS, MUTED, 512, 787, 3), fixedToPage: true },
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
