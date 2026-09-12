# English

## Automatic fitting after the interview

The interview still drafts, edits and independently verifies CV content. Pipeline version 5 then fits a multi-page result before showing it. A one-page result needs no page-reduction pass. Source documents, profile facts and full answers remain unchanged.

1. `initialise_fit` saves the verified preview and spacing in `InterviewSession.state.fit_original`. `preview.fit.status=pending` blocks final document creation.
2. An explicit preview action calls `completeInterviewFit` in the browser. It loads the document fonts and measures actual textarea wraps through `resolveBrowserTextLayouts`. It uses the existing template-specific S transactions and structural packer; no new renderer or runtime dependency is introduced. If the required font cannot be measured, fitting retains the server layout without paid shortening.
3. `prepareInterviewFit` tries current typography and spacing, then S when necessary. The automatic spacing floor is the existing compact preset (stack 3, record 7, section 15, after-rule 6), bounded by the supplied baseline. It chooses the loosest fitting candidate. After each content rewrite it retries the original generated typography, so successful shortening can recover larger text and spacing.
4. Page goals are progressive: 3 to 2, then possibly 2 to 1. A failed goal keeps the best measured page count. Remaining pages are balanced by trying earlier page breaks while retaining whole records and section-heading/first-record grouping. Balance preserves reading order and never adds a page. It may leave unequal pages when record sizes prevent a better division.
5. If the layout still overflows, the browser estimates required reduction as spill height divided by editable prose height in the bottleneck column. Fixed decoration, headers, locked framing and unrelated text do not count as editable prose. Mixed-bullet textareas contribute only their editable text fraction. This is a heuristic, not proof that prose can be shortened without losing meaning.

| Initial required reduction | Maximum shortening attempts |
| --- | --- |
| More than 0%, up to 10% | 1 |
| More than 10%, up to 25% | 2 |
| More than 25%, up to 30% | 3 |
| More than 30%, or no editable prose | 0 |

The server enforces the attempt limit across the entire fit. It stops when measured editable height improves by less than 3%, a candidate is unchanged or longer, factual verification rejects any part, credits are exhausted, or 600 seconds have elapsed since fit initialisation. The time limit prevents starting a new paid pair; it does not interrupt an already running provider call. Existing provider timeouts still apply. These thresholds are initial product heuristics and need calibration with more representative documents.

## Factual protection and recovery

`fit-shorten-N` rewrites eligible prose paths while preserving evidence references. Identity, dates, employers, role titles, skill levels, section placement and explicitly approved framing are not editable. The lexical guard checks protected tokens and placeholders. `fit-verify-N` independently compares the proposal with both the original verified descriptions and raw evidence, including negations, qualifications and responsibility. Any reported loss rejects the whole candidate. Model verification is a safeguard, not a mathematical guarantee of semantic equivalence.

Every paid pair uses the existing versioned generation attempt and durable reservation cache. A verification failure can reuse completed shortening on an explicit retry without a second shortening charge. Failed stages remain visible in the ledger. The browser never retries a paid request automatically. Reads, navigation and saving answers do not start fitting. A pending result reopens preparation with **Resume CV fitting** and **Restore version before fitting**. A manual preview correction invalidates the earlier restore point and permits only free layout work.

The server validates browser elements through `PdfElement`: required flowing IDs and content must survive; structure and non-geometric styles remain unchanged; duplicate IDs, added prose, hidden/deleted text, nonfinite coordinates and out-of-page text are rejected. Reconciled fixed page decoration is allowed. The browser does not become a source of career facts. Geometry validation complements the shared packer; it is not an independent typographic or overlap solver.

Finalisation persists the selected `cv_data`, `changes`, `elements`, `pages` and `spacing_px` together. The existing document-save endpoint consumes that snapshot. `fit_best` retains a measured candidate if a later rewrite increases page count; `fit_original` remains the free restore point until another generation/review replaces it. Both use existing session JSON, without tables, migrations or new environment variables. They follow existing interview access, export, retention and deletion rules.

## API and deployment

`POST /ai/interviews/{session_id}/preview-fit` requires the authenticated owner, matching `revision`, `profile_revision`, `evidence_scope`, and a current verified preview. Its handler is `fit_interview_preview`; domain logic is `fit_preview`.

```json
{
  "revision": 7,
  "profile_revision": 2,
  "evidence_scope": "session",
  "action": "restore"
}
```

