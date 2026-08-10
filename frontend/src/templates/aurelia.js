/**
 * Aurelia template.
 *
 * A one-column quiet-luxury composition built around one memorable gesture:
 * a thin golden Bézier orbit crosses the masthead, then reappears as a small
 * thread beside every section. White space and modest copy keep the ornament
 * editorial rather than decorative-for-decoration's-sake.
 */
import { bezierPath, block, bulleted, line, text } from "./helpers.js";

const PAPER = "#FEFDF9";
const INK = "#272724";
const BODY = "#464540";
const MUTED = "#77736B";
const GOLD = "#B3924F";
const GOLD_DARK = "#8B713A";
const RULE = "#DCD8CE";
const PALE = "#F1EEE7";
const DISPLAY = "PlayfairDisplay";
const SANS = "Montserrat";

const ORBIT_CURVES = [
    { type: "M", x: 0.02, y: 0.72 },
    { type: "C", x1: 0.18, y1: 0.05, x2: 0.48, y2: 0.02, x: 0.62, y: 0.38 },
    { type: "C", x1: 0.76, y1: 0.74, x2: 0.86, y2: 1.03, x: 0.98, y: 0.58 },
];
const THREAD_CURVES = [
    { type: "M", x: 0.02, y: 0.54 },
    { type: "C", x1: 0.22, y1: 0.04, x2: 0.38, y2: 0.98, x: 0.56, y: 0.5 },
    { type: "C", x1: 0.72, y1: 0.08, x2: 0.86, y2: 0.92, x: 0.98, y: 0.46 },
];
const SWEEP_CURVES = [
    { type: "M", x: 0.01, y: 0.76 },
    { type: "C", x1: 0.23, y1: 0.12, x2: 0.42, y2: 0.1, x: 0.55, y: 0.48 },
    { type: "C", x1: 0.68, y1: 0.86, x2: 0.86, y2: 0.82, x: 0.99, y: 0.28 },
];

const masthead = (element) => ({ ...element, flowRole: "masthead" });
const sectionChrome = (element) => ({ ...element, flowRole: "section-chrome" });
const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });

const sectionHeading = (label, top, id) => [
    sectionChrome({
        ...bezierPath(76, top + 1, 29, 13, THREAD_CURVES, GOLD, 1.35, 3, "flourish"),
        id: `aurelia-${id}-thread`,
    }),
    sectionChrome(tracked(bold(text(label, 9, SANS, INK, 116, top, 3)), 1.35)),
    sectionChrome(line(274, top + 9, 241, 1, RULE, 2)),
    sectionChrome(line(274, top + 9, 38, 1.4, GOLD, 3)),
];

const aureliaElements = [
    { ...line(0, 0, 595, 842, PAPER, 0), fixedToPage: true },
    { ...line(58, 42, 1, 756, RULE, 1), fixedToPage: true },
    { ...line(63, 42, 3, 54, GOLD, 2), fixedToPage: true },
    { ...line(63, 744, 3, 54, GOLD, 2), fixedToPage: true },

    masthead(tracked(bold(text("ANNA KOWALSKA", 31, DISPLAY, INK, 80, 55, 4)), 0.1)),
    masthead(tracked(text("STRATEGIA  ·  OPERACJE  ·  TRANSFORMACJA", 8.4, SANS, GOLD_DARK, 82, 100, 4), 1.55)),
    masthead(text("anna.kowalska@email.com  ·  +48 600 000 000  ·  Warszawa", 8.4, SANS, MUTED, 82, 128, 4)),
    masthead({
        ...bezierPath(302, 25, 229, 128, ORBIT_CURVES, GOLD, 1.2, 2, "arc"),
        id: "aurelia-golden-orbit",
    }),
    masthead({
        ...bezierPath(80, 153, 435, 19, SWEEP_CURVES, GOLD_DARK, 1.15, 3, "flourish"),
        id: "aurelia-masthead-sweep",
    }),
    masthead({
        category: "polygon",
        shape: "diamond",
        points: [[0.5, 0.04], [0.96, 0.5], [0.5, 0.96], [0.04, 0.5]],
        left: 495,
        top: 74,
        width: 10,
        height: 10,
        backgroundColor: GOLD,
        borderWidth: 0,
        filled: true,
        zIndex: 4,
        id: "aurelia-orbit-jewel",
    }),

    ...sectionHeading("PROFIL", 204, "summary"),
    block(
        "Liderka strategiczna, która przekłada złożoność na klarowne decyzje. "
        + "Buduje organizacje spokojne w działaniu, ambitne w celach i konsekwentne w realizacji.",
        116, 228, 399, 31, 9.3, 13.6, BODY, SANS,
    ),

    ...sectionHeading("DOŚWIADCZENIE", 291, "experience"),
    bold(text("Director of Operations  /  Waverly Group", 10.8, SANS, INK, 116, 316, 3)),
    text("2020 – obecnie  ·  Warszawa", 8.2, SANS, MUTED, 116, 335, 3),
    bulleted(block(
        "• Przebudowała model operacyjny, skracając drogę od decyzji do wdrożenia.\n"
        + "• Wprowadziła wspólny rytm planowania dla sześciu zespołów.",
        116, 352, 399, 31, 9.3, 13.6, BODY, SANS,
    )),
    bold(text("Operations Manager  /  Westbury", 10.8, SANS, INK, 116, 407, 3)),
    text("2016 – 2020  ·  Kraków", 8.2, SANS, MUTED, 116, 426, 3),
    bulleted(block(
        "• Uporządkowała portfel inicjatyw i odpowiedzialność właścicieli.\n"
        + "• Zbudowała zwięzły system raportowania wyników i ryzyk.",
        116, 443, 399, 31, 9.3, 13.6, BODY, SANS,
    )),

    ...sectionHeading("WYKSZTAŁCENIE", 515, "education"),
    bold(text("Zarządzanie i Strategia  /  SGH", 10.4, SANS, INK, 116, 540, 3)),
    text("2011 – 2016  ·  Warszawa", 8.2, SANS, MUTED, 116, 559, 3),

    ...sectionHeading("KOMPETENCJE", 614, "skills"),
    block(
        "Operating models  ·  Change management  ·  Governance  ·  Planning\n"
        + "Leadership  ·  Process design  ·  Stakeholder alignment",
        116, 639, 399, 31, 9.3, 13.6, BODY, SANS,
    ),

    { ...line(80, 778, 435, 1, RULE, 2), fixedToPage: true },
    {
        ...bezierPath(80, 783, 54, 12, THREAD_CURVES, GOLD, 1.2, 3, "flourish"),
        fixedToPage: true,
    },
    { ...tracked(text("AURELIA  /  01", 7.6, SANS, MUTED, 437, 788, 3), 1.1), fixedToPage: true },
    { ...line(80, 704, 435, 1, PALE, 1), fixedToPage: true },
];

export const aureliaTemplate = aureliaElements.map((element) => (
    element.fixedToPage || element.flowRole
        ? element
        : {
            ...element,
            flowRole: "content",
            ...(element.category === "textarea" ? { preserveInitialLayout: true } : {}),
        }
));
