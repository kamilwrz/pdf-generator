import API_BASE_URL from "../services/api";
import { block, bulleted, circle, ellipse, line, text } from "./helpers";

const INK = "#F3F7FC";
const CYAN = "#37D1EE";
const LIME = "#B7D84B";
const PAPER = "#F7FAFC";
const NAVY = "#13293D";
const SLATE = "#607384";
const RULE = "#C7D5DE";
const SANS = "Inter";
const SERIF = "Times-Roman";
const SIDEBAR = `${API_BASE_URL}/template-assets/quarry-sidebar-v2.png`;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);
const connector = (source_id, target_id, color = CYAN) => (
    { category: "connector", source_id, target_id, backgroundColor: color, borderWidth: 0.9, arrow: false, zIndex: 3 }
);

// Quarry — midnight network artwork contained entirely in a narrow sidebar.
export const quarryTemplate = [
    { category: "image", src: SIDEBAR, width: 184, height: 842, left: 0, top: 0, zIndex: 0, fixedToPage: true },
    { ...line(184, 0, 2, 842, CYAN, 2), fixedToPage: true },
    { ...line(186, 0, 409, 842, PAPER, 0), fixedToPage: true },

    tracked(text("MARTYNA RUTKOWSKA", 29, SERIF, NAVY, 220, 51, 3), 0.1),
    tracked(text("PLATFORM ENGINEER", 9, SANS, CYAN, 222, 92, 3), 1.45),
    text("martyna.rutkowska@email.com  ·  +48 600 000 000", 8.4, SANS, SLATE, 222, 120, 3),
    line(220, 145, 326, 1, RULE, 2),

    tracked(text("KONTAKT", 8, SANS, CYAN, 24, 73, 3), 1.3),
    block("Warszawa\nmartyna.rutkowska@email.com\n+48 600 000 000", 24, 93, 136, 42, 8.1, 12.5, INK, SANS),
    tracked(text("GŁÓWNE TECHNOLOGIE", 8, SANS, CYAN, 24, 205, 3), 1.3),
    block("TypeScript\nGo\nKubernetes\nAWS\nPostgreSQL", 24, 225, 136, 70, 8.4, 13, INK, SANS),

    { ...rect(462, 51, 59, 54, CYAN, 0.9, 3), id: "quarry-frame" },
    { ...ellipse(473, 61, 34, 16, CYAN, false, 1.1, 3), id: "quarry-orbit" },
    { ...circle(484, 81, 12, LIME, true, 1, 3), id: "quarry-node" },
    connector("quarry-frame", "quarry-orbit", RULE),
    connector("quarry-orbit", "quarry-node", LIME),

    { ...circle(220, 184, 8, LIME, true, 1, 3), id: "quarry-profile" },
    tracked(text("PROFIL", 8.4, SANS, NAVY, 242, 182, 3), 1.55),
    line(242, 200, 304, 1, RULE, 2),
    block(
        "Inżynierka budująca niezawodne platformy oraz proste ścieżki dostarczania. Łączę myślenie systemowe, obserwowalność i partnerską pracę z zespołami produktowymi.",
        242, 217, 304, 47, 9.8, 14.3, NAVY, SANS
    ),

    { ...circle(220, 301, 8, CYAN, true, 1, 3), id: "quarry-experience" },
    tracked(text("DOŚWIADCZENIE", 8.4, SANS, NAVY, 242, 299, 3), 1.55),
    line(242, 317, 304, 1, RULE, 2),
    bold(text("Senior Platform Engineer  /  Northstar", 10.7, SANS, NAVY, 242, 337, 3)),
    text("2021 – obecnie  ·  Distributed Systems", 8.5, SANS, SLATE, 242, 355, 3),
    bulleted(block(
        "• Projektowała usługi wspierające krytyczne procesy produktowe.\n• Usprawniła wdrożenia i standard obserwowalności dla wielu zespołów.\n• Budowała praktyki niezawodności oparte na danych oraz odpowiedzialności.",
        242, 373, 304, 60, 9.1, 13, NAVY, SANS
    )),
    bold(text("Backend Engineer  /  Orbit Labs", 10.7, SANS, NAVY, 242, 459, 3)),
    text("2017 – 2021  ·  API & Data", 8.5, SANS, SLATE, 242, 477, 3),
    bulleted(block(
        "• Rozwijała usługi API oraz pipeline’y danych dla produktu wielorynkowego.\n• Współtworzyła praktyki jakości i dokumentacji technicznej.",
        242, 495, 304, 43, 9.1, 13, NAVY, SANS
    )),

    { ...ellipse(218, 590, 13, 13, CYAN, false, 1, 3), id: "quarry-education" },
    tracked(text("EDUKACJA I KOMPETENCJE", 8.4, SANS, NAVY, 242, 590, 3), 1.3),
    line(242, 608, 304, 1, RULE, 2),
    bold(text("Informatyka  /  Politechnika Warszawska", 10.1, SANS, NAVY, 242, 627, 3)),
    text("2012 – 2017", 8.5, SANS, SLATE, 242, 645, 3),
    block("System design  ·  Event-driven architecture  ·  SRE\nCloud infrastructure  ·  Technical leadership", 242, 679, 304, 31, 9, 13, NAVY, SANS),

    { ...line(220, 783, 326, 1, RULE, 2), fixedToPage: true },
    { ...circle(220, 796, 6, LIME, true, 1, 3), fixedToPage: true },
    { ...text("01", 8, SANS, SLATE, 531, 791, 3), fixedToPage: true },
];
