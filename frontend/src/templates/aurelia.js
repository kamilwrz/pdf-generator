/**
 * Aurelia template.
 *
 * A one-column quiet-luxury composition built around a restrained three-stroke
 * signature below the masthead. Two short cubic Bézier gestures and one quiet
 * rule create movement without entering the text area. Section divider lengths
 * follow their heading labels while sharing one precise right edge.
 */
import { bezierPath, block, bulleted, line, text } from "./helpers.js";

const PAPER = "#FEFDF9";
const INK = "#272724";
const BODY = "#464540";
const MUTED = "#77736B";
const GOLD = "#B3924F";
const GOLD_DARK = "#8B713A";
const RULE = "#DCD8CE";
const DISPLAY = "PlayfairDisplay";
const SANS = "Montserrat";

const LEAD_CURVES = [
    { type: "M", x: 0.02, y: 0.72 },
    { type: "C", x1: 0.28, y1: 0.12, x2: 0.72, y2: 0.12, x: 0.98, y: 0.52 },
];
const TAIL_CURVES = [
    { type: "M", x: 0.02, y: 0.5 },
    { type: "C", x1: 0.35, y1: 0.84, x2: 0.72, y2: 0.08, x: 0.98, y: 0.38 },
];

const masthead = (element) => ({ ...element, flowRole: "masthead" });
const sectionChrome = (element) => ({ ...element, flowRole: "section-chrome" });
const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });

const SECTION_HEADING_LEFT = 116;
const SECTION_RULE_RIGHT = 515;
const SECTION_HEADING_SIZE = 9;
const SECTION_HEADING_TRACKING = 1.35;
const SECTION_RULE_GAP = 18;

/**
 * Creates section chrome whose trailing rule reacts to the displayed label.
 *
 * The browser and reflow engine use the same tracked-width approximation:
 * average glyph width plus letter spacing. Only the rule's start changes; its
 * right edge remains fixed at x=515, preserving the page's vertical datum.
 */
const sectionHeading = (label, top, id) => {
    const estimatedLabelWidth = label.length * (
        SECTION_HEADING_SIZE * 0.58 + SECTION_HEADING_TRACKING
    );
    const ruleLeft = Math.min(
        SECTION_RULE_RIGHT - 24,
        SECTION_HEADING_LEFT + estimatedLabelWidth + SECTION_RULE_GAP,
    );

    return [
        sectionChrome({
            ...line(76, top + 7, 28, 4, GOLD, 3),
            id: `aurelia-${id}-bar`,
        }),
        sectionChrome(tracked(
            bold(text(label, SECTION_HEADING_SIZE, SANS, INK, SECTION_HEADING_LEFT, top, 3)),
            SECTION_HEADING_TRACKING,
        )),
        sectionChrome(line(
            ruleLeft,
            top + 9,
            SECTION_RULE_RIGHT - ruleLeft,
            1,
            RULE,
            2,
        )),
    ];
};

const aureliaElements = [
    { ...line(0, 0, 595, 842, PAPER, 0), fixedToPage: true },
    { ...line(58, 42, 1, 756, RULE, 1), fixedToPage: true },
    { ...line(63, 42, 3, 54, GOLD, 2), fixedToPage: true },
    { ...line(63, 744, 3, 54, GOLD, 2), fixedToPage: true },

    masthead(tracked(bold(text("ANNA KOWALSKA", 31, DISPLAY, INK, 80, 55, 4)), 0.1)),
    masthead(tracked(text("STRATEGIA  ·  OPERACJE  ·  TRANSFORMACJA", 8.4, SANS, GOLD_DARK, 82, 100, 4), 1.55)),
    masthead(text("anna.kowalska@email.com  ·  +48 600 000 000  ·  Warszawa", 8.4, SANS, MUTED, 82, 128, 4)),
    masthead({
        ...bezierPath(80, 151, 158, 16, LEAD_CURVES, GOLD_DARK, 4, 3, "arc"),
        id: "aurelia-signature-lead",
    }),
    masthead({ ...line(256, 162, 143, 2, GOLD, 3), id: "aurelia-signature-bridge" }),
    masthead({
        ...bezierPath(419, 155, 96, 16, TAIL_CURVES, GOLD_DARK, 2.5, 3, "flourish"),
        id: "aurelia-signature-tail",
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
    { ...line(80, 787, 54, 4, GOLD, 3), fixedToPage: true },
    { ...tracked(text("AURELIA  /  01", 7.6, SANS, MUTED, 437, 788, 3), 1.1), fixedToPage: true },
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
