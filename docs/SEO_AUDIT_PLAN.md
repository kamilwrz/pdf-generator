# Audyt SEO CV Studio i plan poprawek

Data audytu: 16 września 2026 r.  
Status: audyt repozytorium i plan przyszłych zmian; zapis dokumentu nie wdraża opisanych poprawek.

## 1. Cel i zakres

**Priorytet: polski rynek i pozyskiwanie użytkowników szukających kreatora CV, szablonów oraz eksportu PDF.**

Audyt obejmuje repozytorium. Nie ustala obecnych pozycji, ruchu, linków zewnętrznych ani wyników Core Web Vitals — do tego potrzebne są dane produkcyjne i Search Console. Nie potwierdza również aktywnej konfiguracji hostingu ani indeksowania poszczególnych adresów przez Google.

Dokument powstał na podstawie skilla `seo-audit`, kodu aplikacji, konfiguracji wdrożenia i oficjalnej dokumentacji wskazanej przy zaleceniach. Dowody oraz numery linii odnoszą się do stanu repozytorium z dnia audytu. Priorytety oznaczają kolejność pracy: P1 — fundamenty i istniejące strony, P2 — rozwój jakości i wydajności, P3 — późniejsza ekspansja językowa. Nie stwierdzono na podstawie tego audytu awarii produkcyjnej ani całkowitej blokady indeksowania.

## 2. Co jest słabe

| Priorytet | Ustalenie i dowód | Znaczenie |
| --- | --- | --- |
| **P1** | [Początkowy HTML](../frontend/index.html) (`frontend/index.html`, linie 7–13) zawiera tytuł `CV STUDIO`, pusty kontener aplikacji i skrypt. [Bootstrap React](../frontend/src/main.jsx) (`main.jsx`, linie 12–17) korzysta z `createRoot`; treść pojawia się po uruchomieniu JavaScript. | Warto dostarczać gotową treść publicznych stron w odpowiedzi serwera. Samo używanie Reacta nie dowodzi problemów z indeksowaniem. |
| **P1** | Brak implementacji opisów meta, canonicali i metadanych udostępniania w przejrzanym kodzie. [usePageTitle](../frontend/src/i18n/usePageTitle.js), linie 5–8, oraz [SiteLayout](../frontend/src/components/common/SiteLayout/SiteLayout.jsx), linie 40–42, aktualizują `document.title`. | Brakuje spójnej kontroli opisów stron i preferowanych adresów. |
| **P1** | [Konfiguracja Render](../render.yaml) (`render.yaml`, linie 141–144) przepisuje wszystkie ścieżki na `index.html`. | Nieistniejące strony mogą zwracać HTTP 200 zamiast 404. To ryzyko wynikające z konfiguracji, jeszcze nie pomiar produkcji. |
| **P1** | W publicznych plikach, skryptach i konfiguracji nie znaleziono `robots.txt`, sitemap XML ani jawnej polityki `noindex` dla logowania, edytora oraz konta. Trasy definiuje [App.jsx](../frontend/src/App.jsx), linie 85–108. | Nie rozdzielono stron przeznaczonych do wyszukiwarki od technicznych ekranów aplikacji. Brak sitemap sam w sobie nie blokuje indeksowania. |
| **P1** | Nagłówki są ogólne: „Lepsza treść. Lepsze CV.”, „Znajdź układ dla swojego CV”, „Wybierz plan dla siebie”. [Treści PL](../frontend/src/i18n/locales/pl.json), linie 1991–1992, 2197 i 2280. | Słabiej komunikują temat strony i zamiar użytkownika niż „Kreator CV online”, „Szablony CV” czy „Cennik kreatora CV”. |
| **P2** | [TemplatePage](../frontend/src/pages/Site/PublicPages.jsx) (`PublicPages.jsx`, linie 34–51) opisuje głównie układ, jego cechy i dostępność. | Strony mają podstawową treść, ale mogą lepiej pomagać w wyborze poprzez przykłady, porównania i ograniczenia danego układu. Sama długość tekstu nie rozstrzyga o jego jakości. |
| **P2** | Nie znaleziono implementacji danych strukturalnych w przejrzanym kodzie. | Można lepiej opisać witrynę i ścieżkę nawigacji. Stan wdrożonej strony wymaga osobnej weryfikacji renderowanego DOM; sam tekst pobranego HTML nie wystarcza do wykluczenia skryptów dodających JSON-LD. |
| **P2** | Istniejący artefakt buildu wykorzystuje **197,47 z 200 KiB gzip** budżetu strony głównej. Budżet definiuje [check-bundle-budget.mjs](../frontend/scripts/check-bundle-budget.mjs), linie 9–13. | Zostało niewiele miejsca na dodatkowy JavaScript. To pomiar istniejącego bundla, nie dowód złych wyników szybkości. |
| **P3** | [PL i EN współdzielą adresy](../frontend/src/i18n/index.js) (`index.js`, linie 7–21 i 85–109), a język zależy od pamięci przeglądarki. | Angielska wersja nie ma osobnych, łatwo odkrywalnych adresów. Przy priorytecie PL można rozwiązać to później. |

