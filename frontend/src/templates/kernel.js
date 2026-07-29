import API_BASE_URL from "../services/api";
import { block, bulleted, circle, ellipse, line, text } from "./helpers";

const INK = "#173A76";
const BLUE = "#2462B7";
const TEAL = "#6FB9B4";
const GOLD = "#D69B22";
const SLATE = "#526A83";
const PAPER = "#FAF8F2";
const SANS = "Helvetica";
const SERIF = "Times-Roman";
const BACKGROUND = `${API_BASE_URL}/template-assets/kernel-it-architecture.png`;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });

// Kernel — a bright blueprint composition. A technical rail supports the
// hierarchy while warm circular markers make sections quick to scan.
export const kernelTemplate = [
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
    line(137, 48, 4, 104, INK, 3),
    tracked(text("TOMASZ KOWALSKI", 30, SERIF, INK, 165, 51, 3), 0.15),
    tracked(text("PRODUCT & SYSTEMS ARCHITECT", 8.9, SANS, BLUE, 167, 94, 3), 1.55),
    text("tomasz.kowalski@email.com  ·  +48 600 000 000  ·  Gdańsk", 8.7, SANS, SLATE, 167, 121, 3),

    { ...ellipse(435, 54, 75, 34, TEAL, false, 1.2, 3), id: "kernel-orbit" },
    { ...circle(456, 64, 15, GOLD, true, 1, 3), id: "kernel-core" },
    { ...circle(494, 64, 15, BLUE, false, 1.2, 3), id: "kernel-node" },
    line(471, 70, 23, 1, GOLD, 2),
    { ...circle(143, 185, 12, GOLD, true, 1, 3), id: "kernel-profile" },
    tracked(text("PROFIL", 8.5, SANS, INK, 167, 184, 3), 1.5),
    line(167, 203, 355, 1, "#ACC5D8", 2),
    block(
        "Architekt produktów cyfrowych, który porządkuje złożoność: od potrzeb użytkowników i procesów, po granice systemów, dane oraz bezpieczne wdrożenia.",
        167, 220, 355, 45, 10, 14.5, "#253D54", SANS
    ),

    { ...circle(143, 310, 12, GOLD, true, 1, 3), id: "kernel-experience" },
    tracked(text("DOŚWIADCZENIE", 8.5, SANS, INK, 167, 309, 3), 1.5),
    line(167, 328, 355, 1, "#ACC5D8", 2),
    bold(text("Lead Solutions Architect  /  Velarium", 11, SANS, INK, 167, 348, 3)),
    text("2020 – obecnie  ·  Architecture & Delivery", 8.7, SANS, SLATE, 167, 366, 3),
    bulleted(block(
        "• Uporządkował architekturę modułowej platformy, zachowując tempo rozwoju produktu.\n• Zdefiniował kontrakty integracyjne i standardy pracy dla zespołów inżynierskich.\n• Przełożył cele biznesowe na sekwencję realnych, mierzalnych decyzji technicznych.",
        167, 384, 355, 60, 9.4, 13.3, "#253D54", SANS
    )),
    bold(text("Software Engineer  /  Paperplane", 11, SANS, INK, 167, 471, 3)),
    text("2015 – 2020  ·  Product Engineering", 8.7, SANS, SLATE, 167, 489, 3),
    bulleted(block(
        "• Rozwijał systemy back-endowe i narzędzia wspierające zespoły operacyjne.\n• Współtworzył praktyki jakości, dokumentacji i pracy z długiem technicznym.",
        167, 507, 355, 44, 9.4, 13.3, "#253D54", SANS
    )),

    { ...circle(143, 607, 12, GOLD, true, 1, 3), id: "kernel-stack" },
    tracked(text("TECHNOLOGIE I EDUKACJA", 8.5, SANS, INK, 167, 606, 3), 1.5),
    line(167, 625, 355, 1, "#ACC5D8", 2),
    bold(text("Informatyka  /  Uniwersytet Gdański", 10.3, SANS, INK, 167, 644, 3)),
    text("2010 – 2015", 8.6, SANS, SLATE, 167, 662, 3),
    block(
        "Domain-driven design  ·  TypeScript  ·  Java  ·  AWS  ·  API design\nArchitecture discovery  ·  Delivery strategy  ·  Technical leadership",
        167, 696, 355, 32, 9.2, 13.2, "#253D54", SANS
    ),

    { ...line(167, 784, 355, 1, "#ACC5D8", 2), fixedToPage: true },
    { ...circle(167, 797, 7, GOLD, true, 1, 3), fixedToPage: true },
    { ...text("01", 8, SANS, SLATE, 507, 792, 3), fixedToPage: true },
];
