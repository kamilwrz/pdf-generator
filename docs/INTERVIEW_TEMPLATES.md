# English

## Choosing a one-page alternative

After generation and automatic fitting, an interview CV may still require several pages in its selected template. `InterviewFlow` requests one free comparison when that result is shown. A reopened preview exposes **Check other templates**. Comparison does not rewrite content, consume AI credits, save a document or select a template automatically. The current CV remains usable while checking; the user can cancel, save the existing result or choose a confirmed alternative.

1. `InterviewTemplateOptions` calls `POST /ai/interviews/{id}/preview-templates` with the session revision, profile revision and evidence scope.
2. `preview_templates` renders the current verified `preview.cv_data` in other entitled templates. It keeps actual user photos in compatible authored frames and excludes layouts that would omit visible structured content. It returns canonical element and group identities derived from the session, revision and template, without persisting a candidate cache.
3. `measureInterviewTemplateCandidates` loads real fonts and measures each independent candidate using the registered S typography transaction and compact spacing. Flow textarea heights are `Math.ceil(measured line count × lineHeight)`: the canvas has no internal text padding, so the heuristic's extra 6px is not added after measurement. The check preserves complete text and media, requires one page, and rejects clipped or overlapping measured content. Failed font or geometry checks are reported separately from layouts which legitimately need more pages.
4. The UI reports how many alternatives fit. The template selector and its preview identify the shown design as a sample; the one-page claim is based on the actual candidate content. Browsing, cancelling or retrying never applies a template.
5. Clicking **Use this template — 1 page** sends that candidate to `POST /ai/interviews/{id}/preview-template`. The server regenerates the same canonical baseline, validates the submitted elements and rechecks entitlement, ownership and revisions. It atomically stores the chosen template, spacing and one-page geometry. CV data, reviewed changes, answers and source evidence remain unchanged.
6. The existing free restore action restores the complete earlier preview, its spacing and its template identity. The final **Save as a new CV** action creates a separate document through the existing interview workflow.

## API and state

Both endpoints require the existing authenticated bearer session. They use the same evidence-scope and source/profile freshness checks as preview generation. A pending fit, completed interview, outdated preview, or already single-page result is not eligible. Explicit alternative selection is available in tailoring as well; its initial source template remains the default until the user chooses an alternative.

Example comparison request:

```json
{"revision":4,"profile_revision":1,"evidence_scope":"session"}
```

Successful comparison returns HTTP 200 with `{revision, profile_revision, evidence_scope, target_pages: 1, candidates}`. Each candidate contains `{template_id, elements, spacing_px, pages}`. The returned initial page count is a rendering input, not a recommendation. Only successful browser measurement turns it into a selectable one-page result. No session revision changes during comparison.

Selection accepts the same version fields plus `template_id`, `elements` and `spacing_px`. The element list is limited to 1–1000 entries. `elements` is the complete measured candidate, not a text patch; `spacing_px` uses the existing `stack`, `record`, `section` and `after_rule` fields. Successful selection returns the normal session payload with its next revision. The client must discard previous candidates after any revision change.

Authentication errors use the existing API contract; a missing or foreign session returns 404, stale/ineligible state returns 409, unavailable template access returns 403, and invalid template/layout data returns 422. Failed selection retains the existing preview and exposes retry. A comparison request or individual font/geometry failure is recoverable and never implies that an unmeasured template does not fit.

The existing `InterviewSession.state` JSON stores the selected result and `fit_original` restore snapshot. No schema migration, background job, dependency, environment variable or AI billing operation is added. Candidate geometry is transient in browser memory; cancellation and unmount invalidate late responses. Between candidates, the scan yields to the browser event loop so progress can paint and cancel/save input can run even when fonts are already cached. Session deletion/account erasure retain their existing rules. No additional service receives candidate data.

Deploy the backend endpoints before the frontend. An older backend leaves the current CV available and the comparison in its retry state. Existing interviews and saved documents remain readable. Roll back both components together if removing alternate-template selection, because restoration now includes template identity.

## Verification and references

Implementation is in `backend/app/services/interview_templates.py`, the existing interview routes/schemas, `frontend/src/utils/interviewTemplateFit.js` and `InterviewTemplateOptions.jsx`. The S transaction is shared through `applyTemplateSmallTypography` in `templatePageFit.js`. The existing `interview_fit.py` restores the template identity as well as content and geometry.

Run from `backend`: `.venv/Scripts/python.exe -m pytest tests/test_interview_templates.py tests/test_interview_fit.py`. From `frontend`: `npm test`, `npm run test:runtime -- src/components/ai/Interview`, `npm run test:e2e -- e2e/interview-templates.spec.js --project=desktop-chromium`, `npm run lint` and `npm run build`.

