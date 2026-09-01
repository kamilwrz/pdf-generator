I.   POLITYKA PRYWATNOSCI / RODO
-----------------------------------------------------------------------------------------
II.  PLATNOSCI
-----------------------------------------------------------------------------------------
III. FUNNELING
-----------------------------------------------------------------------------------------
IV.  BUGZ / NEEDED FIXES
-----------------------------------------------------------------------------------------

1) JEZYKI - zbyt krotkie columny w sidebar-templates;dostosowac do innerContent?
2) SIDEBAR TEMPLATES - overFlow podczas kasowania elementow kontaktowych;niepotrzebnie;staly odstep (DONE)
3)
4) UX / UI "Uklad CV" (DONE)
5) Toast przy zmianie szablonow, ma znikac (tylko nowy ma istnies w UI) (DONE)
6) Import CV - dane sie nie zapisuja na pozniej;powinny.... (DONE)

8) Po zapisaniu CV nie moge zmieniac szablonow;Trzeba to zaimplementowac (DONE)
9) Problem w niektorych przypadkach z rodzajem rekordu i kategorii rekordu wybieranej automatycznie
10)
11) Dodac kategorie kolorystyczne dla szablonow (DONE 50%)
12) Zmiany po AI, powinny przechodzic do innego szablonu (np. CV po tlumaczeniu, skroceniu) (DONE)
13) Dodac 2 szablonuy w stylu / layoutem Meridian (DONE)
14) .
15) Jezeli rekord byl wybrakowany i wczytany w ten sposob do CV, nie mozna go skasowac ani dodac (CV30, CV21);
    W CV21 mozna. Doswiadczenei w CV21 jako kategoria / tresc? Dlaczego? Zrozumiec kod

 V.  TEMPLATES / CANVA A4
-----------------------------------------------------------------------------------------

1) Skopiowane szablony maja inna strukture. "RecordOverlay" - zaimplementowac dodawanie, zmiane kolejnosci, itd. (DONE)
2) Dodanie job position, jak nie ma w CV PDF lub WIZZARD (DONE)
3)
4) Zdjecie profilowe - nie wszystkie maja ta sama funkcjonalnosc;Opcja - bez zdjecia; (DONE)
5) Dodac 2-3 szablony z mniejszym akapitem;styl RenderCV (DONE)
6) Za duze ikony (zmiana kolejnosci, usun, przenies na sidebar / main) i ich background (DONE)
7) Lista elementow kontaktowych jest za duza (DONE)
8)
9) W sidebarowych szablonach jezyki na 3 nie na 4 kolumny (DONE)

b) Slate
- schowanie job position nie powoduje znikniecia prostokata / tla dekoracyjnego (DONE)
- prostokat / tlo dekoracyjne powinien sie zwiekszac wraz z job position (DONE)
- klik na slot nie laduje galerii (DONE)
- paginacja strony jest krzywo
- skasowac 9xKWADRTA po prawej (wyglada jak menu) (DONE)
- schowanie job position zaburze reflow / layout. Reflow nie powinien sie aktywowac przy    
   zmianie, dla tresci CV (DONE)

c) Monument
- problem z cyframi przy zmianie kolejnosci / ewtl. manual
- klik na slot nie laduje galerii (DONE)
- zamienic element dekoracyjny na photo slot (DONE)
- brak ikon w elementach kontaktowych (DONE)

d) Atrium
- po schowaniu 'job position' kontakt jest za blisko imienia / zdjecia
- klik na slot nie laduje galerii (DONE)

e) Sterling
- brak UPPERCASE
- prak show/hide job position
- brak zdjecia profilowego / nie pokazuje sie po insert to canvas

f) Regent
- brak zdjecia profilowego

g) Nova (DELETED)
- jest ok, ale slot powinien miec ikone
- dodac inne paletty kolorow


VI.  AI
-----------------------------------------------------------------------------------------  

