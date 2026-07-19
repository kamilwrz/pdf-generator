// Gazette — newspaper-style essay/article template (A4 portrait, "article"
// category). Classic editorial devices: kicker + double masthead rule,
// serif headline, italic standfirst, byline/dateline, TWO justified text
// columns with a hairline divider, an oxblood DROP CAP opening the text,
// section headings with accent rules, a framed pull-quote, an end-of-article
// tombstone (■) and a centered folio page number.
// The backend's article_generator.py mirrors these metrics — keep in sync.
import { text, line, block } from "./helpers";

const DARK = "#191B1E";   // masthead ink
const BODY = "#22262B";   // column text
const ACCENT = "#8C2F39"; // oxblood — drop cap, rules, end mark
const GRAY = "#6A7078";
const RULE = "#B9BEC6";
const SOFT = "#D9DCE1";
const S = "Times-Roman";
const I = "Inter";

const bold = (el) => ({ ...el, bold: true });
const ital = (el) => ({ ...el, italic: true });
const just = (el) => ({ ...el, align: "justify" });
const centered = (el) => ({ ...el, align: "center" });
const right = (el) => ({ ...el, align: "right" });

const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) =>
    ({ category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex });

export const gazetteTemplate = [
    // ---- masthead ----
    line(50, 55, 7, 7, ACCENT, 1),
    { ...text("GAZETA · ESEJE I POMYSŁY", 8.5, I, GRAY, 63, 54, 2) },
    line(50, 72, 495, 3, DARK, 1),
    line(50, 78, 495, 1, DARK, 1),
    bold(block("Cichy argument za powolnym myśleniem w szybkim świecie", 50, 92, 495, 72, 29, 34, DARK, S)),
    ital(block("Wszystko wokół nas optymalizuje się pod natychmiastową odpowiedź. Najlepsza praca nadal pochodzi od ludzi, którzy odmawiają pośpiechu.", 50, 170, 495, 40, 12.5, 18, "#4A5058", S)),
    bold(text("Autor: ADAM KOWALSKI", 9, I, DARK, 50, 216, 2)),
    right(block("Warszawa · lipiec 2026 · 6 min czytania", 50, 214, 495, 12, 8.5, 11, GRAY, I)),
    line(50, 232, 495, 0.5, RULE, 1),

    // ---- column divider ----
    line(296, 244, 1, 470, SOFT, 1),

    // ---- LEFT column ----
    // drop cap + hanging first paragraph ("W" + "ierzymy…" = "Wierzymy…")
    bold(text("W", 44, S, ACCENT, 50, 240, 2)),
    just(block(
        "ierzymy, że szybkość to to samo co inteligencja. Najszybsza odpowiedź wygrywa spotkanie, najszybsza wiadomość wygrywa wątek, a ten, kto się waha, wygląda na niepewnego. Tymczasem prawie wszystko trwałe, co kiedykolwiek zbudowaliśmy, powstało powoli — przez ludzi, którzy pozwolili sobie na czas.",
        104, 248, 183, 104, 9.5, 13.5, BODY, S
    )),
    just(block(
        "Powolne myślenie to nie lenistwo. To dyscyplina pozwalania problemowi dojrzeć: czytania dalej niż streszczenie, siedzenia z niewygodnym draftem, odejścia na tyle długo, by oczywista odpowiedź ujawniła swoje wady. To różnica między pracą, która tylko trafia na rynek, a pracą, która zostaje.",
        50, 364, 237, 104, 9.5, 13.5, BODY, S
    )),
    line(50, 482, 24, 2, ACCENT, 2),
    bold(text("Koszt ciągłego pośpiechu", 12.5, S, DARK, 50, 488, 2)),
    just(block(
        "Koszty pośpiechu kryją się na widoku. Decyzje zapadają dwa razy — raz szybko, potem właściwie, po przeróbce. Mnożą się spotkania, bo nikt nie miał czasu napisać tej jednej jasnej strony, która uczyniłaby je zbędnymi. Mylimy ruch z postępem, a wyczerpanie z wysiłkiem.",
        50, 512, 237, 104, 9.5, 13.5, BODY, S
    )),
    just(block(
        "To nie argument przeciwko terminom. Ograniczenia są hojnymi nauczycielami, a pilność uratowała wiele błądzących projektów. Argument jest węższy: domyślna prędkość naszych narzędzi nie powinna stać się domyślną prędkością naszego osądu.",
        50, 624, 237, 78, 9.5, 13.5, BODY, S
    )),

    // ---- RIGHT column ----
    just(block(
        "Jest praktyczny sposób, by zacząć. Pisz, zanim dyskutujesz, i czytaj, zanim piszesz. Zarezerwuj godzinę dziennie, która nie należy do żadnego powiadomienia. Zapytaj przy każdej pilnej prośbie, co by się stało, gdyby odpowiedzieć jutro — i zauważ, jak często szczera odpowiedź brzmi: nic.",
        308, 244, 237, 92, 9.5, 13.5, BODY, S
    )),
    // framed pull-quote
    rect(308, 349, 237, 86, SOFT, 1, 1),
    line(322, 361, 60, 2, ACCENT, 2),
    ital(centered(block("„Szybkość to narzędzie. Osąd to rzemiosło.”", 322, 371, 209, 40, 13, 18, DARK, S))),
    centered(block("— redakcja", 322, 411, 209, 12, 8.5, 11, GRAY, I)),
    just(block(
        "Instytucje mogą pomóc. Daj recenzjom czas, na jaki zasługują. Nagradzaj memo, które uratowało projekt, tak samo głośno jak sprint, który go uratował. Zatrudniaj za umiejętność powiedzenia „jeszcze nie wiem” bez drgnięcia — bo ta zdanie jest początkiem myślenia.",
        308, 451, 237, 92, 9.5, 13.5, BODY, S
    )),
    line(308, 553, 24, 2, ACCENT, 2),
    bold(text("Co daje powolność", 12.5, S, DARK, 308, 559, 2)),
    just(block(
        "Co daje powolność? Głębię, przede wszystkim. Powolny czytelnik kończy mniej książek i pamięta więcej z nich. Powolny pisarz publikuje rzadziej i jest cytowany dłużej. W kulturze mierzącej wszystko przepustowością cierpliwość cicho stała się przewagą konkurencyjną.",
        308, 583, 237, 92, 9.5, 13.5, BODY, S
    )),
    // end-of-article tombstone
    line(308, 685, 7, 7, ACCENT, 2),

    // ---- folio ----
    line(50, 788, 495, 0.5, RULE, 1),
    centered(block("— 1 —", 50, 796, 495, 12, 8.5, 11, GRAY, I)),
];
