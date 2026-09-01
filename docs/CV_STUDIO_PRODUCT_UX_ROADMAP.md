# CV Studio — roadmap produktu, UX i komercjalizacji

Stan bazowy: 2026-08-30
Zakres: rekomendacje dotyczące całej aplikacji zebrane przed szczegółową roadmapą Final Check.

## Jak używać tego dokumentu

Ten plik jest źródłem prawdy dla zebranych rekomendacji produktowych, UX, technicznych i komercyjnych. Należy aktualizować go w tym samym commicie co implementację.

Legenda:

- `[x]` — funkcja została zaimplementowana i zweryfikowana;
- `[ ]` — funkcja nie jest jeszcze kompletna;
- `WYCOFANE` — propozycja została świadomie zastąpiona innym kierunkiem i nie jest zadaniem;
- `DECYZJA` — zasada produktowa, której mają przestrzegać kolejne implementacje.

Punkt można oznaczyć jako ukończony dopiero wtedy, gdy:

1. implementacja jest kompletna dla wszystkich powierzchni i stanów objętych zmianą;
2. odpowiednie testy, lint i build przechodzą;
3. zachowanie zostało zweryfikowane wizualnie i pod kątem dostępności, jeśli dotyczy UI;
4. obie wersje językowe `README.md` są zsynchronizowane;
5. pod punktem dodano dowód: pliki, testy i commit.

Przykład dowodu ukończenia:

```markdown
- [x] Nazwa funkcji
  - Implementacja: `frontend/src/...`
  - Testy: `frontend/src/...test.js`
  - Weryfikacja: testy, build i QA wizualne
  - Commit: `abc1234`
```

## Zakres wyłączony z tego artefaktu

Szczegółowa roadmapa funkcji **Final Check** nie jest częścią tego dokumentu. Zostanie zapisana osobno, gdy rozpocznie się jej implementacja. Tutaj pozostają wcześniejsze rekomendacje dotyczące produktu jako całości.

---

## 1. Pozycjonowanie i model produktu

### Decyzje produktowe

- [x] `DECYZJA` Canvas A4 pozostaje główną powierzchnią pracy.
- [x] `DECYZJA` CV Studio pozostaje strukturalnym studiem dokumentu, a nie formularzowym generatorem ani pełnym edytorem graficznym.
- [x] `DECYZJA` System zachowuje semantykę CV: sekcje, wpisy, kolumny, strony i dane profilu.
- [x] `DECYZJA` Swoboda użytkownika jest ograniczana tam, gdzie mogłaby uszkodzić skład, eksport albo czytelność dokumentu.
- [x] `DECYZJA` Tryb swobodny pozostaje opcjonalnym escape hatchem, a nie domyślnym sposobem pracy.
- [ ] Przełożyć pozycjonowanie produktu na jeden prowadzony workflow: import lub kreator → diagnoza → dopasowanie → zatwierdzenie → eksport.
- [ ] Komunikować wartość jako przygotowanie dopracowanej wersji CV do konkretnej aplikacji, a nie samo wygenerowanie PDF.

---

## 2. Edytor i canvas

### Topbar i hierarchia akcji

- [x] Pogrupować topbar według zakresu działania: dokument, tworzenie i wygląd, historia, widok oraz operacje plikowe.
  - Implementacja: `frontend/src/components/editor/Topbar/Topbar.jsx`
  - Commit: `b468b24`
- [x] Dodać widoczne etykiety do niejednoznacznych akcji: import, kreator, zmiana szablonu, pobranie i zapis.
  - Implementacja: `frontend/src/components/editor/Topbar/Topbar.jsx`
  - Testy: `frontend/src/components/editor/Topbar/EditorChromeClarity.test.js`
  - Commit: `b468b24`
- [x] Jednoznacznie rozdzielić `Pobierz PDF` od zapisywania projektu.
- [x] Doprecyzować destrukcyjną akcję czyszczenia zawartości.
- [ ] Pokazywać trwały stan zapisu: `Zapisywanie…`, `Zapisano`, `Błąd zapisu` i możliwość ponowienia.
- [ ] Usunąć lub wyjaśnić techniczne skróty parametrów, których przeciętny użytkownik nie rozumie.
- [ ] Zweryfikować, czy wszystkie rzadkie i destrukcyjne operacje znajdują się w przewidywalnym menu `…`.

### Bezpośrednia edycja na A4