For `shorten` and `finish`, send the complete measured `elements` array and `spacing_px`; `shorten` also sends `target_pages`, `required_reduction` (0–1) and `editable_height` (A4 layout points, 0–20000). Collection size is capped at 1000 elements and target pages at 20. `restore` requires no geometry. `shorten` returns the updated session with a verified candidate or a stop decision; `finish` returns the complete session with `preview.fit.status=complete`; `restore` returns `status=restored`. The response retains the ordinary session shape, including the next revision. A client must use each returned revision for the next write.

Success is HTTP 200; invalid payload/layout is 422; stale state, a non-pending fit or attempted save of a pending result is 409; another owner's/missing session is 404; unauthenticated calls use the existing authentication error. Provider failures keep the established error response and saved preview. Optional-fit credit exhaustion ends shortening and allows free finalisation. Charges are read through the existing `/credits` endpoint as `shorten` and `fit_verify` stages.

Deploy backend before frontend. Old clients cannot save a new pending multi-page preview; an old backend cannot serve the new fit endpoint. Roll back the pair together. Existing saved previews/documents remain readable. No Node runtime is needed on the Python server. Browser preview requests keep the 1,680,000 ms timeout; one shortening pair has 1,140,000 ms; other requests retain 180,000 ms. These are transport upper bounds, not completion estimates.

## Tests and implementation

- `backend/app/services/interview_fit.py`: baseline, validation, bounds, paid stages and atomic finalisation.
- `frontend/src/utils/interviewFit.js`: measured fitting, progressive goals, balance and browser orchestration.
- `backend/tests/test_interview_fit.py`: ownership, revisions, content guards, semantic rejection, limits, restore and replayed billing.
- `frontend/src/utils/interviewFit.test.js`: measurable prose, lifecycle cancellation and revision propagation.
- `frontend/e2e/interview-fit.spec.js` and `fixtures/interview-fit.json`: synthetic generated Linden content, interrupted persistence, free restore, keyboard actions, PL/EN, 390/834/1280/1920 px, 200% text zoom and reduced motion. Mocked providers do not establish live AI quality.

From `backend`, run `.venv/Scripts/python.exe -m pytest tests/test_interview_fit.py tests/test_interview_editorial.py tests/test_interview_credits.py`. From `frontend`, run `npm test`, `npm run test:runtime`, `npm run test:e2e -- e2e/interview-fit.spec.js --project=desktop-chromium`, `npm run lint`, and `npm run build`. The README contains verified source line references and the full project setup.