1) Wykrywanie i poprawiki w danym jezyku CV (DONE)
2) Skroc CV kasuje niektore elementy tekstowe... Naprawic (DONE?)

VII. INNE
-----------------------------------------------------------------------------------------
1) GOOGLE LOGIN
2) EMAIL Z POTWIERDZENIEM - REJESTRACJA




---------------------------------------------------------------------------------------------------------
ChatGPT
---------------------------------------------------------------------------------------------------------

1. Główna koncepcja produktu
Najważniejsza rekomendacja była taka:
CV Studio nie powinno być kolejnym formularzowym generatorem CV. Powinno łączyć bezpośrednią edycję dokumentu A4, semantyczną strukturę CV, inteligentny layout oraz AI pracujące na treści.

- Zachować canvas jako centrum produktu.
- Nie kopiować dwukolumnowego edytora FlowCV.
- Ograniczać swobodę tam, gdzie mogłaby zepsuć dokument.
- Sprzedawać rezultat: dopracowane CV pod konkretną aplikację, a nie samo generowanie PDF.
- Pozycjonować produkt jako „studio do pracy nad CV”, nie „generator CV”.
2. Edytor i canvas
Już wdrożone
- ✅ Pogrupowanie topbara według funkcji.
- ✅ Tekstowe etykiety dla niejednoznacznych akcji: import, kreator, zmiana szablonu, pobranie i zapis.
- ✅ Rozdzielenie Pobierz PDF od zapisu projektu.
- ✅ Doprecyzowanie destrukcyjnej akcji czyszczenia.
- ✅ Czytelne tooltipy i stany aktywne sidebara.
- ✅ Freeform unlock zastąpione przez Edytuj jako kopię.
- ✅ Hover pokazuje kontekstowy toolbar, kliknięcie go przypina.
- ✅ Dwuklik rozpoczyna edycję tekstu.
- ✅ Oddzielne dodawanie sekcji i wpisu.
- ✅ Toolbar przeniesiony do guttera poza treścią A4.
- ✅ Usunięcie można cofnąć.
- ✅ Mniejszy toolbar, opóźnienie znikania 1 sekunda.
- ✅ Poprawione położenie toolbarów w widoku dwóch stron.
- ✅ Automatyczny zoom podczas edycji i przywrócenie wcześniejszego widoku.
Nadal aktualne
- ○ Po zaznaczeniu tekstu pokazywać podpowiedź Dwuklik lub Enter — edytuj.
- ○ Obsłużyć Enter lub F2 jako rozpoczęcie edycji.
- ○ Zapewnić dostęp do kontrolek bez hovera: klawiatura, dotyk i trwała ścieżka alternatywna.
- ○ Ujednolicić focus-visible, kolejność focusu i skróty klawiaturowe.
- ○ Pokazywać status zapisu: Zapisywanie…, Zapisano, Błąd zapisu.
- ○ Ograniczyć techniczne parametry w toolbarze, np. niezrozumiałe AV 0 czy #1.
- ○ Pokazywać tylko opcje pasujące do aktualnie zaznaczonego elementu.
3. Sidebar, panele i modale
- ◐ Zachować niewielką liczbę pozycji sidebara, ale zawsze zapewnić nazwy, tooltipy i mocny stan aktywny.
- ○ Panel zdjęcia uprościć do:
  - aktualne zdjęcie,
  - Zmień,
  - Wykadruj,
  - Usuń.
- ○ Bibliotekę poprzednich zdjęć traktować jako funkcję drugorzędną.
- ○ Panel zdjęcia zadokować albo otwierać jako mniejszy popover, aby nie zasłaniał CV.
- ○ „Moje dokumenty” pokazywać jako pełnoszerokie wiersze lub zwęzić modal przy małej liczbie dokumentów.
- ○ Dodać jawne akcje Otwórz, Pobierz i menu … dla usuwania.
- ✅ Naprawiono przewijanie historii importów.
- ✅ Start chooser całkowicie przykrywa chrome edytora.
4. Onboarding i import
- ✅ Zachować prosty wybór: utworzenie nowego CV albo import istniejącego.
- ○ Stosować nazwy zadaniowe:
  - Wgraj CV zamiast Wyodrębnij dane CV,
  - Otwórz pusty dokument zamiast Otwórz pusty canvas.
