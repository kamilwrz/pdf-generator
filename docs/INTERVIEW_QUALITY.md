# English

## Adaptive interview and review of the resulting CV

Creation and enrichment start with the selected CV, not a blank questionnaire. `interview_quality.adaptive_entries` prioritises work experience, projects, skills, contextual notes, education and missing language levels. Authored order within a section is retained; the scheduler does not infer dates, seniority or a target profession. Missing-section invitations come after populated records. Tailoring retains its separate offer-analysis policy: two questions per unresolved requirement.

The initial creation/enrichment round has at most eight main questions and ten discovery answers including follow-ups. Each job/project/contextual note allows two main questions; education, skills, missing language levels and general invitations allow one. Each scope can receive one focused follow-up. A follow-up cannot itself be followed up. Explicitly extending adds five main and five total slots, within the shared ceiling of 50 saved answers. The total ceiling includes verification clarifications; those do not consume main-question slots. Source refresh and additional facts do not extend the round. Older sessions retain their saved answers; budgets initialise at least to their existing answer counts.

`discovery_round_complete` means the current round has ended; `discovery_complete` means there are no available scopes or the shared ceiling is exhausted. The former can offer an explicit extension while keeping CV preparation available. `planned_question_count` reports the current reachable maximum, including optional probes, rather than promising that every slot will be used.

### How an answer affects the next question

1. `/answers` persists the exact submitted text and its selected status before any AI work. `answer_meaning` records an explicit standalone equivalent such as “I don't remember” (`unknown`), “I have no experience” (`no_experience`) or “not applicable” (`skipped`). Unknown and skipped meanings create no career fact. A longer answer containing uncertainty is retained without a substring-based classification.
2. The existing `/next` call can return `answer_assessment:{question_id,status,missing_detail}`. Status is `concrete`, `partial`, `off_topic`, `contradictory` or `unknown`. Only the last ordinary answered question can be assessed. Partial/off-topic/contradictory assessments need a nonblank missing detail and reserve a focused probe when its parent remains eligible. Shortness, spelling and informal language are not criteria for rejection.
3. `completed_scopes:[{entry_id,evidence_refs,reason}]` can close sufficiently described entries. The server checks IDs, a nonempty explanation, current fact references and at least one reference belonging to the entry or its answer. A still-incomplete answer cannot close its scope. Completion is bound to a digest of the record and cited facts; editing or removing that evidence reopens it. It never modifies career facts.
4. After validated assessments, the server selects the first remaining scope. Invalid, repeated or wrongly scoped questions receive a local fallback without another paid request. Historical outputs without assessment cannot claim completeness; an explicitly grounded historical follow-up still uses the existing repetition checks.

For example, “with the appropriate institutions” does not name a partner. A probe can ask for one institution. “By telephone” can be a complete answer about the communication channel. These are test examples, not candidate facts or suggested answers to copy into a CV.

### Grounding and concise writing

Each generated scalar still cites confirmed evidence. Date fields must contain a date explicitly stated together in a cited fact: numbers scattered across unrelated tasks do not establish an attendance period. Semantic verification additionally checks countries, institutions, qualifications, professional status and responsibility boundaries. A citation existing is not proof that its text supports every claim; semantic review and the user's final inspection remain necessary.

Generation pipeline version **4** retains drafting, separate style editing and independent factual verification. The prompts select useful additions, preserve distinct original facts, avoid duplicating educational declarations across sections, keep a consistent grammatical form and favour short standalone bullets. Uncertain proficiency is not automatically upgraded or downgraded. No page-count target removes facts or shrinks the font.

`prepare_editorial_draft` replaces the initial colon in generated flat skill units with a display dash (except literal approved framing). This preserves “PowerPoint — presentations about projects, analyses and cooperation” as one list item through the legacy category normaliser, rather than splitting dependent clauses at commas. It does not merge arbitrary model-generated fragments or repair historical PDFs automatically. The source CV and raw answers remain unchanged.

### Correct or reject a preview suggestion