Dobre podstawy do zachowania: 10 osobnych stron szablonów, linkowanie wewnętrzne, breadcrumbs, instrukcje, widoczne warunki Free/Pro i polityka prywatności. Główna prezentacja szablonów już korzysta z responsywnych WebP, zarezerwowanych wymiarów i priorytetu ładowania wybranego obrazu: [HeroTemplateShowcase](../frontend/src/pages/Hero/HeroTemplateShowcase.jsx), linie 81–91.

Pomiar bundla dotyczy zastanego `dist`, którego `index.html` miał lokalny czas modyfikacji 2026-09-16 03:32:33. Audyt nie uruchamiał nowego buildu. Kontrola bundla nie obejmuje pełnego transferu obrazów publicznych i nie mierzy LCP, INP ani CLS. Dziesięć podstawowych polskich podglądów PNG zajmuje łącznie 1 487 341 bajtów; użycie lazy loading i zarezerwowanej geometrii oznacza, że nie jest to samo w sobie dowód problemu z czasem wyświetlenia głównej treści lub stabilnością układu.

## 3. Kolejność zmian

### Etap 1 — fundamenty techniczne

1. [ ] **Wprowadzić wspólny rejestr publicznych stron i metadanych.** Ma zasilać tytuły, opisy, canonicale, sitemapę i generowanie HTML. Produkcyjny adres witryny pobierać z jawnej konfiguracji `VITE_SITE_URL`, bez zgadywania domeny. Jest to proponowana nowa zmienna, nie istniejąca konfiguracja. W produkcyjnym buildzie wymagać poprawnego originu HTTPS i przerywać generowanie przy braku wartości; lokalne testy korzystają z jawnego adresu serwera testowego.
2. [ ] **Generować statyczny HTML przy buildzie** dla 15 istniejących publicznych adresów: `/`, `/templates`, 10 stron szablonów, `/pricing`, `/help`, `/privacy`. Zachować React/Vite oraz obecną aplikację edytora.
3. [ ] HTML publiczny powinien zawierać właściwą treść PL, nagłówki, linki i metadane. Hydratacja zaczyna się od tego samego anonimowego stanu; preferencje języka i sesję odtwarzać później. Generowanie HTML nie może odczytywać danych rzeczywistych użytkowników ani utrwalać szkiców CV.
4. [ ] **Oddzielić dokument HTML aplikacji z `noindex`** dla `/app`, `/app/*`, `/cvstudio/*`, `/pdfcanvas`, logowania, rejestracji, weryfikacji i płatności. Nawigacja do publicznej strony musi usuwać wcześniejsze `noindex`. Autoryzacja API nadal chroni prywatne dane; reguły wyszukiwarki nie stanowią kontroli dostępu.
5. [ ] **Usunąć globalne przepisywanie wszystkich adresów.** Publiczne strony obsługiwać z wygenerowanej listy; fallback aplikacji ograniczyć do jej tras. Nieznany adres publiczny lub slug szablonu ma zwracać HTTP 404. Błędy wykryte podczas nawigacji klienta mają otrzymywać `noindex`.
6. [ ] Wygenerować `robots.txt` i sitemapę zawierającą wyłącznie kanoniczne, indeksowalne adresy. Pominąć parametry, fragmenty, błędy i ekrany konta; `lastmod` dodawać tylko na podstawie rzeczywistych zmian. Canonicale, linki wewnętrzne i sitemapę utrzymywać w zgodności, zachowując istniejące adresy publiczne bez końcowego ukośnika poza `/`.
7. [ ] Po wdrożeniu sprawdzić aktywne reguły w Render, w tym usunięcie catch-all z konfiguracji hostingu. Sam test serwera Vite ani zmiana pliku YAML nie dowodzi zachowania produkcyjnych odpowiedzi HTTP. Potwierdzić również jeden preferowany host HTTPS i przekierowania pozostałych wariantów, gdy zostanie podana domena produkcyjna.

