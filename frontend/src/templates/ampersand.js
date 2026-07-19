// Ampersand — editorial serif CV with a left accent stripe. Times-Roman with
// real bold headings and real italic for the role/dates. Wine accent.
import { text, line, block, bulleted } from "./helpers";

const INK = "#2A2320";
const WINE = "#7B2D3A";
const GRAY = "#8A7F78";
const RULE = "#E0D7D1";
const BODY = "#3A332E";
const S = "Times-Roman";

const bold = (el) => ({ ...el, bold: true });
const ital = (el) => ({ ...el, italic: true });

export const ampersandTemplate = [
    // left accent stripe
    line(0, 0, 9, 842, WINE, 0),
    bold(text("ZOFIA KRAWCZYK", 31, S, INK, 50, 58, 2)),
    ital(text("Pisarka i Redaktorka", 14, S, WINE, 50, 98, 2)),
    text("zofia.krawczyk@email.com   ·   +48 600 567 890   ·   Gdańsk", 9.5, S, GRAY, 50, 122, 2),
    line(50, 140, 497, 1, RULE),

    bold(text("PROFIL", 12, S, INK, 50, 158)),
    block("Redaktorka i pisarka z dekadą doświadczenia w kształtowaniu długich form narracyjnych. Wnosi klarowność w złożone idee i pewność przy każdym terminie.", 50, 174, 497, 52, 11, 16, BODY, S),

    bold(text("DOŚWIADCZENIE", 12, S, INK, 50, 246)),
    bold(text("Starszy Redaktor — Wydawnictwo Meridian", 11.5, S, INK, 50, 268)),
    ital(text("2018 – obecnie", 9.5, S, GRAY, 50, 284)),
    bulleted(block("• Zleciła i zredagowała ponad 200 artykułów w druku i internecie.\n• Zwiększyła czytelność działu esejów o 40%.\n• Rozwijała zespół sześciu dziennikarzy.", 50, 300, 497, 52, 10.5, 15, BODY, S)),
    bold(text("Dziennikarka — Kwartalnik", 11.5, S, INK, 50, 364)),
    ital(text("2014 – 2018", 9.5, S, GRAY, 50, 380)),
    bulleted(block("• Pisała artykuły okładkowe i cotygodniową kolumnę.\n• Zdobyła dwie regionalne nagrody prasowe.", 50, 396, 497, 40, 10.5, 15, BODY, S)),

    bold(text("EDUKACJA", 12, S, INK, 50, 452)),
    bold(text("Magister Literatury Angielskiej — Uniwersytet Gdański", 11, S, INK, 50, 472)),
    ital(text("2010 – 2014", 9.5, S, GRAY, 50, 488)),

    bold(text("UMIEJĘTNOŚCI", 12, S, INK, 50, 528)),
    block("Redakcja · Tworzenie tekstów · Opowiadanie historii · CMS · SEO · Weryfikacja faktów", 50, 546, 497, 36, 10.5, 15, BODY, S),
];
