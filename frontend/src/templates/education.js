// Education CV — centered, academic, framed. Times-Roman headings + Inter body.
// Decoration: a thin full-page frame (4 line rects) + centered headings flanked
// by short rules ("—— EXPERIENCE ——"). Centered text uses approximate `left`;
// the Center-align button refines it after load.
import { text, line, block, bulleted } from "./helpers";

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
    text("DR ANNA WIŚNIEWSKA", 28, "Times-Roman", INK, 198, 52, 2),
    text("Profesor Edukacji · Specjalistka ds. Programów Nauczania", 13, "Times-Roman", SAGE, 178, 92, 2),
    text("anna.wisniewska@email.com · +48 600 345 678 · Poznań", 9.5, "Inter", GRAY, 168, 116, 2),
    line(248, 138, 100, 1.5, SAGE, 2),

    // PROFILE
    text("PROFIL", 12, "Times-Roman", INK, 268, 166, 2),
    line(90, 173, 150, 1, FLANK, 1),
    line(355, 173, 150, 1, FLANK, 1),
    block("Oddana edukatorka z ponad 15-letnim doświadczeniem w kształtowaniu programów nauczania i mentoringu kadry. Zaangażowana w pedagogikę opartą na dowodach naukowych i inkluzywne uczenie skoncentrowane na uczniu.", 55, 188, 485, 54, 10.5, 15, BODY),

    // EXPERIENCE
    text("DOŚWIADCZENIE", 12, "Times-Roman", INK, 258, 256, 2),
    line(90, 263, 150, 1, FLANK, 1),
    line(355, 263, 150, 1, FLANK, 1),
    text("Starszy Wykładowca — Uniwersytet im. Adama Mickiewicza w Poznaniu", 11, "Inter", INK, 55, 278, 2),
    text("2017 – obecnie", 9.5, "Inter", GRAY, 55, 294, 2),
    bulleted(block("• Przeprojektowała rdzeń studiów magisterskich z edukacji, podnosząc satysfakcję o 25%.\n• Pozyskała granty badawcze o wartości 1,6 mln zł.\n• Promowała ponad 30 prac magisterskich.", 55, 310, 485, 50, 10, 14, BODY)),

    // EDUCATION
    text("EDUKACJA", 12, "Times-Roman", INK, 262, 380, 2),
    line(90, 387, 150, 1, FLANK, 1),
    line(355, 387, 150, 1, FLANK, 1),
    text("Doktorat Edukacji — Uniwersytet Jagielloński", 11, "Inter", INK, 55, 402, 2),
    text("2010 – 2014", 9.5, "Inter", GRAY, 55, 418, 2),

    // SKILLS
    text("UMIEJĘTNOŚCI", 12, "Times-Roman", INK, 270, 472, 2),
    line(90, 479, 150, 1, FLANK, 1),
    line(355, 479, 150, 1, FLANK, 1),
    block("Projektowanie programów nauczania · Pedagogika · Ocena · EdTech · Metody badawcze · Rozwój kadry", 55, 492, 485, 40, 10, 15, BODY),
];
