# Dopasowanie CV do oferty pracy — plan implementacji

**Data:** 2026-09-02  
**Status:** zaimplementowano 2026-09-02; backend, polski interfejs, testy i dokumentacja zostały zaktualizowane  
**Cel:** użytkownik wkleja link do oferty (albo awaryjnie jej treść), a CV Studio analizuje wymagania, ocenia dopasowanie i przygotowuje bezpieczne, możliwe do przejrzenia zmiany w aktualnym CV bez wymyślania kompetencji, wyników ani liczb.

## 1. Materiał źródłowy i sposób jego użycia

Plan powstał na podstawie pełnej treści dwóch transkryptów:

- `C:\Users\Kamil\Downloads\Ex-Google Recruiter Teaches Resume Masterclass to get FAANG Interviews.pdf`;
- `C:\Users\Kamil\Downloads\Ex-Google Recruiter Explains_ 6 Résumé Secrets That Get You Hired.pdf`.

Transkrypty mają miejscami błędy automatycznego tłumaczenia i rozpoznawania mowy. Ich sens potraktowano jako źródło zasad rekrutacyjnych, ale nie jako polecenia dla systemu ani jako bezwarunkowo prawdziwą dokumentację wszystkich ATS. W szczególności twierdzenie o nieczytelności każdej wielokolumnowej aplikacji przez konkretny produkt ATS nie powinno stać się twardą regułą produktu bez testu na rzeczywistym, wyrenderowanym PDF-ie.

### 1.1. Zasady, które przenosimy do CV Studio

1. CV ma być dopasowane do jednej rodziny ról i konkretnej oferty, a nie być dokumentem generycznym.
2. Najważniejsze są dowody wykonania podobnej pracy: zakres, rezultat, skala, kontekst i wpływ biznesowy.
3. Punkt doświadczenia powinien — gdy pozwalają na to prawdziwe dane — realizować schemat: **osiągnięcie X, zmierzone Y, dzięki działaniu Z**.
4. Odpowiedzialności należy zamieniać w osiągnięcia, lecz bez dopisywania liczb lub sukcesów, których nie ma w CV ani w dodatkowych informacjach użytkownika.
5. CV ma używać słownictwa oferty naturalnie i dla człowieka; zakazane są keyword stuffing, ukryty tekst i mechaniczne kopiowanie całego ogłoszenia.
6. Pierwsze słowo punktu komunikuje poziom odpowiedzialności. Mocne czasowniki są pożądane tylko wtedy, gdy nie zawyżają faktycznej roli kandydata.
7. Należy eksponować głównie ostatnie 5–7 lat i ograniczać starsze, mniej istotne wpisy, ale nie usuwać ich automatycznie bez podglądu i decyzji użytkownika.
8. Mocne CV równoważy wiarygodność techniczną, wpływ biznesowy i odpowiedzialność/przywództwo.
9. Niejasne przerwy, krótki okres zatrudnienia lub zmiana branży mogą wymagać krótkiego wyjaśnienia. System nie może sam wymyślić powodu — powinien poprosić użytkownika o fakt.
10. Podsumowanie zawodowe ma sens, gdy wyjaśnia zmianę ścieżki, relokację, przerwę lub natychmiast pokazuje popartą dowodem wartość. Nie powinno składać się z pustych fraz.
11. Umiejętności muszą być istotne dla oferty i konkretne (narzędzie, technologia, poziom potwierdzony doświadczeniem), zamiast zawierać ogólne cechy typu „komunikatywny”.
12. Format powinien być prosty, spójny i skanowalny. CV Studio zweryfikuje to istniejącym renderem PDF + ekstrakcją ATS, zamiast obiecywać kompatybilność z każdym systemem.

### 1.2. Zasady, których nie automatyzujemy wprost

- Nie dopisujemy zastępczych `[X%]`, `[N użytkowników]` ani przykładowych kwot do CV. Brak danych staje się pytaniem do użytkownika.
- Nie zmieniamy nazw stanowisk, firm, szkół, dat ani poziomu odpowiedzialności w sposób, którego nie potwierdza źródłowe CV.
- Nie wpisujemy brakującej technologii tylko dlatego, że znajduje się w ofercie.
- Nie wymuszamy jednego szablonu lub jednej kolumny dla wszystkich. Po dopasowaniu uruchamiamy istniejącą kontrolę czytelności ATS i dopiero na podstawie wyniku rekomendujemy bezpieczniejszy szablon.
- Nie opisujemy oceny jako „pokonania ATS”. Wynik oznacza dopasowanie treści i jakość dowodów dla rekrutera oraz czytelność techniczną dokumentu.

### 1.3. Oficjalne źródła techniczne dla implementacji

