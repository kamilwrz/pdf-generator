import API_BASE_URL from "../services/api";
import { block, bulleted, circle, ellipse, line, text } from "./helpers";

const INK = "#2A2023";
const WINE = "#722E3C";
const ROSE = "#C98E94";
const GOLD = "#C7A66A";
const PAPER = "#FBF8F5";
const MUTE = "#7D6D70";
const RULE = "#DFCFC7";
const SANS = "Helvetica";
const SERIF = "Times-Roman";
const SIDEBAR = `${API_BASE_URL}/template-assets/garnet-sidebar.png`;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);

// Garnet — formal art-deco framing with a deep burgundy sidebar image.
export const garnetTemplate = [
    { category: "image", src: SIDEBAR, width: 184, height: 842, left: 0, top: 0, zIndex: 0, fixedToPage: true },
    { ...line(184, 0, 2, 842, GOLD, 2), fixedToPage: true },
    { ...line(186, 0, 409, 842, PAPER, 0), fixedToPage: true },

    tracked(text("JULIA NOWAK", 29, SERIF, INK, 220, 52, 3), 0.1),
    tracked(text("DIRECTOR OF COMMUNICATIONS", 8.8, SANS, WINE, 222, 92, 3), 1.45),
    text("julia.nowak@email.com  ·  +48 600 000 000", 8.4, SANS, MUTE, 222, 120, 3),
    line(220, 145, 326, 1, RULE, 2),

    tracked(text("KONTAKT", 8, SANS, "#F4DEDE", 24, 299, 3), 1.2),
    block("Kraków\njulia.nowak@email.com\n+48 600 000 000", 24, 321, 136, 42, 8, 12.5, "#FFF8F4", SANS),
    tracked(text("OBSZARY", 8, SANS, "#F4DEDE", 24, 380, 3), 1.2),
    bulleted(block("• Brand strategy\n• Corporate narrative\n• Change communication\n• Leadership", 24, 400, 136, 58, 8.3, 13, "#FFF8F4", SANS)),

    tracked(text("JĘZYKI", 8, SANS, "#F4DEDE", 24, 474, 3), 1.2),
    bulleted(block("• Polski — ojczysty\n• Angielski — C1\n• Francuski — B2", 24, 494, 136, 42, 8.3, 13, "#FFF8F4", SANS)),

    tracked(text("WYKSZTAŁCENIE", 8, SANS, "#F4DEDE", 24, 559, 3), 1.2),
    bold(block("Komunikacja i Media — 2011–2016", 24, 579, 136, 24, 8.4, 12, "#FFF8F4", SANS)),
    block("Uniwersytet Warszawski, Warszawa", 24, 603, 136, 14, 7.9, 11, MUTE, SANS),
    block("Narracja marki, reputacja, komunikacja zmiany.", 24, 619, 136, 26, 8, 12, "#FFF8F4", SANS),

    { ...rect(462, 52, 58, 54, GOLD, 0.8, 3), id: "garnet-frame" },
    { ...ellipse(472, 62, 35, 17, WINE, false, 1, 3), id: "garnet-arc" },
    { ...circle(484, 82, 11, ROSE, true, 1, 3), id: "garnet-seal" },
    line(528, 86, 14, 1, GOLD, 2),
    { ...circle(220, 184, 8, GOLD, true, 1, 3), id: "garnet-profile" },
    tracked(text("PROFIL", 8.4, SANS, WINE, 242, 182, 3), 1.55),
    line(242, 200, 304, 1, RULE, 2),
    block(
        "Liderka komunikacji łącząca strategiczną narrację, reputację oraz sprawne prowadzenie zmiany. Buduję język, który porządkuje złożone ambicje organizacji i angażuje ludzi.",
        242, 217, 304, 47, 9.8, 14.3, INK, SANS
    ),

    { ...circle(220, 301, 8, WINE, true, 1, 3), id: "garnet-experience" },
    tracked(text("DOŚWIADCZENIE", 8.4, SANS, WINE, 242, 299, 3), 1.55),
    line(242, 317, 304, 1, RULE, 2),
    bold(text("Director of Communications  /  Verity", 10.7, SANS, INK, 242, 337, 3)),
    text("2020 – obecnie  ·  Brand & Reputation", 8.5, SANS, MUTE, 242, 355, 3),
    bulleted(block(
        "• Prowadziła komunikację strategiczną dla programów o dużej skali i widoczności.\n• Zbudowała spójny model pracy z marką, zarządem oraz liderami zespołów.\n• Przełożyła zmianę organizacyjną na jasne komunikaty i rytuały współpracy.",
        242, 373, 304, 60, 9.1, 13, INK, SANS
    )),
    bold(text("Senior Consultant  /  Signet", 10.7, SANS, INK, 242, 459, 3)),
    text("2016 – 2020  ·  Corporate Affairs", 8.5, SANS, MUTE, 242, 477, 3),
    bulleted(block(
        "• Doradzała markom w budowaniu narracji i komunikacji interesariuszy.\n• Projektowała materiały dla kadry zarządzającej oraz zespołów.",
        242, 495, 304, 43, 9.1, 13, INK, SANS
    )),

    { ...line(220, 783, 326, 1, RULE, 2), fixedToPage: true },
    { ...circle(220, 796, 6, GOLD, true, 1, 3), fixedToPage: true },
    { ...text("01", 8, SANS, MUTE, 531, 791, 3), fixedToPage: true },
];
