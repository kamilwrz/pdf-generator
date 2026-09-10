/**
 * Registry of built-in CV templates shown in pickers and Hero mockups.
 *
 * Each entry is an individual product template. `description` is the short
 * picker copy; `details` explains the real document structure on the public
 * detail route. `layouts` is code-only metadata so generators and reflow can
 * share sidebar / icons / dark behaviour without exposing implementation tags
 * to users. `tier` drives Free vs paid gating. Only Free starter packs are
 * shipped to the browser; Pro geometry is materialized by the entitlement-
 * gated backend generator after selection.
 */
import { sterlingTemplate } from "./sterling";
import { meridianTemplate } from "./meridian";
import { lindenTemplate } from "./linden";

export { TEMPLATE_LAYOUT_TAGS } from "../utils/templateLayouts";

export const TEMPLATES = [
    {
        id: "monument",
        tier: "paid",
        name: "Monument",
        description: "Czarno-biały układ z numerowanymi sekcjami, ramkami i jedną kolumną na treść.",
        details: {
            heading: "Numerowane sekcje w jednej kolumnie",
            body: "Monument oddziela części CV numerami, ramkami i wyraźnymi nagłówkami. Treść biegnie w jednej kolumnie, a na zdjęcie przewidziano osobne miejsce.",
            highlights: [
                "Numerowane sekcje ułatwiają szybkie przejrzenie dokumentu.",
                "Jedna kolumna zachowuje naturalną kolejność czytania.",
                "Opcjonalne zdjęcie mieści się w osobnej ramce.",
            ],
        },
        layouts: ["single"],
        accent: "#343434",
        serverMaterialized: true,
    },
    {
        id: "slate",
        tier: "paid",
        name: "Slate",
        description: "Dwie kolumny z osobnym panelem na umiejętności, języki i dodatkowe informacje.",
        details: {
            heading: "Doświadczenie w szerokiej kolumnie",
            body: "Slate przenosi umiejętności, języki i wykształcenie do bocznego panelu. Szeroka prawa kolumna zostawia więcej miejsca na historię zawodową i dłuższe opisy stanowisk.",
            highlights: [
                "Panel boczny porządkuje krótsze listy i informacje dodatkowe.",
                "Szeroka kolumna główna mieści szczegółowe opisy doświadczenia.",
                "Opcjonalne zdjęcie jest wyraźnie oddzielone od treści.",
            ],
        },
        layouts: ["sidebar", "icons"],
        accent: "#3E5C76",
        serverMaterialized: true,
    },
    {
        id: "atrium",
        tier: "paid",
        name: "Atrium",
        description: "Jasny układ w jednej kolumnie, z dużą ilością wolnego miejsca i cienkimi liniami.",
        details: {
            heading: "Prosta kolejność i więcej wolnego miejsca",
            body: "Atrium korzysta z jednej szerokiej kolumny i cienkich podziałów. Podsumowanie, doświadczenie i pozostałe sekcje układają się od góry do dołu bez dużych bloków graficznych.",
            highlights: [
                "Więcej wolnej przestrzeni ułatwia czytanie krótszego CV.",
                "Jedna kolumna prowadzi rekrutera przez dokument krok po kroku.",
                "Opcjonalne zdjęcie pozostaje dyskretnym elementem nagłówka.",
            ],
        },
        layouts: ["single", "icons"],
        accent: "#556158",
        serverMaterialized: true,
    },
    {
        id: "sterling",
        tier: "free",
        name: "Sterling",
        description: "Dwie kolumny: boczna na krótsze informacje i szeroka na historię zatrudnienia.",
        details: {
            heading: "Więcej miejsca na historię zatrudnienia",
            body: "Sterling umieszcza podsumowanie, umiejętności, języki i certyfikaty w bocznej kolumnie. Główna część strony zostaje na doświadczenie i wykształcenie, więc dłuższe opisy nie mieszają się z krótkimi informacjami.",
            highlights: [
                "Szeroki panel boczny mieści kilka krótszych sekcji.",
                "Kolumna główna zachowuje dużo miejsca na obowiązki i osiągnięcia.",
                "Stonowane akcenty oddzielają sekcje bez dominowania nad tekstem.",
            ],
        },
        layouts: ["sidebar"],
        accent: "#4A6FA5",
        elements: sterlingTemplate,
    },
    {
        id: "regent",
        tier: "paid",
        name: "Regent",
        description: "Formalny, czarno-biały układ w jednej kolumnie, z miejscem na pełny przebieg kariery.",
        details: {
            heading: "Formalne CV na pełnej szerokości strony",
            body: "Regent nie ma panelu bocznego ani dużych bloków graficznych. Wyraźne nagłówki i pełna szerokość strony porządkują doświadczenie w jednej kolumnie.",
            highlights: [
                "Jedna kolumna ułatwia czytanie dłuższych opisów.",
                "Czarno-biała forma pasuje do formalnego dokumentu.",
                "Daty i miejsca pozostają blisko informacji, których dotyczą.",
            ],
        },
        layouts: ["single", "icons"],
        accent: "#151515",
        serverMaterialized: true,
    },
    {
        id: "meridian",
        tier: "free",
        name: "Meridian",
        description: "Jedna kolumna z datami po prawej stronie i pełną szerokością na opisy stanowisk.",
        details: {
            heading: "Historia zawodowa na jednej osi",
            body: "Meridian układa sekcje od góry do dołu, a daty wyrównuje do prawej krawędzi. Kilka stanowisk tworzy jedną chronologię i nie dzieli się między kolumny.",
            highlights: [
                "Pełna szerokość strony mieści rozbudowane opisy stanowisk.",
                "Daty po prawej pozwalają szybko prześledzić chronologię.",
                "Niewielkie akcenty kolorystyczne porządkują dokument.",
            ],
        },
        layouts: ["single", "icons"],
        accent: "#3D5A80",
        elements: meridianTemplate,
    },
    {
        id: "linden",
        tier: "free",
        name: "Linden",
        description: "Dwie kolumny z miejscem na zdjęcie, kontakt i krótsze informacje zawodowe.",
        details: {
            heading: "Zdjęcie i krótsze informacje z boku",
            body: "Linden zostawia główną część strony na podsumowanie i doświadczenie. Zdjęcie, kontakt, edukacja, umiejętności i języki trafiają do bocznego panelu, obok historii zatrudnienia.",
            highlights: [
                "Boczna kolumna oddziela krótkie informacje od dłuższych opisów.",
                "Duże pole zdjęcia jest opcjonalne i nie zabiera miejsca doświadczeniu.",
                "Spokojna zieleń i ciepłe tło nadają dokumentowi łagodny charakter.",
            ],
        },
        layouts: ["sidebar", "icons"],
        accent: "#285548",
        elements: lindenTemplate,
    },
    {
        id: "cadenza",
        tier: "paid",
        name: "Cadenza",
        description: "Jedna kolumna z pasami oddzielającymi sekcje oraz datami i miejscami po prawej.",
        details: {
            heading: "Daty i miejsca na wspólnej osi",
            body: "Cadenza oddziela części CV poziomymi pasami, a daty i miejsca ustawia po prawej. Stanowiska pozostają w jednej kolumnie, co ułatwia porównanie obowiązków i okresów pracy.",
            highlights: [
                "Pasy sekcji wyraźnie dzielą dokument na części.",
                "Prawa oś porządkuje daty i miejsca bez obciążania opisów.",
                "Jedna kolumna dobrze mieści kilka kolejnych stanowisk.",
            ],
        },
        layouts: ["single", "icons"],
        accent: "#855C46",
        serverMaterialized: true,
    },
    {
        id: "vellum",
        tier: "paid",
        name: "Vellum",
        description: "Przestronny układ ze zdjęciem, szerokim podsumowaniem i umiejętnościami u góry.",
        details: {
            heading: "Podsumowanie i umiejętności blisko nagłówka",
            body: "Vellum umieszcza duże zdjęcie, szerokie podsumowanie i umiejętności blisko góry strony. Niżej doświadczenie i edukacja biegną w jednej kolumnie.",
            highlights: [
                "Podsumowanie i umiejętności są widoczne przed historią zatrudnienia.",
                "Daty i miejsca tworzą czytelną prawą oś.",
                "Opcjonalne zdjęcie zajmuje duże, osobne miejsce w nagłówku.",
            ],
        },
        layouts: ["single", "icons"],
        accent: "#8A5E47",
        serverMaterialized: true,
    },
    {
        id: "aurelia",
        tier: "paid",
        name: "Aurelia",
        description: "Jednokolumnowy układ z obramowanym nagłówkiem, ciepłymi liniami i miejscem na dłuższe opisy.",
        details: {
            heading: "Obramowany nagłówek i jedna kolumna treści",
            body: "Aurelia umieszcza imię i stanowisko w cienkiej ramie, a pozostałe sekcje rozciąga na pełną szerokość strony. Ciepłe linie oddzielają kolejne części dokumentu.",
            highlights: [
                "Ramowy nagłówek wyraźnie rozpoczyna dokument.",
                "Jedna kolumna utrzymuje prostą kolejność czytania.",
                "Daty po prawej pozostawiają więcej miejsca na opis doświadczenia.",
            ],
        },
        layouts: ["single", "icons"],
        accent: "#98884D",
        serverMaterialized: true,
    },
];
