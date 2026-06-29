// Nocturne — bold modern CV with a dark header band. Inter throughout, heavy
// use of real bold for the name, section headings and roles. Coral accent.
import { text, line, block } from "./helpers";

const BAND = "#1F2933";
const CORAL = "#F25F4C";
const INK = "#1F2933";
const GRAY = "#6B7280";
const LIGHT = "#AEB6BD";

const bold = (el) => ({ ...el, bold: true });

export const nocturneTemplate = [
    // dark header band
    line(0, 0, 595, 160, BAND, 0),
    line(50, 120, 56, 4, CORAL, 1),
    bold(text("JORDAN AVERY", 32, "Inter", "#FFFFFF", 50, 56, 2)),
    text("Product Designer & Maker", 14, "Inter", CORAL, 50, 96, 2),
    text("hello@jordan.work   ·   +1 (555) 240-1180   ·   Brooklyn, NY", 9.5, "Inter", LIGHT, 50, 132, 2),

    // ABOUT
    bold(text("ABOUT", 12, "Inter", INK, 50, 192)),
    line(50, 209, 40, 2, CORAL),
    block("Product designer who ships. I turn fuzzy problems into clear, friendly interfaces — and I build the prototypes to prove them.", 50, 221, 495, 48, 10.5, 15),

    // EXPERIENCE
    bold(text("EXPERIENCE", 12, "Inter", INK, 50, 288)),
    line(50, 305, 40, 2, CORAL),
    bold(text("Senior Product Designer", 11, "Inter", INK, 50, 320)),
    text("Northwind Studio   ·   2020 – Present", 9.5, "Inter", GRAY, 50, 336),
    block("• Led the redesign of the core app, lifting activation 32%.\n• Built a component library adopted by 5 product teams.\n• Mentored 3 junior designers.", 50, 352, 495, 52, 10, 14),
    bold(text("Product Designer", 11, "Inter", INK, 50, 418)),
    text("Lumen Labs   ·   2017 – 2020", 9.5, "Inter", GRAY, 50, 434),
    block("• Designed 0-to-1 features across web and mobile.\n• Ran weekly usability sessions with real users.", 50, 450, 495, 40, 10, 14),

    // SKILLS
    bold(text("SKILLS", 12, "Inter", INK, 50, 506)),
    line(50, 523, 40, 2, CORAL),
    block("Figma · Prototyping · Design Systems · User Research · HTML/CSS · React", 50, 535, 495, 36, 10, 15),

    // EDUCATION
    bold(text("EDUCATION", 12, "Inter", INK, 50, 586)),
    line(50, 603, 40, 2, CORAL),
    bold(text("B.F.A. Interaction Design — RISD", 11, "Inter", INK, 50, 617)),
    text("2013 – 2017", 9.5, "Inter", GRAY, 50, 633),
];
