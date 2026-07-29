import API_BASE_URL from "../services/api";
import { block, bulleted, line, text } from "./helpers";

// Rift — an abstract, narrow-column editorial CV placed over a generated
// Swiss-modernist background. The artwork is anchored to every document page.
const BLACK = "#181A1C";
const GRAPHITE = "#565B60";
const ASH = "#C9CBCC";
const RED = "#E21B1B";
const WHITE = "#FFFFFF";
const SANS = "Inter";
const SERIF = "Times-Roman";
const BACKGROUND = `${API_BASE_URL}/template-assets/rift-cv-background.png`;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);

export const riftTemplate = [
    {
        category: "image",
        src: BACKGROUND,
        width: 595,
        height: 842,
        left: 0,
        top: 0,
        zIndex: 0,
        fixedToPage: true,
    },

    bold(text("ANNA KOWALSKA", 29, SERIF, BLACK, 194, 48, 3)),
    tracked(text("DYREKTORKA FINANSOWA", 9.3, SANS, RED, 196, 88, 3), 1.7),
    block(
        "anna.kowalska@email.com\n+48 600 000 000  ·  Warszawa",
        196, 113, 300, 30, 8.7, 13, GRAPHITE, SANS
    ),

    // Small connected nodes echo the background's fractured geometry.
    { ...rect(194, 158, 13, 13, RED, 1.2, 3), id: "rift-node-one" },
    { ...rect(229, 158, 13, 13, GRAPHITE, 1, 3), id: "rift-node-two" },
    { ...rect(264, 158, 13, 13, ASH, 1, 3), id: "rift-node-three" },
    line(207, 163, 22, 1, RED, 2),
    line(242, 163, 22, 1, GRAPHITE, 2),
    rect(510, 202, 14, 14, RED, 1.2, 2),
    tracked(text("PROFIL", 8.5, SANS, RED, 194, 203, 2), 1.55),
    line(194, 221, 330, 1, ASH, 1),
    block(
        "Liderka finansów łącząca strategię, dyscyplinę operacyjną i decyzje oparte na danych. Projektuję modele zarządzania wynikiem, które dają zespołom jasność i przestrzeń do odpowiedzialnego wzrostu.",
        194, 238, 330, 60, 10, 14.5, BLACK, SANS
    ),

    rect(510, 324, 14, 14, RED, 1.2, 2),
    tracked(text("DOŚWIADCZENIE", 8.5, SANS, RED, 194, 325, 2), 1.55),
    line(194, 343, 330, 1, ASH, 1),
    bold(text("Dyrektorka Finansowa", 11, SANS, BLACK, 194, 362, 2)),
    text("Northbridge Partners  ·  2021 – obecnie", 8.7, SANS, GRAPHITE, 194, 380, 2),
    bulleted(block(
        "• Przeprowadziła refinansowanie grupy, obniżając koszt kapitału.\n• Zbudowała zintegrowany forecast dla zarządu i zespołów operacyjnych.\n• Wprowadziła raportowanie łączące wynik, cash flow i kluczowe decyzje.",
        194, 399, 330, 68, 9.3, 13.2, BLACK, SANS
    )),
    bold(text("Menedżerka FP&A", 11, SANS, BLACK, 194, 493, 2)),
    text("Meridian Capital  ·  2017 – 2021", 8.7, SANS, GRAPHITE, 194, 511, 2),
    bulleted(block(
        "• Odpowiadała za budżetowanie i rentowność wielokanałowego biznesu.\n• Przygotowała scenariusze inwestycyjne dla ekspansji europejskiej.",
        194, 530, 330, 48, 9.3, 13.2, BLACK, SANS
    )),

    rect(510, 608, 14, 14, RED, 1.2, 2),
    tracked(text("EDUKACJA I KOMPETENCJE", 8.5, SANS, RED, 194, 609, 2), 1.35),
    line(194, 627, 330, 1, ASH, 1),
    bold(text("Finanse i Rachunkowość  /  SGH", 10.2, SANS, BLACK, 194, 645, 2)),
    text("2013 – 2015  ·  Warszawa", 8.6, SANS, GRAPHITE, 194, 663, 2),
    block(
        "FP&A  ·  Treasury  ·  M&A  ·  IFRS\nModelowanie finansowe  ·  Power BI",
        194, 693, 330, 34, 9.2, 13.2, BLACK, SANS
    ),

    { ...rect(493, 780, 31, 22, WHITE, 1, 2), fixedToPage: true },
    { ...text("01", 8, SANS, GRAPHITE, 503, 787, 3), fixedToPage: true },
];