- ○ Zastąpić samą strzałkę kończącą import etykietą Dalej: wybierz szablon →.
- ○ Usunąć zduplikowane punkty wejścia do importu.
- ○ Po imporcie pokazywać ekran weryfikacji danych i oznaczać pola o niskiej pewności.
- ◐ Pipeline importu rozwijać w kolejności:
  1. parser lokalny,
  2. ocena jakości,
  3. OCR/vision tylko w razie potrzeby,
  4. normalizacja danych,
  5. weryfikacja przez użytkownika.
- ○ Docelowo obsługiwać tekstowy PDF, skan, DOCX, obrazy i wklejony tekst.
- ○ Nie zużywać darmowej próby, jeśli import się nie powiedzie.
5. Szablony i personalizacja
Rekomendacja pozostała konsekwentna:
Użytkownik wybiera zaprojektowany szablon, a nie samodzielnie konstruuje jego język wizualny.

Pozostawić zablokowane:
- fonty przypisane do projektu,
- ikony,
- dekoracje,
- geometrię nagłówków,
- główną konstrukcję layoutu.
Bezpieczna personalizacja:
- ✅ palety kolorystyczne;
- ✅ skala typografii;
- ✅ gęstość i odstępy;
- ✅ kolejność i widoczność sekcji;
- ✅ zdjęcie;
- ✅ zmiana całego szablonu bez utraty treści.
Nadal aktualne:
- ○ Wyjaśnić w panelu wyglądu, że fonty, ikony i dekoracje są częścią projektu.
- ○ Zapewnić wystarczająco różnorodną galerię: Classic, Executive, Editorial, Sidebar, Modern, Tech.
- ○ Wyraźnie oznaczać przykładowe miniatury jako Podgląd stylu, jeśli nie zawierają danych użytkownika.
- ○ Nie dodawać konfiguratora pojedynczych ikon, ramek i dowolnych fontów.
6. Layout, paginacja i jakość PDF
To uznawałem za potencjalnie największą przewagę CV Studio.
- Nie wymuszać jednej strony za wszelką cenę.
- Jedna strona jest preferowana dla krótkiej treści.
- Dwie dobrze wykorzystane strony są prawidłowym rezultatem.
- Ostrzegać dopiero przy słabym wykorzystaniu ostatniej strony lub 3+ stronach.
Docelowa hierarchia silnika:
1. Wrap — treść zawsze mieści się w swoim obszarze.
2. Reflow — elementy zmieniają wysokość.
3. Density adjustment — bezpieczna korekta odstępów i typografii.
4. Pagination — przenoszenie całych logicznych bloków.
5. Overflow guard — nic nie wychodzi poza stronę.
Pozostałe propozycje:
- ◐ Automatyczne dopasowanie gęstości już istnieje, ale należy je dalej rozwijać.
- ○ Liczyć wykorzystanie każdej strony.
- ○ Balansować cały dokument, np. preferować 75% / 65% zamiast 94% / 32%.
- ○ Nie rozcinać stanowiska lub wpisu edukacji w przypadkowym miejscu.
- ○ Wykrywać samotne nagłówki, nachodzenie treści, overflow i prawie pustą ostatnią stronę.
- ○ Testować ekstrakcję tekstu, polskie znaki, ligatury i kolejność tekstu dla ATS.
- ○ Utrzymywać corpus przykładowych CV uruchamiany przez wszystkie szablony.
- ○ Zapewnić pełną zgodność canvas → PDF i brak chrome’u edytora w eksporcie.
7. „Final Check”
Proponowałem połączenie rozproszonych narzędzi w jeden proces przed eksportem:
- ○ Wynik Gotowe do wysłania.
- ○ Błędy krytyczne i rekomendacje.
- ○ Wskazanie konkretnego elementu dokumentu.
- ○ Napraw automatycznie.
- ○ Jedno cofnięcie całego zestawu zmian.
- ○ Ponowna kontrola po zmianie szablonu i przed eksportem.
- ○ Geometrię naprawiać deterministycznie; AI używać dopiero do treści.
Ta funkcja nadal nie występuje jako jeden spójny moduł.
8. AI i analiza CV
Kierunek UX
- Nie prezentować AI jako osobnego „magicznego” produktu.
- AI powinno pracować kontekstowo na zaznaczonej treści.
- Główna sekwencja:
  1. sprawdź CV,
  2. pokaż problemy,
  3. wklej ofertę,
  4. zaproponuj poprawki,
  5. zaakceptuj lub odrzuć,
  6. utwórz wariant,
  7. eksportuj.
