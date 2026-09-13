# English

## Purpose and the user flow

Answer help supports a person who remembers their work but finds it difficult to describe it. It is available beside an eligible active interview question in both the standalone interview and the editor assistant. Ordinary typed answers still use **Save answer**. Help is optional and does not advance the question, accept a fact, edit the source CV or create a PDF.

1. Open an existing source-bound interview. The server includes `question.answer_help_available: true` only when the question is eligible. Opening or reloading the interview does not generate help.
2. Choose **Suggest an answer**. The current unsaved answer is supplied as a draft. The server prepares a suggestion and independently checks applicable text; these are up to two metered AI stages. An immediate guidance-only result needs no second model call. The answer remains visible and is disabled while the request is pending. The credit receipt remains visible.
3. Review the returned mode. `draft` is a proposed answer grounded in the selected entry's information or the unsaved draft. `options` contains hypothetical activities, with every checkbox initially unchecked. `guidance` asks for information the candidate must provide and has no application action.
4. Choose **Use suggestion**, or select applicable activities and choose **Use selected tasks**. This appends text to the answer field. Existing text is retained. It does not save an answer or create evidence. The combined answer must fit the existing 4,000-character limit; otherwise an inline error preserves the answer and choices.
5. Edit and review the complete answer. After assisted insertion, **Confirm and save answer** explicitly confirms that the whole description matches the candidate's experience. Only this answer submission persists the answer and its evidence. There is no second approval of the same submitted text in the information review.

**I cannot remember**, **Skip** and the separate lack-of-experience choice retain their existing meanings. They never generate help or silently adopt a suggestion. Unknown and skipped answers create no career fact. A directly typed ordinary answer does not need an assistance identifier.

The review can be hidden while generation is pending. Hiding it does not cancel server work or promise a refund. The parent stays busy until the request settles. A late response can be cached, but must not reopen a dismissed review or fill the answer. **Show suggestion** subsequently opens the matching cached result without a model request.

## Components and data flow

| File or symbol | Responsibility |
| --- | --- |
| `frontend/src/components/ai/Interview/InterviewFlow.jsx`: `generateAnswerHelp`, `useAnswerHelp`, `saveAnswer` | Owns request versions, the answer draft, the request lock, recovery reads and the final explicit submission. |
| `frontend/src/components/ai/Interview/InterviewAnswerHelp.jsx`: `InterviewAnswerHelp` | Shows the trigger, pending review, draft/options/guidance, retry, hide/reopen and use actions. It does not persist facts. |
| `frontend/src/components/ai/Interview/InterviewAnswerHelp.module.css` | Uses shared design tokens for the local review and checkbox layout. |
| `frontend/src/components/ai/Interview/InterviewCredits.jsx` | Reads settled costs after success or failure without starting AI. |
| `frontend/src/services/interviews.js`: `interviewRequest` | Authenticated requests with explicit timeouts and no automatic retry. |
| `backend/app/api/routes/interviews.py`: `help_interview_answer`, `answer_interview` | Owned API entry points for assistance and answer persistence. |
| `backend/app/services/interview_answer_help.py` | Eligibility, entry-scoped context, two-stage generation, cached recovery, validation and assistance provenance. |
| `backend/app/services/interview_service.py`: `session_payload`, `check_versions`, `paid_model` | Public session output, version/source checks and durable credit reservations. |
| `backend/app/schemas/interview_schema.py` | Pydantic request and model-output contracts. |
| `backend/app/services/interview_credits.py` | Groups `answer-help` and `answer-help-verify` ledger stages into an answer-help receipt. |

`InterviewAnswerHelp` keys its local state to the session and question. The parent also checks the current request/session identity before adopting a result. Cleanup and request tokens prevent an old response from filling another question. Help requests use a synchronous lock to prevent duplicate activation. On a recoverable failure, the parent reads persisted state so an advanced server revision can be used for explicit retry while the user's draft remains in memory.

The generated answer uses the interface language selected by the request, while the CV language remains independent. Cached authored text retains its language; the server-owned guidance explanation follows the current interface language. Application labels, questions, option metadata and assistance IDs never become PDF elements. The ordinary verified CV-generation pipeline may later use the submitted answer as evidence. The request timeout is 1,140,000 ms: two possible 540-second provider stages plus settlement headroom, with no automatic retry.

