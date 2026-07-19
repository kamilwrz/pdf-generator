// Blueprint — technical two-column CV split by a thin divider. Inter body with
// monospace (Courier) section labels and a comment-style title. Bold name and
// labels. Blue accent.
import { text, line, block, bulleted } from "./helpers";

const INK = "#1A2530";
const BLUE = "#2B6CB0";
const GRAY = "#6B7280";
const BODY = "#3A4753";
const DIV = "#D8DEE4";
const M = "Courier";

const bold = (el) => ({ ...el, bold: true });

export const blueprintTemplate = [
    bold(text("TOMASZ KOWALCZYK", 30, "Inter", INK, 50, 56)),
    text("// inżynier oprogramowania", 12, M, BLUE, 50, 94),
    text("tomasz.kowalczyk@email.com   ·   +48 600 678 901   ·   Wrocław", 9.5, "Inter", GRAY, 50, 118),
    line(50, 138, 495, 1.5, INK),
    // vertical divider between the two columns
    line(205, 160, 1, 645, DIV),

    // left column
    bold(text("KONTAKT", 10, M, BLUE, 50, 176)),
    block("tomasz.kowalczyk@email.com\n+48 600 678 901\nWrocław\ngithub.com/tkowalczyk", 50, 193, 150, 64, 8.5, 13, BODY, "Inter"),
    bold(text("UMIEJĘTNOŚCI", 10, M, BLUE, 50, 272)),
    block("Python · Go\nReact · Node.js\nAWS · Docker\nKubernetes\nPostgreSQL · Redis", 50, 289, 150, 92, 9, 15, BODY, "Inter"),
    bold(text("NARZĘDZIA", 10, M, BLUE, 50, 396)),
    block("Git · Linux\nTerraform\nGrafana · Datadog", 50, 413, 150, 56, 9, 15, BODY, "Inter"),

    // right column
    bold(text("DOŚWIADCZENIE", 10, M, BLUE, 225, 176)),
    bold(text("Starszy Inżynier Oprogramowania", 11, "Inter", INK, 225, 195)),
    text("CloudScale Polska · 2021 – obecnie", 9.5, "Inter", GRAY, 225, 211),
    bulleted(block("• Przeskalował kluczowe API do 5 mln żądań dziennie.\n• Obniżył latencję p99 o 60% dzięki przebudowie cache'u.\n• Poprowadził migrację do Kubernetes w 12 usługach.", 225, 227, 320, 52, 10, 14, BODY, "Inter")),
    bold(text("Inżynier Oprogramowania", 11, "Inter", INK, 225, 293)),
    text("ByteWorks · 2018 – 2021", 9.5, "Inter", GRAY, 225, 309),
    bulleted(block("• Zbudował pipeline danych zasilający analitykę produktową.\n• Wprowadził CI/CD, skracając czas release'ów o połowę.", 225, 325, 320, 40, 10, 14, BODY, "Inter")),
    bold(text("EDUKACJA", 10, M, BLUE, 225, 387)),
    bold(text("Inżynier Informatyki", 11, "Inter", INK, 225, 406)),
    text("Politechnika Wrocławska · 2014 – 2018", 9.5, "Inter", GRAY, 225, 422),
];