- Pokazywać oryginał → propozycja.
- Nigdy nie nadpisywać oryginału bez akceptacji.
- Nie wymyślać firm, stanowisk, technologii, liczb ani osiągnięć.
Raport analizy
W porównaniu z AsystentCV proponowałem:
- ○ Jeden raport zamiast osobnego uruchamiania ATS, wyglądu, języka i dopasowania.
- ○ Cztery czytelne wymiary oraz wynik całościowy.
- ○ Każdy problem powinien mieć kategorię, wagę, severity, dowód, lokalizację i rekomendację.
- ○ Dodać analizę chronologii dat.
- ○ Normalizować nazwy stanowisk.
- ○ Pokazywać mierzalność osiągnięć, np. 9 z 20 wpisów.
- ○ Osobno analizować generyczne frazy i różnorodność słownictwa.
- ○ Kalibrować długość CV poziomem Junior/Mid/Senior.
- ○ Zapisywać raporty i porównanie przed/po.
- ○ Opcjonalnie eksportować raport jako PDF.
- ○ Nie deklarować „benchmarku rynku”, dopóki nie istnieje prawdziwy zbiór referencyjny.
- ○ Nie karać automatycznie za brak klauzuli RODO.
9. Dostępność i responsywność
- ✅ Powstał aplikacyjny Swiss Design System.
- ✅ Zdefiniowano centralne tokeny, siatkę, typografię, stany i zasady dla wszystkich tras.
- ○ Doprowadzić wszystkie kontrolki do 44×44 px, a gęste kontrolki edytora co najmniej do 36×36 px.
- ○ Wszystkie workflow muszą działać klawiaturą.
- ○ Dodać focus trap i przywracanie focusu w modalach.
- ○ Dropzone ma działać przez Enter i Spację.
- ○ Weryfikować aplikację przy powiększeniu 200%.
- ○ Respektować prefers-reduced-motion.
- ○ Na mobile panele powinny działać jako drawery/sheets bez zasłaniania głównego zadania.
- ○ Modale mają mieć przewijaną treść, ale dostępne nagłówki i akcje.
10. Landing page i komunikacja
Proponowałem odejście od ogólnych haseł generatora CV.
Główne komunikaty:
- „Ta sama treść. Zupełnie inny dokument.”
- „Dopisujesz jedno zdanie. Reszta CV wie, co z nim zrobić.”
- „Klikasz w CV i zmieniasz właśnie to, co widzisz.”
- „Podgląd nie jest przybliżeniem. Jest dokumentem.”
- „Nie oddawaj AI całego CV. Daj mu konkretne zadanie.”
Landing powinien pokazywać:
- import istniejącego CV;
- before/after z tą samą treścią;
- reakcję layoutu na zmianę treści;
- zmianę szablonu bez utraty danych;
- prawdziwy edytor A4;
- WYSIWYG PDF;
- AI jako pomoc w konkretnych zadaniach;
- jasne zasady prywatności i płatności.
11. Model biznesowy
Najważniejsza rekomendacja:
Nie sprzedawać samego PDF-u. Sprzedawać przygotowanie dopasowanej aplikacji.

