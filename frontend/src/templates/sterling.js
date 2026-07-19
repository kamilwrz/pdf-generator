// Sterling — finance CV with an engraved share-certificate feel. The first
// template built around the OUTLINE RECTANGLE element: a double hairline frame
// around the page, a row of outlined KPI stat boxes under the header, and
// small outline-square section markers. Navy & steel blues over cool greys;
// Times-Roman display, Inter body. Centered header via align:"center"
// textareas (metric-exact on canvas + PDF, no eyeballed centering).
import { text, line, block, bulleted } from "./helpers";

const NAVY = "#1B2A41";   // display ink
const ACCENT = "#2E5E9E"; // steel blue
const STEEL = "#7C8CA0";  // grey-blue details
const GRAY = "#66707E";   // secondary text
const PALE = "#D9E0E9";   // hairlines
const BODY = "#33404F";   // body text
const S = "Times-Roman";
const I = "Inter";

const bold = (el) => ({ ...el, bold: true });
const centered = (el) => ({ ...el, align: "center" });
const spaced = (el, ls) => ({ ...el, letterSpacing: ls });

const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) =>
    ({ category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex });

// Section heading: outline-square marker + serif title + hairline to the frame.
const section = (title, y, hairlineFrom) => [
    rect(55, y + 2, 9, 9, ACCENT, 1.5, 2),
    bold(text(title, 11.5, S, NAVY, 72, y, 2)),
    line(hairlineFrom, y + 6, 540 - hairlineFrom, 1, PALE, 1),
];

// Outlined KPI stat box: figure (serif) over an uppercase label.
const kpi = (left, figure, label) => [
    rect(left, 160, 157, 52, STEEL, 1.2, 1),
    bold(centered(block(figure, left, 168, 157, 18, 15, 18, NAVY, S))),
    spaced(centered(block(label, left, 190, 157, 12, 7.5, 10, GRAY, I)), 1),
];

export const sterlingTemplate = [
    // ---- engraved double frame around the page ----
    rect(24, 24, 547, 794, STEEL, 1.5, 1),
    rect(29, 29, 537, 784, PALE, 1, 1),

    // ---- centered header ----
    bold(centered(block("JULIAN MERCER", 50, 56, 495, 36, 28, 34, NAVY, S))),
    spaced(centered(block("SENIOR INVESTMENT ANALYST", 50, 96, 495, 18, 12, 16, ACCENT, I)), 2),
    centered(block("london · +44 20 7946 0000 · julian.mercer@email.com", 50, 120, 495, 14, 9.5, 13, GRAY, I)),

    // ornament: accent bar flanked by two outline squares
    rect(255, 139, 8, 8, STEEL, 1, 1),
    line(271, 142, 53, 2, ACCENT, 1),
    rect(332, 139, 8, 8, STEEL, 1, 1),

    // ---- KPI strip (outline stat boxes — Sterling's signature) ----
    ...kpi(55,  "8+",    "YEARS IN ASSET MANAGEMENT"),
    ...kpi(219, "$2.4B", "PORTFOLIOS ADVISED"),
    ...kpi(383, "CFA",   "CHARTERHOLDER · 2020"),

    // ---- profile ----
    ...section("PROFILE", 238, 152),
    block(
        "Investment analyst covering European equities and fixed income. I build conviction from first-principles research and communicate it plainly — to committees, clients and regulators alike.",
        55, 258, 485, 48, 10.5, 15, BODY, I
    ),

    // ---- experience ----
    ...section("EXPERIENCE", 322, 186),
    bold(text("Senior Investment Analyst — Hartwell Capital", 11, I, NAVY, 55, 344, 2)),
    text("2019 – Present · London", 9, I, GRAY, 55, 360, 2),
    bulleted(block(
        "• Lead analyst on a €640M European equity book; +310bps vs. benchmark over three years.\n• Built the desk's DCF and scenario library now used across four strategies.\n• Present quarterly to the investment committee and top-20 clients.\n• Mentor two juniors; run the summer analyst programme.",
        55, 376, 485, 62, 10, 14, BODY, I
    )),
    bold(text("Investment Analyst — Berkeley & Marsh", 11, I, NAVY, 55, 450, 2)),
    text("2016 – 2019 · London", 9, I, GRAY, 55, 466, 2),
    bulleted(block(
        "• Covered industrials and financials across the FTSE 350.\n• Authored 40+ initiation notes; 68% hit rate on 12-month calls.\n• Automated the weekly risk pack, saving the desk a day per week.",
        55, 482, 485, 48, 10, 14, BODY, I
    )),
    bold(text("Junior Analyst — Crown Asset Management", 11, I, NAVY, 55, 542, 2)),
    text("2014 – 2016 · Edinburgh", 9, I, GRAY, 55, 558, 2),
    bulleted(block(
        "• Supported the multi-asset team with performance attribution.\n• Rebuilt the fund factsheet pipeline in Python.",
        55, 574, 485, 34, 10, 14, BODY, I
    )),

    // ---- education ----
    ...section("EDUCATION", 622, 182),
    bold(text("MSc Finance — London School of Economics", 10.5, I, NAVY, 55, 644, 2)),
    text("2013 – 2014 · Distinction", 9, I, GRAY, 55, 660, 2),
    bold(text("BSc Economics — University of Edinburgh", 10.5, I, NAVY, 55, 680, 2)),
    text("2009 – 2013 · First Class Honours", 9, I, GRAY, 55, 696, 2),

    // ---- skills ----
    ...section("SKILLS", 724, 140),
    block(
        "Valuation & DCF Modelling · Portfolio Analytics · Fixed Income · Python & SQL · IFRS · Client Reporting · Bloomberg / FactSet",
        55, 746, 485, 30, 10, 15, BODY, I
    ),

    // ---- footer ----
    spaced(centered(block("REFERENCES AVAILABLE ON REQUEST", 50, 788, 495, 12, 8, 11, STEEL, I)), 1.5),
];
