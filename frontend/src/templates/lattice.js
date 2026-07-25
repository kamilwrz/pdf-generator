import API_BASE_URL from "../services/api";
import { block, bulleted, circle, ellipse, line, text } from "./helpers";

const INK = "#26336D";
const INDIGO = "#5B62BA";
const VIOLET = "#8587D8";
const CYAN = "#8DE6ED";
const CORAL = "#F37E71";
const SLATE = "#64708A";
const PAPER = "#FAFBFE";
const SANS = "Helvetica";
const SERIF = "Times-Roman";
const BACKGROUND = `${API_BASE_URL}/template-assets/lattice-it-cloud.png`;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const connector = (source_id, target_id, color = INDIGO) => (
    { category: "connector", source_id, target_id, backgroundColor: color, borderWidth: 1, arrow: false, zIndex: 3 }
);

// Lattice — a soft cloud-systems composition: airy editorial type on a quiet
// paper field, with orbiting forms suggesting a connected product ecosystem.
export const latticeTemplate = [
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
    line(70, 44, 6, 112, INK, 3),
    tracked(text("ALEKSANDRA WIŚNIEWSKA", 29, SERIF, INK, 101, 50, 3), 0.1),
    tracked(text("PRODUCT ENGINEER · DIGITAL SERVICES", 8.8, SANS, INDIGO, 103, 93, 3), 1.35),
    text("aleksandra.wisniewska@email.com  ·  +48 600 000 000  ·  Poznań", 8.6, SANS, SLATE, 103, 121, 3),

    { ...ellipse(411, 50, 53, 28, VIOLET, false, 1.2, 3), id: "lattice-orbit-one" },
    { ...circle(434, 56, 16, CYAN, true, 1, 3), id: "lattice-orbit-two" },
    { ...circle(491, 56, 16, CORAL, true, 1, 3), id: "lattice-orbit-three" },
    connector("lattice-orbit-one", "lattice-orbit-two", CYAN),
    connector("lattice-orbit-two", "lattice-orbit-three", CORAL),

    { ...ellipse(74, 183, 16, 16, VIOLET, false, 1.2, 3), id: "lattice-profile" },
    tracked(text("PROFILE", 8.5, SANS, INDIGO, 103, 184, 3), 1.55),
    line(103, 203, 424, 1, "#B9C4DC", 2),
    block(
        "Product engineer łącząca ciekawość użytkowników z rzetelnością technologii. Tworzę produkty cyfrowe, które są zrozumiałe w użyciu, skalowalne w rozwoju i odpowiedzialne w działaniu.",
        103, 220, 424, 45, 10, 14.5, "#2C3852", SANS
    ),

    { ...circle(76, 310, 12, CORAL, true, 1, 3), id: "lattice-experience" },
    tracked(text("EXPERIENCE", 8.5, SANS, INDIGO, 103, 309, 3), 1.55),
    line(103, 328, 424, 1, "#B9C4DC", 2),
    bold(text("Staff Product Engineer  /  Juniper Works", 11, SANS, INK, 103, 348, 3)),
    text("2020 – obecnie  ·  Product Systems", 8.7, SANS, SLATE, 103, 366, 3),
    bulleted(block(
        "• Prowadziła rozwój usług cyfrowych od problemu użytkownika po stabilne wdrożenie.\n• Połączyła pracę nad doświadczeniem produktu, dostępnością i wydajnością aplikacji.\n• Usprawniła współpracę między projektowaniem, inżynierią i zespołem danych.",
        103, 384, 424, 60, 9.4, 13.3, "#2C3852", SANS
    )),
    bold(text("Full-stack Engineer  /  Helio Studio", 11, SANS, INK, 103, 471, 3)),
    text("2016 – 2020  ·  Product Delivery", 8.7, SANS, SLATE, 103, 489, 3),
    bulleted(block(
        "• Dostarczała funkcje produktu w bliskiej współpracy z zespołem projektowym.\n• Budowała komponenty oraz praktyki, które pozwalały rozwijać interfejs konsekwentnie.",
        103, 507, 424, 44, 9.4, 13.3, "#2C3852", SANS
    )),

    { ...ellipse(74, 606, 16, 16, VIOLET, false, 1.2, 3), id: "lattice-stack" },
    tracked(text("STACK & EDUCATION", 8.5, SANS, INDIGO, 103, 606, 3), 1.55),
    line(103, 625, 424, 1, "#B9C4DC", 2),
    bold(text("Informatyka  /  Uniwersytet im. A. Mickiewicza", 10.3, SANS, INK, 103, 644, 3)),
    text("2011 – 2016", 8.6, SANS, SLATE, 103, 662, 3),
    block(
        "TypeScript  ·  React  ·  Node.js  ·  Design systems  ·  AWS\nProduct discovery  ·  Accessibility  ·  Experimentation",
        103, 696, 424, 32, 9.2, 13.2, "#2C3852", SANS
    ),

    { ...line(103, 784, 424, 1, "#B9C4DC", 2), fixedToPage: true },
    { ...circle(103, 797, 7, CORAL, true, 1, 3), fixedToPage: true },
    { ...text("01", 8, SANS, SLATE, 512, 792, 3), fixedToPage: true },
];
