// Education CV — centered, academic, framed. Times-Roman headings + Inter body.
// Decoration: a thin full-page frame (4 line rects) + centered headings flanked
// by short rules ("—— EXPERIENCE ——"). Centered text uses approximate `left`;
// the Center-align button refines it after load.
import { text, line, block } from "./helpers";

const INK = "#2E2A25";
const SAGE = "#4E7A6B";
const FLANK = "#CBB89E";
const FRAME = "#D8CDBA";
const GRAY = "#6B7280";
const BODY = "#2B2B2B";

export const educationTemplate = [
    // full-page frame
    line(28, 28, 539, 1, FRAME, 1),
    line(28, 813, 539, 1, FRAME, 1),
    line(28, 28, 1, 786, FRAME, 1),
    line(566, 28, 1, 786, FRAME, 1),

    // header (centered approx)
    text("DR. ELENA ROSSI", 28, "Times-Roman", INK, 198, 52, 2),
    text("Professor of Education · Curriculum Specialist", 13, "Times-Roman", SAGE, 178, 92, 2),
    text("elena.rossi@email.com · +1 (555) 303-4050 · Boston, MA", 9.5, "Inter", GRAY, 168, 116, 2),
    line(248, 138, 100, 1.5, SAGE, 2),

    // PROFILE
    text("PROFILE", 12, "Times-Roman", INK, 268, 166, 2),
    line(90, 173, 150, 1, FLANK, 1),
    line(355, 173, 150, 1, FLANK, 1),
    block("Dedicated educator with 15+ years shaping curricula and mentoring faculty. Committed to evidence-based pedagogy and inclusive, student-centered learning.", 55, 188, 485, 54, 10.5, 15, BODY),

    // EXPERIENCE
    text("EXPERIENCE", 12, "Times-Roman", INK, 258, 256, 2),
    line(90, 263, 150, 1, FLANK, 1),
    line(355, 263, 150, 1, FLANK, 1),
    text("Senior Lecturer — Boston University", 11, "Inter", INK, 55, 278, 2),
    text("2017 – Present", 9.5, "Inter", GRAY, 55, 294, 2),
    block("• Redesigned the graduate education core, raising satisfaction 25%.\n• Secured $400K in research grants.\n• Supervised 30+ master's theses.", 55, 310, 485, 50, 10, 14, BODY),

    // EDUCATION
    text("EDUCATION", 12, "Times-Roman", INK, 262, 380, 2),
    line(90, 387, 150, 1, FLANK, 1),
    line(355, 387, 150, 1, FLANK, 1),
    text("Ph.D. Education — Harvard Graduate School of Education", 11, "Inter", INK, 55, 402, 2),
    text("2010 – 2014", 9.5, "Inter", GRAY, 55, 418, 2),

    // SKILLS
    text("SKILLS", 12, "Times-Roman", INK, 270, 472, 2),
    line(90, 479, 150, 1, FLANK, 1),
    line(355, 479, 150, 1, FLANK, 1),
    block("Curriculum Design · Pedagogy · Assessment · EdTech · Research Methods · Faculty Mentoring", 55, 492, 485, 40, 10, 15, BODY),
];
