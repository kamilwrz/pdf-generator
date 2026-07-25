import API_BASE_URL from "../services/api";
import { block, bulleted, circle, ellipse, line, text } from "./helpers";

const MIDNIGHT = "#071326";
const ELECTRIC = "#26D8FF";
const LIME = "#B8EF4A";
const CLOUD = "#DCEBFA";
const MIST = "#95AFC5";
const SANS = "Inter";
const SERIF = "Times-Roman";
const BACKGROUND = `${API_BASE_URL}/template-assets/vector-it-network.png`;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const connector = (source_id, target_id, color = ELECTRIC) => (
    { category: "connector", source_id, target_id, backgroundColor: color, borderWidth: 1, arrow: false, zIndex: 3 }
);

// Vector — an edge-lit circuit field. The image leaves the center quiet while
// bright nodes and rules create a precise, high-contrast technical rhythm.
export const vectorTemplate = [
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
    line(133, 36, 2, 112, ELECTRIC, 3),
    tracked(text("MARTYNA RUTKOWSKA", 31, SERIF, "#FFFFFF", 158, 48, 3), 0.2),
    tracked(text("SENIOR SOFTWARE ENGINEER · PLATFORM", 9.2, SANS, ELECTRIC, 160, 91, 3), 1.35),
    text("martyna.rutkowska@email.com  ·  +48 600 000 000  ·  Warszawa", 8.8, SANS, CLOUD, 160, 119, 3),

    { ...circle(430, 53, 18, LIME, true, 1, 3), id: "vector-node-one" },
    { ...ellipse(468, 54, 42, 18, ELECTRIC, false, 1.2, 3), id: "vector-node-two" },
    { ...circle(527, 53, 18, ELECTRIC, false, 1.2, 3), id: "vector-node-three" },
    connector("vector-node-one", "vector-node-two", LIME),
    connector("vector-node-two", "vector-node-three"),

    tracked(text("PROFILE", 8.5, SANS, LIME, 160, 180, 3), 1.7),
    line(160, 199, 365, 1, "#3C6682", 2),
    block(
        "Inżynierka oprogramowania budująca niezawodne platformy i produkty cyfrowe. Łączę myślenie systemowe, pragmatyczną architekturę oraz partnerską pracę z zespołami produktowymi.",
        160, 216, 365, 48, 10, 14.5, CLOUD, SANS
    ),

    { ...circle(137, 310, 13, LIME, true, 1, 3), id: "vector-section-one" },
    tracked(text("EXPERIENCE", 8.5, SANS, ELECTRIC, 160, 312, 3), 1.7),
    line(160, 331, 365, 1, "#3C6682", 2),
    bold(text("Senior Software Engineer  /  Northstar Cloud", 11, SANS, "#FFFFFF", 160, 351, 3)),
    text("2021 – obecnie  ·  Platform Engineering", 8.7, SANS, MIST, 160, 369, 3),
    bulleted(block(
        "• Zaprojektowała platformę zdarzeniową obsługującą krytyczne procesy produktowe.\n• Uprościła ścieżkę wdrożeń, skracając czas dostarczania zmian dla kilku zespołów.\n• Wprowadziła standardy obserwowalności i odpowiedzialności za niezawodność.",
        160, 387, 365, 60, 9.4, 13.3, CLOUD, SANS
    )),
    bold(text("Backend Engineer  /  Orbit Labs", 11, SANS, "#FFFFFF", 160, 473, 3)),
    text("2017 – 2021  ·  Distributed Systems", 8.7, SANS, MIST, 160, 491, 3),
    bulleted(block(
        "• Rozwijała usługi API i pipeline’y danych dla produktu używanego na wielu rynkach.\n• Współtworzyła model współpracy między inżynierią, produktem i analityką.",
        160, 509, 365, 44, 9.4, 13.3, CLOUD, SANS
    )),

    { ...ellipse(133, 607, 17, 17, ELECTRIC, false, 1.2, 3), id: "vector-section-two" },
    tracked(text("STACK & EDUCATION", 8.5, SANS, ELECTRIC, 160, 610, 3), 1.7),
    line(160, 629, 365, 1, "#3C6682", 2),
    bold(text("Informatyka  /  Politechnika Warszawska", 10.4, SANS, "#FFFFFF", 160, 648, 3)),
    text("2012 – 2017", 8.7, SANS, MIST, 160, 666, 3),
    block(
        "TypeScript  ·  Python  ·  Go  ·  Kubernetes  ·  AWS  ·  PostgreSQL\nSystem design  ·  Event-driven architecture  ·  Observability",
        160, 700, 365, 32, 9.3, 13.2, CLOUD, SANS
    ),

    { ...line(160, 784, 365, 1, "#3C6682", 2), fixedToPage: true },
    { ...circle(160, 797, 7, LIME, true, 1, 3), fixedToPage: true },
    { ...text("01", 8, SANS, MIST, 510, 792, 3), fixedToPage: true },
];
