// Ampersand — editorial serif CV with a left accent stripe. Times-Roman with
// real bold headings and real italic for the role/dates. Wine accent.
import { text, line, block, bulleted } from "./helpers";

const INK = "#2A2320";
const WINE = "#7B2D3A";
const GRAY = "#8A7F78";
const RULE = "#E0D7D1";
const BODY = "#3A332E";
const S = "Times-Roman";

const bold = (el) => ({ ...el, bold: true });
const ital = (el) => ({ ...el, italic: true });

export const ampersandTemplate = [
    // left accent stripe
    line(0, 0, 9, 842, WINE, 0),
    bold(text("ROWAN ELLIS", 31, S, INK, 50, 58, 2)),
    ital(text("Writer & Editor", 14, S, WINE, 50, 98, 2)),
    text("rowan.ellis@email.com   ·   +1 (555) 661-2210   ·   Portland, OR", 9.5, S, GRAY, 50, 122, 2),
    line(50, 140, 497, 1, RULE),

    bold(text("PROFILE", 12, S, INK, 50, 158)),
    block("Editor and writer with a decade shaping long-form stories. I bring clarity to complex ideas and a steady hand to every deadline.", 50, 174, 497, 52, 11, 16, BODY, S),

    bold(text("EXPERIENCE", 12, S, INK, 50, 246)),
    bold(text("Senior Editor — Meridian Press", 11.5, S, INK, 50, 268)),
    ital(text("2018 – Present", 9.5, S, GRAY, 50, 284)),
    bulleted(block("• Commissioned and edited 200+ features across print and web.\n• Grew the essays vertical's readership by 40%.\n• Mentored a team of six staff writers.", 50, 300, 497, 52, 10.5, 15, BODY, S)),
    bold(text("Staff Writer — The Quarterly", 11.5, S, INK, 50, 364)),
    ital(text("2014 – 2018", 9.5, S, GRAY, 50, 380)),
    bulleted(block("• Wrote cover stories and a weekly column.\n• Won two regional press awards.", 50, 396, 497, 40, 10.5, 15, BODY, S)),

    bold(text("EDUCATION", 12, S, INK, 50, 452)),
    bold(text("M.A. English Literature — Reed College", 11, S, INK, 50, 472)),
    ital(text("2010 – 2014", 9.5, S, GRAY, 50, 488)),

    bold(text("SKILLS", 12, S, INK, 50, 528)),
    block("Editing · Copywriting · Storytelling · CMS · SEO · Fact-checking", 50, 546, 497, 36, 10.5, 15, BODY, S),
];
