# English

## Purpose and current rollout

The backend separates inference policy from credit-billing actions, records content-free latency events, and can ask GPT for changed profile fields instead of a second full CV. The API model remains `gpt-5.6-luna`; the existing public response still contains `corrections` and `updated_cv_data`. No database migration, dependency, frontend change, or API endpoint is introduced.

Production rollout is deliberately held: the Render Blueprint pins `AI_ASSISTANT_REASONING_EFFORT=high` and `AI_ASSISTANT_PROFILE_PATCHES_ENABLED=false`. The application supports adaptive effort when the first variable is absent. Neither this document nor successful mocked tests constitutes approval to enable the experiment.

## Recorded live run: 18 September 2026

The complete interleaved run made 216 real calls (24 cases × 3 repetitions × 3 variants). The baseline used the frozen original requests. Latencies include preparation and validation and summarize successful observations only; costs include failed observations with reported usage.

| Variant | Median | p95 | Errors / calls | Estimated USD |
| --- | ---: | ---: | ---: | ---: |
| Original prompts, high | 5.630 s | 11.639 s | 0 / 72 | 0.112502 |
| Original prompts, task policy | 4.567 s | 8.807 s | 2 / 72 | 0.095476 |
| Compact support and task policy | 4.546 s | 7.068 s | 4 / 72 | 0.068493 |

**The rollout gate failed.** The compact median improved by 19.2%, below the 20% target, and the error rate increased. Its four failures occurred during shortening; the two policy-only failures were rejected by the benchmark's evidence checks. The compact failure report retained the exception class, not the exact rejection reason, so it does not establish whether those rejections were valid or false positives. Human editorial review has not been completed. Do not infer semantic quality from timing gains or weaken guards merely to pass this benchmark.

Full local evidence is in `tmp/ai-latency-live.json`; `tmp/ai-latency-reviewed.json` recomputes it offline and `tmp/ai-latency-review.json` contains unapproved review entries. These ignored files contain synthetic outputs and are not committed. The current script additionally records synthetic validation reasons and reports separate policy/compact gates for future runs. Offline evaluation never repeats a paid observation.

Inspection of the two policy-only failures found `4` rewritten as `quatre` (French) and `vier` (German). The lexical guard rejects changed numeric spelling even when the number has the same meaning. This finding does not resolve the four compact failures or substitute for reviewing all outputs.

Verification on the final implementation: full backend `pytest` reported 1425 passed, 5 skipped and 10 pre-existing failures. The same failures were reproduced from the previous Git revision in an isolated copy: three Regent layout/contact checks and seven interview-template state comparisons. The 56 frontend synchronization/correction-acceptance tests passed. New SQL-backed tests also cover compact success, invalid JSON, rejected IDs, constrained credit budgets, timeout reservations and idempotent replay.

## Reproduce the measurements

Run the following from `backend/` after installing `requirements-dev.txt`. The script loads that directory's `.env` without overriding exported variables. Dry runs need no valid provider credential and never call OpenAI:

```sh
python scripts/benchmark_ai_latency.py --output ../tmp/ai-latency-dry-run.json
```

The matrix contains 24 synthetic cases: short, long and deliberately ambiguous documents for PL, EN, DE, FR, ES, UK, IT and NL. It includes numbers, technology names, negations, repeated wording, and a Polish grammatical-inflection correction. These fixtures do not contain customer data. They exercise whole-profile grammar, shortening and improvement; they do **not** establish interview, scoped-edit or translation quality.

Three repetitions of three arms produce 216 provider calls. The order rotates between repetitions. `baseline` replays the original prompts and `high` from the checked-in fixture captured before optimization; `policy` uses those same prompts with the new effort; `compact` runs the current application with adaptive effort and compact-profile support. Ambiguous inputs in the compact arm still use the full-profile fallback. The original fixture must not be overwritten. `--capture-baseline` is only for freezing a separate future baseline at a new path.

Live measurements require a server-side `API_GPT_KEY` and network access. They incur OpenAI charges but do not reserve or charge application credits, query customer documents, or write application records:

```sh
python scripts/benchmark_ai_latency.py --live --output ../tmp/ai-latency-live.json
```

For a connectivity check, append `--limit 1 --repetitions 1 --variants baseline`. Limited runs never pass the rollout gate. Authentication, model/configuration, throttling and connection errors stop the run; the SDK does not silently retry. A report is saved after each completed call, so interrupted measurements retain their already paid observations. There is no automatic resume or repeated paid run.

