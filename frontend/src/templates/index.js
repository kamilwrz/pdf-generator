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
        description: "Mocny, czarno-biały układ z numerowanymi sekcjami i wyraźnymi ramkami.",
        details: {
            heading: "Wyraźny podział bez zbędnych ozdobników",
            body: "Monument prowadzi wzrok przez kolejne części CV za pomocą numerów, ramek i mocnych nagłówków. Cała treść pozostaje w jednej kolumnie, a zdjęcie ma osobne, uporządkowane miejsce.",
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
        description: "Dwukolumnowy układ z chłodnym panelem bocznym na umiejętności i dodatkowe informacje.",
        details: {
            heading: "Dodatkowe informacje z boku, doświadczenie na pierwszym planie",
            body: "Slate oddziela umiejętności, języki i wykształcenie od głównej historii zawodowej. Dzięki temu rozbudowane CV pozostaje uporządkowane, a najważniejsze opisy mają dużo miejsca w prawej kolumnie.",
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
        description: "Lekki układ w jednej kolumnie, z dużą ilością wolnej przestrzeni i subtelnymi liniami.",
        details: {
            heading: "Spokojny układ, który daje treści więcej miejsca",
            body: "Atrium wykorzystuje jedną szeroką kolumnę i oszczędne podziały. Podsumowanie, doświadczenie i pozostałe sekcje tworzą prostą kolejność, bez ciężkich bloków graficznych.",
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
        description: "Klasyczny układ z szeroką kolumną boczną i dużą przestrzenią na historię zatrudnienia.",
        details: {
            heading: "Dwie kolumny na bogate doświadczenie",
            body: "Sterling przenosi podsumowanie, umiejętności, języki i certyfikaty do bocznej kolumny. Główna część strony zostaje przeznaczona na doświadczenie i wykształcenie, dzięki czemu dłuższe opisy nie konkurują z dodatkowymi informacjami.",
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
        description: "Formalny, czarno-biały układ w jednej kolumnie, skupiony na przebiegu kariery.",
        details: {
            heading: "Prosty dokument z naciskiem na treść",
            body: "Regent rezygnuje z panelu bocznego i dekoracyjnych bloków. Wyraźne nagłówki, spokojna typografia i pełna szerokość strony pomagają przedstawić doświadczenie w formalny, uporządkowany sposób.",
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
        description: "Czytelny układ w jednej kolumnie, z datami wyrównanymi do prawej strony.",
        details: {
            heading: "Dużo treści w jednej, czytelnej osi",
            body: "Meridian układa wszystkie sekcje od góry do dołu, a daty przenosi na prawą krawędź. To pomaga zachować porządek przy kilku stanowiskach, bez dzielenia historii zawodowej między kolumny.",
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
        description: "Dwukolumnowy układ w spokojnych kolorach, z miejscem na zdjęcie i informacje dodatkowe.",
        details: {
            heading: "Zdjęcie i szczegóły w osobnej kolumnie",
            body: "Linden pozostawia główną część strony na podsumowanie i doświadczenie. Zdjęcie, kontakt, edukacja, umiejętności i języki są uporządkowane w bocznym panelu, więc łatwo je znaleźć bez przerywania historii zatrudnienia.",
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
        description: "Jednokolumnowy układ z wyraźnymi pasami sekcji i datami umieszczonymi po prawej.",
        details: {
            heading: "Chronologia, którą łatwo przejrzeć",
            body: "Cadenza oddziela kolejne części CV poziomymi pasami, a daty i miejsca ustawia na prawej osi. Stanowiska pozostają w jednej kolumnie, dzięki czemu można szybko porównać zakres obowiązków i okresy pracy.",
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
        description: "Przestronny układ ze zdjęciem, szerokim podsumowaniem i subtelnymi akcentami.",
        details: {
            heading: "Najważniejsze informacje widoczne od razu",
            body: "Vellum łączy duże zdjęcie z nagłówkiem, szerokim podsumowaniem i sekcją umiejętności blisko góry strony. Dalsza część dokumentu prowadzi przez doświadczenie i edukację w jednej kolumnie.",
            highlights: [
                "Podsumowanie i umiejętności są widoczne przed historią zatrudnienia.",
                "Daty i miejsca tworzą czytelną prawą oś.",
                "Opcjonalne zdjęcie jest mocnym, ale odrębnym elementem nagłówka.",
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
        description: "Minimalistyczny układ z delikatną ramą, ciepłymi akcentami i dużą ilością miejsca na treść.",
        details: {
            heading: "Elegancki nagłówek, oszczędny środek",
            body: "Aurelia zamyka imię i stanowisko w lekkiej ramie, a pozostałe sekcje układa na pełnej szerokości strony. Ciepłe linie pomagają oddzielić treść bez wprowadzania ciężkich bloków.",
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
