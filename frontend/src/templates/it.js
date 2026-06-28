// IT CV — modern two-column. Filled teal sidebar + photo placeholder.
// The photo slot is the "visible empty space": a teal frame rect, a darker
// inner box, and a PHOTO label. To use it, add a gallery image over the box
// (or delete the box). zIndex keeps the dark fills under their text.
import { text, line, block } from "./helpers";

const SIDEBG = "#0F2A33";
const TEAL = "#2BB3C0";
const WHITE = "#FFFFFF";
const LIGHT = "#C9D8DA";
const MUTE = "#9FB8BC";
const MAININK = "#1F2937";
const GRAY = "#6B7280";

export const itTemplate = [
    // sidebar + photo placeholder
    line(0, 0, 190, 842, SIDEBG, 0),
    line(43, 38, 104, 104, TEAL, 1),
    line(45, 40, 100, 100, "#14333D", 2),
    text("PHOTO", 10, "Inter", "#6E8C92", 78, 84, 3),

    text("PRIYA SHARMA", 18, "Inter", WHITE, 28, 158, 3),
    text("Full-Stack Engineer", 11, "Inter", TEAL, 28, 184, 3),

    text("CONTACT", 10, "Inter", MUTE, 28, 218, 3),
    line(28, 232, 40, 2, TEAL, 3),
    block("priya.dev@email.com\n+1 (555) 222-3344\nSan Francisco, CA\ngithub.com/priyash", 28, 242, 145, 72, 9, 15, LIGHT, "Inter", 0, 3),

    text("SKILLS", 10, "Inter", MUTE, 28, 334, 3),
    line(28, 348, 40, 2, TEAL, 3),
    block("JavaScript / TypeScript\nReact · Node · Python\nAWS · Docker · K8s\nPostgreSQL · Redis\nGraphQL · CI/CD", 28, 358, 150, 112, 9, 16, LIGHT, "Inter", 0, 3),

    // main column
    text("PROFILE", 12, "Inter", SIDEBG, 220, 48, 2),
    line(220, 64, 60, 2, TEAL, 2),
    block("Full-stack engineer with 6 years building scalable web platforms. Comfortable across the stack, from React interfaces to distributed back-end services on AWS.", 220, 74, 330, 54, 10.5, 15, MAININK, "Inter", 0, 2),

    text("EXPERIENCE", 12, "Inter", SIDEBG, 220, 152, 2),
    line(220, 168, 60, 2, TEAL, 2),
    text("Senior Software Engineer", 11, "Inter", MAININK, 220, 182, 2),
    text("TechCorp · Remote · 2021 – Present", 9.5, "Inter", GRAY, 220, 198, 2),
    block("• Led migration to microservices, cutting deploy time 70%.\n• Built a React design system used across 8 teams.\n• Mentored 4 engineers to senior level.", 220, 214, 330, 52, 10, 14, MAININK, "Inter", 0, 2),
    text("Software Engineer", 11, "Inter", MAININK, 220, 280, 2),
    text("StartupXYZ · 2018 – 2021", 9.5, "Inter", GRAY, 220, 296, 2),
    block("• Shipped the core API serving 2M requests/day.\n• Introduced CI/CD, reducing release bugs 40%.", 220, 312, 330, 38, 10, 14, MAININK, "Inter", 0, 2),

    text("EDUCATION", 12, "Inter", SIDEBG, 220, 372, 2),
    line(220, 388, 60, 2, TEAL, 2),
    text("B.S. Computer Science — UC Berkeley", 11, "Inter", MAININK, 220, 402, 2),
    text("2014 – 2018", 9.5, "Inter", GRAY, 220, 418, 2),
];