## Eligibility and factual boundaries

`answer_help_available` requires a confirmed source-bound session with an active narrative question, an explicit evidence scope and no pending proposed facts. It excludes clarification decisions, general invitations, language entries, unsupported question angles and recognised requests for exact facts such as dates, counts, qualifications or language levels. A tailoring question is eligible only for a partially supported requirement. The server enforces these restrictions even if a client exposes or calls the action incorrectly.

For a structured entry, context contains facts bound to that exact record and answers explicitly bound to the same question scope. A discovery-queue association between a loose note and a role is not a factual binding. Note scopes retain their own context. Tailoring instead uses confirmed facts cited for the active partially evidenced requirement; those citations may span multiple records but retain their original paths and context. Requirement references must resolve to current selected-store facts. Unrelated roles, another candidate's account profile and the job offer cannot supply invented evidence. The question is context, not proof of its own assumptions. The unsaved draft is identified separately and must retain its uncertainty or negations.

The first model returns a bounded `draft`, three to five hypothetical `options`, or `guidance`. Local validation checks mode consistency, known evidence IDs, duplicate options, unsupported numbers and fill-in placeholders. The second model checks the draft's factual support or rejects individual options. An immediate `guidance` result has no applicable generated text; the server supplies its own localized explanation and skips the second call. Rejected draft claims produce guidance; rejected options are removed, and an empty list becomes guidance. There is no automatic paid regeneration to replace rejected content. A filtered option list can therefore contain fewer than three choices.

The semantic check is model-based. It reduces unsupported suggestions but does not prove that every statement is true. Hypothetical activities are intentionally not confirmed career facts. Mandatory review and explicit submission remain the boundary for accepting them, and live model quality requires separate evaluation beyond mocked regression tests.

## API tutorial

Paths below are backend paths before the deployment's API prefix. Use the existing Bearer access token and the selected interface language. All IDs and candidate examples below are fictional.

### Generate or recover assistance

`POST /ai/interviews/{session_id}/answer-help` requires ownership, an eligible active question, the selected evidence scope, current profile/session versions, an unchanged saved source and AI access for new model work. `question_id` is required and at most 100 characters. `draft` defaults to an empty string and is at most 4,000 characters. `revision` is at least 1 and `profile_revision` is nonnegative.

```json
{
  "revision": 7,
  "profile_revision": 4,
  "evidence_scope": "session",
  "question_id": "question-example-1",
  "draft": "I checked customer requests and recorded the decisions."
}
```

Success returns HTTP 200 with the updated session. The profile revision, active question, answers and CV content remain unchanged. The session revision can advance when the attempt is stored and when its result is stored; always use the returned revision instead of incrementing locally. This is an illustrative fragment of the response, not the entire session:

```json
{
  "revision": 9,
  "profile_revision": 4,
  "evidence_scope": "session",
  "question": { "id": "question-example-1", "answer_help_available": true },
  "answer_help": {
    "id": "help-example-1",
    "question_id": "question-example-1",
    "mode": "draft",
    "draft": "I reviewed customer requests and documented the decisions.",
    "options": [],
    "guidance": "Review and edit the draft. Save it only when the whole answer matches your experience.",
    "based_on_draft": "I checked customer requests and recorded the decisions."
  }
}
```

In `options` mode, `draft` is empty and `options` is a list such as `[{"id":"task-1","text":"Comparing request details with customer documentation."}]`. This example shows one option's shape; initial provider output requires three to five options. In `guidance` mode, both applicable fields are empty and `guidance` contains the explanation. `GET /ai/interviews/{session_id}` exposes matching cached help without invoking AI.

### Confirm an assisted answer

`POST /ai/interviews/{session_id}/answers` retains its ordinary body and accepts two additional fields:

```json
{
  "revision": 9,
  "profile_revision": 4,
  "evidence_scope": "session",
  "question_id": "question-example-1",
  "status": "answered",
  "answer": "I reviewed customer requests and documented the decisions.",
  "suggestion_id": "help-example-1",
  "confirm_suggestion": true
}
```

The suggestion must belong to the current question and profile revision, be in `draft` or `options` mode, and have both confirmation fields. The full submitted answer may contain the user's edits. Success returns HTTP 200 with the updated session, clears active help and records `ai_assistance: {suggestion_id, mode, confirmed: true}` in answer history. Existing answer-to-fact processing persists selected-store evidence in the same transaction. The source CV is unchanged. Identical answer replay does not duplicate a saved answer or its evidence.