- [x] Pojedynczy klik zaznacza element, a dwuklik rozpoczyna edycję tekstu.
- [x] Edycja tekstu tymczasowo zwiększa zoom i przywraca wcześniejszy widok po świadomym wyjściu.
- [x] Hover pokazuje lokalny toolbar strukturalny, a kliknięcie przypina go do elementu.
  - Implementacja: `frontend/src/components/canvas/CanvasHoverToolbar/CanvasHoverToolbar.jsx`
  - Commit: `db16c83`
- [x] Rozdzielić akcje dodawania sekcji i dodawania wpisu.
- [x] Wyświetlać toolbar w gutterze poza treścią A4.
- [x] Podświetlać cały logiczny zakres sekcji lub wpisu.
- [x] Umieścić rzadkie i destrukcyjne działania w menu `Więcej`.
- [x] Pozwalać cofnąć usunięcie sekcji lub wpisu.
- [x] Zmniejszyć toolbar kontekstowy i opóźnić jego znikanie o jedną sekundę.
- [x] W widoku dwóch stron kierować toolbary do zewnętrznych gutterów rozkładówki.
  - Implementacja: `frontend/src/components/canvas/CanvasHoverToolbar/CanvasHoverToolbar.jsx`
  - Commit: `0e306e5`
- [ ] Po pierwszym zaznaczeniu pokazywać krótką podpowiedź `Dwuklik lub Enter — edytuj`.
- [ ] Obsłużyć `Enter` lub `F2` jako rozpoczęcie edycji tekstu.
- [ ] Zapewnić pełną alternatywę klawiaturową i dotykową dla wszystkich funkcji ujawnianych przez hover.
- [ ] Ujednolicić skróty klawiaturowe i pokazywać je w tooltipach.
- [ ] Pokazywać w toolbarze wyłącznie akcje pasujące do typu zaznaczonego elementu.

---

## 3. Sidebar, panele i modale

- [x] Zachować małą liczbę głównych pozycji sidebara.
- [x] Dodać jednoznaczne tooltipy i mocny stan aktywnego panelu.
- [x] Zastąpić techniczne `Freeform unlock` etykietą `Edytuj jako kopię`.
- [x] Jednocześnie otwierać tylko jeden panel edytora.
- [x] Używać wspólnych prymitywów `PanelShell` i `DialogShell`.
- [x] Zapewnić przewijanie listy historii importów bez ukrywania nagłówka i akcji.
  - Implementacja: `frontend/src/components/ai/AiCvPanel/AiCvPanel.jsx`
  - Commit: `edd488c`
- [ ] Uprościć podstawową obsługę zdjęcia do `Aktualne zdjęcie`, `Zmień`, `Wykadruj` i `Usuń`.
- [ ] Traktować bibliotekę wcześniejszych zdjęć jako funkcję drugorzędną.
- [ ] Zweryfikować dokowanie lub mniejszy popover zdjęcia, aby panel nie zasłaniał CV przy powiększeniu.
- [ ] Dostosować szerokość i układ `Moich dokumentów` do liczby elementów zamiast zostawiać dużą pustą powierzchnię.
- [ ] Zapewnić jawne akcje `Otwórz` i `Pobierz`, a usuwanie przenieść do menu `…`.
- [ ] Utrzymać główną akcję każdego modala widoczną przy przewijaniu i na małych wysokościach ekranu.

---

## 4. Onboarding i import CV

- [x] Na pustym dokumencie pokazywać jednoznaczny wybór między kreatorem a importem.
- [x] Start chooser całkowicie zastępuje chrome edytora i usuwa ukryte akcje z drzewa dostępności.
  - Implementacja: `frontend/src/components/editor/StartChooser/StartChooser.jsx`
  - Commit: `a2bea1a`
- [ ] Używać nazw zadaniowych, np. `Wgraj CV` zamiast technicznego `Wyodrębnij dane CV`.
- [ ] Używać `Otwórz pusty dokument` zamiast `Otwórz pusty canvas` tam, gdzie taka etykieta nadal występuje.
- [ ] Zastąpić samą strzałkę kończącą import przyciskiem `Dalej: wybierz szablon →`.
- [ ] Usunąć równorzędne, zduplikowane punkty wejścia do tego samego importu.
- [ ] Po imporcie pokazywać ekran przeglądu danych z polami o niskiej pewności.
- [ ] Obsługiwać PDF tekstowy, skan PDF, DOCX, PNG, JPEG, WEBP oraz wklejony tekst.
- [ ] Stosować pipeline: tani parser lokalny → ocena wyniku → OCR lub vision tylko przy słabym wyniku → normalizacja → przegląd użytkownika.
- [ ] Nie zużywać darmowej próby importu po błędzie, timeoutcie lub niepoprawnym pliku.
- [ ] Walidować MIME na podstawie zawartości, limit rozmiaru, liczbę stron i stan zaszyfrowania dokumentu.
- [ ] Nie przechowywać oryginalnego pliku importu dłużej, niż wymaga ekstrakcja i jasno opisana retencja.

