// Prism — colourful & artistic. Bold purple header band, teal accent strip,
// and a rotating 10 × 10 colour square before every section heading.
import { text, line, block, bulleted } from "./helpers";

const PURPLE  = "#6B21A8";
const TEAL    = "#0D9488";
const ORANGE  = "#F26B2E";
const MAGENTA = "#D63384";
const WHITE   = "#FFFFFF";
const INK     = "#1A1A1A";
const GRAY    = "#6B7280";
const LGRAY   = "#9CA3AF";

// Section accent squares — each section gets the next colour in the cycle.
// The square shares the same `top` as the heading text so they sit side-by-side.
const sq = (top, color) => line(50, top, 10, 10, color, 2);

const bold = el => ({ ...el, bold: true });
const ital = el => ({ ...el, italic: true });

export const prismTemplate = [
    // ── DECORATIVE HEADER ────────────────────────────────────────
    line(0, 0, 595, 118, PURPLE, 0),       // purple band
    line(0, 118, 595, 6, TEAL, 1),          // teal accent strip
    line(0, 124, 595, 3, ORANGE, 1),        // orange micro-strip

    bold(text("PRIYA SHARMA", 30, "Inter", WHITE, 50, 38)),
    ital(text("UX Designer & Creative Lead", 13, "Inter", "#E9D5FF", 50, 80)),

    // ── CONTACT / DIVIDER ────────────────────────────────────────
    text("priya@email.com   ·   +1 (555) 820-0910   ·   San Francisco, CA", 9.5, "Inter", LGRAY, 50, 150),
    line(50, 168, 495, 1.5, ORANGE),

    // ── PROFILE ─────────────────────────────────────────────────
    sq(190, PURPLE), bold(text("PROFILE", 12, "Inter", INK, 68, 190)),
    block("UX designer with 8 years crafting delightful digital products — from early-stage startups to Fortune 500 companies. Passionate about accessibility and design systems.", 50, 214, 495, 52, 10.5, 15, GRAY, "Inter"),

    // ── EXPERIENCE ──────────────────────────────────────────────
    sq(280, ORANGE), bold(text("EXPERIENCE", 12, "Inter", INK, 68, 280)),
    bold(text("Senior UX Designer", 11, "Inter", INK, 50, 306)),
    text("Stripe   ·   San Francisco   ·   2021 – Present", 9.5, "Inter", GRAY, 50, 322),
    bulleted(block("• Led design of the global payments dashboard used by 2M+ merchants.\n• Built a design system adopted across 6 product teams.\n• Mentored 3 junior designers to senior level.", 50, 338, 495, 50, 10, 14, GRAY, "Inter")),

    bold(text("UX Designer", 11, "Inter", INK, 50, 402)),
    text("Airbnb   ·   2018 – 2021", 9.5, "Inter", GRAY, 50, 418),
    bulleted(block("• Redesigned host onboarding, improving completion 34%.\n• Ran 20+ usability studies across 8 countries.", 50, 434, 495, 36, 10, 14, GRAY, "Inter")),

    // ── EDUCATION ────────────────────────────────────────────────
    sq(486, TEAL), bold(text("EDUCATION", 12, "Inter", INK, 68, 486)),
    bold(text("B.F.A. Interaction Design — RISD", 11, "Inter", INK, 50, 512)),
    text("2013 – 2017", 9.5, "Inter", GRAY, 50, 528),

    // ── SKILLS ───────────────────────────────────────────────────
    sq(560, MAGENTA), bold(text("SKILLS", 12, "Inter", INK, 68, 560)),
    block("Figma · Prototyping · Design Systems · User Research · Accessibility · HTML / CSS · React", 50, 584, 495, 36, 10, 15, GRAY, "Inter"),
];
