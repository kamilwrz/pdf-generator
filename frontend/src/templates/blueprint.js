// Blueprint — technical two-column CV split by a thin divider. Inter body with
// monospace (Courier) section labels and a comment-style title. Bold name and
// labels. Blue accent.
import { text, line, block } from "./helpers";

const INK = "#1A2530";
const BLUE = "#2B6CB0";
const GRAY = "#6B7280";
const BODY = "#3A4753";
const DIV = "#D8DEE4";
const M = "Courier";

const bold = (el) => ({ ...el, bold: true });

export const blueprintTemplate = [
    bold(text("SAM CHEN", 30, "Inter", INK, 50, 56)),
    text("// software engineer", 12, M, BLUE, 50, 94),
    text("sam.chen@email.com   ·   +1 (555) 770-8890   ·   Austin, TX", 9.5, "Inter", GRAY, 50, 118),
    line(50, 138, 495, 1.5, INK),
    // vertical divider between the two columns
    line(205, 160, 1, 645, DIV),

    // left column
    bold(text("CONTACT", 10, M, BLUE, 50, 176)),
    block("sam.chen@email.com\n+1 (555) 770-8890\nAustin, TX\ngithub.com/samchen", 50, 193, 150, 64, 8.5, 13, BODY, "Inter"),
    bold(text("SKILLS", 10, M, BLUE, 50, 272)),
    block("Python · Go\nReact · Node.js\nAWS · Docker\nKubernetes\nPostgreSQL · Redis", 50, 289, 150, 92, 9, 15, BODY, "Inter"),
    bold(text("TOOLS", 10, M, BLUE, 50, 396)),
    block("Git · Linux\nTerraform\nGrafana · Datadog", 50, 413, 150, 56, 9, 15, BODY, "Inter"),

    // right column
    bold(text("EXPERIENCE", 10, M, BLUE, 225, 176)),
    bold(text("Senior Software Engineer", 11, "Inter", INK, 225, 195)),
    text("CloudScale Inc · 2021 – Present", 9.5, "Inter", GRAY, 225, 211),
    block("• Scaled the core API to 5M requests/day.\n• Cut p99 latency 60% with a caching rewrite.\n• Led the migration to Kubernetes across 12 services.", 225, 227, 320, 52, 10, 14, BODY, "Inter"),
    bold(text("Software Engineer", 11, "Inter", INK, 225, 293)),
    text("ByteWorks · 2018 – 2021", 9.5, "Inter", GRAY, 225, 309),
    block("• Built the data pipeline powering product analytics.\n• Introduced CI/CD, halving release time.", 225, 325, 320, 40, 10, 14, BODY, "Inter"),
    bold(text("EDUCATION", 10, M, BLUE, 225, 387)),
    bold(text("B.S. Computer Science", 11, "Inter", INK, 225, 406)),
    text("UT Austin · 2014 – 2018", 9.5, "Inter", GRAY, 225, 422),
];