---

## 5. Szablony i personalizacja

### Granice personalizacji

- [x] `DECYZJA` Użytkownik wybiera zaprojektowany szablon, a nie konstruuje jego język wizualny od zera.
- [x] `DECYZJA` Fonty, ikony, dekoracje, geometria nagłówków i główny layout pozostają częścią projektu szablonu.
- [x] Udostępniać bezpieczne palety kolorystyczne w obsługiwanych szablonach.
- [x] Udostępniać kontrolowaną skalę typografii.
- [x] Udostępniać gęstość i odstępy dokumentu.
- [x] Pozwalać zmieniać kolejność i widoczność sekcji.
- [x] Pozwalać zmieniać zdjęcie profilowe.
- [x] Pozwalać zmienić cały szablon bez utraty treści profilu.
- [ ] Wyjaśnić w panelu wyglądu, że fonty, ikony i dekoracje są chronioną częścią projektu.
- [ ] Dodać bezpośredni link `Potrzebujesz innego stylu? Zmień szablon`.
- [ ] Utrzymywać wyraźnie różne kategorie wizualne, np. Classic, Executive, Editorial, Sidebar, Modern i Tech.
- [ ] Oznaczać statyczne przykłady jako `Podgląd stylu`, jeśli miniatura nie wykorzystuje danych użytkownika.
- [ ] Nie dodawać konfiguratora pojedynczych ikon, dowolnych fontów, ramek i dekoracji.

---

## 6. Layout, paginacja i jakość PDF

### Zasady produktu

- [x] `DECYZJA` Nie wymuszać jednej strony za wszelką cenę.
- [x] `DECYZJA` Dwie dobrze wykorzystane strony są poprawnym, komercyjnym rezultatem.
- [x] `DECYZJA` Layout engine optymalizuje cały dokument, a nie tylko maksymalne zapełnienie pierwszej strony.
- [x] `DECYZJA` Geometria i paginacja są deterministyczne; AI może skracać treść dopiero po wyczerpaniu bezpiecznych korekt layoutu.

### Istniejące mechanizmy

- [x] Mierzyć zapełnienie ostatniej strony i rozpoznawać dokument zbyt długi.
  - Implementacja: `frontend/src/utils/documentLength.js`
- [x] Mierzyć zapełnienie wszystkich stron i oceniać balans dokumentu.
  - Implementacja: `frontend/src/utils/layoutDensity.js`
- [x] Dobierać najluźniejszy rytm odstępów mieszczący dokument na docelowej liczbie stron.
  - Implementacja: `frontend/src/utils/fitToPages.js`
- [x] Zachować semantyczne sekcje i wpisy podczas przepakowania między stronami.
  - Implementacja: `frontend/src/utils/sectionStructure.js`
- [x] Po skutecznym skróceniu AI odzyskiwać możliwie luźny, czytelny rytm dokumentu.
- [ ] Wprowadzić jawne komunikaty o wykorzystaniu stron, np. `Druga strona wykorzystana w 38%`.
- [ ] Rozwinąć balansowanie logicznych bloków między stronami, np. preferować `75% / 65%` zamiast `94% / 32%`.
- [ ] Gwarantować, że wpis doświadczenia lub edukacji nie zostanie przypadkowo przecięty.
- [ ] Wykrywać samotne nagłówki, overflow, nachodzenie treści i nieuzasadnione puste strony we wspólnym procesie jakościowym.
- [ ] Testować kolejność ekstrakcji tekstu, Unicode, ligatury oraz znaki PL/DE/FR dla każdego szablonu.
- [ ] Utrzymywać wersjonowany corpus krótkich i długich CV uruchamiany przez każdy zarejestrowany szablon.
- [ ] Zweryfikować, że chrome edytora, podświetlenia, uchwyty i guide'y nigdy nie pojawiają się w eksporcie PDF.

