// Monolith — pure black / white / grayscale. No colour at all.
// Section headings use a thick 4 px black left bar as the only decoration.
import { text, line, block } from "./helpers";

const K   = "#0A0A0A";   // near-black
const DG  = "#444444";   // dark grey
const MG  = "#777777";   // mid grey
const LG  = "#AAAAAA";   // light grey
const VLG = "#DDDDDD";   // very light grey

const bold = el => ({ ...el, bold: true });
const ital = el => ({ ...el, italic: true });

// Section heading helper produces: thick left bar  +  heading text at same y.
// The bar is a line element (does not advance y in the generator); the text
// sits 12 px to the right and carries the line-height advance.
const bar  = (top) => line(50, top, 4, 12, K, 2);
const head = (label, top) => bold(text(label, 11, "Inter", K, 68, top));
const sep  = (top) => line(50, top, 495, 0.5, VLG);

export const monolithTemplate = [
    // ── HEADER ──────────────────────────────────────────────────
    bold(text("JAMES HARRISON", 32, "Inter", K, 50, 54)),
    ital(text("Senior Product Manager", 13, "Inter", MG, 50, 98)),
    text("james.h@email.com   ·   +1 (555) 770-0800   ·   Chicago, IL", 9.5, "Inter", LG, 50, 118),
    line(50, 136, 495, 0.5, DG),

    // ── EXPERIENCE ──────────────────────────────────────────────
    bar(154), head("PROFESSIONAL EXPERIENCE", 154),
    bold(text("Vice President of Product", 11, "Inter", K, 50, 180)),
    text("MidWest Financial Group   ·   2021 – Present", 9.5, "Inter", MG, 50, 196),
    block("• Built product roadmap that grew MRR 40%.\n• Led cross-functional team of 12 across design, engineering and data.\n• Launched 3 product lines serving 150,000+ customers.", 50, 212, 495, 50, 10, 14, MG, "Inter"),

    bold(text("Senior Product Manager", 11, "Inter", K, 50, 276)),
    text("SaaS Startup Inc   ·   2018 – 2021", 9.5, "Inter", MG, 50, 292),
    block("• Owned full product lifecycle for 2 core products.\n• Increased user retention 22% through personalization.\n• Reduced time-to-market 30% through agile process improvements.", 50, 308, 495, 50, 10, 14, MG, "Inter"),

    sep(372),

    // ── EDUCATION ───────────────────────────────────────────────
    bar(386), head("EDUCATION", 386),
    bold(text("M.B.A. — Northwestern University, Kellogg", 11, "Inter", K, 50, 412)),
    text("2014 – 2016", 9.5, "Inter", MG, 50, 428),

    sep(450),

    // ── SKILLS ──────────────────────────────────────────────────
    bar(464), head("SKILLS", 464),
    block("Product Strategy · Roadmapping · Agile / Scrum · SQL · Tableau · Data Analysis · Stakeholder Management", 50, 490, 495, 36, 10, 15, MG, "Inter"),
];