In **Result → Changes**, review the original, new text and cited information. **Edit this suggestion** opens one labelled full-text form. Confirming stores that complete replacement as a cited `framing` fact in the selected session/profile store and regenerates layout locally. It does not overwrite source CV fields. Identity/contact edits stay in the existing source editor. **Reject this suggestion** restores the original field or omits the addition; rejecting a generated record identity also removes dependent generated fields. Rejecting an earlier human replacement removes its now-unused review fact.

The form uses existing Swiss tokens and native controls in both the standalone page and embedded assistant. Keyboard focus enters the textarea; Escape/Cancel restores the edit button. Open drafts block stage changes, record selection, pagination and final saving. Requests disable duplicate actions and preserve the draft on failure. Successful decisions return to the result with a polite status message. These operations make no AI call and create no credit reservation. PDF geometry is regenerated by the existing template renderer; review controls and metadata never enter PDF elements.

### API, persistence and deployment

`POST /ai/interviews/{id}/preview-review` requires the authenticated owner, a current `preview` phase, matching session/profile/source revisions and an existing proposed field path.

```json
{"evidence_scope":"session","revision":7,"profile_revision":3,
 "path":"/summary","value":"Collected departmental comments without drafting the substantive position."}
```

Send `value:null` to reject the proposal. A replacement is a nonblank string of at most 4,000 characters; the path is at most 200 characters and must be present in the preview changes. Success returns the updated session, preview, page count, citations and revision (200). Unauthenticated requests use the existing authentication error; absent/foreign sessions return 404. Stale revisions, unavailable proposals or an invalid phase return 409. Invalid input, identity editing or invalid CV content returns 422. Failed rendering/persistence retains the previous committed preview; load saved state after an uncertain network response. A stale repeat is rejected rather than applying twice. Saving a document remains a separate explicit operation with existing entitlement checks.

The additions use existing `interview_sessions.state` JSON: `discovery_limit`, `discovery_main_limit`, `discovery_round_complete`, `scope_reviews`, and per-answer `assessment`/`answer_meaning`. Human replacements use existing career-fact storage with source `interview:{id}:review`. No table, migration, environment variable or dependency is added. Account export/deletion and session isolation retain their current boundaries. Deploy the backend before the frontend. Rollback preserves JSON/history, but an older frontend cannot expose preview review and an older backend lacks this endpoint. Previously generated previews stay readable; version-4 generation does not reuse earlier-policy stages.

### Tests and limitations

Run in `backend/`: `python -m pytest tests/test_interview_quality.py tests/test_interview_discovery.py tests/test_interview_questions.py tests/test_interviews.py tests/test_interview_editorial.py tests/test_interview_recovery.py -q`.

Run in `frontend/`: `npm run test:runtime -- src/components/ai/Interview`, `npm run test:e2e -- e2e/interview-quality.spec.js e2e/interview-workspace.spec.js --project=desktop-chromium --workers=1`, `npm test`, `npm run lint`, and `npm run build`. Tests use the configured scripts; when npm is unavailable the bundled Node runtime can invoke their corresponding local entry points directly.

The controlled fixtures cover formal/colloquial/short answers, uncertainty, contradictions, unavailable evidence, one probe per scope, finite rounds, resume, stale writes, source preservation, skill units and free preview decisions in both evidence scopes. Browser tests cover PL/EN, 390/834/1280/1920px, 200% text size at 834px, reduced motion, keyboard focus and failure recovery. Mocked semantic assessments validate orchestration, not the live model's accuracy. Live acceptance should compare useful supported facts per question, duplicate questions, preservation of responsibility limits and unsupported additions using a fixed fictional fact sheet. Real-user interviews are still needed to measure question comprehension and effort; no such study is claimed here.