---

## 7. AI i analiza CV

### UX AI

- [x] Prezentować główne intencje AI zamiast pustego pola `Zapytaj AI`.
- [x] Oddzielać analizę ogólną, wygląd, dopasowanie do oferty, język, tłumaczenie i skracanie.
- [x] Pokazywać strukturalne wyniki kategorii zamiast ukrywać wszystko w tekście odpowiedzi.
- [x] Chronić zmiany geometrii przez deterministyczną walidację `layout_analysis`.
- [ ] Ukrywać albo osłabiać pływający przycisk AI po otwarciu panelu AI.
- [ ] Dostosować szerokość panelu AI do laptopów i zachować widoczność dokumentu.
- [ ] Priorytetyzować AI działające na zaznaczonym fragmencie: `Skróć`, `Wzmocnij`, `Popraw język`, `Dopasuj do oferty`.
- [ ] Zawsze pokazywać `oryginał → propozycja` przed zastosowaniem zmiany treści.
- [ ] Nie nadpisywać oryginalnego dokumentu przy tworzeniu wariantu pod ofertę.
- [ ] Wymagać źródła w danych użytkownika dla firm, stanowisk, technologii, liczb i osiągnięć.
- [ ] Przy braku dowodu zadawać pytanie użytkownikowi zamiast generować fakt.
- [ ] Pokazywać koszt kredytów przed rozpoczęciem płatnej akcji AI.

### Spójny raport analizy treści

- [ ] Połączyć rozproszone wyniki ATS, języka, wyglądu i dopasowania w jeden czytelny raport treści.
- [ ] Każdy problem opisywać kategorią, wagą, severity, dowodem, lokalizacją i rekomendacją.
- [ ] Dodać deterministyczną analizę chronologii dat.
- [ ] Dodać normalizację nazw stanowisk.
- [ ] Pokazywać mierzalność osiągnięć, np. `9 z 20 wpisów zawiera wynik liczbowy`.
- [ ] Osobno analizować generyczne frazy i różnorodność słownictwa.
- [ ] Kalibrować oczekiwania długością doświadczenia i poziomem Junior/Mid/Senior.
- [ ] Zapisywać raporty i umożliwiać porównanie `przed/po`.
- [ ] Nie deklarować benchmarku względem rynku bez prawdziwego i opisanego zbioru referencyjnego.
- [ ] Nie traktować braku klauzuli RODO jako automatycznego błędu dyskwalifikującego.

---

## 8. Dostępność, responsywność i system projektowy

- [x] Wprowadzić aplikacyjny Swiss Design System obejmujący wszystkie trasy i powierzchnie.
  - Specyfikacja: `DESIGN.md`
  - Commit: `0fc7d9f`
- [x] Stosować centralne tokeny koloru, odstępów, typografii, geometrii i motion.
- [x] Używać wspólnych komponentów dla dialogów, paneli, spinnerów i toastów.
- [x] Zapewnić focus trap, Escape, focus początkowy i przywrócenie focusu w `DialogShell`.
- [x] Zapewnić panelom zachowanie drawerów na kompaktowych szerokościach.
- [x] Stosować `prefers-reduced-motion` w powierzchniach objętych systemem.
- [x] Utrzymywać opisaną ścieżkę klawiaturową i dotykową przez panel `Dostosuj CV` dla operacji strukturalnych.
- [ ] Zweryfikować wszystkie gęste kontrolki względem minimum 36×36 px i preferowanego celu 44×44 px.
- [ ] Przeprowadzić pełny audyt wszystkich workflow wyłącznie klawiaturą.
- [ ] Zweryfikować każdy główny workflow przy powiększeniu przeglądarki 200%.
- [ ] Zweryfikować kolejność focusu i jego widoczność na każdej trasie.
- [ ] Zweryfikować kontrast wszystkich stanów disabled, warning, error i success.
- [ ] Utrzymywać semantyczne etykiety, powiązane błędy formularzy i komunikaty live region.
- [ ] Przeprowadzić formalny audyt WCAG przed komercyjnym wydaniem; obecne QA nie jest certyfikacją zgodności.

---

## 9. Landing page i komunikacja wartości

