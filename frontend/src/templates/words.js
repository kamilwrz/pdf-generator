/**
 * Words template.
 *
 * A monochrome, Word-inspired CV that behaves like a carefully formatted
 * office document: one text column, familiar serif typography, restrained
 * rules, and small circular markers. It deliberately avoids frames, panels,
 * and decorative margins so the content remains the visual hierarchy.
 */
import { block, bulleted, circle, line, text } from "./helpers";

const PAPER = "#FFFFFF";
const INK = "#202020";
const BODY = "#383838";
const MUTED = "#6F6F6F";
const RULE = "#BEBEBE";
const PALE = "#E6E6E6";
const WORD_SERIF = "Times-Roman";

const bold = (element) => ({ ...element, bold: true });
const italic = (element) => ({ ...element, italic: true });
const sectionChrome = (element) => ({ ...element, flowRole: "section-chrome" });

const sectionHeading = (label, top, id) => [
    sectionChrome({ ...circle(72, top + 4, 7, INK, false, 1.2, 3), id: `words-${id}-marker` }),
    sectionChrome(bold(text(label, 12, WORD_SERIF, INK, 89, top, 3))),
    sectionChrome(line(89, top + 21, 434, 1, RULE, 2)),
];

const wordsElements = [
    { ...line(0, 0, 595, 842, PAPER, 0), fixedToPage: true },

    bold(text("ANNA KOWALSKA", 29, WORD_SERIF, INK, 72, 58, 3)),
    bold(text("SENIOR PROJECT MANAGER", 13.5, WORD_SERIF, BODY, 72, 98, 3)),
    text(
        "anna.kowalska@email.com  |  +48 600 000 000  |  Warszawa",
        10,
        WORD_SERIF,
        MUTED,
        72,
        127,
        3,
    ),
    circle(72, 154, 5, INK, true, 1, 3),
    circle(82, 154, 5, PALE, false, 1, 3),
    line(94, 156, 429, 1, RULE, 2),

    ...sectionHeading("PODSUMOWANIE ZAWODOWE", 184, "summary"),
    block(
        "Doświadczona menedżerka projektów, która porządkuje złożone inicjatywy, "
        + "łączy zespoły wokół wspólnego celu i konsekwentnie prowadzi pracę do mierzalnego rezultatu.",
        89,
        220,
        434,
        45,
        10.5,
        15,
        BODY,
        WORD_SERIF,
    ),

    ...sectionHeading("DOŚWIADCZENIE ZAWODOWE", 292, "experience"),
    bold(text("Senior Project Manager", 11.5, WORD_SERIF, INK, 89, 328, 3)),
    italic(text("Northstar Sp. z o.o.  |  2021 – obecnie  |  Warszawa", 10, WORD_SERIF, MUTED, 89, 348, 3)),
    bulleted(block(
        "• Prowadziła portfel projektów od planowania do wdrożenia i oceny efektów.\n"
        + "• Uporządkowała współpracę zespołów biznesowych, projektowych i technologicznych.\n"
        + "• Wprowadziła standard raportowania ryzyk, terminów oraz odpowiedzialności.",
        89,
        371,
        434,
        58,
        10.5,
        15,
        BODY,
        WORD_SERIF,
    )),
    bold(text("Project Coordinator", 11.5, WORD_SERIF, INK, 89, 457, 3)),
    italic(text("Lumen Group  |  2017 – 2021  |  Kraków", 10, WORD_SERIF, MUTED, 89, 477, 3)),
    bulleted(block(
        "• Koordynowała harmonogramy, budżety i komunikację z interesariuszami.\n"
        + "• Przygotowywała materiały zarządcze oraz dokumentację projektową.",
        89,
        500,
        434,
        42,
        10.5,
        15,
        BODY,
        WORD_SERIF,
    )),

    ...sectionHeading("WYKSZTAŁCENIE", 581, "education"),
    bold(text("Zarządzanie projektami  |  Uniwersytet Warszawski", 11, WORD_SERIF, INK, 89, 617, 3)),
    italic(text("2012 – 2017  |  Warszawa", 10, WORD_SERIF, MUTED, 89, 637, 3)),

    ...sectionHeading("UMIEJĘTNOŚCI", 682, "skills"),
    block(
        "Zarządzanie projektami  •  Planowanie  •  Budżetowanie  •  Analiza ryzyka\n"
        + "Facylitacja  •  Komunikacja  •  Raportowanie  •  Praca z interesariuszami",
        89,
        718,
        434,
        34,
        10.5,
        15,
        BODY,
        WORD_SERIF,
    ),

    { ...line(72, 783, 451, 1, RULE, 2), fixedToPage: true },
    { ...circle(72, 794, 6, INK, false, 1, 3), fixedToPage: true },
    { ...text("01", 10, WORD_SERIF, MUTED, 508, 790, 3), fixedToPage: true },
];

export const wordsTemplate = wordsElements.map((element) => (
    element.fixedToPage || element.flowRole
        ? element
        : {
            ...element,
            flowRole: "content",
            ...(element.category === "textarea" ? { preserveInitialLayout: true } : {}),
        }
));
