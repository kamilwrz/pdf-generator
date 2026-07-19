// Meridian — 16:9 presentation deck (960×540). Editorial serif display
// (Times-Roman) over Inter body, deep-ink text with a confident blue accent.
// Exercises every canvas primitive: text, textarea (incl. bullet lists +
// center align), line (solid bars/rules), outline rectangles (frames, image
// placeholder) and arrow connectors (agenda flow).
//
// Symbolic `id` keys let connectors reference their boxes — the loader
// rewrites them to real element_ids (materializeSpecs).
import { text, line, block, bulleted } from "./helpers";

const INK = "#1F2A3A";
const BODY = "#2A3542";
const BLUE = "#3E6DB5";
const SKY = "#9DBBE6";
const GRAY = "#57616F";
const MIST = "#D9E2EF";
const SERIF = "Times-Roman";
const SANS = "Inter";

const bold = (el) => ({ ...el, bold: true });
const centered = (el) => ({ ...el, align: "center" });
const onPage = (n) => (el) => ({ ...el, page: n });

const rect = (left, top, width, height, color, borderWidth = 1.5, zIndex = 1) =>
    ({ category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex });

const conn = (source_id, target_id) =>
    ({ category: "connector", source_id, target_id, backgroundColor: BLUE, borderWidth: 1.5, arrow: true, zIndex: 6 });

// Shared footer rule + page number for content slides.
const footer = (n) => [
    line(80, 497, 800, 1, MIST, 1),
    text(String(n).padStart(2, "0"), 10, SANS, GRAY, 862, 507, 2),
    text("Meridian", 10, SANS, GRAY, 80, 507, 2),
];

// ---- Slide 1 · Title ----------------------------------------------------
const slide1 = [
    line(0, 0, 14, 540, BLUE, 1),
    line(14, 0, 3, 540, SKY, 1),
    // geometric motif: two offset outline frames + a filled square
    rect(700, 140, 180, 180, SKY, 1.5, 1),
    rect(730, 170, 180, 180, BLUE, 1.5, 1),
    line(676, 116, 14, 14, BLUE, 1),

    bold(text("COMPANY · 2026", 11, SANS, BLUE, 84, 96, 2)),
    bold(block("Presentation title goes here", 84, 150, 520, 120, 44, 52, INK, SERIF)),
    line(84, 296, 110, 3, BLUE, 2),
    block("A one-line subtitle that frames the story you are about to tell.", 84, 320, 480, 48, 15, 22, GRAY, SANS),

    bold(text("Author Name", 12, SANS, INK, 84, 452, 2)),
    text("City · July 2026", 10.5, SANS, GRAY, 84, 472, 2),
].map(onPage(1));

// ---- Slide 2 · Agenda (connector flow) ----------------------------------
const agendaBox = (id, left, num, label) => ([
    { ...rect(left, 210, 200, 130, BLUE, 1.5, 2), id },
    bold(text(num, 20, SERIF, BLUE, left + 18, 226, 3)),
    block(label, left + 18, 268, 164, 56, 12.5, 18, BODY, SANS, 0, 3),
]);

const slide2 = [
    bold(text("Agenda", 28, SERIF, INK, 80, 64, 2)),
    line(80, 106, 56, 3, BLUE, 2),
    ...agendaBox("ag1", 80, "01", "Where we are\nThe starting point."),
    ...agendaBox("ag2", 380, "02", "What we learned\nThe evidence."),
    ...agendaBox("ag3", 680, "03", "Where we go\nThe decision."),
    conn("ag1", "ag2"),
    conn("ag2", "ag3"),
    ...footer(2),
].map(onPage(2));

// ---- Slide 3 · Key insight + image frame --------------------------------
const slide3 = [
    bold(text("Key insight", 28, SERIF, INK, 80, 64, 2)),
    line(80, 106, 56, 3, BLUE, 2),
    bulleted(block(
        "• First supporting point stated clearly.\n• Second point backed by a concrete number.\n• Third point — the so-what for the audience.\n• Fourth point that closes the argument.",
        80, 160, 400, 240, 14, 24, BODY, SANS
    )),
    // offset double frame = image placeholder (AI drops the matched image inside)
    rect(548, 148, 340, 255, MIST, 1.5, 1),
    rect(560, 160, 340, 255, BLUE, 1.5, 2),
    text("Image placeholder", 10.5, SANS, "#8894A5", 672, 278, 3),
    text("Fig. 1 — replace with your visual", 9.5, SANS, GRAY, 560, 430, 2),
    ...footer(3),
].map(onPage(3));

// ---- Slide 4 · Two-column -----------------------------------------------
const slide4 = [
    bold(text("In detail", 28, SERIF, INK, 80, 64, 2)),
    line(80, 106, 56, 3, BLUE, 2),
    line(478, 160, 2, 270, MIST, 1),
    bold(text("Where we are", 15, SANS, INK, 80, 162, 2)),
    bulleted(block(
        "• Current state, summarised honestly.\n• The constraint that shaped this year.\n• What is already working well.",
        80, 192, 360, 230, 12.5, 20, BODY, SANS
    )),
    bold(text("Where we're going", 15, SANS, INK, 518, 162, 2)),
    bulleted(block(
        "• The bet we are making next.\n• What changes for the team.\n• How we will know it worked.",
        518, 192, 360, 230, 12.5, 20, BODY, SANS
    )),
    ...footer(4),
].map(onPage(4));

// ---- Slide 5 · Closing --------------------------------------------------
const slide5 = [
    rect(880, 44, 36, 36, SKY, 1, 1),
    line(864, 28, 12, 12, BLUE, 1),
    bold(centered(block("Thank you.", 230, 196, 500, 64, 46, 56, INK, SERIF))),
    line(430, 286, 100, 3, BLUE, 2),
    centered(block("name@email.com  ·  +00 000 000 000  ·  company.com", 230, 312, 500, 24, 12.5, 17, GRAY, SANS)),
    ...footer(5),
].map(onPage(5));

export const meridianTemplate = [...slide1, ...slide2, ...slide3, ...slide4, ...slide5];