## Read the report and review quality

Reports contain per-call end-to-end and provider durations, available usage counters, effort, output contract, outcome and estimated USD cost, plus successful-call median and nearest-rank p95. Errors are counted separately; an immediate failure cannot look like a fast success. Missing token details are `null`, not zero. The existing USD estimator is unchanged and is not a provider invoice; this task does not introduce cache pricing, cache retention or explicit cache writes.

The report also includes generated output **only for these synthetic cases** so it can be reviewed. Production `ai_latency` events contain no prompts, CV text, responses, user IDs or document IDs. Do not adapt the benchmark to real CVs or publish reports containing customer data.

Create a blank review file and recompute the report without sending another request:

```sh
python scripts/benchmark_ai_latency.py --evaluate-report ../tmp/ai-latency-live.json --review-template ../tmp/ai-latency-review.json --output ../tmp/ai-latency-reviewed.json
```

For each observation, a human reviewer compares `result` with the corresponding synthetic case and baseline. Check every fact, number, technology, responsibility, negation and qualification; verify that grammar and wording did not worsen, that the canonical profile and visible corrections agree, and that no content was silently dropped. Populate `facts_preserved`, `editorial_not_worse`, and `notes`. Keep the supplied `result_sha256`: it binds the decision to the exact output, including its recorded usage. Do not mark every row approved solely because JSON validation passed.

```sh
python scripts/benchmark_ai_latency.py --evaluate-report ../tmp/ai-latency-live.json --reviews ../tmp/ai-latency-review.json --output ../tmp/ai-latency-reviewed.json
```

The offline evaluation recomputes the summaries and validates output hashes. Passing requires all 24 cases, at least three repetitions of all three arms, no errors, explicit positive quality review of every observation, at least a 20% lower compact-arm median, and no worse compact-arm p95. Dry runs never qualify. Review per-action summaries as well: an aggregate improvement is not evidence that every task improved. The broader interview/scoped/translation quality review remains necessary before removing the global override for those operations.

## Compatibility, limitations and rollback

Compact mapping first validates `cvDataBindings` against actual existing source values; otherwise it requires exact unique text matches. It reconstructs supported bullet markers and line separators from source offsets. Unsupported composite rows, empty editable fields, unbound freeform content or ambiguous repeated text select legacy full-profile inference **before** the call. There is no fuzzy match or second model call. Identity, dates, headings, language levels and locked content are not compact editing targets. Translation keeps its full-profile contract.

The response validator rejects unknown/duplicate IDs, blank replacements, changed protected numbers/tools, changed negation vocabulary, new placeholders, paragraph restructuring, and normalization that would change the profile structure. The finite `Python`/`Pythonie`/`Pythonem`/`Pythona` equivalence permits Polish inflection. These are conservative lexical guards, not proof of semantic fidelity; valid paraphrases may be rejected. Reported usage for rejected paid output is still settled once through the existing credit mechanisms.

Roll out telemetry first. After reviewing the relevant quality evidence, remove the global reasoning override and restart; enable `AI_ASSISTANT_PROFILE_PATCHES_ENABLED=true` only after its separate gate passes. To roll back, restore `AI_ASSISTANT_REASONING_EFFORT=high`, set the profile flag to `false`, and restart. Update the Blueprint as well as the running service so the next synchronization does not undo the intended state. Existing settled receipts and pending reservations retain their recovery behavior.

Relevant tests:

```sh
python -m pytest tests/test_ai_request_policy.py tests/test_ai_telemetry.py tests/test_cv_profile_patches.py tests/test_ai_latency_benchmark.py tests/test_ai_assistant_exception_handling.py tests/test_ai_credit_budget.py tests/test_ai_credit_reservations.py tests/test_interviews.py tests/test_interview_editorial.py -q
python -m pytest -q
```

From `frontend/`, the existing acceptance and profile tests run with:

```sh
node --test src/utils/syncCvDataFromCanvas.test.js src/components/ai/AiAssistant/AiAssistant.test.js src/utils/aiCorrectionHighlights.test.js
```

