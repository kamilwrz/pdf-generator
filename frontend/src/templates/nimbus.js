import API_BASE_URL from "../services/api";
import { block, bulleted, line, text } from "./helpers";

// Nimbus: an airy, blue-grey editorial CV. The template name and its category
// deliberately never appear on the page — only the candidate's information does.
const INK = "#2B3D4C";
const BLUE = "#5F8EAD";
const POWDER = "#B9D2E5";
const SKY = "#DFEBF4";
const CLOUD = "#E9EEF1";
const SLATE = "#72818C";
const SANS = "Inter";
const SERIF = "Times-Roman";
const ACCENT_IMAGE = `${API_BASE_URL}/template-assets/nimbus-finance-accent.png`;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);
const connector = (source_id, target_id) => (
    { category: "connector", source_id, target_id, backgroundColor: POWDER, borderWidth: 1, arrow: false, zIndex: 1 }
);

export const nimbusTemplate = [
    // A soft header composition: editable image, quiet rules and generous air.
    line(0, 0, 595, 4, POWDER, 0),
    line(52, 207, 490, 1, POWDER, 1),
    rect(401, 35, 141, 153, POWDER, 1.1, 3),
    {
        category: "image",
        src: ACCENT_IMAGE,
        width: 129,
        height: 141,
        left: 407,
        top: 41,
        zIndex: 2,
    },
    line(52, 48, 4, 112, BLUE, 2),
    bold(text("ANNA KOWALSKA", 29, SERIF, INK, 78, 55, 2)),
    tracked(text("LIDERKA STRATEGII I ROZWOJU", 9.3, SANS, BLUE, 80, 99, 2), 1.5),
    block(
        "Strategia · Planowanie · Kapitał · Rozwój",
        80, 121, 285, 18, 9.4, 12, SLATE, SANS
    ),
    text("anna.kowalska@email.com  /  +48 600 000 000  /  Warszawa", 8.7, SANS, SLATE, 80, 153, 2),

    // Three outline marks and their connectors add an understated data rhythm.
    { ...rect(80, 176, 14, 14, BLUE, 1.2, 2), id: "nimbus-mark-one" },
    { ...rect(114, 176, 14, 14, POWDER, 1.2, 2), id: "nimbus-mark-two" },
    { ...rect(148, 176, 14, 14, POWDER, 1.2, 2), id: "nimbus-mark-three" },
    connector("nimbus-mark-one", "nimbus-mark-two"),
    connector("nimbus-mark-two", "nimbus-mark-three"),

    tracked(text("PROFIL", 8.7, SANS, BLUE, 80, 248, 2), 1.4),
    line(80, 265, 306, 1, CLOUD, 1),
    block(
        "Liderka finansów, która łączy klarowną analizę z odważnym podejmowaniem decyzji. Buduję modele, procesy i partnerstwa pozwalające zespołom rozwijać się odpowiedzialnie.",
        80, 280, 306, 44, 10.1, 15, INK, SANS
    ),

    // A slim left rail creates hierarchy without a heavy two-column layout.
    line(52, 347, 2, 328, SKY, 1),
    rect(45, 362, 16, 16, BLUE, 1, 2),
    tracked(text("DOŚWIADCZENIE", 8.7, SANS, BLUE, 80, 362, 2), 1.4),
    line(80, 379, 462, 1, CLOUD, 1),
    bold(text("Dyrektorka Finansowa  /  Northbridge Partners", 11, SANS, INK, 80, 398, 2)),
    text("2021 – obecnie  ·  Warszawa", 8.8, SANS, SLATE, 80, 415, 2),
    bulleted(block(
        "• Przeprowadziła refinansowanie grupy, obniżając koszt kapitału i zwiększając elastyczność finansową.\n• Zbudowała zintegrowany model forecastu dla zarządu i zespołów operacyjnych.\n• Ustanowiła praktykę raportowania łączącą wynik, cash flow i kluczowe decyzje.",
        80, 431, 462, 58, 9.5, 13.4, INK, SANS
    )),
    bold(text("Menedżerka FP&A  /  Meridian Capital", 11, SANS, INK, 80, 517, 2)),
    text("2017 – 2021  ·  Gdańsk", 8.8, SANS, SLATE, 80, 534, 2),
    bulleted(block(
        "• Odpowiadała za budżetowanie i analizę rentowności wielokanałowego biznesu.\n• Przygotowała scenariusze inwestycyjne wspierające ekspansję europejską.",
        80, 550, 462, 42, 9.5, 13.4, INK, SANS
    )),

    rect(45, 620, 16, 16, POWDER, 1, 2),
    tracked(text("EDUKACJA I KOMPETENCJE", 8.7, SANS, BLUE, 80, 620, 2), 1.4),
    line(80, 637, 462, 1, CLOUD, 1),
    bold(text("Magister Finansów i Rachunkowości  /  SGH", 10.3, SANS, INK, 80, 654, 2)),
    text("2013 – 2015  ·  Warszawa", 8.7, SANS, SLATE, 80, 671, 2),
    block(
        "FP&A  ·  Treasury  ·  Finansowanie dłużne  ·  M&A  ·  IFRS  ·  Modelowanie finansowe  ·  Power BI",
        80, 704, 462, 30, 9.4, 13.5, INK, SANS
    ),
    line(80, 774, 462, 1, POWDER, 1),
    text("01", 8, SANS, SLATE, 80, 792, 2),
];
