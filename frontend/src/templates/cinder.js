import { block, bulleted, line, text } from "./helpers";

// Cinder — a single-column editorial CV built from black, ash and signal red.
// Geometry stays decorative; no sidebar or theme/category label is rendered.
const BLACK = "#111315";
const CHARCOAL = "#292D31";
const GRAPHITE = "#62686D";
const ASH = "#D5D6D6";
const PAPER = "#F4F3F1";
const RED = "#C93F3F";
const WHITE = "#FFFFFF";
const SANS = "Inter";
const SERIF = "Times-Roman";

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);

export const cinderTemplate = [
    { ...line(0, 0, 595, 842, PAPER, 0), fixedToPage: true },
    line(0, 0, 595, 170, BLACK, 1),
    line(0, 0, 595, 5, RED, 2),
    line(52, 36, 5, 99, RED, 2),

    bold(text("ANNA KOWALSKA", 30, SERIF, WHITE, 76, 43, 3)),
    tracked(text("DYREKTORKA FINANSOWA", 9.5, SANS, "#E06B67", 78, 86, 3), 1.65),
    text("anna.kowalska@email.com  ·  +48 600 000 000  ·  Warszawa", 8.7, SANS, "#B8BCC0", 78, 119, 3),

    // A connected geometric signature balances the masthead without becoming a column.
    { ...rect(425, 34, 72, 72, RED, 1.2, 3), id: "cinder-frame-one" },
    { ...rect(455, 63, 78, 78, "#767B80", 1, 3), id: "cinder-frame-two" },
    { ...rect(482, 39, 12, 12, WHITE, 1, 3), id: "cinder-node" },
    line(497, 45, 18, 1, RED, 2),
    rect(526, 205, 16, 16, RED, 1.2, 2),
    tracked(text("PROFIL", 8.7, SANS, RED, 76, 207, 2), 1.55),
    line(76, 226, 466, 1, ASH, 1),
    block(
        "Liderka finansów łącząca dyscyplinę operacyjną, analizę i odważne decyzje kapitałowe. Buduję przejrzyste modele zarządzania wynikiem i przekładam dane na trwały wzrost biznesu.",
        76, 243, 466, 45, 10.2, 15, CHARCOAL, SANS
    ),

    rect(526, 317, 16, 16, RED, 1.2, 2),
    tracked(text("DOŚWIADCZENIE", 8.7, SANS, RED, 76, 319, 2), 1.55),
    line(76, 338, 466, 1, ASH, 1),

    bold(text("Dyrektorka Finansowa  /  Northbridge Partners", 11, SANS, BLACK, 76, 365, 2)),
    text("2021 – obecnie  ·  Warszawa", 8.7, SANS, GRAPHITE, 76, 383, 2),
    bulleted(block(
        "• Przeprowadziła refinansowanie grupy, ograniczając koszt kapitału i zwiększając elastyczność finansową.\n• Zbudowała zintegrowany forecast dla zarządu i zespołów operacyjnych.\n• Wprowadziła raportowanie łączące wynik, cash flow i kluczowe decyzje.",
        76, 401, 466, 58, 9.5, 13.4, CHARCOAL, SANS
    )),

    bold(text("Menedżerka FP&A  /  Meridian Capital", 11, SANS, BLACK, 76, 489, 2)),
    text("2017 – 2021  ·  Gdańsk", 8.7, SANS, GRAPHITE, 76, 507, 2),
    bulleted(block(
        "• Odpowiadała za budżetowanie i rentowność wielokanałowego biznesu.\n• Przygotowała scenariusze inwestycyjne wspierające ekspansję europejską.",
        76, 525, 466, 42, 9.5, 13.4, CHARCOAL, SANS
    )),

    rect(526, 620, 16, 16, RED, 1.2, 2),
    tracked(text("EDUKACJA I KOMPETENCJE", 8.7, SANS, RED, 76, 622, 2), 1.55),
    line(76, 641, 466, 1, ASH, 1),
    bold(text("Magister Finansów i Rachunkowości  /  SGH", 10.3, SANS, BLACK, 76, 660, 2)),
    text("2013 – 2015  ·  Warszawa", 8.7, SANS, GRAPHITE, 76, 678, 2),
    block(
        "FP&A  ·  Treasury  ·  M&A  ·  IFRS  ·  Modelowanie finansowe  ·  Power BI  ·  Zarządzanie ryzykiem",
        76, 713, 466, 28, 9.4, 13.5, CHARCOAL, SANS
    ),

    { ...line(52, 786, 490, 1, BLACK, 1), fixedToPage: true },
    { ...line(52, 786, 64, 3, RED, 2), fixedToPage: true },
    { ...text("01", 8, SANS, GRAPHITE, 522, 801, 2), fixedToPage: true },
];
