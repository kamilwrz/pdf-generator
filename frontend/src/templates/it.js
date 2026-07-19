// IT CV — modern two-column. Filled teal sidebar + photo placeholder.
// The photo slot is the "visible empty space": a teal frame rect, a darker
// inner box, and a PHOTO label. To use it, add a gallery image over the box
// (or delete the box). zIndex keeps the dark fills under their text.
import { text, line, block, bulleted } from "./helpers";

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
    text("ZDJĘCIE", 10, "Inter", "#6E8C92", 78, 84, 3),

    text("KATARZYNA NOWAK", 18, "Inter", WHITE, 28, 158, 3),
    text("Inżynier Full-Stack", 11, "Inter", TEAL, 28, 184, 3),

    text("KONTAKT", 10, "Inter", MUTE, 28, 218, 3),
    line(28, 232, 40, 2, TEAL, 3),
    block("katarzyna.nowak@email.com\n+48 600 234 567\nKraków\ngithub.com/knowak", 28, 242, 145, 72, 9, 15, LIGHT, "Inter", 0, 3),

    text("UMIEJĘTNOŚCI", 10, "Inter", MUTE, 28, 334, 3),
    line(28, 348, 40, 2, TEAL, 3),
    block("JavaScript / TypeScript\nReact · Node · Python\nAWS · Docker · K8s\nPostgreSQL · Redis\nGraphQL · CI/CD", 28, 358, 150, 112, 9, 16, LIGHT, "Inter", 0, 3),

    // main column
    text("PROFIL", 12, "Inter", SIDEBG, 220, 48, 2),
    line(220, 64, 60, 2, TEAL, 2),
    block("Inżynier full-stack z 6-letnim doświadczeniem w budowaniu skalowalnych platform webowych. Swobodnie porusza się w całym stosie — od interfejsów React po rozproszone usługi backendowe w AWS.", 220, 74, 330, 54, 10.5, 15, MAININK, "Inter", 0, 2),

    text("DOŚWIADCZENIE", 12, "Inter", SIDEBG, 220, 152, 2),
    line(220, 168, 60, 2, TEAL, 2),
    text("Starszy Inżynier Oprogramowania", 11, "Inter", MAININK, 220, 182, 2),
    text("TechCorp Polska · zdalnie · 2021 – obecnie", 9.5, "Inter", GRAY, 220, 198, 2),
    bulleted(block("• Poprowadził migrację do mikrousług, skracając czas wdrożeń o 70%.\n• Zbudował system projektowy React używany przez 8 zespołów.\n• Rozwijał 4 inżynierów do poziomu seniora.", 220, 214, 330, 52, 10, 14, MAININK, "Inter", 0, 2)),
    text("Inżynier Oprogramowania", 11, "Inter", MAININK, 220, 280, 2),
    text("StartupXYZ · 2018 – 2021", 9.5, "Inter", GRAY, 220, 296, 2),
    bulleted(block("• Dostarczył kluczowe API obsługujące 2 mln żądań dziennie.\n• Wprowadził CI/CD, redukując błędy w release'ach o 40%.", 220, 312, 330, 38, 10, 14, MAININK, "Inter", 0, 2)),

    text("EDUKACJA", 12, "Inter", SIDEBG, 220, 372, 2),
    line(220, 388, 60, 2, TEAL, 2),
    text("Inżynier Informatyki — Politechnika Krakowska", 11, "Inter", MAININK, 220, 402, 2),
    text("2014 – 2018", 9.5, "Inter", GRAY, 220, 418, 2),
];
