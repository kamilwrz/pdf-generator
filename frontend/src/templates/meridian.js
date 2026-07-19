// Deck templates — one 16:9 geometry (960×540), three themes. The layout is
// shared; each theme swaps palette, typography and light/dark treatment.
// MUST stay in sync with the backend's DECK_THEMES + layout engine in
// deck_generator.py so AI-generated decks match these canvas templates.
//
// Exercises every canvas primitive: text, textarea (bullets + center align),
// line (solid bars/rules/backgrounds), outline rectangles (frames, image
// placeholder) and arrow connectors (agenda flow).
import { text, line, block, bulleted } from "./helpers";

export const DECK_THEMES = {
    meridian: {
        id: "meridian", name: "Meridian",
        dark: false, bg: "#FFFFFF",
        ink: "#1F2A3A", body: "#2A3542", accent: "#3E6DB5", soft: "#9DBBE6",
        gray: "#57616F", mist: "#D9E2EF", placeholder: "#8894A5",
        display: "Times-Roman", sans: "Inter",
    },
    onyx: {
        id: "onyx", name: "Onyx",
        dark: true, bg: "#14181F",
        ink: "#F2F5F9", body: "#C7CFDA", accent: "#F25F4C", soft: "#7A8494",
        gray: "#8B94A3", mist: "#2A313C", placeholder: "#6C7686",
        display: "Inter", sans: "Inter",
    },
    verdant: {
        id: "verdant", name: "Verdant",
        dark: false, bg: "#FFFFFF",
        ink: "#1E2B24", body: "#2F3E35", accent: "#3E7A5E", soft: "#A8C8B8",
        gray: "#5F6B64", mist: "#DCE7E0", placeholder: "#8AA294",
        display: "Helvetica", sans: "Roboto",
    },
};

const bold = (el) => ({ ...el, bold: true });
const centered = (el) => ({ ...el, align: "center" });
const onPage = (n) => (el) => ({ ...el, page: n });

