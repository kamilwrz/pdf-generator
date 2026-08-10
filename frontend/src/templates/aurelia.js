/**
 * Aurelia template.
 *
 * A one-column quiet-luxury composition built around thick contrasting Bézier
 * brushstrokes behind the display name and job title. A mist-grey vertical
 * gesture on the right softens the stack; charcoal and stone plates create
 * large, high-contrast fields for white type, with a gold accent stroke on
 * the name. Section divider lengths follow their labels and share one precise
 * right edge; antique-gold chrome also marks section bars and page rails.
 */
import { bezierPath, block, bulleted, line, text } from "./helpers.js";

const PAPER = "#FEFDF9";
const INK = "#272724";
const BODY = "#464540";
const MUTED = "#77736B";
const GOLD = "#B3924F";
const GOLD_DARK = "#8B713A";
const RULE = "#DCD8CE";
const MIST = "#D6D6D3";
/** Deep charcoal plate behind the name — enough mass for white glyphs. */
const SLATE = "#3A3A36";
/** Mid stone plate behind the job title; still dark enough for white type. */
const STONE = "#5A5A54";
const WHITE = "#FFFFFF";
const DISPLAY = "PlayfairDisplay";
const SANS = "Montserrat";

const BACKDROP_CURVES = [
    { type: "M", x: 0.72, y: 0.02 },
    { type: "C", x1: 1, y1: 0.27, x2: 0.08, y2: 0.66, x: 0.34, y: 0.98 },
];
const NAMEPLATE_CURVES = [
    { type: "M", x: 0.03, y: 0.55 },
    { type: "C", x1: 0.25, y1: 0.23, x2: 0.68, y2: 0.78, x: 0.97, y: 0.46 },
];
const TITLEPLATE_CURVES = [
    { type: "M", x: 0.02, y: 0.52 },
    { type: "C", x1: 0.28, y1: 0.16, x2: 0.72, y2: 0.84, x: 0.98, y: 0.48 },
];
const INK_CURVES = [
    { type: "M", x: 0.02, y: 0.65 },
    { type: "C", x1: 0.28, y1: 0.05, x2: 0.72, y2: 0.95, x: 0.98, y: 0.25 },
];

const STARTER_NAME = "ANNA KOWALSKA";
const STARTER_TITLE = "STRATEGIA  ·  OPERACJE  ·  TRANSFORMACJA";
const DISPLAY_NAME_SIZE = 31;
const DISPLAY_NAME_TRACKING = 0.1;
const TITLE_SIZE = 8.4;
const TITLE_TRACKING = 1.55;
const estimatedStarterNameWidth = Math.min(
    435,
    Math.max(
        180,
        STARTER_NAME.length * (DISPLAY_NAME_SIZE * 0.63 + DISPLAY_NAME_TRACKING),
    ),
);
const estimatedStarterTitleWidth = Math.min(
    360,
    Math.max(
        140,
        STARTER_TITLE.length * (TITLE_SIZE * 0.52 + TITLE_TRACKING * 0.35),
    ),
);

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

    // PDF export paints in array order. Keep all artwork before masthead text so
    // the explicit z-index layering also remains readable in the exported file.
    // Contrast stack: mist right companion → thick charcoal name plate →
    // thick stone title plate → gold accent → white name/title type.
    masthead({
        ...bezierPath(
            Math.min(425, 80 + estimatedStarterNameWidth * 1.02),
            24,
            90,
            132,
            BACKDROP_CURVES,
            MIST,
            22,
            1,
            "flourish",
        ),
        id: "aurelia-name-backdrop",
    }),
    masthead({
        ...bezierPath(
            72,
            36,
            Math.min(455, estimatedStarterNameWidth + 56),
            52,
            NAMEPLATE_CURVES,
            SLATE,
            44,
            2,
            "wave",
        ),
        id: "aurelia-nameplate",
    }),
    masthead({
        ...bezierPath(
            78,
            86,
            Math.min(400, estimatedStarterTitleWidth + 48),
            36,
            TITLEPLATE_CURVES,
            STONE,
            30,
            2,
            "wave",
        ),
        id: "aurelia-titleplate",
    }),
    masthead({
        ...bezierPath(
            80,
            28,
            estimatedStarterNameWidth * 0.55,
            12,
            INK_CURVES,
            GOLD,
            6,
            3,
            "arc",
        ),
        id: "aurelia-name-ink",
    }),
    masthead(tracked(
        bold(text(STARTER_NAME, DISPLAY_NAME_SIZE, DISPLAY, WHITE, 80, 55, 4)),
        DISPLAY_NAME_TRACKING,
    )),
    masthead(tracked(text(STARTER_TITLE, TITLE_SIZE, SANS, WHITE, 82, 100, 4), TITLE_TRACKING)),
    masthead(text("anna.kowalska@email.com  ·  +48 600 000 000  ·  Warszawa", 8.4, SANS, MUTED, 82, 128, 4)),

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