Tests cover ownership, stale revisions, entitlement, immutable content, photo preservation, recovery, deterministic candidate identities, actual font measurements, cancellation, explicit selection, failed persistence, automatic comparison, PL/EN and 390/834/1280/1920px layouts. `frontend/src/utils/interviewTemplateFit.test.js`, lines 34–54, verifies that 33 measured one-line records fit and that adding the obsolete 6px allowance to each field incorrectly creates a second page; lines 179–190 verify cancellation before the next candidate when font results resolve immediately. Browser fixtures contain synthetic CV content, not uploaded personal documents. The selection tests use Linden at 390px, Cadenza at 834px, Sterling at 1280px and Meridian at 1920px in both PL and EN, including failed persistence, retry and restore. Fixed one-page checks may conservatively exclude a layout that needs manual adjustments; they do not promise that every CV has a one-page alternative. Changes to template fonts or generators require rerunning the geometry tests.

- [CSS Font Loading API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Font_Loading_API) explains loading the actual font before measuring its text.
- [React effect cleanup](https://react.dev/reference/react/useEffect) explains discarding stale asynchronous results when the component is replaced.

---

# Polski

## Wybór alternatywy na jedną stronę

Po wygenerowaniu i automatycznym dopasowaniu CV z wywiadu może nadal zajmować kilka stron w wybranym szablonie. `InterviewFlow` uruchamia jedno bezpłatne porównanie po pokazaniu takiego wyniku. Ponownie otwarty podgląd udostępnia **Sprawdź inne szablony**. Porównanie nie przepisuje treści, nie zużywa kredytów AI, nie zapisuje dokumentu ani nie wybiera automatycznie szablonu. Obecne CV pozostaje dostępne podczas sprawdzania; użytkownik może przerwać, zapisać obecny wynik albo wybrać potwierdzoną alternatywę.

1. `InterviewTemplateOptions` wywołuje `POST /ai/interviews/{id}/preview-templates` z rewizją sesji, rewizją profilu i zakresem informacji.
2. `preview_templates` renderuje bieżące zweryfikowane `preview.cv_data` w innych szablonach dostępnych w planie. Zachowuje rzeczywiste zdjęcie użytkownika w zgodnych ramkach i wyklucza układy pomijające widoczną treść strukturalną. Zwraca kanoniczne identyfikatory elementów i grup wyliczone z sesji, rewizji i szablonu, bez zapisywania pamięci podręcznej wariantów.
3. `measureInterviewTemplateCandidates` ładuje rzeczywiste czcionki i mierzy każdy niezależny wariant z zarejestrowaną zmianą typografii S oraz małymi odstępami. Wysokości pól tekstowych w przepływie to `Math.ceil(zmierzona liczba linii × lineHeight)`: kanwa nie ma wewnętrznego paddingu tekstu, dlatego po pomiarze nie dodaje się heurystycznego zapasu 6px. Kontrola zachowuje pełny tekst i obrazy, wymaga jednej strony oraz odrzuca uciętą lub nakładającą się zmierzoną treść. Błędy czcionek lub geometrii są odróżniane od układów, które poprawnie wymagają większej liczby stron.
4. Interfejs podaje liczbę pasujących alternatyw. Lista szablonów i jej podgląd jawnie opisują pokazany wygląd jako przykład; informacja o jednej stronie wynika z pomiaru rzeczywistej treści wariantu. Przeglądanie, przerwanie i ponowienie nie zmieniają szablonu.
5. Kliknięcie **Użyj tego szablonu — 1 strona** wysyła wariant do `POST /ai/interviews/{id}/preview-template`. Serwer odtwarza tę samą kanoniczną bazę, sprawdza przesłane elementy oraz ponownie kontroluje dostęp do szablonu, własność i rewizje. Zapisuje atomowo wybrany szablon, odstępy i geometrię jednej strony. Dane CV, sprawdzone zmiany, odpowiedzi i źródła pozostają bez zmian.
6. Obecne bezpłatne przywracanie odtwarza cały wcześniejszy podgląd wraz z odstępami i tożsamością szablonu. Końcowe **Zapisz jako nowe CV** tworzy osobny dokument dotychczasowym przepływem wywiadu.

## API i stan

Oba endpointy wymagają istniejącej uwierzytelnionej sesji bearer. Korzystają z kontroli zakresu informacji i aktualności źródła/profilu używanych przy generowaniu podglądu. Niedokończone dopasowanie, zakończony wywiad, nieaktualny podgląd lub wynik już jednostronicowy wykluczają porównanie. Jawny wybór alternatywy jest dostępny również przy dopasowaniu do oferty; szablon źródłowy pozostaje domyślny do wyboru użytkownika.

Przykładowe żądanie porównania:

```json
{"revision":4,"profile_revision":1,"evidence_scope":"session"}
```

Poprawne porównanie zwraca HTTP 200 z `{revision, profile_revision, evidence_scope, target_pages: 1, candidates}`. Każdy wariant zawiera `{template_id, elements, spacing_px, pages}`. Początkowa liczba stron jest wejściem renderowania, a nie rekomendacją. Dopiero poprawny pomiar w przeglądarce pozwala pokazać wariant jednej strony. Porównanie nie zmienia rewizji sesji.

Wybór przyjmuje te same pola wersji oraz `template_id`, `elements` i `spacing_px`. Lista elementów ma limit 1–1000 wpisów. `elements` to kompletny zmierzony wariant, a nie poprawka tekstu; `spacing_px` korzysta z istniejących pól `stack`, `record`, `section` i `after_rule`. Poprawny wybór zwraca zwykły payload sesji z kolejną rewizją. Klient musi odrzucić poprzednie warianty po każdej zmianie rewizji.

Błędy uwierzytelnienia korzystają z istniejącego kontraktu API; brak lub cudza sesja daje 404, nieaktualny/niedozwolony stan 409, brak dostępu do szablonu 403, a błędne dane szablonu/układu 422. Nieudany wybór zachowuje obecny podgląd i umożliwia ponowienie. Błąd porównania lub pojedynczej czcionki/geometrii pozwala na odzyskanie i nigdy nie oznacza, że niezmierzony szablon się nie mieści.

Istniejący JSON `InterviewSession.state` przechowuje wybrany wynik i kopię `fit_original` do przywrócenia. Nie dodano migracji, zadania w tle, zależności, zmiennej środowiskowej ani operacji rozliczającej AI. Geometria wariantów pozostaje tymczasowo w pamięci przeglądarki; przerwanie i odmontowanie unieważniają spóźnione odpowiedzi. Między wariantami porównanie oddaje sterowanie pętli zdarzeń przeglądarki, aby mogła wyświetlić postęp i obsłużyć przerwanie lub zapis również przy czcionkach już obecnych w pamięci podręcznej. Usuwanie sesji/konta zachowuje dotychczasowe reguły. Dane kandydata nie trafiają do dodatkowej usługi.

Wdrażaj endpointy backendu przed frontendem. Starszy backend pozostawi CV dostępne, a porównanie w stanie umożliwiającym ponowienie. Istniejące wywiady i zapisane dokumenty pozostają czytelne. Wycofuj oba składniki razem przy usuwaniu wyboru alternatywy, ponieważ przywracanie obejmuje teraz tożsamość szablonu.

## Weryfikacja i źródła

Implementacja jest w `backend/app/services/interview_templates.py`, istniejących trasach/schematach wywiadu, `frontend/src/utils/interviewTemplateFit.js` i `InterviewTemplateOptions.jsx`. Zmiana typografii S jest współdzielona przez `applyTemplateSmallTypography` w `templatePageFit.js`. Obecny `interview_fit.py` przywraca tożsamość szablonu wraz z treścią i geometrią.

W `backend` uruchom `.venv/Scripts/python.exe -m pytest tests/test_interview_templates.py tests/test_interview_fit.py`. W `frontend`: `npm test`, `npm run test:runtime -- src/components/ai/Interview`, `npm run test:e2e -- e2e/interview-templates.spec.js --project=desktop-chromium`, `npm run lint` i `npm run build`.

Testy obejmują własność, nieaktualne rewizje, uprawnienia, niezmienność treści, zdjęcia, odzyskiwanie, deterministyczne identyfikatory wariantów, rzeczywiste pomiary czcionek, przerwanie, jawny wybór, nieudany zapis, automatyczne porównanie, PL/EN i układy 390/834/1280/1920px. `frontend/src/utils/interviewTemplateFit.test.js`, linie 34–54, sprawdza, że 33 zmierzone jednoliniowe rekordy się mieszczą, a dodanie zbędnego zapasu 6px do każdego pola błędnie tworzy drugą stronę; linie 179–190 sprawdzają przerwanie przed kolejnym wariantem, gdy wyniki czcionek są dostępne natychmiast. Przeglądarkowe dane testowe zawierają syntetyczne CV, a nie przesłane dokumenty osobiste. Testy wyboru używają Linden przy 390px, Cadenzy przy 834px, Sterling przy 1280px i Meridiana przy 1920px w wersjach PL i EN, obejmując nieudany zapis, ponowienie i przywrócenie. Kontrole jednej strony mogą zachowawczo wykluczyć układ wymagający ręcznych poprawek; nie obiecują alternatywy dla każdego CV. Zmiana czcionek lub generatorów szablonów wymaga ponowienia testów geometrii.

- [CSS Font Loading API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Font_Loading_API) opisuje ładowanie rzeczywistej czcionki przed pomiarem tekstu.
- [Czyszczenie efektów React](https://react.dev/reference/react/useEffect) wyjaśnia odrzucanie nieaktualnych wyników asynchronicznych po zastąpieniu komponentu.
