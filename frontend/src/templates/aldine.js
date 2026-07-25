import { block, bulleted, circle, ellipse, line, text } from "./helpers";

const PAPER = "#F8F4EC";
const INK = "#2A3028";
const FOREST = "#486151";
const OLIVE = "#788068";
const SAND = "#D7CCB8";
const DUST = "#79776E";
const SANS = "Helvetica";
const SERIF = "Times-Roman";

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);
const connector = (source_id, target_id, color = FOREST) => (
    { category: "connector", source_id, target_id, backgroundColor: color, borderWidth: 0.8, arrow: false, zIndex: 3 }
);

// Aldine — warm paper, elegant serif hierarchy and a quiet, old-world seal.
// It is deliberately conventional in structure so it still reads like a
// beautifully edited document rather than a poster.
export const aldineTemplate = [
    { ...line(0, 0, 595, 842, PAPER, 0), fixedToPage: true },
    { ...rect(29, 29, 537, 784, SAND, 0.7, 1), fixedToPage: true },
    { ...line(71, 36, 1, 770, "#E3D9C9", 1), fixedToPage: true },
    { ...line(523, 36, 1, 770, "#E3D9C9", 1), fixedToPage: true },

    tracked(text("ANNA KOWALSKA", 30, SERIF, INK, 92, 66, 3), 0.1),
    tracked(text("SENIOR CONSULTANT", 8.9, SANS, FOREST, 94, 106, 3), 1.4),
    text("anna.kowalska@email.com  ·  +48 600 000 000  ·  Warszawa", 8.6, SANS, DUST, 94, 132, 3),
    line(92, 157, 408, 1, SAND, 2),

    { ...circle(446, 61, 48, FOREST, false, 1, 3), id: "aldine-seal" },
    { ...ellipse(458, 76, 24, 10, OLIVE, false, 0.9, 3), id: "aldine-lozenge" },
    { ...circle(465, 93, 10, FOREST, true, 1, 3), id: "aldine-core" },
    { ...rect(437, 52, 66, 66, SAND, 0.7, 3), id: "aldine-frame" },
    connector("aldine-frame", "aldine-seal", SAND),
    connector("aldine-lozenge", "aldine-core", FOREST),

    { ...circle(94, 195, 7, FOREST, true, 1, 3), id: "aldine-profile" },
    tracked(text("PROFILE", 8.4, SANS, FOREST, 116, 193, 3), 1.65),
    line(116, 211, 384, 1, SAND, 2),
    block(
        "Konsultantka strategiczna, która z troską o szczegół porządkuje decyzje, projekty i relacje. Pomagam organizacjom tworzyć kierunek, który można konsekwentnie wdrażać.",
        116, 228, 384, 45, 10, 14.5, INK, SANS
    ),

    { ...circle(94, 313, 7, FOREST, true, 1, 3), id: "aldine-experience" },
    tracked(text("EXPERIENCE", 8.4, SANS, FOREST, 116, 311, 3), 1.65),
    line(116, 329, 384, 1, SAND, 2),
    bold(text("Senior Consultant  /  Lumen Advisory", 10.8, SANS, INK, 116, 349, 3)),
    text("2020 – obecnie  ·  Strategy & Transformation", 8.6, SANS, DUST, 116, 367, 3),
    bulleted(block(
        "• Prowadziła projekty strategiczne od diagnozy po wdrożenie rekomendacji.\n• Projektowała warsztaty, które przekładały różne perspektywy na wspólną decyzję.\n• Tworzyła narzędzia wspierające zarządzanie portfelem kluczowych inicjatyw.",
        116, 385, 384, 60, 9.3, 13.2, INK, SANS
    )),
    bold(text("Consultant  /  Eton & Partners", 10.8, SANS, INK, 116, 472, 3)),
    text("2016 – 2020  ·  Organisational Design", 8.6, SANS, DUST, 116, 490, 3),
    bulleted(block(
        "• Wspierała zespoły w projektowaniu nowych modeli współpracy.\n• Przygotowywała analizy i materiały dla kadry zarządzającej.",
        116, 508, 384, 44, 9.3, 13.2, INK, SANS
    )),

    { ...ellipse(92, 606, 11, 11, FOREST, false, 0.9, 3), id: "aldine-expertise" },
    tracked(text("EDUCATION & EXPERTISE", 8.4, SANS, FOREST, 116, 606, 3), 1.35),
    line(116, 624, 384, 1, SAND, 2),
    bold(text("Ekonomia  /  Uniwersytet Jagielloński", 10.2, SANS, INK, 116, 643, 3)),
    text("2011 – 2016", 8.5, SANS, DUST, 116, 661, 3),
    block(
        "Strategy  ·  Facilitation  ·  Operating models  ·  Research\nTransformation  ·  Governance  ·  Executive communication",
        116, 694, 384, 32, 9.1, 13, INK, SANS
    ),

    { ...line(92, 783, 408, 1, SAND, 2), fixedToPage: true },
    { ...circle(92, 796, 6, FOREST, true, 1, 3), fixedToPage: true },
    { ...text("01", 8, SANS, DUST, 485, 791, 3), fixedToPage: true },
];
