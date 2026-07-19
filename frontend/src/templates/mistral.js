// Mistral — a coastal editorial CV: sea-glass blue, warm paper, and an
// asymmetric information column. Designed for writers, researchers, and
// multidisciplinary professionals who want quiet distinction over ornament.
import { text, line, block, bulleted } from "./helpers";

const DEEP = "#173F4C";
const SEA = "#4D9AA6";
const FOAM = "#E8F0ED";
const PAPER = "#FBFAF5";
const INK = "#29363A";
const DRIFT = "#748184";
const SERIF = "Times-Roman";
const SANS = "Inter";

const bold = (element) => ({ ...element, bold: true });
const ital = (element) => ({ ...element, italic: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) =>
    ({ category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex });

const sideLabel = (label, top) => [
    tracked(bold(text(label, 8.5, SANS, SEA, 48, top, 2)), 1.45),
    line(48, top + 15, 104, 1, "#C7D7D4", 1),
];

const section = (label, top) => [
    line(188, top + 4, 5, 16, SEA, 2),
    tracked(bold(text(label, 10.5, SANS, DEEP, 204, top, 2)), 1.25),
    line(204, top + 22, 340, 0.75, "#D9E1DE", 1),
];

export const mistralTemplate = [
    // ── PAPER + HEADER FIELD ──────────────────────────────────────
    line(0, 0, 595, 842, PAPER, 0),
    line(0, 0, 595, 150, DEEP, 1),
    line(0, 150, 595, 7, SEA, 1),
    rect(48, 42, 88, 58, FOAM, 1, 2),
    tracked(block("MISTRAL", 48, 57, 88, 14, 8.5, 11, DEEP, SANS), 1.7),
    line(62, 80, 60, 1, SEA, 2),

    tracked(text("ELIAS MOREAU", 32, SERIF, "#FFFFFF", 188, 46, 2), 0.4),
    ital(text("Researcher, writer & systems thinker", 12.5, SANS, "#CBE3DF", 190, 91, 2)),
    text("Paris · +33 6 12 34 56 78 · elias.moreau@email.com", 9.2, SANS, "#B4D5D0", 190, 118, 2),

    // ── LEFT REFERENCE COLUMN ─────────────────────────────────────
    ...sideLabel("PROFILE", 198),
    block("I work where research, language and public systems meet — translating difficult questions into useful, human-scale work.", 48, 222, 104, 104, 9, 14, INK, SANS),

    ...sideLabel("PRACTICE", 364),
    block("Qualitative Research\nEditorial Direction\nPolicy Design\nFacilitation\nInformation Design", 48, 388, 104, 92, 8.8, 15, INK, SANS),

    ...sideLabel("LANGUAGES", 532),
    block("French — native\nEnglish — fluent\nItalian — working", 48, 556, 104, 54, 8.8, 15, INK, SANS),

    ...sideLabel("SELECTED", 658),
    block("The New European\nDesign Council\nPublic Digital\nField Notes", 48, 682, 104, 70, 8.8, 15, INK, SANS),

    // ── MAIN NARRATIVE COLUMN ─────────────────────────────────────
    ...section("EXPERIENCE", 194),
    bold(text("Principal Researcher", 11.5, SANS, INK, 204, 230, 2)),
    text("Civic Lab  ·  Paris  ·  2021 – Present", 9.2, SANS, DRIFT, 204, 247, 2),
    bulleted(block("• Led field research across 11 cities to redesign access to public services.\n• Turned 380 interviews into a national service blueprint adopted by three ministries.\n• Built a participatory research practice for a 24-person multidisciplinary studio.", 204, 265, 340, 58, 10, 14, INK, SANS)),

    bold(text("Editorial Strategist", 11.5, SANS, INK, 204, 350, 2)),
    text("North Star Review  ·  London  ·  2017 – 2021", 9.2, SANS, DRIFT, 204, 367, 2),
    bulleted(block("• Commissioned long-form reporting and research for an audience of 180K readers.\n• Designed editorial systems that reduced production time by 31% without losing craft.", 204, 385, 340, 44, 10, 14, INK, SANS)),

    ...section("EDUCATION", 466),
    bold(text("M.Sc. Cities, Space & Society — LSE", 10.8, SANS, INK, 204, 502, 2)),
    text("2015 – 2017  ·  Merit", 9.2, SANS, DRIFT, 204, 518, 2),
    bold(text("B.A. Politics & Modern History — Durham", 10.8, SANS, INK, 204, 548, 2)),
    text("2012 – 2015  ·  First Class Honours", 9.2, SANS, DRIFT, 204, 564, 2),

    ...section("NOTE", 610),
    block("Good work begins with attention: to people, to place, and to the small signals that reveal what a system is really doing.", 204, 646, 340, 42, 11, 16, DEEP, SERIF),
    line(204, 716, 340, 1, SEA, 1),
    tracked(text("PORTFOLIO · ELIASMOREAU.WORK", 9, SANS, DEEP, 204, 738, 2), 1.1),
];