- [Pydantic field constraints and defaults](https://docs.pydantic.dev/latest/concepts/fields/) explain bounded input and compatibility with missing historical fields.
- [pytest mocking](https://docs.pytest.org/en/stable/how-to/monkeypatch.html) explains isolating external dependencies in regression tests.

---

# Polski

## Adaptacyjny wywiad i przegląd wynikowego CV

Tworzenie i uzupełnianie zaczyna się od wybranego CV. `interview_quality.adaptive_entries` nadaje pierwszeństwo doświadczeniu zawodowemu, projektom, umiejętnościom, notatkom z kontekstem, edukacji i brakującym poziomom języka. Zachowuje kolejność autora wewnątrz sekcji; nie wywnioskuje dat, seniority ani zawodu docelowego. Pytania o nieobecne sekcje pojawiają się po istniejących wpisach. Dopasowanie zachowuje osobną politykę analizy oferty: dwa pytania na nierozstrzygnięte wymaganie.

Pierwsza runda tworzenia/uzupełniania obejmuje najwyżej osiem pytań głównych i dziesięć odpowiedzi zwykłego wywiadu wraz z dopytaniami. Każda rola/projekt/notatka z kontekstem ma dwa pytania główne; edukacja, umiejętności, brakujący poziom języka i ogólne zaproszenia mają jedno. Każdy zakres może otrzymać jedno celne dopytanie. Nie można dopytywać do dopytania. Jawne przedłużenie dodaje pięć miejsc głównych i pięć łącznych, do wspólnego maksimum 50 zapisanych odpowiedzi. To maksimum obejmuje doprecyzowania weryfikacyjne, które nie zużywają miejsc pytań głównych. Odświeżenie źródła i nowe fakty nie przedłużają rundy. Starsze sesje zachowują odpowiedzi; inicjalizowane limity są co najmniej równe liczbie już zapisanych odpowiedzi.

`discovery_round_complete` oznacza koniec bieżącej rundy; `discovery_complete` oznacza brak dostępnych zakresów albo wyczerpanie wspólnego maksimum. Po zakończeniu rundy można jawnie ją przedłużyć lub przygotować CV. `planned_question_count` pokazuje bieżące osiągalne maksimum z opcjonalnymi dopytaniami, bez obietnicy wykorzystania każdego miejsca.

### Wpływ odpowiedzi na następne pytanie

1. `/answers` zapisuje dokładny tekst i wybrany status przed pracą AI. `answer_meaning` rozpoznaje jawne samodzielne odpowiedniki: „nie pamiętam” (`unknown`), „nie mam doświadczenia” (`no_experience`) i „nie dotyczy” (`skipped`). Niepamiętanie i pominięcie nie tworzą faktu zawodowego. Dłuższa odpowiedź z niepewnością pozostaje zachowana bez klasyfikowania jej na podstawie wystąpienia fragmentu tekstu.
2. Istniejące `/next` może zwrócić `answer_assessment:{question_id,status,missing_detail}`. Status to `concrete`, `partial`, `off_topic`, `contradictory` albo `unknown`. Ocena dotyczy tylko ostatniego zwykłego pytania z odpowiedzią. Ocena częściowa, omijająca temat lub sprzeczna wymaga niepustego opisu braku i rezerwuje dopytanie, gdy pytanie źródłowe nadal się kwalifikuje. Krótkość, pisownia i potoczność nie są powodem odrzucenia.
3. `completed_scopes:[{entry_id,evidence_refs,reason}]` może zakończyć dostatecznie opisane wpisy. Serwer sprawdza identyfikatory, niepuste uzasadnienie, aktualne fakty i przynajmniej jedno odwołanie należące do wpisu lub jego odpowiedzi. Nadal niepełna odpowiedź nie może zamknąć zakresu. Zakończenie wiąże się z odciskiem wpisu i cytowanych faktów; ich zmiana lub usunięcie ponownie otwiera zakres. Ocena nie zmienia faktów zawodowych.
4. Po walidacji ocen serwer wybiera pierwszy pozostały zakres. Błędne, powtórzone lub źle przypisane pytanie otrzymuje lokalny zamiennik bez kolejnego płatnego żądania. Starsze wyniki bez oceny nie dowodzą kompletności; jawne, osadzone w danych starsze dopytanie nadal podlega dotychczasowym kontrolom powtórzeń.

Przykładowo „z właściwymi instytucjami” nie podaje partnera. Dopytanie może poprosić o jedną instytucję. „Telefonicznie” może w pełni odpowiedzieć o kanał komunikacji. To przykłady testowe, a nie fakty kandydata ani sugerowane odpowiedzi do skopiowania do CV.

### Źródła i zwięzła redakcja

Każde generowane pole nadal wskazuje potwierdzone źródła. Pole daty musi zawierać datę podaną razem w cytowanym fakcie: liczby rozproszone w opisach innych czynności nie ustalają okresu nauki. Weryfikacja znaczenia dodatkowo sprawdza państwa, instytucje, kwalifikacje, status zawodowy i granice odpowiedzialności. Samo istnienie odwołania nie dowodzi poparcia każdego twierdzenia; potrzebna pozostaje kontrola znaczenia i końcowy przegląd użytkownika.

Wersja **4** generowania zachowuje przygotowanie treści, osobną redakcję i niezależną weryfikację faktów. Prompty wybierają przydatne dodatki, zachowują odrębne pierwotne fakty, ograniczają powielanie deklaracji z edukacji między sekcjami, utrzymują spójną formę gramatyczną i preferują krótkie samodzielne punkty. Niepewny poziom kompetencji nie jest automatycznie podnoszony ani obniżany. Docelowa liczba stron nie usuwa faktów ani nie zmniejsza czcionki.

`prepare_editorial_draft` zastępuje pierwszy dwukropek w generowanej płaskiej pozycji umiejętności myślnikiem, z wyjątkiem dosłownie zatwierdzonego `framing`. Zachowuje to „PowerPoint — prezentacje dotyczące projektów, analiz i współpracy” jako jeden element po przejściu przez starszy normalizator kategorii, zamiast dzielić zależne fragmenty przecinkami. Nie scala dowolnych fragmentów wygenerowanych przez model i nie naprawia automatycznie historycznych PDF-ów. CV źródłowe i surowe odpowiedzi pozostają niezmienione.

### Poprawianie lub odrzucanie propozycji

W **Wynik → Zmiany** porównaj oryginał, propozycję i przywołane informacje. **Popraw tę propozycję** otwiera jeden podpisany formularz pełnego tekstu. Zatwierdzenie zapisuje całą podmianę jako cytowany fakt `framing` w wybranym zbiorze sesji/profilu i przelicza układ lokalnie. Nie nadpisuje pól źródłowego CV. Tożsamość i dane kontaktowe edytuje się nadal w edytorze źródła. **Odrzuć tę propozycję** przywraca oryginalne pole lub pomija dodatek; odrzucenie tożsamości generowanego wpisu usuwa także zależne pola generowane. Odrzucenie wcześniejszej ręcznej podmiany usuwa jej nieużywany już fakt przeglądu.

Formularz korzysta z istniejących tokenów Swiss i natywnych kontrolek na stronie oraz w asystencie. Fokus przechodzi do tekstu; Escape/Anuluj przywraca przycisk edycji. Otwarty szkic blokuje etapy, wybór wpisu, stronicowanie i końcowy zapis. Żądania blokują powtórne akcje i zachowują szkic po błędzie. Sukces przywraca wynik z uprzejmym komunikatem statusu. Te operacje nie wywołują AI ani nie tworzą rezerwacji kredytów. Geometrię PDF przelicza istniejący generator szablonu; kontrolki przeglądu i metadane nie trafiają do elementów PDF.

### API, zapis i wdrożenie

`POST /ai/interviews/{id}/preview-review` wymaga zalogowanego właściciela, bieżącej fazy `preview`, zgodnych rewizji sesji/profilu/źródła i ścieżki istniejącej propozycji.

```json
{"evidence_scope":"session","revision":7,"profile_revision":3,
 "path":"/summary","value":"Zbieranie uwag departamentów bez przygotowywania stanowiska merytorycznego."}
```

Wyślij `value:null`, aby odrzucić propozycję. Podmiana musi być niepustym tekstem do 4000 znaków; ścieżka ma do 200 znaków i musi występować w zmianach podglądu. Sukces zwraca zaktualizowaną sesję, podgląd, liczbę stron, źródła i rewizję (200). Brak uwierzytelnienia korzysta z dotychczasowego błędu logowania; brak lub cudza sesja daje 404. Nieaktualne rewizje, niedostępna propozycja lub niewłaściwa faza dają 409. Niepoprawne wejście, edycja tożsamości lub nieprawidłowa treść CV daje 422. Błąd renderowania/zapisu zachowuje poprzedni zatwierdzony podgląd; po niepewnej odpowiedzi sieciowej wczytaj zapisany stan. Nieaktualne ponowienie zostaje odrzucone zamiast dwukrotnego zastosowania. Zapis dokumentu jest osobną jawną operacją z dotychczasowymi kontrolami planu.

Dodatki używają istniejącego JSON-a `interview_sessions.state`: `discovery_limit`, `discovery_main_limit`, `discovery_round_complete`, `scope_reviews` i `assessment`/`answer_meaning` odpowiedzi. Ręczne podmiany korzystają z istniejących faktów ze źródłem `interview:{id}:review`. Nie dodano tabeli, migracji, zmiennej środowiskowej ani zależności. Eksport/usunięcie konta i izolacja sesji zachowują swoje granice. Wdróż backend przed frontendem. Rollback zachowuje JSON/historię, lecz starszy frontend nie pokazuje przeglądu propozycji, a starszy backend nie ma tego endpointu. Zapisane podglądy pozostają czytelne; generowanie wersji 4 nie używa etapów starszej polityki.

### Testy i ograniczenia

W `backend/` uruchom: `python -m pytest tests/test_interview_quality.py tests/test_interview_discovery.py tests/test_interview_questions.py tests/test_interviews.py tests/test_interview_editorial.py tests/test_interview_recovery.py -q`.

W `frontend/` uruchom: `npm run test:runtime -- src/components/ai/Interview`, `npm run test:e2e -- e2e/interview-quality.spec.js e2e/interview-workspace.spec.js --project=desktop-chromium --workers=1`, `npm test`, `npm run lint` i `npm run build`. To skonfigurowane skrypty; gdy npm jest niedostępny, dołączony Node może uruchomić odpowiadające im lokalne pliki wejściowe.

Kontrolowane dane obejmują odpowiedzi formalne/potoczne/krótkie, niepewność, sprzeczności, niedostępne źródła, jedno dopytanie na zakres, skończone rundy, wznowienie, nieaktualne zapisy, zachowanie źródła, jednostki umiejętności i bezpłatne decyzje w obu zbiorach danych. Testy przeglądarkowe obejmują PL/EN, 390/834/1280/1920 px, tekst 200% przy 834 px, reduced motion, klawiaturę i odzyskiwanie po błędzie. Symulowane oceny znaczenia sprawdzają przepływ, nie trafność rzeczywistego modelu. Akceptacja z prawdziwym modelem powinna porównywać przydatne potwierdzone fakty na pytanie, powtórki, zachowanie ograniczeń odpowiedzialności i niepotwierdzone dodatki na stałym fikcyjnym profilu. Rozmowy z rzeczywistymi użytkownikami są nadal potrzebne do zmierzenia zrozumiałości i wysiłku; nie twierdzimy, że takie badanie przeprowadzono.

- [Ograniczenia i domyślne wartości Pydantic](https://docs.pydantic.dev/latest/concepts/fields/) wyjaśniają limity wejścia i zgodność z brakującymi polami starszych danych.
- [Atrapy w pytest](https://docs.pytest.org/en/stable/how-to/monkeypatch.html) wyjaśniają izolowanie zewnętrznych zależności w testach regresji.