- [x] Skupić landing na rezultacie i bezpośrednich wejściach do kreatora oraz importu.
- [x] Pokazywać prawdziwy edytor A4 zamiast wyłącznie abstrakcyjnej listy funkcji.
- [ ] Oprzeć główny przekaz na transformacji tej samej treści w dopracowany dokument.
- [ ] Pokazać before/after wykorzystujące dokładnie te same dane.
- [ ] Wyjaśnić, że dokument reaguje na zmianę treści i przelicza strony.
- [ ] Wyeksponować zmianę szablonu bez utraty poprawionej treści.
- [ ] Komunikować WYSIWYG: `To, co widzisz → to pobierasz`.
- [ ] Pozycjonować AI jako narzędzie do konkretnych zadań, a nie generator całego CV.
- [ ] Pokazać rzeczywisty przepływ: treść → dokument → dopracowanie → eksport.
- [ ] Używać prostych, zadaniowych CTA zamiast ogólnych haseł SaaS.
- [ ] Utrzymywać komunikaty zgodne z faktycznym zakresem szablonów, planów, ATS i AI.

Rekomendowane linie komunikacyjne do dalszej oceny:

- `Ta sama treść. Zupełnie inny dokument.`
- `Dopisujesz jedno zdanie. Reszta CV wie, co z nim zrobić.`
- `Klikasz w CV i zmieniasz właśnie to, co widzisz.`
- `Podgląd nie jest przybliżeniem. Jest dokumentem.`
- `Nie oddawaj AI całego CV. Daj mu konkretne zadanie.`

---

## 10. Model biznesowy i paywall

### Decyzje rekomendowane

- [ ] Sprzedawać przygotowanie dopasowanej aplikacji, a nie samą możliwość wygenerowania PDF.
- [ ] Utrzymywać czytelny plan Free pozwalający realnie ocenić jakość produktu.
- [ ] Oprzeć Pro na jednorazowym dostępie przez 30 dni bez automatycznego odnowienia.
- [ ] Przed rozpoczęciem pracy jasno pokazywać cenę, okres dostępu i brak subskrypcji.
- [ ] Umieszczać paywall dopiero po pokazaniu użytkownikowi konkretnej wartości.
- [ ] Skierować pierwszą ofertę głównie do osób posiadających istniejące CV i 2–15 lat doświadczenia.
- [ ] Sprzedawać w Pro warianty pod oferty, pełne AI, ATS, tłumaczenia, wiele CV i historię zmian.
- [ ] Nie opierać przewagi płatnego planu wyłącznie na większej liczbie szablonów.

### Nierozstrzygnięta decyzja

- [ ] Podjąć ostateczną decyzję, czy darmowy PDF ma być czysty, czy zawierać oznaczenie CV Studio.
  - Rekomendacja strategiczna: czysty podstawowy PDF zwiększa zaufanie i polecenia.
  - Aktualny produkt: plan Free komunikuje i stosuje oznaczenie wersji darmowej.

---

## 11. Fundament komercjalizacji

### Płatności i konto

- [ ] Wdrożyć rzeczywisty Stripe Checkout.
- [ ] Aktywować Pro wyłącznie na podstawie zweryfikowanego webhooka.
- [ ] Zapewnić idempotencję webhooków i obsługę zwrotów.
- [ ] Dodać strony płatności zakończonej i anulowanej.
- [ ] Usunąć tymczasową możliwość aktywacji płatnego planu bez płatności.
- [ ] Dodać eksport danych konta.
- [ ] Dodać trwałe usunięcie konta wraz z dokumentami, zdjęciami i importami.

### Prywatność i bezpieczeństwo

- [ ] Udostępnić kompletną politykę prywatności i regulamin.
- [ ] Jasno opisać, które dane trafiają do dostawców AI.
- [ ] Zdefiniować retencję dokumentów, zdjęć, importów, logów i danych płatniczych.
- [ ] Zweryfikować CSP, CORS, rate limiting i limity uploadu.
- [ ] Dodać monitoring błędów importu, eksportu i płatności.
- [ ] Dodać automatyczne backupy bazy i procedurę odtworzenia.
- [ ] Utrzymywać osobne środowiska staging i production.
- [ ] Wyeliminować cold start backendu produkcyjnego.

### Analityka produktu

- [ ] Mierzyć cały lejek użytkownika również przed rejestracją.
- [ ] Używać anonimowego `session_id` i opcjonalnego `user_id` bez treści CV.
- [ ] Rejestrować co najmniej: wejście, start, import, wybór szablonu, pierwszą edycję, zapis, eksport, rozpoczęcie i zakończenie płatności.
- [ ] Nie wysyłać do analityki tekstu CV, opisu oferty ani danych kontaktowych.

