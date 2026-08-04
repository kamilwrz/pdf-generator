import API_BASE_URL from "../services/api";
import { block, bulleted, circle, ellipse, line, text } from "./helpers";

const FOREST = "#274232";
const SAGE = "#73856E";
const GOLD = "#B99854";
const PAPER = "#FBFAF6";
const BODY = "#344238";
const MUTE = "#798078";
const RULE = "#D5D0C2";
const SANS = "Helvetica";
const SERIF = "Times-Roman";
const SIDEBAR = `${API_BASE_URL}/template-assets/moss-sidebar.png`;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);

// Moss — a paper-and-sage sidebar built from a generated botanical fragment.
export const mossTemplate = [
    { category: "image", src: SIDEBAR, width: 184, height: 842, left: 0, top: 0, zIndex: 0, fixedToPage: true },
    { ...line(184, 0, 2, 842, GOLD, 2), fixedToPage: true },
    { ...line(186, 0, 409, 842, PAPER, 0), fixedToPage: true },

    tracked(text("ALEKSANDRA WIŚNIEWSKA", 28, SERIF, FOREST, 220, 52, 3), 0.1),
    tracked(text("SERVICE DESIGN LEAD", 8.8, SANS, SAGE, 222, 92, 3), 1.5),
    text("aleksandra.wisniewska@email.com  ·  +48 600 000 000", 8.4, SANS, MUTE, 222, 120, 3),
    line(220, 145, 326, 1, RULE, 2),

    // Photo placeholder at the sidebar top (aligned with the name), then contact
    // and fitted sidebar sections — not mid-page under empty vertical space.
    { ...rect(44, 52, 96, 90, GOLD, 0.85, 3), id: "moss-frame" },
    { ...ellipse(60.6, 68.6, 57.9, 28.1, SAGE, false, 1, 3), id: "moss-orbit" },
    { ...circle(80.4, 101.6, 18.2, GOLD, true, 1, 3), id: "moss-node" },

    tracked(text("KONTAKT", 8, SANS, FOREST, 24, 160, 3), 1.2),
    block("Poznań\naleksandra.wisniewska@email.com\n+48 600 000 000", 24, 182, 136, 42, 8, 12.5, FOREST, SANS),
    tracked(text("KOMPETENCJE", 8, SANS, FOREST, 24, 242, 3), 1.2),
    bulleted(block("• Service design\n• Research\n• Facilitation\n• Operating models", 24, 262, 136, 58, 8.3, 13, FOREST, SANS)),

    tracked(text("JĘZYKI", 8, SANS, FOREST, 24, 336, 3), 1.2),
    bulleted(block("• Polski — ojczysty\n• Angielski — C1\n• Hiszpański — B1", 24, 356, 136, 42, 8.3, 13, FOREST, SANS)),

    tracked(text("WYKSZTAŁCENIE", 8, SANS, FOREST, 24, 421, 3), 1.2),
    bold(block("Projektowanie Usług — 2011–2016", 24, 441, 136, 24, 8.4, 12, FOREST, SANS)),
    block("SWPS, Poznań", 24, 465, 136, 14, 7.9, 11, MUTE, SANS),
    block("Badania, service blueprints, facylitacja.", 24, 482, 136, 26, 8, 12, BODY, SANS),

    { ...circle(220, 184, 8, GOLD, true, 1, 3), id: "moss-profile" },
    tracked(text("PROFIL", 8.4, SANS, FOREST, 242, 182, 3), 1.55),
    line(242, 200, 304, 1, RULE, 2),
    block(
        "Projektantka usług, która pomaga organizacjom przełożyć złożone potrzeby na klarowne doświadczenia i realne modele działania. Łączę badania, strategię oraz uważną współpracę.",
        242, 217, 304, 47, 9.8, 14.3, BODY, SANS
    ),

    { ...circle(220, 301, 8, GOLD, true, 1, 3), id: "moss-experience" },
    tracked(text("DOŚWIADCZENIE", 8.4, SANS, FOREST, 242, 299, 3), 1.55),
    line(242, 317, 304, 1, RULE, 2),
    bold(text("Service Design Lead  /  Olive Works", 10.7, SANS, FOREST, 242, 337, 3)),
    text("2020 – obecnie  ·  Digital Services", 8.5, SANS, MUTE, 242, 355, 3),
    bulleted(block(
        "• Prowadziła programy projektowania usług od badań po wdrożenie.\n• Łączyła perspektywę użytkowników, zespołów operacyjnych i technologii.\n• Wprowadziła praktyki wspierające podejmowanie decyzji w złożonych projektach.",
        242, 373, 304, 60, 9.1, 13, BODY, SANS
    )),
    bold(text("Senior Consultant  /  Field Studio", 10.7, SANS, FOREST, 242, 459, 3)),
    text("2016 – 2020  ·  Organisation Design", 8.5, SANS, MUTE, 242, 477, 3),
    bulleted(block(
        "• Projektowała procesy i narzędzia wspierające współpracę zespołów.\n• Moderowała warsztaty oraz przekładała obserwacje na działania.",
        242, 495, 304, 43, 9.1, 13, BODY, SANS
    )),

    { ...line(220, 783, 326, 1, RULE, 2), fixedToPage: true },
    { ...circle(220, 796, 6, GOLD, true, 1, 3), fixedToPage: true },
    { ...text("01", 8, SANS, MUTE, 531, 791, 3), fixedToPage: true },
];
