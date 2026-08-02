import { block, bulleted, circle, ellipse, line, text } from "./helpers";

const SANS = "Inter";
const SERIF = "Times-Roman";

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const fixed = (element) => ({ ...element, fixedToPage: true });
const rect = (left, top, width, height, backgroundColor, borderWidth = 1, zIndex = 1) => ({
    category: "rectangle", left, top, width, height, backgroundColor, borderWidth, zIndex,
});

export const signalTemplate = [
    fixed(line(0, 0, 595, 842, "#101C26", 0)),
    fixed(line(0, 0, 595, 5, "#3BD2C7", 1)),
    fixed(line(52, 789, 491, 1, "#395263", 1)),
    fixed(text("01", 7.5, SANS, "#88A0AE", 522, 800, 2)),
    ellipse(392, 26, 164, 106, "#173545", false, 1.2, 1),
    ellipse(427, 48, 94, 62, "#3BD2C7", false, 1, 1),
    circle(460, 65, 28, "#3BD2C7", true, 1, 2),
    line(52, 42, 4, 118, "#3BD2C7", 2),
    bold(text("ANNA KOWALSKA", 30, SERIF, "#F2F7F6", 76, 77, 2)),
    tracked(text("DYREKTORKA RYZYKA I KONTROLI", 9.2, SANS, "#9DB7C3", 78, 122, 2), 1.35),
    text("anna.kowalska@email.com  ·  +48 600 000 000  ·  Warszawa", 8.6, SANS, "#9DB7C3", 78, 145, 2),
    rect(487, 181, 54, 22, "#395263", 1, 2),
    { ...circle(78, 197, 18, "#3BD2C7", false, 1.2, 2), id: "signal-node-a" },
    { ...circle(116, 197, 18, "#9DB7C3", false, 1.2, 2), id: "signal-node-b" },
    { ...circle(154, 197, 18, "#3BD2C7", false, 1.2, 2), id: "signal-node-c" },
    line(96, 205, 20, 1, "#3BD2C7", 2),
    line(134, 205, 20, 1, "#3BD2C7", 2),
    tracked(text("PODSUMOWANIE", 8.6, SANS, "#7BE1D9", 76, 251, 2), 1.5),
    line(76, 268, 465, 1, "#395263", 1),
    block("Prowadzę funkcje ryzyka tak, aby ochrona kapitału wspierała dobre decyzje biznesowe. Łączę nadzór, dane i partnerstwo z zespołami odpowiedzialnymi za wzrost.", 76, 284, 465, 43, 10, 14.7, "#E4EFEE", SANS),
    tracked(text("DOŚWIADCZENIE", 8.6, SANS, "#7BE1D9", 76, 366, 2), 1.5),
    line(76, 383, 465, 1, "#395263", 1),
    rect(525, 402, 16, 16, "#3BD2C7", 1.1, 2),
    bold(text("Dyrektorka Ryzyka  /  Northbridge Bank", 10.8, SANS, "#F2F7F6", 76, 403, 2)),
    text("2021 – obecnie  ·  Warszawa", 8.6, SANS, "#9DB7C3", 76, 420, 2),
    bulleted(block("• Uporządkowała apetyt na ryzyko i rytm raportowania dla zarządu.\n• Wdrożyła model wczesnego ostrzegania dla ekspozycji portfelowych.", 76, 437, 465, 42, 9.4, 13.1, "#E4EFEE", SANS)),
    rect(525, 519, 16, 16, "#395263", 1.1, 2),
    bold(text("Menedżerka Treasury  /  Meridian Capital", 10.8, SANS, "#F2F7F6", 76, 520, 2)),
    text("2017 – 2021  ·  Gdańsk", 8.6, SANS, "#9DB7C3", 76, 537, 2),
    bulleted(block("• Prowadziła planowanie płynności i scenariusze finansowania.", 76, 554, 465, 30, 9.4, 13.1, "#E4EFEE", SANS)),
    tracked(text("OBSZARY", 8.6, SANS, "#7BE1D9", 76, 654, 2), 1.5),
    line(76, 671, 465, 1, "#395263", 1),
    block("Enterprise risk  ·  ALM  ·  ICAAP  ·  Płynność  ·  Compliance  ·  Power BI", 76, 687, 465, 28, 9.2, 13.1, "#E4EFEE", SANS),
];