Official references: [Luna model](https://developers.openai.com/api/docs/models/gpt-5.6-luna) documents supported effort; [latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization) explains output-token and sequential-call costs; [prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) explains why matching prefixes alone do not guarantee reuse.

---

# Polski

## Cel i obecny stan wdrożenia

Backend oddziela politykę inferencji od akcji rozliczającej kredyty, zapisuje pomiary czasu bez treści dokumentów i potrafi prosić GPT o zmienione pola zamiast drugiego pełnego CV. Modelem API pozostaje `gpt-5.6-luna`; publiczna odpowiedź nadal zawiera `corrections` oraz `updated_cv_data`. Zmiana nie wprowadza migracji bazy, zależności, modyfikacji frontendu ani endpointu API.

Włączenie produkcyjne jest celowo wstrzymane: Blueprint Render ustawia `AI_ASSISTANT_REASONING_EFFORT=high` i `AI_ASSISTANT_PROFILE_PATCHES_ENABLED=false`. Aplikacja obsługuje dobór poziomu do zadania przy braku pierwszej zmiennej. Ten dokument ani zaliczone testy z atrapami nie stanowią zatwierdzenia eksperymentu.

## Zapisany pomiar API: 18 września 2026

Pełny pomiar przeplatany wykonał 216 rzeczywistych wywołań (24 przypadki × 3 powtórzenia × 3 warianty). Wariant bazowy używał zamrożonych pierwotnych żądań. Czasy obejmują przygotowanie i walidację, a podsumowania dotyczą tylko poprawnych obserwacji; koszty obejmują także błędy ze zgłoszonym zużyciem.

| Wariant | Mediana | p95 | Błędy / wywołania | Szacowane USD |
| --- | ---: | ---: | ---: | ---: |
| Pierwotne prompty, high | 5,630 s | 11,639 s | 0 / 72 | 0,112502 |
| Pierwotne prompty, polityka zadania | 4,567 s | 8,807 s | 2 / 72 | 0,095476 |
| Obsługa zmian pól i polityka zadania | 4,546 s | 7,068 s | 4 / 72 | 0,068493 |

**Warunek wdrożenia nie został spełniony.** Mediana wariantu compact poprawiła się o 19,2%, poniżej celu 20%, a odsetek błędów wzrósł. Cztery błędy compact dotyczyły skracania; dwa błędy samej polityki wynikały z kontroli faktów w benchmarku. Raport błędów compact zachował klasę wyjątku, bez dokładnej przyczyny odrzucenia, więc nie rozstrzyga, czy były one zasadne, czy fałszywie dodatnie. Ocena redakcyjna przez człowieka nie została zakończona. Krótszy czas nie potwierdza jakości znaczeniowej; nie osłabiaj kontroli wyłącznie po to, aby zaliczyć benchmark.

Pełne lokalne dane są w `tmp/ai-latency-live.json`; `tmp/ai-latency-reviewed.json` przelicza je offline, a `tmp/ai-latency-review.json` zawiera niezatwierdzone pozycje oceny. Te ignorowane pliki zawierają syntetyczne odpowiedzi i nie trafiają do repozytorium. Aktualny skrypt dodatkowo zapisuje przyczyny syntetycznych błędów walidacji oraz osobne warunki zaliczenia polityki i formatu kompaktowego dla przyszłych pomiarów. Ocena offline nie powtarza żadnego płatnego wywołania.

Oględziny dwóch błędów samej polityki wykazały zamianę `4` na `quatre` (francuski) i `vier` (niemiecki). Kontrola leksykalna odrzuca zmianę zapisu liczby nawet przy zachowaniu jej znaczenia. To ustalenie nie wyjaśnia czterech błędów compact i nie zastępuje oceny wszystkich odpowiedzi.

Weryfikacja końcowej implementacji: pełny backendowy `pytest` wykazał 1425 zaliczonych, 5 pominiętych i 10 istniejących wcześniej błędów. Te same błędy odtworzono z poprzedniej wersji Git w odizolowanej kopii: trzy kontrole kontaktów/układu Regent i siedem porównań stanu szablonów wywiadu. Zaliczone zostało 56 frontendowych testów synchronizacji i akceptowania poprawek. Nowe testy z bazą SQL obejmują też poprawną odpowiedź compact, nieprawidłowy JSON, odrzucone ID, ograniczony budżet kredytów, rezerwacje po timeoutcie i odtwarzanie tego samego klucza.

## Odtworzenie pomiarów

Poniższe polecenia uruchamiaj z `backend/` po instalacji `requirements-dev.txt`. Skrypt wczytuje tamtejszy `.env` bez nadpisywania wyeksportowanych zmiennych. Próba lokalna nie potrzebuje prawidłowego klucza i nie wywołuje OpenAI:

```sh
python scripts/benchmark_ai_latency.py --output ../tmp/ai-latency-dry-run.json
```

Macierz obejmuje 24 syntetyczne przypadki: dokumenty krótkie, długie i celowo niejednoznaczne dla PL, EN, DE, FR, ES, UK, IT i NL. Zawiera liczby, technologie, negacje, powtórzenia i polską poprawkę odmiany gramatycznej. Dane nie pochodzą od klientów. Przypadki sprawdzają gramatykę, skracanie i ulepszanie pełnego profilu; **nie** potwierdzają jakości wywiadu, edycji zakresowej ani tłumaczenia.

Trzy powtórzenia trzech wariantów dają 216 wywołań dostawcy. Kolejność zmienia się między powtórzeniami. `baseline` odtwarza pierwotne prompty i `high` z wersjonowanego pliku zapisanego przed optymalizacją; `policy` używa tych samych promptów z nowym poziomem rozumowania; `compact` uruchamia aktualną aplikację z doborem poziomu i obsługą zmian pól. Niejednoznaczne dane w wariancie compact nadal używają pełnego profilu. Nie nadpisuj pierwotnego pliku. `--capture-baseline` służy wyłącznie do zapisania osobnej przyszłej bazy pod nową ścieżką.

Rzeczywisty pomiar wymaga serwerowego `API_GPT_KEY` i dostępu do sieci. Powoduje opłaty OpenAI, ale nie rezerwuje ani nie pobiera kredytów aplikacji, nie odczytuje dokumentów klientów i nie zapisuje rekordów aplikacji:

```sh
python scripts/benchmark_ai_latency.py --live --output ../tmp/ai-latency-live.json
```

Do sprawdzenia połączenia dodaj `--limit 1 --repetitions 1 --variants baseline`. Ograniczony pomiar nigdy nie spełnia warunku wdrożenia. Błędy uwierzytelnienia, modelu/konfiguracji, limitów i połączenia zatrzymują pomiar; SDK nie ponawia ich automatycznie. Raport jest zapisywany po każdym zakończonym wywołaniu, więc przerwanie zachowuje opłacone obserwacje. Nie ma automatycznego wznowienia ani ponownego płatnego uruchomienia.

## Raport i ocena jakości

Raport zawiera czas całej operacji i dostawcy, dostępne liczniki tokenów, poziom rozumowania, kontrakt odpowiedzi, wynik i szacowany koszt USD każdego wywołania oraz medianę i p95 poprawnych wywołań liczone metodą najbliższej rangi. Błędy są liczone osobno; natychmiastowa awaria nie udaje szybkiej poprawnej odpowiedzi. Brakujące liczniki mają `null`, nie zero. Istniejący estymator USD pozostaje niezmieniony i nie jest fakturą dostawcy; zadanie nie wprowadza cen cache, retencji ani jawnych zapisów cache.

Raport zawiera także wygenerowane odpowiedzi **wyłącznie dla syntetycznych przypadków**, aby można było je ocenić. Produkcyjne zdarzenia `ai_latency` nie zawierają promptów, treści CV, odpowiedzi, ID użytkownika ani dokumentu. Nie dostosowuj benchmarku do rzeczywistych CV i nie publikuj raportów z danymi klientów.

Utwórz pusty plik oceny i przelicz raport bez kolejnych zapytań:

```sh
python scripts/benchmark_ai_latency.py --evaluate-report ../tmp/ai-latency-live.json --review-template ../tmp/ai-latency-review.json --output ../tmp/ai-latency-reviewed.json
```

Dla każdej obserwacji osoba oceniająca porównuje `result` z odpowiednim przypadkiem syntetycznym i wynikiem bazowym. Należy sprawdzić każdy fakt, liczbę, technologię, odpowiedzialność, negację i zastrzeżenie; potwierdzić brak pogorszenia gramatyki i redakcji, zgodność profilu z widocznymi poprawkami oraz brak cichego usunięcia treści. Uzupełnij `facts_preserved`, `editorial_not_worse` i `notes`. Zachowaj `result_sha256`: wiąże ocenę z dokładną odpowiedzią, łącznie z zapisanym zużyciem. Nie zatwierdzaj wszystkich wierszy tylko dlatego, że JSON przeszedł walidację.

```sh
python scripts/benchmark_ai_latency.py --evaluate-report ../tmp/ai-latency-live.json --reviews ../tmp/ai-latency-review.json --output ../tmp/ai-latency-reviewed.json
```

Ocena offline przelicza podsumowania i sprawdza skróty odpowiedzi. Zaliczenie wymaga wszystkich 24 przypadków, co najmniej trzech powtórzeń wszystkich trzech wariantów, braku błędów, jawnej pozytywnej oceny każdej obserwacji, mediany wariantu compact krótszej o co najmniej 20% i niepogorszonego p95. Próba z atrapą nigdy nie kwalifikuje wdrożenia. Sprawdź też podsumowania dla poszczególnych akcji: lepszy wynik zbiorczy nie dowodzi poprawy każdego zadania. Przed usunięciem globalnego nadpisania dla wywiadu, edycji zakresowej i tłumaczenia nadal potrzebna jest ocena jakości tych przepływów.

## Zgodność, ograniczenia i rollback

Mapowanie kompaktowe najpierw sprawdza `cvDataBindings` względem istniejących wartości źródłowych; bez tych danych wymaga dokładnego, jednoznacznego dopasowania tekstu. Obsługiwane punktory i separatory wierszy odtwarza na podstawie pozycji w tekście źródłowym. Nieobsługiwane wiersze złożone, puste pola edytowalne, niepowiązany tekst i niejednoznaczne powtórzenia wybierają dotychczasową inferencję pełnego profilu **przed** wywołaniem. Nie ma dopasowania przybliżonego ani drugiego zapytania. Tożsamość, daty, nagłówki, poziomy języków i treść zablokowana nie są celami edycji kompaktowej. Tłumaczenie zachowuje pełny kontrakt profilu.

Walidator odrzuca nieznane/powtórzone ID, puste zamienniki, zmienione chronione liczby/narzędzia, zmieniony zestaw negacji, nowe placeholdery, przebudowę akapitów i normalizację zmieniającą strukturę profilu. Skończona równoważność `Python`/`Pythonie`/`Pythonem`/`Pythona` dopuszcza polską odmianę. To ostrożne reguły leksykalne, a nie dowód zachowania znaczenia; prawidłowa parafraza może zostać odrzucona. Zużycie zgłoszone dla odrzuconej płatnej odpowiedzi nadal jest rozliczane jeden raz przez istniejący mechanizm kredytów.

Najpierw wdróż pomiary. Po ocenie odpowiednich dowodów jakości usuń globalne nadpisanie poziomu i uruchom backend ponownie; `AI_ASSISTANT_PROFILE_PATCHES_ENABLED=true` włącz dopiero po przejściu osobnej bramki. Rollback: przywróć `AI_ASSISTANT_REASONING_EFFORT=high`, ustaw flagę profilu na `false` i uruchom ponownie. Aktualizuj Blueprint oraz działającą usługę, aby kolejna synchronizacja nie cofnęła zamierzonego ustawienia. Rozliczone odpowiedzi i aktywne rezerwacje zachowują obecny mechanizm odzyskiwania.

Powiązane testy:

```sh
python -m pytest tests/test_ai_request_policy.py tests/test_ai_telemetry.py tests/test_cv_profile_patches.py tests/test_ai_latency_benchmark.py tests/test_ai_assistant_exception_handling.py tests/test_ai_credit_budget.py tests/test_ai_credit_reservations.py tests/test_interviews.py tests/test_interview_editorial.py -q
python -m pytest -q
```

Z `frontend/` istniejące testy akceptacji i profilu uruchom poleceniem:

```sh
node --test src/utils/syncCvDataFromCanvas.test.js src/components/ai/AiAssistant/AiAssistant.test.js src/utils/aiCorrectionHighlights.test.js
```

Oficjalne źródła: [model Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) opisuje obsługiwane poziomy rozumowania; [optymalizacja opóźnień](https://developers.openai.com/api/docs/guides/latency-optimization) wyjaśnia koszt generowania tokenów i kolejnych wywołań; [prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) wyjaśnia, dlaczego zgodny początek promptu nie gwarantuje trafienia cache.