For an ordinary manually written answer, omit `suggestion_id` and leave `confirm_suggestion` absent or false. Saving answers and using cached help consume no AI credits.

### Errors and recovery

| HTTP response | Meaning and recovery |
| --- | --- |
| `401` | Existing authentication failure; restore authentication before retry. |
| `404`, `detail.code: interview_invalid` | Session is absent or belongs to another user; both use the same owned lookup. |
| `422`, `detail.code: interview_invalid` | Ineligible/inactive help, missing confirmation or a mismatched suggestion. Review the current question and saved state. |
| `422`, validation `detail` array | Invalid request shape or field limit, handled by the shared FastAPI validation handler. |
| `409`, `detail.code: interview_conflict` | Stale session/profile/source, changed active question or another conflicting write. Reload saved state; do not silently replay different input. |
| `409`, `detail.code: ai_request_in_progress` | The same reserved AI operation is still pending. It must not be duplicated. |
| `403`, `detail.code: plan_feature_ai_assistant` or `plan_limit_ai_credits` | New metered work lacks entitlement or sufficient credits. Existing cached help and saved answers remain readable. |
| `413`, `detail.code: interview_invalid` | The complete provider context exceeds the shared size limit. |
| `500`, `detail.code: ai_provider_unavailable` | Provider or validated-output failure. Preserve the draft, read the receipt and retry explicitly when appropriate. |

Messages are localized by the existing server handler. The help panel uses its own concise recoverable failure copy. It does not display provider diagnostics or automatically retry a paid operation.

## Credits and durable recovery

`generate_answer_help` creates a separate versioned attempt. Its fingerprint includes the scoped context, unsaved draft, policy version, selected scope and relevant revisions. `paid_model` also hashes the concrete provider contract. An unchanged successful stage can be reused after a later verification failure. Changed drafts, evidence or source cannot reuse a different proposal as if it had been verified for the new context.

Generation and verification are separate metered stages. Immediate guidance charges generation only; guidance caused by rejected applicable text follows both stages. An explicit retry after successful generation and failed verification can reuse generation and pay only for work that must run again. A failed or invalid provider output can still incur actual usage charges when usage was returned; a released reservation and an unknown pending outcome are different states. Do not promise that every failure or retry is free. `/credits` reads the durable ledger and keeps completed/failed stage costs visible without charging again. Reopening a settled matching suggestion is a local/read-only operation, including after Pro access expires.

## Privacy, deployment and maintenance

The endpoint obtains the source and evidence from the owned session. The browser supplies the draft and version identifiers, not arbitrary replacement CV data. An isolated session does not read or write the account career profile. Explicit profile scope continues to use the existing selected account store.

The unsaved draft is sent to the configured AI provider when the user requests help. Cached help, including `based_on_draft`, is stored in the existing interview state; model results use existing credit-reservation storage. Existing session/account deletion and retention rules apply. This feature adds no separate retention job, table, database migration, environment variable or dependency. Consult the project's privacy documentation for the existing provider and ledger policies.

Deploy the backend and frontend as one feature rollout, with the backend available before the new frontend. Keep server ownership, version and confirmation checks when rolling back the UI. Cached JSON uses additive fields; existing ordinary answers and saved CVs remain compatible. The controls follow `DESIGN.md`: labelled native inputs, unchecked checkboxes, visible focus, 44px actions, wrapping at 390/834/1280/1920px, enlarged text and reduced motion.

Run backend regressions from `backend/`:

```sh
python -m pytest tests/test_interview_answer_help.py tests/test_interviews.py tests/test_interview_credits.py -q
```

Run frontend checks from `frontend/`, using the scripts in `package.json`:

```sh
npm run test:runtime -- src/components/ai/Interview src/services/interviews.runtime.test.js
npm run test:e2e -- e2e/interview-answer-help.spec.js --project=desktop-chromium --workers=1
npm run check:locales
npm run lint -- --quiet
npm run build
```