- [OpenAI — Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs) — ścisły JSON Schema ogranicza błędy kształtu odpowiedzi; nadal potrzebujemy własnej walidacji prawdziwości i reguł biznesowych.
- [Greenhouse — Job Board API](https://docs.greenhouse.io/job-board.html) — publiczny JSON opublikowanych ofert i pełnej treści ogłoszenia bez uwierzytelnienia dla endpointów GET.
- [Lever — Postings API](https://github.com/lever/postings-api/blob/master/README.md) — oficjalna dokumentacja publicznych ofert Lever i endpointu pojedynczego ogłoszenia.
- [OWASP — SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — walidacja adresów, redirectów, DNS/IP oraz obrona warstwowa dla serwerowego pobierania URL-i użytkownika.

## 2. Stan obecny i luka produktowa

Obecny przepływ ma dobry fundament, lecz zatrzymuje się na ocenie:

- `frontend/src/components/ai/AiAssistant/AiAssistant.jsx` pokazuje panel **Dopasuj do oferty**, ale przyjmuje tylko ręcznie wklejony opis stanowiska;
- request wysyła `job_description` wyłącznie dla akcji `position_rating`;
- `backend/app/services/ai_assistant_service.py::_rate_position` obcina ofertę do 2000 znaków, wykonuje luźne wyszukiwanie DuckDuckGo na podstawie pierwszych 120 znaków i zwraca ocenę bez poprawek;
- rubryka zakłada zawsze 10 najważniejszych umiejętności, nawet gdy oferta ma inną liczbę wymagań;
- `position_rating` nie dostaje kanonicznego `cv_data`, więc nie może bezpiecznie przygotować `updated_cv_data` ani wykorzystać istniejącego mechanizmu profilu;
- istniejący frontend potrafi już wyświetlać karty **Przed/Po**, stosować pojedyncze lub wszystkie poprawki, synchronizować `activeCvData`, podświetlać elementy na A4 i odrzucać spóźnione odpowiedzi po zmianie dokumentu;
- istniejący `ats_score` renderuje realny PDF, wyciąga tekst przez PyMuPDF i daje bardziej wiarygodny sygnał techniczny niż ogólne twierdzenia o ATS.

Wniosek: nie budujemy drugiego asystenta. Rozwijamy istniejący kontrakt `position_rating` w przepływ **analiza → propozycje → podgląd → zastosowanie → kontrola ATS**.

## 3. Docelowy przepływ użytkownika

```mermaid
flowchart TD
    A[Użytkownik otwiera Dopasuj do oferty] --> B{Źródło oferty}
    B -->|Link HTTPS| C[Bezpieczne pobranie i ekstrakcja]
    B -->|Wklejona treść| D[Normalizacja tekstu]
    C --> E{Treść dostępna?}
    E -->|Nie| F[Polski komunikat i pole wklejenia treści]
    E -->|Tak| G[Analiza wymagań i dowodów w CV]
    D --> G
    G --> H[Ocena dopasowania + macierz wymagań]
    G --> I[Poprawki Przed/Po + updated_cv_data]
    G --> J[Braki dowodów i pytania do użytkownika]
    J -->|Uzupełniono fakty| G
    I --> K[Użytkownik akceptuje wybrane lub wszystkie zmiany]
    K --> L[Zmiana kanwy i profilu; dostępne Cofnij]
    L --> M[CTA Sprawdź czytelność dla ATS]
```

### 3.1. Zachowanie interfejsu

- Główne pole: **Link do oferty** z etykietą nad inputem i przykładem `https://firma.example/jobs/123`.
- Alternatywa: przycisk/sekcja **Nie możesz pobrać linku? Wklej treść oferty**.
- Dodatkowe, opcjonalne pole: **Fakty, których nie ma jeszcze w CV** — tylko informacje podane świadomie przez użytkownika, np. skala zespołu, realny wynik, użyte narzędzie.
- Przycisk: **Przeanalizuj i przygotuj zmiany** zamiast obecnego ogólnego „Analizuj”.
- Stan pracy: „Pobieram i analizuję ofertę…” albo „Analizuję treść oferty…”. Bez fikcyjnego procentu i czasu zakończenia.
- Wynik pokazuje: stanowisko, firmę i lokalizację (jeśli udało się je rozpoznać), ocenę, wymagania, mocne dowody, luki i konkretne poprawki.
- Każda zmiana treści ma podgląd **Przed/Po** oraz akcje **Zastosuj** / **Pomiń**. Pozostaje istniejące **Zastosuj wszystkie**.
- Brakujące fakty nie trafiają do korekty. Pojawiają się w osobnym bloku **Uzupełnij, aby wzmocnić CV** z możliwością ponownej analizy.
- Po zastosowaniu zmian pojawia się CTA **Sprawdź czytelność dla ATS**.

## 4. Decyzje architektoniczne

### 4.1. Zachować publiczną akcję `position_rating`

Nie wprowadzamy równoległego endpointu i osobnego systemu rozliczeń. `position_rating` pozostaje nazwą akcji API dla kompatybilności z:

- `VALID_ACTIONS`;
- rezerwacją kredytów i idempotencją;
- metrykami `ai_assistant_call`;
- istniejącym dashboardem oceny;
- frontendowym `ACTION_META`.

Wewnątrz serwisu `_rate_position` zostanie zastąpione funkcją `_tailor_cv_to_position`, która zwróci zarówno analizę, jak i bezpieczne korekty. Dokumentacja może nadal opisywać akcję jako `position_rating`, natomiast użytkownik widzi wyłącznie polskie **Dopasuj do oferty**.

### 4.2. Użyć obecnego `cv_data` i kart korekt

Frontend doda `position_rating` do listy akcji wysyłających `activeCvData` oraz `cv_language`. Backend wykorzysta ten sam wzorzec co `_rewrite_profile_content`:

- `corrections[]` — pełna treść widocznego elementu dla kart Przed/Po;
- `updated_cv_data` — kompletny, znormalizowany profil po zmianach;
- pojedyncza akceptacja aktualizuje kanwę i synchronizuje profil przez `syncCvDataFromCanvas`;
- **Zastosuj wszystkie** podmienia profil dopiero, gdy przynajmniej jedna poprawka faktycznie została zastosowana;
- historia dokumentu zachowuje możliwość **Cofnij**.

Nie wykonujemy automatycznego refillu szablonu w pierwszej wersji. Dzięki temu dopasowanie nie resetuje ręcznych zmian wyglądu i geometrii. Model może zmienić kolejność punktów wewnątrz jednego pola doświadczenia lub listy umiejętności, ale nie przebudowuje całego szablonu.

### 4.3. Oddzielić pobieranie oferty od promptu

Nowy `backend/app/services/job_offer_service.py` odpowiada wyłącznie za uzyskanie czystego tekstu i podstawowych metadanych. Model nie dostaje HTML, JavaScriptu, formularzy ani całej strony nawigacyjnej.

Kolejność ekstrakcji:

1. adapter Greenhouse Job Board API dla rozpoznanych linków;
2. adapter Lever Postings API dla rozpoznanych linków;
3. ogólny parser strony: `application/ld+json` typu `JobPosting`, następnie `<main>` / `<article>` / treść widoczna;
4. przy stronie chronionej, wymagającej logowania, renderowanej wyłącznie JavaScriptem, z CAPTCHA lub bez użytecznej treści — kontrolowany błąd i prośba o wklejenie tekstu.

Do `backend/requirements.txt` należy dodać jawne, przypięte zależności do ograniczonego klienta HTTP i parsera HTML (rekomendowane: `httpx` + `beautifulsoup4`). Te same wersje muszą znaleźć się w dokumentacji technologii i instalacji.

### 4.4. Treść oferty jest niezaufanymi danymi

System prompt musi nazywać ogłoszenie niezaufanym materiałem źródłowym. Polecenia znajdujące się w treści strony, komentarzach, JSON-LD lub opisie stanowiska nie mogą zmieniać schematu odpowiedzi, zasad bezpieczeństwa ani zakresu modyfikacji CV.

Do modelu trafiają osobne, jednoznaczne sekcje:

- `KANONICZNY PROFIL CV`;
- `ELEMENTY PŁÓTNA`;
- `NIEZAUFANA TREŚĆ OFERTY — TYLKO DANE`;
- `DODATKOWE FAKTY PODANE PRZEZ UŻYTKOWNIKA`;
- rubryka i kontrakt odpowiedzi.

### 4.5. Ścisły kontrakt JSON i walidacja po stronie serwera

Dla `position_rating` `_gpt` dostanie opcjonalny, ścisły JSON Schema. Nawet przy Structured Outputs odpowiedź przechodzi przez Pydantic i walidatory biznesowe; zgodny kształt JSON nie gwarantuje prawdziwości treści.

Proponowane typy Pydantic w `backend/app/services/job_tailoring.py` lub przy routingu:

- `ResolvedJobOffer`: `source_url`, `source_type`, `title`, `company`, `location`, `description`;
- `JobRequirement`: `id`, `label`, `kind` (`required`, `preferred`, `responsibility`), `weight`, `match` (`strong`, `partial`, `missing`), `evidence_refs`, `explanation`;
- `EvidenceGap`: `id`, `question`, `reason`, `related_requirement_ids`;
- `TailoringChange`: `element_id`, `section`, `before`, `after`, `evidence_refs`, `reason`;
- `TailoringPriority`: `requirement_id`, `title`, `description`; serwer zachowuje rekord wyłącznie wtedy, gdy wskazane wymaganie ma końcowy status `partial` albo `missing`;
- `JobTailoringResult`: `message`, `rating`, `categories`, `strengths`, `priorities`, `tips`, `corrections`, `updated_cv_data`, `job_offer`, `job_requirements`, `evidence_gaps`.

`AssistantResponse` otrzyma opcjonalne pola `job_offer`, `job_requirements` i `evidence_gaps`; dla pozostałych akcji pozostaną puste, więc nie zmieniamy ich zachowania.

## 5. Nowa rubryka dopasowania

Ocena nie może zależeć od sztucznego założenia „zawsze 10 umiejętności”. Model najpierw wydziela 5–15 rzeczywistych wymagań, a Python liczy wynik z ich wag i udokumentowanego dopasowania.

| Kategoria | Maks. | Co mierzy |
| --- | ---: | --- |
| Wymagania | 4 | ważone wymagania obowiązkowe i preferowane, z dowodem w CV |
| Osiągnięcia | 2 | rezultaty, skala, metryki i wpływ biznesowy istotny dla roli |
| Odpowiedzialność | 1 | poziom własności, samodzielność i seniority bez zawyżania roli |
| Kontekst | 1 | branża, typ problemu, skala firmy/produktu/rynku |
| Klarowność | 1 | czy CV usuwa istotne niejasności: przejście, luka, krótka rola, relokacja |
| Terminologia | 1 | naturalne użycie języka oferty bez keyword stuffing |

Reguły obliczeń:

- `strong = 1`, `partial = 0.5`, `missing = 0` pomnożone przez wagę wymagania;
- wymagania obowiązkowe mają wyższą wagę niż preferowane i odpowiedzialności opisowe;
- każda ocena `strong` lub `partial` musi wskazać prawdziwy element CV/notatkę przez stabilne `evidence_refs` (`canvas:*` / `note:*`), które serwer rozwiązuje do rzeczywistego fragmentu;
- brak dowodu automatycznie obniża dopasowanie — model nie może „domyślić się” umiejętności;
- `rating` 1–10 jest zgodną wstecznie, zaokrągloną prezentacją sumy, a frontend nadal liczy procent z `categories`.

## 6. Reguły promptu dopasowującego

### 6.1. Analiza oferty

Prompt ma wydzielić i odróżnić:

- wymagania obowiązkowe;
- wymagania preferowane;
- główne odpowiedzialności i problemy do rozwiązania;
- oczekiwany poziom seniority i samodzielności;
- narzędzia, technologie, domenę, skalę i język branżowy;
- sygnały, które obniżają ryzyko zatrudnienia: podobne zadanie wykonane wcześniej, jasny wynik, wiarygodny zakres.

### 6.2. Analiza CV

Prompt ma sprawdzić:

- czy najnowsze role pokazują najbardziej relewantne dowody;
- czy punkty zaczynają się od czasowników odpowiadających realnej odpowiedzialności;
- czy obowiązki można przepisać jako osiągnięcie X / miarę Y / działanie Z na podstawie istniejących faktów;
- czy każda liczba pochodzi ze źródłowego CV lub jawnej notatki użytkownika;
- czy podsumowanie wyjaśnia zmianę roli/branży lub szybko pokazuje wartość;
- czy umiejętności są konkretne i istotne dla tej oferty;
- czy starsze doświadczenie można skrócić, zachowując chronologię i ważne fakty;
- czy dokument równoważy technikę, wpływ biznesowy i odpowiedzialność.

### 6.3. Generowanie zmian

Dozwolone:

- przeredagowanie podsumowania na podstawie istniejących faktów;
- zmiana kolejności istniejących umiejętności i usunięcie nieistotnych duplikatów;
- zmiana kolejności istniejących punktów w ramach tej samej roli;
- skrócenie mniej istotnych punktów i wzmocnienie relewantnych;
- zastąpienie ogólników naturalnym słownictwem oferty, jeżeli nie zmienia to znaczenia;
- zachowanie języka CV wykrytego przez istniejący mechanizm `cv_language`, przy polskich poradach i komunikatach UI.

Zakazane:

- dodawanie nowych liczb, technologii, certyfikatów, klientów, przychodów, rozmiaru zespołu lub rezultatów bez dowodu;
- zamiana „wspierałem” na „prowadziłem”, gdy źródło nie potwierdza własności;
- zmiana nazw stanowisk, firm, szkół, dat, linków lub danych kontaktowych;
- dodawanie `[X%]`, `TBD`, przykładowych wartości i ukrytych słów kluczowych;
- kopiowanie całych zdań z oferty jako rzekomego doświadczenia kandydata;
- tłumaczenie CV na polski, jeśli bieżące CV jest w innym obsługiwanym języku.

## 7. Walidacja uziemienia zmian

Nowy moduł `backend/app/services/job_tailoring.py` powinien walidować odpowiedź przed zwróceniem jej do UI.

Minimalne invariants:

1. `normalize_cv_data` przechodzi przed i po zmianie.
2. Imię, kontakt, linki, nazwy firm, nazwy stanowisk, szkoły, stopnie i okresy zatrudnienia są identyczne.
3. Liczby, procenty, kwoty i daty w nowej treści muszą występować w źródłowym CV albo w `candidate_notes` podanych przez użytkownika.
4. Nowa lista umiejętności jest podzbiorem/reorganizacją umiejętności źródłowych oraz faktów jawnie dodanych w `candidate_notes`.
5. Każda korekta wskazuje istniejący, edytowalny `element_id`; elementy `locked` i `fixedToPage` są odrzucane.
6. `before` zgadza się z aktualną treścią elementu — odpowiedź dotycząca starej rewizji nie może zostać zastosowana.
7. Zabronione wzorce placeholderów (`[X]`, `[N]`, `TBD`, `TODO`, `???`) powodują odrzucenie korekty.
8. `updated_cv_data` oraz `corrections` muszą opisywać ten sam zestaw zmian. Jeśli model zwróci niespójność, nie podmieniamy profilu.
9. Zmiany bez dowodu są zamieniane na `evidence_gaps`, a nie przepuszczane do kanwy.

Nie należy automatycznie „naprawiać” niewiarygodnej odpowiedzi modelu poprzez dopisanie własnej treści. Bezpieczniej zwrócić analizę, luki i polski komunikat, że część propozycji pominięto.

## 8. Bezpieczne pobieranie linków

`job_offer_url` jest wejściem do żądania sieciowego po stronie serwera, dlatego implementacja musi traktować SSRF jako wymaganie akceptacyjne.

Wymagania dla `job_offer_service.py`:

- tylko `https://`;
- brak `userinfo`, fragmentów i niestandardowych portów;
- maksymalna długość URL 2048 znaków;
- rozpoznanie DNS i odrzucenie adresów prywatnych, loopback, link-local, multicast, unspecified i zarezerwowanych dla IPv4/IPv6;
- brak automatycznego śledzenia redirectów; każdy redirect maksymalnie do 3 razy przechodzi ponowną walidację URL i DNS;
- krótki connect/read timeout, limit odpowiedzi 1 MiB i kontrola `Content-Type` (`text/html`, `application/json`);
- brak przekazywania nagłówka `Authorization`, cookies, referera lub danych użytkownika;
- brak wykonywania JavaScriptu i pobierania zasobów podrzędnych;
- logi zawierają tylko typ źródła, domenę po bezpiecznej normalizacji, status i rozmiar — nigdy pełną treść CV, ofertę, query string ani notatki kandydata;
- testy DNS rebinding/redirect-to-private w warstwie mockowanego resolvera/transportu;
- produkcyjny egress powinien dodatkowo blokować sieci prywatne niezależnie od kodu aplikacji.

Jeżeli ogólne pobieranie dowolnych domen okaże się zbyt ryzykowne dla pierwszego wdrożenia, release może zacząć od publicznych adapterów Greenhouse i Lever oraz fallbacku „wklej treść”. Nie wolno jednak przedstawiać ograniczonej wersji jako obsługującej każdy link.

## 9. Zmiany API

### 9.1. `AssistantRequest`

Rozszerzyć o:

- `job_offer_url: str = Field(default="", max_length=2048)`;
- zachować `job_description: str` jako fallback do 20 000 znaków;
- `candidate_notes: str = Field(default="", max_length=5000)`.

Walidacja dla `position_rating`:

- wymagane jest co najmniej jedno z `job_offer_url` / `job_description`;
- jeśli oba są podane, URL jest źródłem głównym, a tekst ręczny może być fallbackiem po błędzie pobrania;
- `cv_data` powinno być przesyłane, gdy dokument ma kanoniczny profil;
- `cv_language` zachowuje obecną walidację.

### 9.2. `AssistantResponse`

Dodać opcjonalne pola:

- `job_offer: ResolvedJobOffer | None`;
- `job_requirements: list[JobRequirement]`;
- `evidence_gaps: list[EvidenceGap]`;
- nadal używać `categories`, `strengths`, `priorities`, `corrections`, `updated_cv_data`.

### 9.3. Limity i rozliczenie

- Pobranie strony odbywa się po autoryzacji, walidacji uprawnienia i rezerwacji kredytów, ale przed wywołaniem modelu.
- Błąd lokalnego pobrania/parsowania zwalnia rezerwację i zwraca stabilny błąd 4xx z polskim komunikatem.
- Jeśli użytkownik podał także pełny `job_description`, błąd URL może automatycznie przejść do tego tekstu bez drugiego żądania.
- Idempotency key pozostaje jeden dla całej logicznej operacji. Replay zwraca zapisany wynik bez ponownego pobierania linku ani wywołania modelu.
- Limit requestu 1 MiB nadal obowiązuje; `job_description` nie jest już cicho obcinane do 2000 znaków w serwisie.

## 10. Zadania implementacyjne

### Zadanie 1 — testy charakteryzujące stan obecny

**Pliki:**

- `backend/tests/test_ai_assistant_schema.py`;
- `backend/tests/test_ai_assistant_request_limits.py`;
- nowy `backend/tests/test_job_tailoring.py`;
- `frontend/src/components/ai/AiAssistant/AiAssistant.test.js`.

- [ ] Zapisać test pokazujący, że obecne `position_rating` nie zwraca korekt ani profilu.
- [ ] Zapisać test pełnych 20 000 znaków oferty (bez ukrytego `[:2000]`).
- [ ] Zapisać test, że frontend dotychczas wysyła tylko opis, bez `cv_data` i URL.
- [ ] Uruchomić testy i potwierdzić oczekiwane czerwone przypadki przed implementacją.

### Zadanie 2 — bezpieczny resolver oferty

**Pliki:**

- nowy `backend/app/services/job_offer_service.py`;
- nowy `backend/tests/test_job_offer_service.py`;
- `backend/requirements.txt`;
- `backend/requirements-dev.txt`, jeżeli wymaga synchronizacji runtime.

- [x] Zaimplementować modele wyniku i stabilne kody błędów.
- [x] Zaimplementować walidację HTTPS, DNS/IP, redirectów, timeoutów, rozmiaru i typu treści.
- [x] Dodać adaptery Greenhouse i Lever.
- [x] Dodać parser JSON-LD `JobPosting` i kontrolowany fallback HTML.
- [ ] Pokryć: poprawny link, redirect, redirect prywatny, IPv4/IPv6 prywatny, za duża odpowiedź, zły MIME, 403/CAPTCHA, brak treści i fallback ręczny.

### Zadanie 3 — kontrakt i walidatory dopasowania

**Pliki:**

- nowy `backend/app/services/job_tailoring.py`;
- `backend/tests/test_job_tailoring.py`;
- `backend/app/services/cv_data.py` tylko jeśli potrzebny jest mały, współdzielony helper normalizacji.

- [x] Zdefiniować typy `JobRequirement`, `EvidenceGap`, `TailoringChange` i wynik.
- [x] Zaimplementować deterministyczne liczenie kategorii i wyniku.
- [x] Zaimplementować invariants chronionych danych, liczb, umiejętności, placeholderów i element IDs.
- [ ] Dodać testy przypadków z transkryptów: odpowiedzialność bez wyniku, prawdziwa metryka, zmiana branży, krótka rola, brakujące narzędzie, seniority bez dowodu, technika/biznes/przywództwo.

### Zadanie 4 — nowy prompt `position_rating`

**Pliki:**

- `backend/app/services/ai_assistant_service.py`;
- `backend/tests/test_job_tailoring.py`;
- `backend/tests/test_ai_content_language.py`.

- [x] Zastąpić `_rate_position` przez `_tailor_cv_to_position` przy zachowaniu akcji API.
- [x] Usunąć `_ddg_search` z tego przepływu; oferta użytkownika jest źródłem prawdy.
- [x] Przekazać pełną, znormalizowaną treść oferty do 20 000 znaków.
- [x] Dodać `cv_data`, elementy, język CV i `candidate_notes`.
- [x] Wprowadzić rubrykę oraz reguły z sekcji 6.
- [x] Dodać ścisły JSON Schema dla tej akcji oraz Pydantic/grounding po odpowiedzi.
- [x] Powiązać każdy priorytet z wymaganiem i po stronie serwera odrzucać priorytety dla wymagań `matched`.
- [x] Traktować synonimy, tłumaczenia, skróty, pojęcia nadrzędne i typowe czynności jako semantyczne odpowiedniki oraz zakazać tautologicznych przeredagowań.
- [x] Zwracać porady po polsku, a `corrections[].content` w języku CV.
- [x] Upewnić się, że prompt wyraźnie ignoruje polecenia znalezione wewnątrz oferty.

### Zadanie 5 — routing, rezerwacje i błędy

**Pliki:**

- `backend/app/api/routes/ai_assistant.py`;
- `backend/tests/test_ai_assistant_schema.py`;
- `backend/tests/test_ai_assistant_exception_handling.py`;
- `backend/tests/test_ai_credit_reservations.py`.

- [x] Rozszerzyć request/response o nowe pola.
- [x] Rozwiązać ofertę po rezerwacji, a przed `analyze_action`.
- [x] Przekazać do serwisu wyłącznie czysty tekst i metadane.
- [x] Zwalniać rezerwację przy potwierdzonym lokalnym błędzie pobrania.
- [x] Zachować idempotentny replay i settlement rzeczywistego użycia modelu.
- [ ] Zwracać polskie błędy: nieprawidłowy link, brak dostępnej treści, strona wymaga logowania, oferta wygasła, zbyt duża odpowiedź, nieobsługiwany format.

### Zadanie 6 — polski panel linku i treści oferty

**Pliki:**

- `frontend/src/components/ai/AiAssistant/AiAssistant.jsx`;
- `frontend/src/components/ai/AiAssistant/AiAssistant.module.css`;
- `frontend/src/components/ai/AiAssistant/AiAssistant.test.js`;
- opcjonalnie nowy `frontend/src/components/ai/AiAssistant/JobOfferPanel.jsx`, jeśli wydzielenie zmniejszy rozmiar obecnego komponentu.

- [x] Rozdzielić stan `jobOfferUrl`, `jobDesc` i `candidateNotes`.
- [x] Dodać walidację URL i możliwość przejścia do tekstowego fallbacku bez utraty danych.
- [x] Zmienić copy na **Przeanalizuj i przygotuj zmiany**.
- [x] Dodać dostępne etykiety, help text, błędy skojarzone z polami i `aria-live` dla stanu pracy.
- [x] Wysyłać `cv_data` i `cv_language` dla `position_rating`.
- [x] Zachować dokumentowy session guard, jeden idempotency key i blokadę podwójnego kliknięcia.
- [x] Wyczyścić cały stan oferty po zmianie dokumentu.

### Zadanie 7 — wynik dopasowania i luki dowodowe

**Pliki:**

- `frontend/src/components/ai/AiAssistant/AiAssistant.jsx` lub wydzielone komponenty;
- `frontend/src/components/ai/AiAssistant/AiAssistant.module.css`;
- nowe testy runtime Vitest/Testing Library, jeśli source-inspection nie weryfikuje zachowania.

- [x] Rozszerzyć dashboard o macierz wymagań: wymagane/preferowane, dopasowane/częściowe/brak, z tekstowym statusem obok koloru.
- [x] Pokazać metadane rozpoznanej oferty i źródło.
- [x] Wyświetlić `evidence_gaps` w sekcji **Uzupełnij, aby wzmocnić CV**.
- [x] Dodać akcję ponownej analizy z `candidate_notes`.
- [x] Zachować istniejące karty korekt, podświetlenia A4 oraz przyciski Zastosuj/Pomiń/Zastosuj wszystkie.
- [x] Po zastosowaniu wyświetlić CTA do istniejącego `ats_score`.

### Zadanie 8 — testy integracyjne UI i E2E

**Pliki:**

- `frontend/src/components/ai/AiAssistant/AiAssistant.test.js`;
- nowy test runtime komponentu;
- `frontend/e2e/support/mockApi.js`;
- nowy `frontend/e2e/job-tailoring.spec.js`.

- [ ] Link → stan ładowania → wynik → zastosowanie jednej poprawki.
- [ ] Zastosuj wszystkie aktualizuje kanwę i `activeCvData`.
- [ ] Odrzucenie wszystkich nie podmienia profilu.
- [ ] Zmiana szablonu/dokumentu w trakcie requestu odrzuca spóźnioną odpowiedź.
- [ ] Nieudany link zachowuje wpisane dane i pokazuje fallback wklejenia.
- [ ] Klawiatura, focus-visible, Escape, przywrócenie fokusu, 200% zoom, mały ekran i reduced motion.
- [ ] Brak poziomego overflow; panel na compact pozostawia bieżące zadanie i kanwę używalne zgodnie z `DESIGN.md`.

### Zadanie 9 — regresja ATS po dopasowaniu

**Pliki:**

- `backend/tests/test_ats_readability.py`;
- `frontend/src/utils/atsScore.test.js`;
- `frontend/src/components/ai/AiAssistant/AiAssistant.jsx`.

- [x] Po zastosowaniu dopasowania umożliwić uruchomienie realnego `ats_score` jednym kliknięciem.
- [x] Nie łączyć oceny dopasowania z czytelnością ATS w jeden mylący procent.
- [x] Jeśli render/ekstrakcja wskazuje problem, rekomendować szablon o lepszej czytelności ATS bez automatycznej zmiany szablonu.
- [x] Sprawdzić, że poprawki nie wprowadzają ukrytego tekstu, tabel ani treści poza stroną.

### Zadanie 10 — dokumentacja i przegląd końcowy

**Pliki:**

- `README.md` — kompletna, równoważna sekcja EN i PL;
- `docs/AI_IMPLEMENTATION_README.md`;
- `docs/FEATURES.md`;
- `docs/PROMPTS.md` generowany przez `scripts/generate_prompts_md.py`;
- `backend/requirements.txt` i dokumentacja instalacji zależności.

- [x] Zaktualizować przepływ użytkownika, architekturę, API, bezpieczeństwo SSRF, limity, zależności i testy.
- [x] Zweryfikować i dopiero po finalnych zmianach wpisać aktualne zakresy linii oraz symbole w obu językach README.
- [x] Dodać oficjalne źródła do Structured Outputs, Greenhouse Job Board API, Lever Postings API i OWASP SSRF.
- [x] Uruchomić `python scripts/generate_prompts_md.py` i przejrzeć diff.
- [x] Sprawdzić brak sekretów, treści CV, ofert i pełnych URL-i w logach oraz fixture'ach.

## 11. Pliki objęte planem

### Backend

- `backend/app/services/ai_assistant_service.py` — prompt, dispatch, schema-aware `_gpt`.
- `backend/app/services/job_offer_service.py` — nowy, bezpieczny resolver linków.
- `backend/app/services/job_tailoring.py` — nowa rubryka, scoring i grounding.
- `backend/app/api/routes/ai_assistant.py` — kontrakt request/response i obsługa resolvera.
- `backend/requirements.txt` — klient HTTP i parser HTML.
- testy `test_job_offer_service.py`, `test_job_tailoring.py` oraz rozszerzenia istniejących testów AI/ATS/kredytów.

### Frontend

- `frontend/src/components/ai/AiAssistant/AiAssistant.jsx` — wejście URL/tekst/notatki, wynik i CTA.
- `frontend/src/components/ai/AiAssistant/AiAssistant.module.css` — wszystkie stany zgodne z tokenami.
- opcjonalny wydzielony `JobOfferPanel.jsx` / `JobRequirementMatrix.jsx` po przekroczeniu rozsądnego rozmiaru komponentu.
- testy jednostkowe, runtime i E2E.

### Dokumentacja

- `README.md` EN + PL;
- `docs/AI_IMPLEMENTATION_README.md`;
- `docs/FEATURES.md`;
- `docs/PROMPTS.md`.

## 12. Kryteria akceptacji

Funkcja jest gotowa dopiero, gdy:

- [ ] użytkownik może wkleić typowy publiczny link Greenhouse/Lever lub bezpiecznie obsłużoną stronę ogólną;
- [ ] przy nieobsługiwanym linku może wkleić treść bez utraty danych;
- [ ] cała oferta do limitu jest analizowana, bez cichego obcięcia do 2000 znaków;
- [ ] UI i porady są po polsku, a poprawiona treść pozostaje w spójnym języku CV;
- [ ] wynik odróżnia wymagania obowiązkowe, preferowane i odpowiedzialności;
- [ ] każda mocna strona ma dowód w CV, a każdy brak bez dowodu pozostaje luką;
- [ ] system nie dopisuje nowych liczb, kompetencji, stanowisk, firm, dat ani placeholderów;
- [ ] poprawki są widoczne Przed/Po, można je stosować pojedynczo lub zbiorczo, pominąć i cofnąć;
- [ ] `activeCvData` oraz kanwa pozostają spójne po zastosowaniu;
- [ ] wynik dopasowania i czytelność ATS są dwoma osobnymi, jasno nazwanymi pomiarami;
- [ ] link fetcher przechodzi testy SSRF, redirectów, rozmiaru, timeoutów i MIME;
- [ ] brak CV/oferty/notatek użytkownika w logach;
- [ ] wszystkie stany UI spełniają `DESIGN.md`: default, hover, active, focus-visible, disabled, loading, empty, validation, error, success i responsive;
- [ ] testy backendu, frontend `npm test`, runtime Vitest, lint, build i reprezentatywny Playwright są zielone;
- [ ] README w języku angielskim i polskim, dokumentacja AI i `docs/PROMPTS.md` odpowiadają finalnemu kodowi.

## 13. Kolejność wdrożenia i punkty kontrolne

1. **Backend bez UI:** resolver + schema + rubryka + grounding + testy.
2. **Kompatybilny endpoint:** rozszerzony `position_rating`, rozliczenia i polskie błędy.
3. **UI wejścia:** URL/tekst/notatki wraz ze stanami dostępności.
4. **UI wyniku:** wymagania, luki i istniejące karty poprawek.
5. **Zastosowanie i ATS:** profil/kanwa/undo oraz CTA do realnego testu PDF.
6. **E2E i security review:** mockowane źródła, SSRF, prompt injection, spóźnione odpowiedzi.
7. **Dokumentacja EN/PL i pełna weryfikacja.**

Po każdym punkcie kontrolnym kod ma pozostać wdrażalny. Nie należy łączyć fetchera URL, promptu, UI i dokumentacji w jeden nieprzeglądalny commit.

## 14. Poza pierwszym wdrożeniem

- trwałe zapisywanie oferty i historii kilku dopasowanych wersji w bazie;
- automatyczne tworzenie kopii dokumentu „CV — Firma — Stanowisko”;
- obsługa stron wymagających logowania lub renderowania pełną przeglądarką;
- automatyczne aplikowanie na ofertę;
- gwarancja zgodności z każdym ATS;
- zmiana całego szablonu bez potwierdzenia użytkownika.

Te rozszerzenia mogą powstać później. Pierwsze wdrożenie ma przede wszystkim bezpiecznie poprawić aktualne CV na podstawie jednej oferty, zachować kontrolę użytkownika i wykorzystać istniejące możliwości CV Studio.
