// Nocturne — bold modern CV with a dark header band. Inter throughout, heavy
// use of real bold for the name, section headings and roles. Coral accent.
import { text, line, block, bulleted } from "./helpers";

const BAND = "#1F2933";
const CORAL = "#F25F4C";
const INK = "#1F2933";
const GRAY = "#6B7280";
const LIGHT = "#AEB6BD";

const bold = (el) => ({ ...el, bold: true });

export const nocturneTemplate = [
    // dark header band
    line(0, 0, 595, 160, BAND, 0),
    line(50, 120, 56, 4, CORAL, 1),
    bold(text("JAN NOWAK", 32, "Inter", "#FFFFFF", 50, 56, 2)),
    text("Projektant Produktu i Twórca", 14, "Inter", CORAL, 50, 96, 2),
    text("jan.nowak@email.com   ·   +48 600 456 789   ·   Wrocław", 9.5, "Inter", LIGHT, 50, 132, 2),

    // ABOUT
    bold(text("O MNIE", 12, "Inter", INK, 50, 192)),
    line(50, 209, 40, 2, CORAL),
    block("Projektant produktu, który dostarcza. Zamieniam niejasne problemy w przejrzyste, przyjazne interfejsy — i buduję prototypy, które to udowadniają.", 50, 221, 495, 48, 10.5, 15),

    // EXPERIENCE
    bold(text("DOŚWIADCZENIE", 12, "Inter", INK, 50, 288)),
    line(50, 305, 40, 2, CORAL),
    bold(text("Starszy Projektant Produktu", 11, "Inter", INK, 50, 320)),
    text("Studio Northwind   ·   2020 – obecnie", 9.5, "Inter", GRAY, 50, 336),
    bulleted(block("• Poprowadził przeprojektowanie głównej aplikacji, podnosząc aktywację o 32%.\n• Zbudował bibliotekę komponentów wdrożoną przez 5 zespołów produktowych.\n• Wspierał rozwój 3 młodszych projektantów.", 50, 352, 495, 52, 10, 14)),
    bold(text("Projektant Produktu", 11, "Inter", INK, 50, 418)),
    text("Lumen Labs   ·   2017 – 2020", 9.5, "Inter", GRAY, 50, 434),
    bulleted(block("• Projektował funkcje od zera na web i mobile.\n• Prowadził cotygodniowe sesje użyteczności z prawdziwymi użytkownikami.", 50, 450, 495, 40, 10, 14)),

    // SKILLS
    bold(text("UMIEJĘTNOŚCI", 12, "Inter", INK, 50, 506)),
    line(50, 523, 40, 2, CORAL),
    block("Figma · Prototypowanie · Systemy designu · Badania użytkowników · HTML/CSS · React", 50, 535, 495, 36, 10, 15),

    // EDUCATION
    bold(text("EDUKACJA", 12, "Inter", INK, 50, 586)),
    line(50, 603, 40, 2, CORAL),
    bold(text("Licencjat Projektowania Interakcji — ASP w Warszawie", 11, "Inter", INK, 50, 617)),
    text("2013 – 2017", 9.5, "Inter", GRAY, 50, 633),
];
