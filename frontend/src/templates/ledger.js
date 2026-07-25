import API_BASE_URL from "../services/api";
import { block, bulleted, line, text } from "./helpers";

// Ledger — a composed finance CV inspired by institutional reports: deep navy
// hierarchy, slate data panels, precise rules, and a restrained market graphic.
const NAVY = "#102A43";
const BLUE = "#2E5E86";
const SLATE = "#607789";
const STEEL = "#AEBECC";
const MIST = "#E8EEF2";
const INK = "#17212B";
const PAPER = "#F7F9FA";
const SANS = "Inter";
const SERIF = "Times-Roman";
const ACCENT_IMAGE = `${API_BASE_URL}/uploads/templates/ledger-finance-accent.png`;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);
const connector = (source_id, target_id) => (
    { category: "connector", source_id, target_id, backgroundColor: BLUE, borderWidth: 1, arrow: false, zIndex: 2 }
);

export const ledgerTemplate = [
    // Header field and image — image element stays editable like any user asset.
    line(0, 0, 595, 146, NAVY, 0),
    line(0, 146, 595, 5, BLUE, 1),
    rect(416, 24, 122, 126, STEEL, 1.2, 3),
    {
        category: "image",
        src: ACCENT_IMAGE,
        width: 110,
        height: 118,
        left: 422,
        top: 28,
        zIndex: 2,
    },
    line(400, 30, 2, 102, BLUE, 2),
    tracked(text("LEDGER / FINANCE", 8.5, SANS, "#BFD0DE", 54, 34, 2), 1.5),
    bold(text("ANNA KOWALSKA", 30, SERIF, "#FFFFFF", 52, 58, 2)),
    tracked(text("DYREKTORKA FINANSOWA · STRATEGIA I KAPITAŁ", 10, SANS, "#C7D7E2", 54, 98, 2), 1.05),
    text("anna.kowalska@email.com  ·  +48 600 000 000  ·  Warszawa", 8.8, SANS, "#C7D7E2", 54, 120, 2),

    // Three linked financial indicators demonstrate rectangles and connectors.
    { ...rect(52, 180, 150, 62, STEEL, 1, 1), id: "metric-revenue" },
    { ...rect(222, 180, 150, 62, STEEL, 1, 1), id: "metric-margin" },
    { ...rect(392, 180, 150, 62, STEEL, 1, 1), id: "metric-capital" },
    connector("metric-revenue", "metric-margin"),
    connector("metric-margin", "metric-capital"),
    tracked(text("PRZYCHODY", 7.5, SANS, SLATE, 66, 193, 3), 1.05),
    bold(text("+28%", 20, SERIF, NAVY, 66, 208, 3)),
    text("r/r", 8, SANS, SLATE, 126, 215, 3),
    tracked(text("MARŻA EBITDA", 7.5, SANS, SLATE, 236, 193, 3), 0.7),
    bold(text("18,4%", 20, SERIF, NAVY, 236, 208, 3)),
    text("cel 16%", 8, SANS, SLATE, 310, 215, 3),
    tracked(text("KAPITAŁ", 7.5, SANS, SLATE, 406, 193, 3), 1.05),
    bold(text("120 mln", 20, SERIF, NAVY, 406, 208, 3)),
    text("PLN", 8, SANS, SLATE, 487, 215, 3),

    // Main content column.
    tracked(text("PROFIL", 9, SANS, BLUE, 52, 278, 2), 1.35),
    line(52, 294, 490, 1, STEEL, 1),
    block(
        "Liderka finansów z doświadczeniem w budowaniu skalowalnych modeli operacyjnych, finansowaniu wzrostu i przekładaniu danych na decyzje zarządcze. Łączę rygor raportowania z partnerskim podejściem do biznesu.",
        52, 310, 490, 44, 10.2, 15, INK, SANS
    ),

    tracked(text("DOŚWIADCZENIE", 9, SANS, BLUE, 52, 384, 2), 1.35),
    line(52, 400, 490, 1, STEEL, 1),
    bold(text("Dyrektorka Finansowa  /  Northbridge Partners", 11, SANS, NAVY, 52, 418, 2)),
    text("2021 – obecnie  ·  Warszawa", 8.8, SANS, SLATE, 52, 435, 2),
    bulleted(block(
        "• Prowadziła refinansowanie grupy o wartości 120 mln PLN, obniżając koszt kapitału o 1,8 pp.\n• Zbudowała model planowania kroczącego, który skrócił cykl forecastu z 15 do 6 dni.\n• Wprowadziła rytm raportowania łączący wynik finansowy, cash flow i priorytety operacyjne.",
        52, 451, 490, 60, 9.6, 13.5, INK, SANS
    )),
    bold(text("Menedżerka FP&A  /  Meridian Capital", 11, SANS, NAVY, 52, 534, 2)),
    text("2017 – 2021  ·  Gdańsk", 8.8, SANS, SLATE, 52, 551, 2),
    bulleted(block(
        "• Odpowiadała za budżetowanie i analizę rentowności pięciu linii biznesowych.\n• Przygotowała scenariusze inwestycyjne wspierające ekspansję na trzy rynki europejskie.",
        52, 567, 490, 42, 9.6, 13.5, INK, SANS
    )),

    // Closing ledger strip.
    line(0, 674, 595, 1, STEEL, 1),
    rect(52, 700, 490, 74, STEEL, 1, 1),
    tracked(text("OBSZARY EKSPERTYZY", 8, SANS, BLUE, 66, 714, 2), 1.1),
    block(
        "FP&A  ·  Treasury  ·  Finansowanie dłużne  ·  M&A  ·  Modelowanie finansowe  ·  IFRS  ·  Power BI  ·  Zarządzanie ryzykiem",
        66, 732, 458, 28, 9.3, 13, INK, SANS
    ),
    text("LEDGER / 01", 8, SANS, SLATE, 467, 796, 2),
];