Backend tests exercise validation, ownership, scope, confirmation, retry caching and real ledger settlement with mocked model output. `InterviewAnswerHelp.runtime.test.jsx` covers component state and interactions; the interview runtime tests cover the parent submission boundary. `interview-answer-help.spec.js` uses a synthetic local API to cover both languages and four widths, keyboard use, pending cancellation, draft retention, unchecked choices, overflow errors, cached reload, unknown/skip semantics, source/PDF isolation and credit visibility. Browser/API mocks do not establish live model quality or production-provider availability.

Further reading: [React Effect cleanup](https://react.dev/reference/react/useEffect) explains cleanup and stale-response handling; [FastAPI request bodies](https://fastapi.tiangolo.com/tutorial/body/) explains typed Pydantic input validation. These support the implementation patterns above, rather than prescribing the product's eligibility or factual rules.

---

# Polski

## Cel i przebieg dla użytkownika

Pomoc w odpowiedzi wspiera osobę, która pamięta swoją pracę, lecz ma trudność z jej opisaniem. Jest dostępna przy kwalifikującym się aktywnym pytaniu wywiadu, zarówno na osobnej stronie, jak i w asystencie edytora. Zwykłe odpowiedzi wpisane samodzielnie nadal korzystają z **Zapisz odpowiedź**. Pomoc jest opcjonalna i nie przechodzi do następnego pytania, nie zatwierdza faktu, nie zmienia źródłowego CV ani nie tworzy PDF.

1. Otwórz istniejący wywiad powiązany ze źródłem. Serwer dodaje `question.answer_help_available: true` wyłącznie przy odpowiednim pytaniu. Otwarcie lub odświeżenie wywiadu nie generuje pomocy.
2. Wybierz **Zaproponuj odpowiedź**. Aktualny niezapisany tekst jest przesyłany jako szkic. Serwer przygotowuje propozycję i niezależnie sprawdza tekst możliwy do zastosowania; są to najwyżej dwa rozliczane etapy AI. Wynik od razu ograniczony do wskazówki nie wymaga drugiego wywołania modelu. Odpowiedź pozostaje widoczna i jest zablokowana na czas żądania. Rozliczenie kredytów także pozostaje widoczne.
3. Przejrzyj wynik. `draft` oznacza propozycję opartą na informacjach o wybranym wpisie lub niezapisanym szkicu. `options` zawiera hipotetyczne czynności, a wszystkie pola wyboru są początkowo niezaznaczone. `guidance` prosi o informację, którą musi podać kandydat, i nie ma akcji zastosowania.
4. Wybierz **Użyj propozycji** albo zaznacz pasujące czynności i wybierz **Użyj wybranych czynności**. Tekst zostaje dopisany do pola odpowiedzi. Wcześniejsza treść pozostaje zachowana. Nie jest to zapis odpowiedzi ani utworzenie informacji dowodowej. Łączna odpowiedź musi zmieścić się w istniejącym limicie 4000 znaków; w przeciwnym razie błąd przy formularzu zachowuje tekst i wybór.
5. Edytuj i sprawdź całą odpowiedź. Po dodaniu pomocy przycisk **Potwierdzam i zapisuję odpowiedź** wyraźnie potwierdza zgodność całego opisu z doświadczeniem kandydata. Dopiero przesłanie odpowiedzi zapisuje ją wraz z informacją dowodową. Ten sam przesłany tekst nie wymaga ponownego zatwierdzenia w przeglądzie informacji.

**Nie pamiętam**, **Pomiń** i osobna odpowiedź o braku doświadczenia zachowują dotychczasowe znaczenie. Nigdy nie generują pomocy ani nie przyjmują propozycji w tle. Niepamiętanie i pominięcie nie tworzą faktu zawodowego. Zwykła odpowiedź wpisana samodzielnie nie wymaga identyfikatora pomocy.

Propozycję można ukryć podczas generowania. Ukrycie nie anuluje pracy serwera i nie oznacza zwrotu kredytów. Formularz pozostaje zajęty do zakończenia żądania. Spóźniony wynik może zostać zachowany, ale nie może ponownie otworzyć ukrytego podglądu ani wypełnić odpowiedzi. **Pokaż propozycję** otwiera następnie pasujący zapisany wynik bez żądania do modelu.

## Komponenty i przepływ danych

| Plik lub symbol | Odpowiedzialność |
| --- | --- |
| `frontend/src/components/ai/Interview/InterviewFlow.jsx`: `generateAnswerHelp`, `useAnswerHelp`, `saveAnswer` | Wersje żądań, szkic odpowiedzi, blokada żądania, odczyty naprawcze i końcowe jawne przesłanie. |
| `frontend/src/components/ai/Interview/InterviewAnswerHelp.jsx`: `InterviewAnswerHelp` | Przycisk, oczekiwanie, szkic/opcje/wskazówka, ponowienie, ukrycie/otwarcie i zastosowanie. Nie zapisuje faktów. |
| `frontend/src/components/ai/Interview/InterviewAnswerHelp.module.css` | Wspólne tokeny projektu dla podglądu i układu pól wyboru. |
| `frontend/src/components/ai/Interview/InterviewCredits.jsx` | Odczyt rozliczonych kosztów po sukcesie lub błędzie bez uruchamiania AI. |
| `frontend/src/services/interviews.js`: `interviewRequest` | Uwierzytelnione żądania z jawnymi limitami czasu i bez automatycznego ponawiania. |
| `backend/app/api/routes/interviews.py`: `help_interview_answer`, `answer_interview` | Punkty wejścia API sprawdzające właściciela dla pomocy i zapisu odpowiedzi. |
| `backend/app/services/interview_answer_help.py` | Dostępność, kontekst konkretnego wpisu, dwa etapy generowania, odzyskiwanie, walidacja i pochodzenie pomocy. |
| `backend/app/services/interview_service.py`: `session_payload`, `check_versions`, `paid_model` | Publiczna odpowiedź sesji, kontrola wersji/źródła i trwałe rezerwacje kredytów. |
| `backend/app/schemas/interview_schema.py` | Kontrakty Pydantic dla żądań i wyników modelu. |
| `backend/app/services/interview_credits.py` | Grupowanie etapów `answer-help` i `answer-help-verify` w rozliczeniu pomocy. |

`InterviewAnswerHelp` wiąże lokalny stan z sesją i pytaniem. Komponent nadrzędny dodatkowo sprawdza tożsamość aktualnego żądania i sesji przed przyjęciem wyniku. Sprzątanie efektów i znaczniki żądań zapobiegają wypełnieniu innego pytania starym wynikiem. Synchroniczna blokada uniemożliwia podwójne uruchomienie. Po błędzie możliwym do naprawienia komponent nadrzędny odczytuje zapisany stan, aby jawne ponowienie używało aktualnej wersji serwera, zachowując szkic użytkownika w pamięci.

Wygenerowana odpowiedź używa języka interfejsu wskazanego w żądaniu; język CV pozostaje niezależny. Zapisana treść propozycji zachowuje swój język; serwerowe wyjaśnienie wskazówki podąża za aktualnym językiem interfejsu. Etykiety aplikacji, pytania, metadane opcji i identyfikatory pomocy nigdy nie stają się elementami PDF. Dotychczasowy proces generowania i sprawdzania CV może później wykorzystać przesłaną odpowiedź jako informację dowodową. Limit żądania wynosi 1 140 000 ms: dwa możliwe etapy dostawcy po 540 sekund i zapas na rozliczenie, bez automatycznego ponawiania.

## Dostępność i granice faktów

`answer_help_available` wymaga zatwierdzonej sesji powiązanej ze źródłem, aktywnego pytania opisowego, jawnego zakresu informacji i braku oczekujących propozycji faktów. Wyklucza decyzje doprecyzowujące, ogólne zaproszenia do opisu, wpisy językowe, nieobsługiwane cele pytania i rozpoznane pytania o dokładne fakty, np. daty, liczby, kwalifikacje lub poziomy językowe. Pytanie dopasowania do oferty kwalifikuje się tylko przy częściowo potwierdzonym wymaganiu. Serwer egzekwuje te ograniczenia również wtedy, gdy klient błędnie pokaże lub wywoła akcję.

Dla wpisu strukturalnego kontekst zawiera fakty powiązane z dokładnie tym rekordem oraz odpowiedzi jawnie powiązane z tym samym zakresem pytań. Powiązanie luźnej notatki z rolą w kolejce pytań nie jest powiązaniem dowodowym. Zakresy notatek zachowują własny kontekst. Dopasowanie korzysta z potwierdzonych faktów wskazanych dla bieżącego częściowo popartego wymagania; źródła mogą obejmować kilka rekordów, zachowując pierwotne ścieżki i kontekst. Odwołania wymagania muszą wskazywać aktualne fakty z wybranego zbioru. Niezwiązane role, profil innego kandydata i oferta pracy nie mogą dostarczać wymyślonych dowodów. Pytanie jest kontekstem, a nie dowodem własnych założeń. Niezapisany szkic jest oznaczony osobno i musi zachować niepewność oraz zaprzeczenia.

Pierwszy model zwraca ograniczony szkic `draft`, od trzech do pięciu hipotetycznych `options` albo `guidance`. Walidacja lokalna sprawdza zgodność trybu, znane identyfikatory dowodów, powtórzone opcje, niepoparte liczby i znaczniki do uzupełnienia. Drugi model sprawdza poparcie szkicu albo odrzuca poszczególne opcje. Wynik od razu w trybie `guidance` nie zawiera wygenerowanego tekstu do zastosowania; serwer dostarcza własne przetłumaczone wyjaśnienie i pomija drugie wywołanie. Odrzucone twierdzenia szkicu zamieniają wynik we wskazówkę; odrzucone opcje są usuwane, a pusta lista również staje się wskazówką. Nie ma automatycznej płatnej regeneracji odrzuconej treści. Po odfiltrowaniu lista może więc zawierać mniej niż trzy opcje.

Sprawdzenie znaczenia wykonuje model. Ogranicza ono niepoparte sugestie, lecz nie dowodzi prawdziwości każdego zdania. Hipotetyczne czynności celowo nie są potwierdzonymi faktami zawodowymi. Obowiązkowy przegląd i jawne przesłanie pozostają granicą ich przyjęcia, a jakość rzeczywistego modelu wymaga osobnej oceny poza testami z zastąpionym dostawcą.

## Przewodnik po API

Poniższe ścieżki są ścieżkami backendu przed prefiksem API wdrożenia. Należy użyć istniejącego tokenu dostępu Bearer i wybranego języka interfejsu. Identyfikatory i przykłady kandydata są fikcyjne.

### Generowanie lub odzyskanie pomocy

`POST /ai/interviews/{session_id}/answer-help` wymaga własności sesji, odpowiedniego aktywnego pytania, wybranego zakresu informacji, aktualnych wersji profilu/sesji, niezmienionego zapisanego źródła i dostępu do AI dla nowej pracy modelu. `question_id` jest wymagane i ma najwyżej 100 znaków. `draft` domyślnie jest pusty i ma najwyżej 4000 znaków. `revision` wynosi co najmniej 1, a `profile_revision` jest nieujemne.

```json
{
  "revision": 7,
  "profile_revision": 4,
  "evidence_scope": "session",
  "question_id": "question-example-1",
  "draft": "Sprawdzałam zgłoszenia klientów i zapisywałam decyzje."
}
```

Sukces zwraca HTTP 200 ze zaktualizowaną sesją. Wersja profilu, aktywne pytanie, odpowiedzi i treść CV pozostają niezmienione. Wersja sesji może wzrosnąć podczas zapisu próby oraz wyniku; należy zawsze używać wartości zwróconej, zamiast zwiększać ją lokalnie. To przykładowy fragment odpowiedzi, a nie cała sesja:

```json
{
  "revision": 9,
  "profile_revision": 4,
  "evidence_scope": "session",
  "question": { "id": "question-example-1", "answer_help_available": true },
  "answer_help": {
    "id": "help-example-1",
    "question_id": "question-example-1",
    "mode": "draft",
    "draft": "Sprawdzałam zgłoszenia klientów i dokumentowałam decyzje.",
    "options": [],
    "guidance": "Sprawdź i popraw szkic. Zapisz go tylko wtedy, gdy cała odpowiedź jest zgodna z Twoim doświadczeniem.",
    "based_on_draft": "Sprawdzałam zgłoszenia klientów i zapisywałam decyzje."
  }
}
```

W trybie `options` pole `draft` jest puste, a `options` zawiera elementy takie jak `[{"id":"task-1","text":"Porównywanie danych zgłoszenia z dokumentacją klienta."}]`. Przykład pokazuje kształt jednej opcji; pierwszy wynik dostawcy wymaga trzech do pięciu opcji. W trybie `guidance` oba pola możliwe do zastosowania są puste, a wyjaśnienie znajduje się w `guidance`. `GET /ai/interviews/{session_id}` udostępnia pasującą zapisaną pomoc bez uruchamiania AI.

### Potwierdzenie odpowiedzi z pomocą

`POST /ai/interviews/{session_id}/answers` zachowuje dotychczasową strukturę i przyjmuje dwa dodatkowe pola:

```json
{
  "revision": 9,
  "profile_revision": 4,
  "evidence_scope": "session",
  "question_id": "question-example-1",
  "status": "answered",
  "answer": "Sprawdzałam zgłoszenia klientów i dokumentowałam decyzje.",
  "suggestion_id": "help-example-1",
  "confirm_suggestion": true
}
```

Propozycja musi należeć do aktualnego pytania i wersji profilu, mieć tryb `draft` lub `options` oraz oba pola potwierdzenia. Pełna przesłana odpowiedź może zawierać poprawki użytkownika. Sukces zwraca HTTP 200 ze zaktualizowaną sesją, usuwa aktywną pomoc i zapisuje `ai_assistance: {suggestion_id, mode, confirmed: true}` w historii odpowiedzi. Dotychczasowe przekształcanie odpowiedzi w fakty zapisuje informacje w wybranym zbiorze w tej samej transakcji. Źródłowe CV pozostaje niezmienione. Identyczne ponowienie zapisu nie powiela odpowiedzi ani faktów.

Dla zwykłej samodzielnie wpisanej odpowiedzi należy pominąć `suggestion_id`, a `confirm_suggestion` pominąć lub ustawić na false. Zapis odpowiedzi i odczyt gotowej pomocy nie zużywają kredytów AI.

### Błędy i odzyskiwanie

| Odpowiedź HTTP | Znaczenie i dalszy krok |
| --- | --- |
| `401` | Dotychczasowy błąd uwierzytelnienia; przed ponowieniem przywróć uwierzytelnienie. |
| `404`, `detail.code: interview_invalid` | Sesja nie istnieje albo należy do innego użytkownika; oba przypadki używają tego samego wyszukiwania właściciela. |
| `422`, `detail.code: interview_invalid` | Niedostępna/nieaktywna pomoc, brak potwierdzenia albo niepasująca propozycja. Sprawdź aktualne pytanie i zapisany stan. |
| `422`, tablica walidacji `detail` | Nieprawidłowy kształt żądania lub limit pola, obsługiwany przez wspólny handler FastAPI. |
| `409`, `detail.code: interview_conflict` | Nieaktualna sesja/profil/źródło, zmienione pytanie albo konflikt zapisu. Wczytaj zapisany stan; nie ponawiaj innej treści bez wiedzy użytkownika. |
| `409`, `detail.code: ai_request_in_progress` | Ta sama zarezerwowana operacja AI nadal trwa. Nie należy jej powielać. |
| `403`, `detail.code: plan_feature_ai_assistant` lub `plan_limit_ai_credits` | Brak uprawnienia lub wystarczających kredytów na nową pracę. Gotowa pomoc i zapisane odpowiedzi pozostają czytelne. |
| `413`, `detail.code: interview_invalid` | Pełny kontekst dostawcy przekracza wspólny limit rozmiaru. |
| `500`, `detail.code: ai_provider_unavailable` | Błąd dostawcy lub walidacji wyniku. Zachowaj szkic, odczytaj koszty i w odpowiednim momencie jawnie ponów. |

Komunikaty są tłumaczone przez istniejący handler serwera. Panel pomocy korzysta z własnego krótkiego komunikatu pozwalającego ponowić działanie. Nie pokazuje diagnostyki dostawcy i nie ponawia automatycznie płatnej operacji.

## Kredyty i trwałe odzyskiwanie

`generate_answer_help` tworzy osobną wersjonowaną próbę. Jej odcisk obejmuje kontekst wpisu, niezapisany szkic, wersję zasad, wybrany zakres oraz odpowiednie wersje danych. `paid_model` dodatkowo uwzględnia konkretny kontrakt dostawcy. Niezmieniony pomyślny etap może zostać ponownie wykorzystany po późniejszym błędzie sprawdzania. Zmieniony szkic, fakty lub źródło nie mogą wykorzystać innej propozycji tak, jakby została sprawdzona dla nowego kontekstu.

Generowanie i sprawdzanie są osobnymi rozliczanymi etapami. Bezpośrednia wskazówka rozlicza tylko generowanie; wskazówka wynikająca z odrzucenia treści następuje po obu etapach. Jawne ponowienie po udanym generowaniu i nieudanym sprawdzeniu może odzyskać generowanie i rozliczyć tylko pracę, którą trzeba wykonać ponownie. Błędny lub nieprawidłowy wynik dostawcy nadal może wiązać się z rzeczywistym kosztem, jeśli dostawca zwrócił zużycie; zwolniona rezerwacja i nieznany wynik oczekującego żądania to inne stany. Nie należy obiecywać, że każdy błąd lub każde ponowienie są bezpłatne. `/credits` odczytuje trwały rejestr i zachowuje widoczne koszty zakończonych/nieudanych etapów bez ponownego naliczania. Otwarcie rozliczonej pasującej propozycji jest operacją lokalną/odczytową, także po wygaśnięciu Pro.

## Prywatność, wdrożenie i utrzymanie

Endpoint pobiera źródło i informacje dowodowe z własnej sesji użytkownika. Przeglądarka dostarcza szkic i wersje, a nie dowolne zastępcze dane CV. Sesja izolowana nie odczytuje i nie zapisuje profilu zawodowego konta. Jawny zakres profilowy nadal korzysta z dotychczasowego wybranego zbioru konta.

Niezapisany szkic jest przesyłany do skonfigurowanego dostawcy AI, gdy użytkownik poprosi o pomoc. Zapisana pomoc, wraz z `based_on_draft`, trafia do istniejącego stanu wywiadu; wyniki modelu używają istniejącego magazynu rezerwacji kredytów. Obowiązują dotychczasowe zasady usuwania i retencji sesji/konta. Funkcja nie dodaje osobnego zadania retencji, tabeli, migracji, zmiennej środowiskowej ani zależności. Zasady dostawcy i rejestru kosztów opisuje dotychczasowa dokumentacja prywatności projektu.

Backend i frontend należy wdrożyć jako jedną zmianę funkcjonalną, udostępniając backend przed nowym frontendem. Wycofanie interfejsu powinno zachować serwerowe sprawdzanie właściciela, wersji i potwierdzenia. Dodawane pola JSON zachowują zgodność istniejących zwykłych odpowiedzi i zapisanych CV. Kontrolki realizują `DESIGN.md`: opisane natywne pola, niezaznaczone opcje, widoczny fokus, akcje 44px, zawijanie przy 390/834/1280/1920px, powiększony tekst i ograniczony ruch.

Testy backendu uruchamiaj z `backend/`:

```sh
python -m pytest tests/test_interview_answer_help.py tests/test_interviews.py tests/test_interview_credits.py -q
```

Sprawdzenia frontendu uruchamiaj z `frontend/`, używając skryptów z `package.json`:

```sh
npm run test:runtime -- src/components/ai/Interview src/services/interviews.runtime.test.js
npm run test:e2e -- e2e/interview-answer-help.spec.js --project=desktop-chromium --workers=1
npm run check:locales
npm run lint -- --quiet
npm run build
```

Testy backendu obejmują walidację, właściciela, zakres, potwierdzenie, odzyskiwanie i rzeczywiste rozliczanie rejestru z zastąpionym wynikiem modelu. `InterviewAnswerHelp.runtime.test.jsx` sprawdza stan komponentu i interakcje, a testy runtime wywiadu obejmują granicę zapisu w komponencie nadrzędnym. `interview-answer-help.spec.js` używa syntetycznego lokalnego API do sprawdzenia obu języków i czterech szerokości, klawiatury, ukrywania podczas pracy, zachowania szkicu, niezaznaczonych opcji, limitu znaków, odświeżenia z zapisanym wynikiem, niepamiętania/pomijania, izolacji źródła/PDF oraz widocznych kredytów. Zastąpione API i przeglądarkowe odpowiedzi nie dowodzą jakości rzeczywistego modelu ani dostępności dostawcy produkcyjnego.

Materiały uzupełniające: [sprzątanie efektów React](https://react.dev/reference/react/useEffect) wyjaśnia sprzątanie i obsługę spóźnionych odpowiedzi; [treść żądań FastAPI](https://fastapi.tiangolo.com/tutorial/body/) opisuje walidację typowanego wejścia Pydantic. Materiały wspierają wzorce implementacji, ale nie definiują produktowych zasad dostępności i faktów.