---

## 12. SEO, dystrybucja i walidacja rynku

- [ ] Zbudować publiczny, darmowy audyt jako wejście do produktu.
- [ ] Utworzyć publiczną stronę każdego aktywnego szablonu.
- [ ] Utworzyć strony zawodów i problemów, np. `CV programisty`, `CV po angielsku`, `CV ATS`.
- [ ] Generować statyczny HTML, `sitemap.xml`, canonical, Open Graph i schema.org.
- [ ] Utrzymywać unikalną, zgodną z produktem treść każdej strony SEO.
- [ ] Budować dystrybucję przez poradniki, przykłady before/after i strony szablonów.
- [ ] Rozwinąć partnerstwa z doradcami zawodowymi, rekruterami i uczelniami.
- [ ] Przeprowadzić betę z 20–30 osobami aktywnie szukającymi pracy.
- [ ] Mierzyć czas `import → gotowy PDF`, ukończenie głównego workflow, eksport oraz płatność.
- [ ] Zweryfikować, czy co najmniej 80% beta testerów kończy podstawowy workflow bez pomocy.

---

## 13. Poza zakresem pierwszego komercyjnego wydania

Poniższe funkcje nie powinny odciągać projektu od dopracowania głównego workflow:

- [x] `DECYZJA` Nie budować teraz katalogu 100 szablonów.
- [x] `DECYZJA` Nie budować pełnego trackera aplikacji przed walidacją wariantów CV pod oferty.
- [x] `DECYZJA` Nie budować teraz rozszerzenia Chrome.
- [x] `DECYZJA` Nie budować teraz marketplace'u szablonów.
- [x] `DECYZJA` Nie budować teraz aplikacji mobilnej.
- [x] `DECYZJA` Nie budować teraz zaawansowanego RAG ani auto-apply.
- [x] `DECYZJA` Nie rozszerzać teraz produktu o B2B dla uczelni.
- [x] `DECYZJA` Nie dodawać eksportu DOCX przed dopracowaniem PDF.

---

## 14. Propozycje wycofane lub zastąpione

Te punkty nie są zadaniami:

- `WYCOFANE` Osobny przycisk `Podgląd` — canvas jest już podglądem dokumentu.
- `WYCOFANE` Całkowita przebudowa topbara i sidebara — zastąpiona minimalnym uporządkowaniem obecnego UI.
- `WYCOFANE` Pełny prawy panel kontekstowy — zastąpiony lokalnym toolbarem hover i istniejącymi panelami zadaniowymi.
- `WYCOFANE` Ciągły widok wszystkich stron jako priorytet — widok pojedynczy i dwustronicowy wystarczają dla typowego CV.
- `WYCOFANE` Wymuszanie jednej strony — zastąpione inteligentnym zarządzaniem gęstością i paginacją.
- `WYCOFANE` Pełna dowolność projektowa jak w Canvie — koliduje z semantyką CV i niezawodnością eksportu.
- `WYCOFANE` Konkurowanie samą liczbą szablonów — ważniejsza jest odporność każdego szablonu na realne dane.

---

## 15. Historia aktualizacji

| Data | Zmiana | Autor/commit |
| --- | --- | --- |
| 2026-08-30 | Utworzono zbiorczą checklistę produktu, UX i komercjalizacji; szczegółowy Final Check pozostawiono poza zakresem. | Codex / niezatwierdzone |


## 16. BUGI DO POPRAWY / KWESTIE DO IMPLEMENTACJI (WLASNE)

- [x] Dodane wpisy / sekcje nie sa przenoszone przy zmianie szablonu
- [x] Dodawanie "klonow" w Cadenza, Merridian i Vellum (innych tp.) [BUG -> ENTER i PISANIE przy wlaczonym BULLETLIST nie dziala]
- [ ] ATRIUM - chipsy kasuja mala linie dekoracyjna;zmiana na liste tez
- [ ] Poprawic design i funkcjonalnosc kreatora CV
- [ ] Seleckcja tekstu jest niewidoma na B,I,U przez editor panel i na odwrot. Ma byc tylko B,I,U przez selekcje...
- [ ] Wczytywanie linkow (np. LinkedIn - link ukryty)
- [ ] Zmodyfikowac rodzaj chipsow w szablonach
- [ ] Przestal dzialac scroll-page-change