export function makeDeckTemplate(T) {
    const rect = (left, top, width, height, color, borderWidth = 1.5, zIndex = 1) =>
        ({ category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex });

    const conn = (source_id, target_id) =>
        ({ category: "connector", source_id, target_id, backgroundColor: T.accent, borderWidth: 1.5, arrow: true, zIndex: 6 });

    // Dark themes get a full-bleed background block behind every slide.
    const bg = (els) => (T.dark ? [line(0, 0, 960, 540, T.bg, 0), ...els] : els);

    const footer = (n) => [
        line(80, 497, 800, 1, T.mist, 1),
        text(String(n).padStart(2, "0"), 10, T.sans, T.gray, 862, 507, 2),
        text(T.name, 10, T.sans, T.gray, 80, 507, 2),
    ];

    const header = (title) => [
        bold(text(title, 28, T.display, T.ink, 80, 64, 2)),
        line(80, 106, 56, 3, T.accent, 2),
    ];

    // ---- Slide 1 · Title -------------------------------------------------
    const slide1 = bg([
        line(0, 0, 14, 540, T.accent, 1),
        line(14, 0, 3, 540, T.soft, 1),
        rect(700, 140, 180, 180, T.soft, 1.5, 1),
        rect(730, 170, 180, 180, T.accent, 1.5, 1),
        line(676, 116, 14, 14, T.accent, 1),
        bold(text("FIRMA · 2026", 11, T.sans, T.accent, 84, 96, 2)),
        bold(block("Tytuł prezentacji", 84, 150, 520, 120, 44, 52, T.ink, T.display)),
        line(84, 296, 110, 3, T.accent, 2),
        block("Jednozdaniowy podtytuł, który wprowadza w historię, którą zaraz opowiesz.", 84, 320, 480, 48, 15, 22, T.gray, T.sans),
        bold(text("Jan Kowalski", 12, T.sans, T.ink, 84, 452, 2)),
        text("Warszawa · lipiec 2026", 10.5, T.sans, T.gray, 84, 472, 2),
    ]).map(onPage(1));

    // ---- Slide 2 · Agenda (connector flow) -------------------------------
    const agendaBox = (id, left, num, label) => ([
        { ...rect(left, 210, 200, 130, T.accent, 1.5, 2), id },
        bold(text(num, 20, T.display, T.accent, left + 18, 226, 3)),
        block(label, left + 18, 268, 164, 56, 12.5, 18, T.body, T.sans, 0, 3),
    ]);

    const slide2 = bg([
        ...header("Agenda"),
        ...agendaBox("ag1", 80, "01", "Gdzie jesteśmy\nPunkt wyjścia."),
        ...agendaBox("ag2", 380, "02", "Czego się nauczyliśmy\nDowody i wnioski."),
        ...agendaBox("ag3", 680, "03", "Dokąd idziemy\nDecyzja."),
        conn("ag1", "ag2"),
        conn("ag2", "ag3"),
        ...footer(2),
    ]).map(onPage(2));

    // ---- Slide 3 · Key insight + image frame -----------------------------
    const slide3 = bg([
        ...header("Kluczowy wniosek"),
        bulleted(block(
            "• Pierwszy punkt wspierający, sformułowany jasno.\n• Drugi punkt poparty konkretną liczbą.\n• Trzeci punkt — co z tego wynika dla odbiorców.\n• Czwarty punkt domykający argument.",
            80, 160, 400, 240, 14, 24, T.body, T.sans
        )),
        rect(548, 148, 340, 255, T.mist, 1.5, 1),
        rect(560, 160, 340, 255, T.accent, 1.5, 2),
        text("Miejsce na obraz", 10.5, T.sans, T.placeholder, 672, 278, 3),
        text("Rys. 1 — zastąp własną grafiką", 9.5, T.sans, T.gray, 560, 430, 2),
        ...footer(3),
    ]).map(onPage(3));

    // ---- Slide 4 · Two-column --------------------------------------------
    const slide4 = bg([
        ...header("Szczegółowo"),
        line(478, 160, 2, 270, T.mist, 1),
        bold(text("Gdzie jesteśmy", 15, T.sans, T.ink, 80, 162, 2)),
        bulleted(block(
            "• Obecny stan, podsumowany uczciwie.\n• Ograniczenie, które ukształtowało ten rok.\n• Co już działa dobrze.",
            80, 192, 360, 230, 12.5, 20, T.body, T.sans
        )),
        bold(text("Dokąd idziemy", 15, T.sans, T.ink, 518, 162, 2)),
        bulleted(block(
            "• Zakład, który stawiamy na przyszłość.\n• Co zmienia się dla zespołu.\n• Jak poznamy, że się udało.",
            518, 192, 360, 230, 12.5, 20, T.body, T.sans
        )),
        ...footer(4),
    ]).map(onPage(4));

    // ---- Slide 5 · Closing -----------------------------------------------
    const slide5 = bg([
        rect(880, 44, 36, 36, T.soft, 1, 1),
        line(864, 28, 12, 12, T.accent, 1),
        bold(centered(block("Dziękuję.", 230, 196, 500, 64, 46, 56, T.ink, T.display))),
        line(430, 286, 100, 3, T.accent, 2),
        centered(block("jan.kowalski@email.com  ·  +48 600 000 000  ·  firma.pl", 230, 312, 500, 24, 12.5, 17, T.gray, T.sans)),
        ...footer(5),
    ]).map(onPage(5));

    return [...slide1, ...slide2, ...slide3, ...slide4, ...slide5];
}

export const meridianTemplate = makeDeckTemplate(DECK_THEMES.meridian);
export const onyxTemplate = makeDeckTemplate(DECK_THEMES.onyx);
export const verdantTemplate = makeDeckTemplate(DECK_THEMES.verdant);