[Font loading and layout readiness](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready) explains when browser font metrics are available. [Loading the required font faces](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load) explains the explicit font load used before measurement. [Pydantic models](https://github.com/pydantic/pydantic/blob/main/docs/concepts/models.md) describes validation at the API boundary.

---

# Polski

## Automatyczne dopasowanie po wywiadzie

Wywiad nadal tworzy, redaguje i niezależnie weryfikuje treść CV. Wersja procesu 5 dopasowuje następnie wielostronicowy wynik przed jego pokazaniem. Wynik jednostronicowy nie potrzebuje próby zmniejszenia liczby stron. Dokument źródłowy, fakty profilu i pełne odpowiedzi pozostają niezmienione.

1. `initialise_fit` zapisuje zweryfikowany podgląd i odstępy w `InterviewSession.state.fit_original`. `preview.fit.status=pending` blokuje utworzenie dokumentu końcowego.
2. Jawna akcja przygotowania podglądu uruchamia `completeInterviewFit` w przeglądarce. Ładuje czcionki dokumentu i mierzy rzeczywiste zawinięcia pól przez `resolveBrowserTextLayouts`. Korzysta z istniejących transakcji wariantu S każdego szablonu i mechanizmu układania rekordów; nie wprowadza nowego renderera ani zależności wykonawczej. Gdy nie można zmierzyć wymaganej czcionki, dopasowanie zachowuje układ serwera bez płatnego skracania.
3. `prepareInterviewFit` próbuje bieżącej typografii i odstępów, a następnie w razie potrzeby S. Automatycznym minimum jest istniejący wariant kompaktowy (stos 3, rekord 7, sekcja 15, odstęp za linią 6), ograniczony przekazaną bazą. Wybiera największe odstępy zapewniające dopasowanie. Po każdej zmianie treści ponownie próbuje początkowej wygenerowanej typografii, dzięki czemu skuteczne skrócenie pozwala odzyskać większy tekst i odstępy.
4. Cele są stopniowe: 3 do 2, następnie ewentualnie 2 do 1. Nieudana próba zachowuje najlepszą zmierzoną liczbę stron. Pozostałe strony są wyrównywane przez próby wcześniejszych podziałów z zachowaniem całych rekordów i grup nagłówek/pierwszy rekord. Wyrównanie zachowuje kolejność czytania i nigdy nie dodaje strony. Strony mogą pozostać nierówne, gdy rozmiary rekordów nie pozwalają na lepszy podział.
5. Jeżeli układ nadal przekracza cel, przeglądarka szacuje wymaganą redukcję jako wysokość nadmiaru podzieloną przez wysokość edytowalnych opisów w ograniczającej kolumnie. Stałe dekoracje, nagłówki, zatwierdzone dosłowne sformułowania i niepowiązany tekst nie są edytowalnymi opisami. Pole łączące kilka punktów wnosi tylko edytowalną część tekstu. Jest to heurystyka, a nie dowód możliwości skrócenia bez utraty znaczenia.

| Początkowa wymagana redukcja | Maksymalna liczba prób skracania |
| --- | --- |
| Powyżej 0%, do 10% | 1 |
| Powyżej 10%, do 25% | 2 |
| Powyżej 25%, do 30% | 3 |
| Powyżej 30% albo brak edytowalnych opisów | 0 |

Serwer egzekwuje limit prób w całym dopasowaniu. Kończy skracanie, gdy zmierzona wysokość opisów poprawi się o mniej niż 3%, propozycja jest identyczna lub dłuższa, weryfikacja odrzuci dowolny fragment, zabraknie kredytów albo od inicjalizacji dopasowania minie 600 sekund. Limit czasu blokuje rozpoczęcie kolejnej płatnej pary; nie przerywa już działającego wywołania dostawcy. Nadal obowiązują istniejące limity dostawcy. Progi są początkowymi heurystykami produktu i wymagają kalibracji na kolejnych reprezentatywnych dokumentach.

## Ochrona faktów i odzyskiwanie

`fit-shorten-N` redaguje dozwolone ścieżki opisów z zachowaniem odwołań do źródeł. Dane osobowe, daty, pracodawcy, stanowiska, poziomy umiejętności, położenie sekcji i jawnie zatwierdzone dosłowne sformułowania nie są edytowalne. Kontrola leksykalna sprawdza chronione tokeny i placeholdery. `fit-verify-N` niezależnie porównuje propozycję z pierwotnymi zweryfikowanymi opisami i surowymi źródłami, uwzględniając negacje, zastrzeżenia i odpowiedzialność. Każda zgłoszona strata odrzuca cały wariant. Weryfikacja modelowa jest zabezpieczeniem, a nie matematyczną gwarancją równoważności znaczeniowej.

Każda płatna para używa istniejącej wersjonowanej próby generacji i trwałej pamięci rezerwacji. Po błędzie weryfikacji jawne ponowienie może wykorzystać ukończone skracanie bez kolejnej opłaty za ten etap. Nieudane etapy pozostają widoczne w rejestrze. Przeglądarka nigdy automatycznie nie ponawia płatnego żądania. Odczyt, nawigacja i zapis odpowiedzi nie rozpoczynają dopasowania. Niedokończony wynik otwiera przygotowanie z akcjami **Wznów dopasowanie CV** i **Przywróć wersję sprzed dopasowania**. Ręczna poprawka podglądu unieważnia poprzedni punkt przywracania i dopuszcza wyłącznie bezpłatną zmianę układu.

Serwer waliduje elementy przeglądarki przez `PdfElement`: wymagane identyfikatory i treść elementów przepływu muszą pozostać; struktura i style niezwiązane z geometrią nie mogą się zmienić; powtórzone identyfikatory, dodany tekst, ukryta/usunięta treść, niefinitywne współrzędne i tekst poza stroną są odrzucane. Dozwolone jest uzgodnienie stałych dekoracji stron. Przeglądarka nie staje się źródłem faktów zawodowych. Walidacja geometrii uzupełnia wspólny mechanizm układania; nie jest niezależnym systemem oceny typografii ani wykrywania nakładania elementów.

Finalizacja zapisuje wybrane `cv_data`, `changes`, `elements`, `pages` i `spacing_px` razem. Istniejący endpoint zapisu dokumentu korzysta z tego stanu. `fit_best` zachowuje zmierzony wariant, jeżeli późniejsza redakcja zwiększy liczbę stron; `fit_original` pozostaje bezpłatnym punktem przywracania do następnej generacji/przeglądu. Oba pola korzystają z istniejącego JSON sesji, bez tabel, migracji i nowych zmiennych środowiskowych. Podlegają obecnym zasadom dostępu, eksportu, retencji i usuwania wywiadów.

## API i wdrożenie

`POST /ai/interviews/{session_id}/preview-fit` wymaga zalogowanego właściciela, zgodnych `revision`, `profile_revision`, `evidence_scope` oraz aktualnego zweryfikowanego podglądu. Handler to `fit_interview_preview`, a logika domenowa to `fit_preview`.

```json
{
  "revision": 7,
  "profile_revision": 2,
  "evidence_scope": "session",
  "action": "restore"
}
```

Dla `shorten` i `finish` należy przesłać pełną tablicę zmierzonych `elements` oraz `spacing_px`; `shorten` przekazuje też `target_pages`, `required_reduction` (0–1) i `editable_height` (punkty układu A4, 0–20000). Limit kolekcji to 1000 elementów, a celu 20 stron. `restore` nie potrzebuje geometrii. `shorten` zwraca zaktualizowaną sesję ze zweryfikowanym wariantem lub decyzją o zatrzymaniu; `finish` zwraca całą sesję z `preview.fit.status=complete`; `restore` zwraca `status=restored`. Odpowiedź zachowuje zwykły format sesji, łącznie z następną rewizją. Klient musi użyć każdej zwróconej rewizji przy następnym zapisie.

Sukces to HTTP 200; błędny payload/układ to 422; nieaktualny stan, zakończone dopasowanie lub próba zapisania niedokończonego wyniku to 409; cudza/brakująca sesja to 404; brak uwierzytelnienia korzysta z istniejącego błędu logowania. Błędy dostawcy zachowują dotychczasową odpowiedź i zapisany podgląd. Brak kredytów na opcjonalne dopasowanie kończy skracanie i pozwala na bezpłatną finalizację. Opłaty są odczytywane przez istniejący endpoint `/credits` jako etapy `shorten` i `fit_verify`.

Wdrażaj backend przed frontendem. Stary klient nie zapisze nowego niedokończonego wielostronicowego podglądu; stary backend nie obsłuży nowego endpointu. Wycofuj oba składniki razem. Istniejące podglądy i dokumenty pozostają czytelne. Serwer Python nie wymaga Node. Żądania podglądu zachowują limit przeglądarki 1 680 000 ms; jedna para skracania ma 1 140 000 ms; pozostałe żądania zachowują 180 000 ms. Są to górne granice transportu, a nie prognozy czasu ukończenia.

## Testy i implementacja

- `backend/app/services/interview_fit.py`: baza, walidacja, limity, płatne etapy i atomowa finalizacja.
- `frontend/src/utils/interviewFit.js`: mierzone dopasowanie, stopniowe cele, wyrównanie i koordynacja przeglądarkowa.
- `backend/tests/test_interview_fit.py`: własność, rewizje, ochrona treści, odrzucanie utraty znaczenia, limity, przywracanie i rozliczenia ponowień.
- `frontend/src/utils/interviewFit.test.js`: mierzalne opisy, anulowanie wraz z cyklem życia i przekazywanie rewizji.
- `frontend/e2e/interview-fit.spec.js` oraz `fixtures/interview-fit.json`: syntetyczna wygenerowana treść Linden, przerwany zapis, bezpłatne przywracanie, klawiatura, PL/EN, 390/834/1280/1920 px, powiększenie tekstu 200% i ograniczenie animacji. Atrapy dostawców nie potwierdzają jakości rzeczywistego AI.

W `backend` uruchom `.venv/Scripts/python.exe -m pytest tests/test_interview_fit.py tests/test_interview_editorial.py tests/test_interview_credits.py`. W `frontend` uruchom `npm test`, `npm run test:runtime`, `npm run test:e2e -- e2e/interview-fit.spec.js --project=desktop-chromium`, `npm run lint` i `npm run build`. README zawiera zweryfikowane odwołania do linii źródeł i pełną konfigurację projektu.

[Gotowość czcionek i układu](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready) wyjaśnia dostępność metryk przeglądarki. [Ładowanie wymaganych krojów](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load) opisuje jawne ładowanie przed pomiarem. [Modele Pydantic](https://github.com/pydantic/pydantic/blob/main/docs/concepts/models.md) opisują walidację na granicy API.
