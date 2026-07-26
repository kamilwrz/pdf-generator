import API_BASE_URL from "../services/api";
import { block, bulleted, circle, ellipse, line, text } from "./helpers";

const NAVY = "#1D3446";
const STEEL = "#527286";
const COPPER = "#B78355";
const FOG = "#E8EDF0";
const PAPER = "#FAFBFB";
const MUTE = "#6E7E88";
const RULE = "#CBD5D9";
const SANS = "Helvetica";
const SERIF = "Times-Roman";
const SIDEBAR = `${API_BASE_URL}/template-assets/harbor-sidebar-v3.png`;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);
const connector = (source_id, target_id, color = COPPER) => (
    { category: "connector", source_id, target_id, backgroundColor: color, borderWidth: 0.8, arrow: false, zIndex: 3 }
);

// Harbor — slate and copper contours, with the generated coastal artwork
// repeated as a narrow sidebar on every page.
export const harborTemplate = [
    { category: "image", src: SIDEBAR, width: 184, height: 842, left: 0, top: 0, zIndex: 0, fixedToPage: true },
    { ...line(184, 0, 2, 842, COPPER, 2), fixedToPage: true },
    { ...line(186, 0, 409, 842, PAPER, 0), fixedToPage: true },

    tracked(text("TOMASZ KOWALSKI", 29, SERIF, NAVY, 220, 52, 3), 0.1),
    tracked(text("PROGRAMME DIRECTOR", 8.8, SANS, STEEL, 222, 92, 3), 1.5),
    text("tomasz.kowalski@email.com  ·  +48 600 000 000", 8.4, SANS, MUTE, 222, 120, 3),
    line(220, 145, 326, 1, RULE, 2),

    tracked(text("KONTAKT", 8, SANS, "#EAF0F3", 24, 300, 3), 1.2),
    block("Gdańsk\ntomasz.kowalski@email.com\n+48 600 000 000", 24, 322, 136, 42, 8, 12.5, "#F7FAFB", SANS),
    tracked(text("OBSZARY", 8, SANS, "#EAF0F3", 24, 434, 3), 1.2),
    block("Programme design\nStrategy\nGovernance\nStakeholders", 24, 456, 136, 58, 8.3, 13, "#F7FAFB", SANS),

    { ...rect(462, 52, 58, 54, COPPER, 0.8, 3), id: "harbor-frame" },
    { ...ellipse(472, 62, 35, 17, STEEL, false, 1, 3), id: "harbor-wave" },
    { ...circle(484, 82, 11, COPPER, true, 1, 3), id: "harbor-point" },
    connector("harbor-frame", "harbor-wave", RULE),
    connector("harbor-wave", "harbor-point"),

    { ...circle(220, 184, 8, COPPER, true, 1, 3), id: "harbor-profile" },
    tracked(text("PROFIL", 8.4, SANS, NAVY, 242, 182, 3), 1.55),
    line(242, 200, 304, 1, RULE, 2),
    block(
        "Lider programów, który łączy strategię, wykonanie oraz relacje z interesariuszami. Prowadzę złożone inicjatywy w sposób spokojny, przejrzysty i odpowiedzialny.",
        242, 217, 304, 47, 9.8, 14.3, NAVY, SANS
    ),

    { ...circle(220, 301, 8, COPPER, true, 1, 3), id: "harbor-experience" },
    tracked(text("DOŚWIADCZENIE", 8.4, SANS, NAVY, 242, 299, 3), 1.55),
    line(242, 317, 304, 1, RULE, 2),
    bold(text("Programme Director  /  Bluewater", 10.7, SANS, NAVY, 242, 337, 3)),
    text("2020 – obecnie  ·  Strategy & Delivery", 8.5, SANS, MUTE, 242, 355, 3),
    bulleted(block(
        "• Prowadził programy strategiczne realizowane przez wielodyscyplinarne zespoły.\n• Uporządkował zarządzanie priorytetami, ryzykami oraz komunikacją statusową.\n• Wspierał liderów w przekładaniu ambitnych planów na konkretne decyzje.",
        242, 373, 304, 60, 9.1, 13, NAVY, SANS
    )),
    bold(text("Programme Manager  /  North Coast", 10.7, SANS, NAVY, 242, 459, 3)),
    text("2016 – 2020  ·  Portfolio Management", 8.5, SANS, MUTE, 242, 477, 3),
    bulleted(block(
        "• Koordynował portfel inicjatyw i przygotowywał materiały dla zarządu.\n• Rozwijał standardy współpracy między zespołami i partnerami.",
        242, 495, 304, 43, 9.1, 13, NAVY, SANS
    )),

    { ...ellipse(218, 590, 13, 13, STEEL, false, 1, 3), id: "harbor-education" },
    tracked(text("EDUKACJA I KOMPETENCJE", 8.4, SANS, NAVY, 242, 590, 3), 1.3),
    line(242, 608, 304, 1, RULE, 2),
    bold(text("Zarządzanie  /  Uniwersytet Gdański", 10.1, SANS, NAVY, 242, 627, 3)),
    text("2011 – 2016", 8.5, SANS, MUTE, 242, 645, 3),
    block("Programme governance  ·  Strategy execution  ·  Planning\nStakeholder management  ·  Change delivery", 242, 679, 304, 31, 9, 13, NAVY, SANS),

    { ...line(220, 783, 326, 1, RULE, 2), fixedToPage: true },
    { ...circle(220, 796, 6, COPPER, true, 1, 3), fixedToPage: true },
    { ...text("01", 8, SANS, MUTE, 531, 791, 3), fixedToPage: true },
];