Google opisuje renderowanie JavaScript i obsługę błędów w [wytycznych JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics). Adresów wymagających odczytania `noindex` nie należy jednocześnie blokować przed crawlowaniem — wyjaśnia to [dokumentacja indeksowania](https://developers.google.com/search/docs/crawling-indexing/block-indexing). [Dokumentacja sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) opisuje dobór adresów i format XML. [Reguły Render](https://render.com/docs/redirects-rewrites) wyjaśniają pierwszeństwo istniejących plików oraz działanie przekierowań i przepisywania ścieżek.

### Etap 2 — poprawa istniejących stron

Przyjąć następującą mapę tematów:

| Strona | Główny temat | Docelowy tytuł |
| --- | --- | --- |
| `/` | kreator CV online, darmowy PDF | Kreator CV online — darmowy PDF \| CV Studio |
| `/templates` | szablony CV do wypełnienia | Szablony CV do wypełnienia online \| CV Studio |
| `/templates/:slug` | konkretny szablon i jego układ | Szablon CV {nazwa} — {rodzaj układu} \| CV Studio |
| `/pricing` | cena, Free i Pro | Cennik kreatora CV — Free i Pro \| CV Studio |
| `/help` | obsługa produktu | Jak stworzyć i pobrać CV w PDF \| Pomoc CV Studio |

- [ ] Zmienić H1 strony głównej na **„Kreator CV online z darmowym pobieraniem PDF”**. Zachować rozróżnienie Studio/Wywiad i informację, że zapis oraz pobranie wymagają konta.
- [ ] Oddzielić tytuł SEO od nagłówka ekranowego; oba mają opisywać tę samą stronę. Na galerii zastosować H1 „Szablony CV do wypełnienia online”, na szczegółach „Szablon CV {nazwa}”, na cenniku „Cennik CV Studio — Free i Pro”.
- [ ] Dodać indywidualne opisy meta odpowiadające faktycznej treści i warunkom oferty. Google może wyświetlić inny fragment — [zasady opisów wyników](https://developers.google.com/search/docs/appearance/snippet). Długości tytułów i opisów traktować jako wskazówkę redakcyjną, nie sztywny warunek rankingu; [wytyczne tytułów](https://developers.google.com/search/docs/appearance/title-link) wyjaśniają źródła tekstu wyświetlanego przez Google.
- [ ] Rozbudować strony szablonów o zastosowania, konkretne różnice, ograniczenia oraz linki do dwóch powiązanych układów. Unikać powielania tekstu z podmienioną nazwą i niepotwierdzonych obietnic zgodności z każdym systemem rekrutacyjnym.
- [ ] Dodać `WebSite` na stronie głównej oraz `BreadcrumbList` zgodny z widoczną nawigacją. Metadane Open Graph przygotować jako element poprawnego udostępniania. Dane strukturalne muszą opisywać rzeczywistą treść; nie dodawać fikcyjnych ocen ani obiecywać rozszerzonych wyników.
- [ ] Zachować użyteczne FAQ. Nie planować go jako sposobu uzyskania rozszerzonego wyniku FAQ: Google wycofał tę funkcję w maju 2026 r. — [oficjalny komunikat](https://developers.google.com/search/updates#may-2026).

### Etap 3 — wydajność i treści

- [ ] Zachować aktualne budżety JavaScript. Oddzielić publiczne opisy szablonów od danych ich geometrii, żeby strony marketingowe nie pobierały danych potrzebnych wyłącznie edytorowi.
- [ ] Dla galerii przygotować responsywne WebP zamiast pełnych PNG. Ustawić priorytet obrazu szczegółowego dopiero po sprawdzeniu, czy jest elementem LCP. Zachować wymiary, teksty alternatywne i stany błędu.
- [ ] Dodać centrum `/poradnik` i trzy pierwsze artykuły: `/poradnik/jak-napisac-cv`, `/poradnik/cv-bez-doswiadczenia`, `/poradnik/cv-na-jedna-strone`. Są to nowe, planowane trasy. Objąć je generowaniem HTML, metadanymi i sitemapą z etapu 1.
- [ ] Każdy poradnik ma zawierać własne przykłady, autora, rzeczywistą datę aktualizacji i odnośniki do odpowiednich szablonów. `/help` pozostaje instrukcją aplikacji. Centrum poradników podlinkować w publicznej nawigacji pomocniczej; powiązane artykuły połączyć ze stronami szablonów.
- [ ] Frazy traktować jako hipotezy tematyczne, bez wymyślonych wolumenów wyszukiwania. Po uzyskaniu danych Search Console doprecyzować kolejność dalszych treści. Nie oceniać profilu linków zewnętrznych ani autorytetu domeny bez odpowiednich danych.
- [ ] Osobne publiczne adresy EN i wzajemny `hreflang` pozostawić na kolejny etap. Obecny interfejs EN zachować; nie deklarować alternatyw językowych, które nie mają własnych adresów. To odpowiada [zaleceniom Google dla witryn wielojęzycznych](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites).

## 4. Testy i kryteria odbioru przyszłej implementacji

- [ ] Wszystkie 15 istniejących stron publicznych udostępnia treść i linki bez JavaScript oraz dokładnie jeden właściwy tytuł, opis i canonical. Nowe poradniki spełniają ten sam kontrakt po ich dodaniu.
- [ ] Hydratacja i przejścia między stronami nie pozostawiają nieaktualnych metadanych ani `noindex`; nie tracą wyboru szablonu, preferencji języka lub sesji.
- [ ] Znane strony zwracają 200; nieznane publiczne adresy i szablony — 404. Bezpośrednie wejścia do aplikacji nadal działają.
- [ ] Początkowe odpowiedzi tras aplikacji, uwierzytelniania i płatności zawierają `noindex`. Dane prywatne nadal wymagają autoryzacji API i nie trafiają do publicznego HTML.
- [ ] Sitemap zawiera tylko właściwe adresy; każdy z nich zwraca 200. `robots.txt` zwraca tekst, a sitemap XML — nigdy HTML aplikacji. Parametry marketingowe i fragmenty nie zmieniają canonicala.
- [ ] JSON-LD odpowiada widocznej treści i przechodzi walidację odpowiednią dla użytego typu. Walidacja obejmuje również DOM po wykonaniu JavaScript.
- [ ] Testy konfiguracji produkcyjnej obejmują rzeczywisty hosting. Obecne testy na serwerze Vite nie potwierdzają działania reguł Render.
- [ ] Zmiany UI spełniają [DESIGN.md](../DESIGN.md): PL/EN, szerokości 390/834/1280/1920 px, klawiatura, powiększenie 200%, ograniczony ruch i brak wpływu na eksport PDF. Przed zmianą zinwentaryzować stany komponentów i korzystać ze wspólnych tokenów oraz prymitywów.
- [ ] Po implementacji uruchomić istniejące testy, lint, build, kontrolę bundla oraz nowe testy SEO wygenerowanego HTML.
- [ ] Po wdrożeniu zweryfikować adresy w Search Console i mierzyć indeksowanie, wyświetlenia, kliknięcia oraz zapytania niebrandowe. Porównywać kolejne pełne okresy 28 dni od dostępnego punktu odniesienia, z uwzględnieniem opóźnienia indeksacji. Wyników szybkości ani wzrostu ruchu nie uznawać za potwierdzone na podstawie samego kodu.

Istniejące polecenia z katalogu głównego repozytorium, do użycia podczas realizacji zmian:

```sh
npm --prefix frontend run test:all
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run check:bundle
npm --prefix frontend run test:e2e -- e2e/site-architecture.spec.js --project=desktop-chromium
```

Nowe testy SEO należy dodać do odpowiednich istniejących zestawów lub udokumentować ich nowe polecenie dopiero po implementacji. Testy surowego HTML muszą czytać wynik produkcyjnego buildu. Testy HTTP hostingu wymagają podanego adresu wdrożenia i nie mogą być zastąpione samym testem Vite.

## 5. Dokumentacja i granice realizacji

Ten plik jest zapisem audytu i planu, a odnośniki w obu wersjach językowych README oznaczają go jako **plan, a nie wdrożone funkcje**. Wszystkie checklisty implementacyjne pozostają otwarte.

Samo zapisanie audytu nie zmienia aplikacji. Późniejsza realizacja obejmie frontend i konfigurację hostingu; nie wymaga zmian publicznego API backendu ani schematu bazy danych. Zmiany skryptów buildu, konfiguracji, tras i treści należy opisywać w kompletnych sekcjach EN/PL README wraz z rzeczywistymi testami i zweryfikowanymi odnośnikami. Zaktualizować `DESIGN.md`, jeśli wdrożenie ustanowi nową regułę produktową, na przykład osobne adresy językowe. Nie przedstawiać kolejnych etapów jako wdrożonych przed ich wykonaniem i sprawdzeniem.