Proponowany model:
- Free: jedno CV, podstawowy import i edycja.
- Pro: 59 zł za 30 dni, jednorazowa płatność, bez automatycznego odnowienia.
- Pro odblokowuje warianty pod oferty, pełne AI, ATS, tłumaczenia, wiele CV i historię zmian.
- Paywall pojawia się po pokazaniu wartości, np. po analizie oferty, ale przed zastosowaniem pełnego zestawu zmian.
- Główna grupa: osoby z 2–15 latami doświadczenia, posiadające stare lub zbyt długie CV.
Ważna nierozstrzygnięta decyzja: wcześniej rekomendowałem darmowy PDF bez watermarka, ponieważ zwiększa zaufanie i rekomendacje. Aktualna aplikacja nadal komunikuje oznaczenie wersji darmowej.
12. Fundament komercjalizacji
Nadal do wykonania lub dokończenia:
- ○ rzeczywisty Stripe Checkout i podpisane webhooki;
- ○ Pro aktywowane wyłącznie przez webhook;
- ○ eksport i trwałe usunięcie danych konta;
- ○ polityka prywatności i regulamin;
- ○ jawna informacja, które dane trafiają do usług AI;
- ○ monitoring błędów importu, płatności i eksportu;
- ○ backup bazy, staging i produkcja;
- ○ CSP, CORS, rate limiting i limity uploadu;
- ○ analityka lejka bez zapisywania treści CV;
- ○ eliminacja produkcyjnego cold startu.
Kod obecnie ma przygotowane kolumny i bramki pod Stripe, ale sam Checkout nadal jest opisany jako przyszły etap.
13. SEO i dystrybucja
- ○ Publiczny darmowy audyt CV jako wejście do produktu.
- ○ Strony każdego szablonu.
- ○ Strony zawodów i problemów, np. CV programisty, CV po angielsku, CV ATS.
- ○ Statyczny HTML, sitemap, canonical, Open Graph i schema.org.
- ○ Treści typu „jak zmieścić CV na jednej stronie”.
- ○ Partnerstwa z doradcami zawodowymi, rekruterami i uczelniami.
- ○ Beta z 20–30 osobami aktywnie szukającymi pracy.
- ○ Mierzyć czas import → PDF, ukończenie Final Check, wariant pod ofertę, eksport i płatność.
14. Pomysły, które później wycofałem albo obniżyłem ich priorytet
- ↩ Osobny przycisk Podgląd — edytor już jest podglądem.
- ↩ Całkowita przebudowa topbara i sidebara — zastąpiona minimalnym uporządkowaniem obecnego UI.
- ↩ Pełny prawy panel kontekstowy — wycofany na rzecz lokalnego toolbara hover.
- ↩ Ciągły widok wszystkich stron — widok pojedynczy i dwustronicowy jest wystarczający dla większości CV.
- ↩ Wymuszanie jednej strony — niewłaściwe; liczy się czytelność i balans.
- ↩ Pełna dowolność projektowa jak w Canvie — osłabiłaby spójność szablonów i renderer.
- ↩ Konkurowanie liczbą szablonów — ważniejsza jest odporność każdego szablonu na realną treść.
- ↩ Rozbudowany tracker aplikacji, rozszerzenie Chrome, marketplace, aplikacja mobilna i zaawansowany RAG przed pierwszym komercyjnym wydaniem.
Najważniejsze obecne priorytety to: dostępność edytora bez hovera, jeden Final Check, inteligentne balansowanie stron, spójny raport CV, wariant dokumentu pod ofertę oraz prawdziwe płatności i prywatność.
