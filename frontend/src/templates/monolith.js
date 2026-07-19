// Monolith — pure black / white / grayscale. No colour at all.
// Section headings use a thick 4 px black left bar as the only decoration.
import { text, line, block, bulleted } from "./helpers";

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
    bold(text("PIOTR WIŚNIEWSKI", 32, "Inter", K, 50, 54)),
    ital(text("Główny Menedżer Produktu", 13, "Inter", MG, 50, 98)),
    text("piotr.wisniewski@email.com   ·   +48 600 789 012   ·   Łódź", 9.5, "Inter", LG, 50, 118),
    line(50, 136, 495, 0.5, DG),

    // ── EXPERIENCE ──────────────────────────────────────────────
    bar(154), head("DOŚWIADCZENIE ZAWODOWE", 154),
    bold(text("Wiceprezes ds. Produktu", 11, "Inter", K, 50, 180)),
    text("MidWest Financial Group   ·   2021 – obecnie", 9.5, "Inter", MG, 50, 196),
    bulleted(block("• Zbudował mapę drogową produktu, która zwiększyła MRR o 40%.\n• Kierował zespołem 12 osób z projektowania, inżynierii i analityki.\n• Wprowadził 3 linie produktów obsługujących ponad 150 000 klientów.", 50, 212, 495, 50, 10, 14, MG, "Inter")),

    bold(text("Główny Menedżer Produktu", 11, "Inter", K, 50, 276)),
    text("SaaS Startup Inc   ·   2018 – 2021", 9.5, "Inter", MG, 50, 292),
    bulleted(block("• Odpowiadał za pełny cykl życia 2 kluczowych produktów.\n• Zwiększył retencję użytkowników o 22% dzięki personalizacji.\n• Skrócił czas wejścia na rynek o 30% dzięki usprawnieniom zwinnego procesu.", 50, 308, 495, 50, 10, 14, MG, "Inter")),

    sep(372),

    // ── EDUCATION ───────────────────────────────────────────────
    bar(386), head("EDUKACJA", 386),
    bold(text("MBA — SGH w Warszawie", 11, "Inter", K, 50, 412)),
    text("2014 – 2016", 9.5, "Inter", MG, 50, 428),

    sep(450),

    // ── SKILLS ──────────────────────────────────────────────────
    bar(464), head("UMIEJĘTNOŚCI", 464),
    block("Strategia produktowa · Roadmapowanie · Agile / Scrum · SQL · Tableau · Analiza danych · Zarządzanie interesariuszami", 50, 490, 495, 36, 10, 15, MG, "Inter"),
];
